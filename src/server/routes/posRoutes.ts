import { Router } from 'express';
import type { Response } from 'express';
import bcrypt from 'bcryptjs';
import { pgClient } from '../../db/index.ts';
import { requireAuth } from '../auth.ts';
import type { AuthenticatedRequest } from '../auth.ts';
import { extractStrictTenantId } from '../../db/tenantDb.ts';
import { ensureCustomerLedgerSchema, ensureSalesTransactionIdSchema } from '../../db/schemaInit.ts';
import { notifyPosAction } from '../pushNotificationService.ts';
import { getAppSetting } from '../services/appSettingsService.ts';

const router = Router();

// Helper to generate next unique invoice number scoped to tenant
async function generateInvoiceNumber(tenantId: number): Promise<string> {
  const prefix = (await getAppSetting('INVOICE_PREFIX', 'INV-')).trim() || 'INV-';

  const lastSale = await pgClient.query<{ invoice_number: string }>(
    `SELECT invoice_number FROM sales WHERE COALESCE(tenant_id, 1) = $1 AND invoice_number LIKE $2 ORDER BY id DESC LIMIT 1`,
    [tenantId, `${prefix}%`]
  );

  let nextNum = 1;
  if (lastSale.rows.length > 0) {
    const rawNum = lastSale.rows[0].invoice_number.slice(prefix.length);
    const parsed = parseInt(rawNum, 10);
    if (!isNaN(parsed)) {
      nextNum = parsed + 1;
    }
  }

  const padded = String(nextNum).padStart(6, '0');
  return `${prefix}${padded}`;
}

// Helper to generate next unique return number scoped to tenant
async function generateReturnNumber(tenantId: number): Promise<string> {
  const lastRet = await pgClient.query<{ return_number: string }>(
    "SELECT return_number FROM returns WHERE COALESCE(tenant_id, 1) = $1 AND return_number LIKE 'RET-%' ORDER BY id DESC LIMIT 1",
    [tenantId]
  );
  let nextNum = 1;
  if (lastRet.rows.length > 0) {
    const rawNum = lastRet.rows[0].return_number.slice(4);
    const parsed = parseInt(rawNum, 10);
    if (!isNaN(parsed)) {
      nextNum = parsed + 1;
    }
  }
  const padded = String(nextNum).padStart(6, '0');
  return `RET-${padded}`;
}

// POST /api/pos/verify-override - Verify Store Admin credentials strictly scoped by tenant_id
router.post('/verify-override', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = extractStrictTenantId(req);
    const { email, password, pin } = req.body || {};
    const secret = String(password || pin || '').trim();
    if (!secret) {
      return res.status(400).json({ error: 'Admin password or PIN is required.' });
    }

    const adminQuery = email
      ? await pgClient.query<any>(
          `SELECT id, tenant_id, name, email, password_hash, role, status
           FROM users
           WHERE COALESCE(tenant_id, 1) = $2
             AND LOWER(email) = LOWER($1)
             AND role = 'ADMIN'
             AND status = 'APPROVED'`,
          [String(email).trim(), tenantId]
        )
      : await pgClient.query<any>(
          `SELECT id, tenant_id, name, email, password_hash, role, status
           FROM users
           WHERE COALESCE(tenant_id, 1) = $1
             AND role = 'ADMIN'
             AND status = 'APPROVED'`,
          [tenantId]
        );

    for (const adminRow of adminQuery.rows) {
      if (Number(adminRow.tenant_id || 1) !== tenantId) continue;
      if (await bcrypt.compare(secret, adminRow.password_hash)) {
        return res.json({
          verified: true,
          adminId: adminRow.id,
          tenantId,
          adminName: adminRow.name,
        });
      }
    }

    return res.status(403).json({
      verified: false,
      error: 'Invalid Store Admin credentials for this store.',
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to verify override credentials: ' + err.message });
  }
});

// POST /api/pos/checkout - Atomic Sale & Direct Shoe Exchange Processing (Strictly Scoped to req.user.tenantId)
router.post('/checkout', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = extractStrictTenantId(req);
  const {
    items = [],
    customerId = null,
    paymentMethod = 'CASH',
    notes = '',
    isMinPriceOverridden = false,
    adminOverrideEmail = null,
    adminOverridePassword = null,
    exchange = null,
    clientTxId = null,
    saleDate = null,
  } = req.body;

  if (clientTxId && typeof clientTxId === 'string') {
    const existingSync = await pgClient.query<any>(
      "SELECT id, invoice_number, total_amount FROM sales WHERE COALESCE(tenant_id, 1) = $1 AND notes LIKE $2 LIMIT 1",
      [tenantId, `%[Offline Tx: ${clientTxId.trim()}]%`]
    );
    if (existingSync.rows.length > 0) {
      const saleRow = existingSync.rows[0];
      return res.status(200).json({
        message: 'Sale previously synchronized.',
        invoiceNumber: saleRow.invoice_number,
        alreadySynced: true,
        sale: saleRow,
      });
    }
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Cart is empty. Please add replacement shoes to checkout.' });
  }

  const user = req.user!;
  let verifiedOverrideAdminId: number | null = null;

  const settingsRes = await pgClient.query<{ pricing_mode: string; business_type: string }>(
    'SELECT pricing_mode, business_type FROM company_settings WHERE COALESCE(tenant_id, 1) = $1 LIMIT 1',
    [tenantId]
  );
  const isFixedMode = String(settingsRes.rows[0]?.pricing_mode || 'FIXED').toUpperCase() === 'FIXED';
  const isWholesaleStore = String(settingsRes.rows[0]?.business_type || 'RETAIL').toUpperCase() === 'WHOLESALE';
  const normalizedPaymentMethod = String(paymentMethod).toUpperCase();
  const transactionId = String(req.body.transactionId ?? req.body.transaction_id ?? '').trim();
  if (normalizedPaymentMethod === 'CARD') {
    return res.status(400).json({ error: 'Card payments are currently unavailable.' });
  }
  if ((normalizedPaymentMethod === 'ONLINE' || normalizedPaymentMethod === 'BANK_TRANSFER') && !transactionId) {
    return res.status(400).json({ error: 'A transaction ID is required for online and bank transfer payments.' });
  }
  if (!isWholesaleStore && normalizedPaymentMethod === 'KHATA') {
    return res.status(400).json({ error: 'Khata credit is available only for wholesale stores.' });
  }

  for (const item of items) {
    const prodRes = await pgClient.query<{
      cost_price: string;
      name: string;
      article: string;
      min_price: number | null;
      max_price: number | null;
    }>(
      'SELECT COALESCE(cost_price, 0) as cost_price, name, article, COALESCE(min_price, 0) as min_price, COALESCE(max_price, 0) as max_price FROM products WHERE id = $1 AND COALESCE(tenant_id, 1) = $2',
      [item.productId, tenantId]
    );

    if (prodRes.rows.length === 0) {
      return res.status(404).json({ error: `Product ID ${item.productId} not found in your store.` });
    }

    const prod = prodRes.rows[0];
    const costPrice = Math.round(parseFloat(prod.cost_price || '0'));
    const prodIdentifier = prod.article || prod.name;
    const effectiveUnitPrice = Math.round(parseFloat(item.unitPrice));

    let minAllowedPrice = 0;
    if (isFixedMode) {
      minAllowedPrice = prod.max_price && prod.max_price > 0
        ? Math.round(Number(prod.max_price))
        : costPrice;
    } else {
      minAllowedPrice = prod.min_price && prod.min_price > 0
        ? Math.round(Number(prod.min_price))
        : costPrice;
    }

    if (effectiveUnitPrice < minAllowedPrice) {
      if (user.role === 'ADMIN' || user.role === 'SUPERADMIN') {
        verifiedOverrideAdminId = user.id;
      } else if (isMinPriceOverridden && adminOverrideEmail && adminOverridePassword) {
        const adminCheck = await pgClient.query<any>(
          'SELECT id, password_hash, role, status FROM users WHERE LOWER(email) = LOWER($1) AND COALESCE(tenant_id, 1) = $2',
          [adminOverrideEmail.trim(), tenantId]
        );
        if (
          adminCheck.rows.length === 0 ||
          adminCheck.rows[0].role !== 'ADMIN' ||
          adminCheck.rows[0].status !== 'APPROVED'
        ) {
          return res.status(403).json({
            error: `Selling "${prodIdentifier}" below minimum price (Rs. ${minAllowedPrice}) is rejected. Invalid Admin credentials.`,
          });
        }
        const isPassValid = await bcrypt.compare(adminOverridePassword, adminCheck.rows[0].password_hash);
        if (!isPassValid) {
          return res.status(403).json({
            error: `Selling "${prodIdentifier}" below minimum price (Rs. ${minAllowedPrice}) is rejected. Incorrect Admin password.`,
          });
        }
        verifiedOverrideAdminId = adminCheck.rows[0].id;
      } else {
        return res.status(400).json({
          error: `Minimum Price Violation: "${prodIdentifier}" cannot be sold below saved minimum price of Rs. ${minAllowedPrice} without Admin authorization.`,
          requiresAdminOverride: true,
          productId: item.productId,
          productName: prodIdentifier,
          minSalePrice: minAllowedPrice,
          attemptedPrice: effectiveUnitPrice,
        });
      }
    }
  }

  try {
    await ensureSalesTransactionIdSchema();
    await ensureCustomerLedgerSchema();
  } catch (err: any) {
    return res.status(500).json({ error: 'Could not prepare the database for checkout: ' + err.message });
  }

  await pgClient.query('BEGIN');

  try {
    const invoiceNumber = await generateInvoiceNumber(tenantId);
    let calculatedSubtotal = 0;
    let calculatedTotalDiscount = 0;

    let totalExchangeCredit = 0;
    let generatedReturnNumber: string | null = null;
    const validatedReturnItems: Array<{
      saleItemId: number;
      productId: number;
      productName: string;
      quantity: number;
      unitRefundPrice: number;
      subtotal: number;
      prevStock: number;
      newStock: number;
    }> = [];

    let origSale: any = null;
    if (exchange && exchange.originalSaleId && Array.isArray(exchange.items) && exchange.items.length > 0) {
      const origSaleRes = await pgClient.query('SELECT * FROM sales WHERE id = $1 AND COALESCE(tenant_id, 1) = $2', [exchange.originalSaleId, tenantId]);
      if (origSaleRes.rows.length === 0) {
        throw new Error('Original sale record for exchange not found in this store.');
      }
      origSale = origSaleRes.rows[0];

      for (const rItem of exchange.items) {
        const retQty = parseInt(rItem.quantity, 10);
        const refundPrice = parseFloat(rItem.unitRefundPrice);
        if (isNaN(retQty) || retQty <= 0) continue;

        const siRes = await pgClient.query<{ id: number; product_id: number; product_name: string; quantity: number }>(
          'SELECT id, product_id, product_name, quantity FROM sale_items WHERE id = $1 AND sale_id = $2',
          [rItem.saleItemId, exchange.originalSaleId]
        );
        if (siRes.rows.length === 0) {
          throw new Error(`Sale item ${rItem.saleItemId} does not match original invoice.`);
        }
        const saleItem = siRes.rows[0];

        const prevReturnsRes = await pgClient.query<{ total_returned: string }>(
          'SELECT COALESCE(SUM(quantity), 0) as total_returned FROM return_items WHERE sale_item_id = $1',
          [saleItem.id]
        );
        const alreadyReturned = parseInt(prevReturnsRes.rows[0].total_returned, 10);
        const maxReturnable = saleItem.quantity - alreadyReturned;

        if (retQty > maxReturnable) {
          throw new Error(
            `Cannot exchange ${retQty} of "${saleItem.product_name}". Maximum returnable is ${maxReturnable}.`
          );
        }

        const prodRes = await pgClient.query<{ id: number; total_stock: number }>(
          'SELECT id, total_stock FROM products WHERE id = $1 AND COALESCE(tenant_id, 1) = $2 FOR UPDATE',
          [saleItem.product_id, tenantId]
        );
        if (prodRes.rows.length === 0) {
          throw new Error(`Product ${saleItem.product_id} not found.`);
        }
        const prevStock = prodRes.rows[0].total_stock;
        const newStock = prevStock + retQty;
        const itemCredit = Math.round(retQty * refundPrice * 100) / 100;
        totalExchangeCredit += itemCredit;

        await pgClient.query('UPDATE products SET total_stock = $1, updated_at = NOW() WHERE id = $2 AND COALESCE(tenant_id, 1) = $3', [
          newStock,
          saleItem.product_id,
          tenantId,
        ]);

        validatedReturnItems.push({
          saleItemId: saleItem.id,
          productId: saleItem.product_id,
          productName: saleItem.product_name,
          quantity: retQty,
          unitRefundPrice: refundPrice,
          subtotal: itemCredit,
          prevStock,
          newStock,
        });
      }

      if (validatedReturnItems.length > 0) {
        generatedReturnNumber = await generateReturnNumber(tenantId);
        const returnRes = await pgClient.query<{ id: number }>(
          `INSERT INTO returns (
            tenant_id, return_number, original_sale_id, customer_id, return_date, 
            total_refund_amount, reason, created_by
          ) VALUES ($1, $2, $3, $4, NOW()::date::text, $5, $6, $7)
          RETURNING id`,
          [
            tenantId,
            generatedReturnNumber,
            origSale.id,
            customerId ? parseInt(customerId, 10) : origSale.customer_id,
            totalExchangeCredit,
            (exchange.reason || 'Direct Shoe Exchange at POS').trim(),
            user.id,
          ]
        );
        const returnId = returnRes.rows[0].id;

        for (const v of validatedReturnItems) {
          await pgClient.query(
            `INSERT INTO return_items (tenant_id, return_id, sale_item_id, product_id, quantity, unit_refund_price, subtotal)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [tenantId, returnId, v.saleItemId, v.productId, v.quantity, v.unitRefundPrice, v.subtotal]
          );

          await pgClient.query(
            `INSERT INTO stock_movements (
              tenant_id, product_id, qty_change, prev_stock, new_stock, movement_type, reference_id, user_id, notes
            ) VALUES ($1, $2, $3, $4, $5, 'SALE_RETURN', $6, $7, $8)`,
            [
              tenantId,
              v.productId,
              v.quantity,
              v.prevStock,
              v.newStock,
              generatedReturnNumber,
              user.id,
              `Direct Shoe Exchange for Invoice ${origSale.invoice_number}: ${exchange.reason || 'Size/style exchange'}`,
            ]
          );
        }
      }
    }

    const validatedItems: Array<{
      productId: number;
      productName: string;
      quantity: number;
      unitPrice: number;
      discount: number;
      subtotal: number;
      purchasePrice: number;
      prevStock: number;
      newStock: number;
    }> = [];

    for (const item of items) {
      const qty = parseInt(item.quantity, 10);
      const unitPrice = parseFloat(item.unitPrice);
      const discount = parseFloat(item.discount || 0);

      if (isNaN(qty) || qty <= 0) {
        throw new Error(`Invalid quantity (${qty}) for item.`);
      }

      const pRes = await pgClient.query<{
        id: number;
        name: string;
        article: string;
        total_stock: number;
        cost_price: string;
      }>('SELECT id, name, article, total_stock, COALESCE(cost_price, 0) as cost_price FROM products WHERE id = $1 AND COALESCE(tenant_id, 1) = $2 FOR UPDATE', [
        item.productId,
        tenantId,
      ]);

      if (pRes.rows.length === 0) {
        throw new Error(`Product ID ${item.productId} does not exist in your store.`);
      }

      const product = pRes.rows[0];
      const prodIdentifier = product.article || product.name;
      const prevStock = product.total_stock;

      if (prevStock < qty) {
        throw new Error(
          `Insufficient stock for "${prodIdentifier}". Available: ${prevStock}, Requested: ${qty}.`
        );
      }

      const newStock = prevStock - qty;
      const subtotal = unitPrice * qty - discount;
      calculatedSubtotal += unitPrice * qty;
      calculatedTotalDiscount += discount;

      await pgClient.query(
        'UPDATE products SET total_stock = $1, updated_at = NOW() WHERE id = $2 AND COALESCE(tenant_id, 1) = $3',
        [newStock, product.id, tenantId]
      );

      validatedItems.push({
        productId: product.id,
        productName: prodIdentifier,
        quantity: qty,
        unitPrice,
        discount,
        subtotal,
        purchasePrice: parseFloat(product.cost_price || '0'),
        prevStock,
        newStock,
      });
    }

    const netDifference = Math.round((calculatedSubtotal - calculatedTotalDiscount - totalExchangeCredit) * 100) / 100;

    let exchangeNote: string | null = null;
    if (validatedReturnItems.length > 0) {
      exchangeNote = `Direct Shoe Exchange against ${origSale?.invoice_number || exchange.originalInvoiceNumber} (Return ${generatedReturnNumber}). Returned Credit: Rs. ${Math.round(totalExchangeCredit)}. Net Difference: Rs. ${Math.round(netDifference)}`;
    }
    const offlineNote = clientTxId ? `[Offline Tx: ${clientTxId.trim()}]` : null;
    const finalNotes = [notes?.trim(), exchangeNote, offlineNote].filter(Boolean).join(' | ') || null;

    const effectiveSaleDate = saleDate && typeof saleDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(saleDate)
      ? saleDate.slice(0, 10)
      : null;

    const saleType = isWholesaleStore ? 'WHOLESALE' : 'RETAIL';
    const totalCartons = Math.max(0, parseFloat(String(req.body.totalCartons || req.body.total_cartons || 0)) || 0);
    const transportName = String(req.body.transportName || req.body.transport_name || '').trim();
    const biltyNumber = String(req.body.biltyNumber || req.body.bilty_number || '').trim();
    const bookingDestination = String(req.body.bookingDestination || req.body.booking_destination || '').trim();

    // Fetch authoritative customer previous balance
    let customerPreviousBalance = 0;
    const targetCustomerId = customerId ? parseInt(customerId, 10) : (origSale ? origSale.customer_id : null);
    if (targetCustomerId && isWholesaleStore) {
      const custBalRes = await pgClient.query<{ outstanding_balance: string; current_balance: string }>(
        `SELECT COALESCE(outstanding_balance, current_balance, 0)::numeric as outstanding_balance FROM customers WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [targetCustomerId, tenantId]
      );
      if (custBalRes.rows.length > 0) {
        customerPreviousBalance = Math.max(0, parseFloat(custBalRes.rows[0].outstanding_balance || '0'));
      }
    }

    // Invoice Calculation Logic:
    // Total Amount Due on New Invoice = Current_Cart_Total + Customer_Previous_Balance
    // Remaining Balance = Total_Amount_Due - Payment_Received
    const currentCartTotal = Math.max(0, netDifference);
    const totalAmountDue = Math.round((currentCartTotal + customerPreviousBalance) * 100) / 100;

    let paymentReceived = 0;
    const rawPaid = typeof req.body.paidAmount !== 'undefined'
      ? req.body.paidAmount
      : (typeof req.body.amountReceived !== 'undefined'
        ? req.body.amountReceived
        : req.body.cashReceived);

    if (paymentMethod === 'KHATA') {
      paymentReceived = typeof rawPaid === 'number' ? rawPaid : (parseFloat(String(rawPaid || 0)) || 0);
    } else {
      paymentReceived = typeof rawPaid === 'number'
        ? rawPaid
        : (parseFloat(String(rawPaid ?? totalAmountDue)) || totalAmountDue);
    }
    const effectivePaidAmount = Math.max(0, Math.round(paymentReceived * 100) / 100);
    if (!isWholesaleStore && effectivePaidAmount < totalAmountDue) {
      throw new Error('Retail checkout requires full payment. Partial payments and Khata credit are not allowed.');
    }
    const remainingBalance = Math.max(0, Math.round((totalAmountDue - effectivePaidAmount) * 100) / 100);
    const changeGivenDue = effectivePaidAmount > totalAmountDue
      ? Math.round((effectivePaidAmount - totalAmountDue) * 100) / 100
      : (netDifference < 0 ? Math.abs(netDifference) : 0);

    const saleRes = await pgClient.query<{ id: number }>(
      `INSERT INTO sales (
        tenant_id, invoice_number, sale_type, customer_id, sale_date, subtotal, discount, 
        total_amount, total_cartons, transport_name, bilty_number, booking_destination,
        previous_balance, paid_amount, remaining_balance,
        payment_method, cash_received, change_given, 
        created_by, is_min_price_overridden, overridden_by, notes, transaction_id
      ) VALUES ($1, $2, $3, $4, COALESCE($22, NOW()::date::text), $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $23)
      RETURNING id`,
      [
        tenantId,
        invoiceNumber,
        saleType,
        targetCustomerId,
        calculatedSubtotal,
        calculatedTotalDiscount,
        totalAmountDue,
        totalCartons,
        transportName,
        biltyNumber,
        bookingDestination,
        customerPreviousBalance,
        effectivePaidAmount,
        remainingBalance,
        paymentMethod,
        effectivePaidAmount,
        changeGivenDue,
        user.id,
        verifiedOverrideAdminId !== null,
        verifiedOverrideAdminId,
        finalNotes,
        effectiveSaleDate,
        transactionId,
      ]
    );

    const saleId = saleRes.rows[0].id;

    for (let idx = 0; idx < validatedItems.length; idx++) {
      const v = validatedItems[idx];
      const origItem = items[idx] || {};
      const packingType = String(origItem.packingType || origItem.packing_type || 'PAIR').toUpperCase() === 'CARTON' ? 'CARTON' : 'PAIR';
      const cartonQuantity = Math.max(0, parseFloat(String(origItem.cartonQuantity || origItem.carton_quantity || 0)) || 0);
      const pairsPerCarton = Math.max(1, parseInt(String(origItem.pairsPerCarton || origItem.pairs_per_carton || 1), 10) || 1);

      await pgClient.query(
        `INSERT INTO sale_items (
          tenant_id, sale_id, product_id, product_name, packing_type, carton_quantity, pairs_per_carton,
          quantity, unit_price, discount, subtotal, purchase_price
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [tenantId, saleId, v.productId, v.productName, packingType, cartonQuantity, pairsPerCarton, v.quantity, v.unitPrice, v.discount, v.subtotal, v.purchasePrice]
      );

      await pgClient.query(
        `INSERT INTO stock_movements (
          tenant_id, product_id, qty_change, prev_stock, new_stock, movement_type, reference_id, user_id, notes
        ) VALUES ($1, $2, $3, $4, $5, 'SALE', $6, $7, $8)`,
        [
          tenantId,
          v.productId,
          -v.quantity,
          v.prevStock,
          v.newStock,
          invoiceNumber,
          user.id,
          `POS Sale Checkout (${invoiceNumber})`,
        ]
      );
    }

    // Update Customer outstanding_balance = Remaining_Balance and record in Khata Ledger history
    if (targetCustomerId && isWholesaleStore) {
      await pgClient.query(
        `UPDATE customers
         SET outstanding_balance = $1,
             current_balance = $1
         WHERE id = $2 AND tenant_id = $3`,
        [remainingBalance, targetCustomerId, tenantId]
      );

      const balanceChange = Math.round((currentCartTotal - effectivePaidAmount) * 100) / 100;
      await pgClient.query(
        `INSERT INTO customer_ledger (
          tenant_id, customer_id, transaction_date, invoice_id, invoice_number,
          total_bill, amount_paid, balance_change, running_balance, payment_method, notes
        ) VALUES ($1, $2, COALESCE($3, NOW()::date::text), $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          tenantId,
          targetCustomerId,
          effectiveSaleDate,
          saleId,
          invoiceNumber,
          currentCartTotal,
          effectivePaidAmount,
          balanceChange,
          remainingBalance,
          paymentMethod,
          `Invoice #${invoiceNumber} (Items: Rs. ${currentCartTotal}, Prev Khata: Rs. ${customerPreviousBalance})`,
        ]
      );
    }

    await pgClient.query('COMMIT');

    const fullSale = await pgClient.query(
      `SELECT s.*, u.name as cashier_name, c.name as customer_name, c.phone as customer_phone,
              c.shop_name as customer_shop_name, c.city as customer_city, c.market_name as customer_market_name,
              c.customer_type, c.ntn_number as customer_ntn,
              COALESCE(c.outstanding_balance, c.current_balance, 0)::numeric as customer_outstanding_balance,
              COALESCE(c.current_balance, c.outstanding_balance, 0)::numeric as customer_current_balance
       FROM sales s
       LEFT JOIN users u ON s.created_by = u.id
       LEFT JOIN customers c ON s.customer_id = c.id
       WHERE s.id = $1 AND COALESCE(s.tenant_id, 1) = $2`,
      [saleId, tenantId]
    );

    const saleItemsRes = await pgClient.query(
      `SELECT si.*, COALESCE(p.article, si.product_name) as article, COALESCE(p.article, si.product_name) as product_name,
              COALESCE(p.pairs_per_carton, 12) as pairs_per_carton, p.allow_half_carton
       FROM sale_items si
       LEFT JOIN products p ON si.product_id = p.id
       WHERE si.sale_id = $1 ORDER BY si.id ASC`,
      [saleId]
    );

    const csRes = await pgClient.query('SELECT * FROM company_settings WHERE COALESCE(tenant_id, 1) = $1 LIMIT 1', [tenantId]);

    // Instant Real-Time Push Notification Trigger for Store Owners/Admins
    try {
      const isExchangeAction = validatedReturnItems.length > 0;
      const cashierDisplayName = user.name || 'Counter Staff';
      const customerDisplayName = fullSale.rows[0]?.customer_name || 'Walk-in Customer';

      if (isExchangeAction) {
        const oldItemsStr = validatedReturnItems.map((r) => `${r.quantity}x ${r.productName}`).join(', ');
        const newItemsStr = validatedItems.map((i) => `${i.quantity}x ${i.productName}`).join(', ');
        notifyPosAction(tenantId, {
          type: 'EXCHANGE',
          title: `🔁 Shoe Exchange: #${invoiceNumber}`,
          message: `Exchange against Inv #${origSale?.invoice_number || exchange?.originalInvoiceNumber}. Old: [${oldItemsStr}] ➔ New: [${newItemsStr}]. Net: Rs. ${Math.round(netDifference)}. Handled by ${cashierDisplayName}.`,
          invoiceNumber,
          orderId: saleId,
          saleId,
          totalAmount: totalAmountDue,
          netDifference,
          customerName: customerDisplayName,
          cashierName: cashierDisplayName,
          cashierId: user.id,
          itemsSummary: `Old: ${oldItemsStr} ➔ New: ${newItemsStr}`,
          exchangeDetails: {
            oldItems: oldItemsStr,
            newItems: newItemsStr,
            netDifference,
          },
          deepLinkUrl: `/?tab=reports&viewInvoice=${encodeURIComponent(invoiceNumber)}`,
          timestamp: new Date().toISOString(),
          triggeredBy: cashierDisplayName,
        }).catch((err) => console.warn('Push notification delivery notice:', err));
      } else {
        const itemNamesStr = validatedItems.slice(0, 3).map((i) => `${i.quantity}x ${i.productName}`).join(', ');
        const extraCount = validatedItems.length > 3 ? ` +${validatedItems.length - 3} more` : '';
        const itemsSummary = `${itemNamesStr}${extraCount}`;
        notifyPosAction(tenantId, {
          type: 'SALE',
          title: `🛍️ New Sale: #${invoiceNumber}`,
          message: `Order #${invoiceNumber} for Rs. ${Math.round(totalAmountDue)} (${paymentMethod}). Items: ${itemsSummary}. Customer: ${customerDisplayName}. Processed by ${cashierDisplayName}.`,
          invoiceNumber,
          orderId: saleId,
          saleId,
          totalAmount: totalAmountDue,
          customerName: customerDisplayName,
          cashierName: cashierDisplayName,
          cashierId: user.id,
          itemsSummary,
          deepLinkUrl: `/?tab=reports&viewInvoice=${encodeURIComponent(invoiceNumber)}`,
          timestamp: new Date().toISOString(),
          triggeredBy: cashierDisplayName,
        }).catch((err) => console.warn('Push notification delivery notice:', err));
      }
    } catch (notifErr) {
      console.warn('Notification trigger error:', notifErr);
    }

    res.status(201).json({
      message: validatedReturnItems.length > 0
        ? `Direct Shoe Exchange completed. Return ${generatedReturnNumber} generated.`
        : 'Sale completed successfully.',
      invoiceNumber,
      returnNumber: generatedReturnNumber,
      clientTxId: clientTxId || null,
      netDifference,
      exchangeCredit: totalExchangeCredit,
      sale: {
        ...(fullSale.rows[0] as any),
        items: saleItemsRes.rows,
        returned_items: validatedReturnItems,
        exchange_credit: totalExchangeCredit,
        net_difference: netDifference,
        return_number: generatedReturnNumber,
        original_invoice_number: origSale?.invoice_number || exchange?.originalInvoiceNumber,
      },
      companySettings: csRes.rows[0] || null,
    });
  } catch (txErr: any) {
    await pgClient.query('ROLLBACK');
    console.error('POS Checkout Transaction Failed:', txErr);
    res.status(400).json({ error: txErr.message || 'Transaction failed. Stock has been preserved.' });
  }
});

// GET /api/pos/sales - List sales scoped strictly by req.user.tenantId
router.get('/sales', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = extractStrictTenantId(req);
    const { search, limit = 50 } = req.query;
    let query = `
      SELECT s.id, s.invoice_number, s.customer_id, c.name as customer_name, 
             s.sale_date, s.subtotal, s.discount, s.total_amount, 
             s.payment_method, s.cash_received, s.change_given, 
             s.created_by, u.name as cashier_name, s.is_min_price_overridden,
             s.notes, s.created_at
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id AND COALESCE(c.tenant_id, 1) = $1
      LEFT JOIN users u ON s.created_by = u.id
      WHERE COALESCE(s.tenant_id, 1) = $1
    `;
    const params: any[] = [tenantId];

    if (search && typeof search === 'string') {
      params.push(`%${search.trim().toLowerCase()}%`);
      query += ` AND (LOWER(s.invoice_number) LIKE $${params.length} OR LOWER(c.name) LIKE $${params.length} OR c.phone LIKE $${params.length})`;
    }

    query += ` ORDER BY s.id DESC LIMIT $${params.length + 1}`;
    params.push(parseInt(String(limit), 10) || 50);

    const result = await pgClient.query(query, params);
    res.json({ sales: result.rows });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch sales: ' + err.message });
  }
});

// GET /api/pos/sales/:id - Single Sale Details scoped strictly by req.user.tenantId
router.get('/sales/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = extractStrictTenantId(req);
    const id = parseInt(req.params.id, 10);
    const saleRes = await pgClient.query(
      `SELECT s.*, u.name as cashier_name, c.name as customer_name, c.phone as customer_phone, c.address as customer_address,
              c.customer_type, c.shop_name as customer_shop_name, c.market_name as customer_market_name, c.city as customer_city,
              c.ntn_number as customer_ntn
       FROM sales s
       LEFT JOIN users u ON s.created_by = u.id
       LEFT JOIN customers c ON s.customer_id = c.id AND COALESCE(c.tenant_id, 1) = $2
       WHERE s.id = $1 AND COALESCE(s.tenant_id, 1) = $2`,
      [id, tenantId]
    );

    if (saleRes.rows.length === 0) {
      return res.status(404).json({ error: 'Sale record not found in your store.' });
    }

    const itemsRes = await pgClient.query(
      `SELECT si.*, COALESCE(p.article, si.product_name) as article, COALESCE(p.article, si.product_name) as product_name,
              COALESCE(p.pairs_per_carton, 12) as pairs_per_carton, p.allow_half_carton 
       FROM sale_items si
       LEFT JOIN products p ON si.product_id = p.id
       WHERE si.sale_id = $1 ORDER BY si.id ASC`,
      [id]
    );

    const settingsRes = await pgClient.query('SELECT * FROM company_settings WHERE COALESCE(tenant_id, 1) = $1 LIMIT 1', [tenantId]);

    res.json({
      sale: {
        ...(saleRes.rows[0] as any),
        items: itemsRes.rows,
      },
      companySettings: settingsRes.rows[0] || null,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch sale details: ' + err.message });
  }
});

// GET /api/pos/invoice/:invoiceNumber - Single Sale Details by Invoice Number scoped to tenant
router.get('/invoice/:invoiceNumber', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = extractStrictTenantId(req);
    const invoiceNumber = req.params.invoiceNumber.trim();
    const saleRes = await pgClient.query(
      `SELECT s.*, u.name as cashier_name, c.name as customer_name, c.phone as customer_phone, c.address as customer_address,
              c.customer_type, c.shop_name as customer_shop_name, c.market_name as customer_market_name, c.city as customer_city,
              c.ntn_number as customer_ntn
       FROM sales s
       LEFT JOIN users u ON s.created_by = u.id
       LEFT JOIN customers c ON s.customer_id = c.id AND COALESCE(c.tenant_id, 1) = $2
       WHERE UPPER(s.invoice_number) = UPPER($1) AND COALESCE(s.tenant_id, 1) = $2`,
      [invoiceNumber, tenantId]
    );

    if (saleRes.rows.length === 0) {
      return res.status(404).json({ error: `Invoice "${invoiceNumber}" not found in your store.` });
    }

    const sale = saleRes.rows[0];
    const itemsRes = await pgClient.query(
      `SELECT si.*, COALESCE(p.article, si.product_name) as article, COALESCE(p.article, si.product_name) as product_name,
              COALESCE(p.pairs_per_carton, 12) as pairs_per_carton, p.allow_half_carton 
       FROM sale_items si
       LEFT JOIN products p ON si.product_id = p.id
       WHERE si.sale_id = $1 ORDER BY si.id ASC`,
      [sale.id]
    );

    const settingsRes = await pgClient.query('SELECT * FROM company_settings WHERE COALESCE(tenant_id, 1) = $1 LIMIT 1', [tenantId]);

    res.json({
      sale: {
        ...(sale as any),
        items: itemsRes.rows,
      },
      companySettings: settingsRes.rows[0] || null,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch invoice details: ' + err.message });
  }
});

export default router;
