import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';

import { pgClient } from '../src/db/index.ts';
import { ensureSaasControlPlane } from '../src/db/schemaInit.ts';
import { generateToken } from '../src/server/auth.ts';
import productRoutes from '../src/server/routes/productRoutes.ts';
import posRoutes from '../src/server/routes/posRoutes.ts';
import returnRoutes from '../src/server/routes/returnRoutes.ts';
import inventoryRoutes from '../src/server/routes/inventoryRoutes.ts';
import reportRoutes from '../src/server/routes/reportRoutes.ts';
import settingsRoutes from '../src/server/routes/settingsRoutes.ts';
import { processOfflineSalesQueue } from '../src/services/offline/syncEngine.ts';
import type { OfflineSyncStorageAdapter, QueuedSale } from '../src/services/offline/offlineTypes.ts';

function createTestServer() {
  const app = express();
  app.use(express.json());
  app.use('/api/products', productRoutes);
  app.use('/api/pos', posRoutes);
  app.use('/api/returns', returnRoutes);
  app.use('/api/inventory', inventoryRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/settings', settingsRoutes);
  return http.createServer(app);
}

test('POS, Returns, Inventory & Reports integration: atomic transactions, discount non-duplication, floor check, and Khata ledger', async () => {
  await pgClient.waitReady;
  await ensureSaasControlPlane();

  const server = createTestServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  // Ensure an approved cashier user exists in DB for requireAuth lookup
  const cashierEmail = `cashier.test.${Date.now()}@balochshoes.com`;
  const insertedCashier = await pgClient.query<{ id: number }>(
    `INSERT INTO users (tenant_id, name, email, phone, password_hash, quick_password, role, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'CASHIER', 'APPROVED')
     RETURNING id`,
    [1, 'Counter Cashier', cashierEmail, '+923001112233', 'hash', 'pass']
  );
  const cashierId = insertedCashier.rows[0].id;

  const adminToken = generateToken({
    id: 2,
    tenantId: 1,
    name: 'Store Owner',
    email: 'admin@balochshoes.com',
    role: 'ADMIN',
    status: 'APPROVED',
  });
  const cashierToken = generateToken({
    id: cashierId,
    tenantId: 1,
    name: 'Counter Cashier',
    email: cashierEmail,
    role: 'CASHIER',
    status: 'APPROVED',
  });

  const adminHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${adminToken}`,
    'X-Tenant-Id': '1',
  };
  const cashierHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${cashierToken}`,
    'X-Tenant-Id': '1',
  };

  let testProdId: number | null = null;
  let wholesaleProdId: number | null = null;
  let wholesaleCustomerId: number | null = null;
  let wholesaleAdminId: number | null = null;
  let wholesaleTenantId: number | null = null;

  try {
    const addr = server.address();
    assert.ok(addr && typeof addr === 'object');
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    // 1. Create test shoe product: cost=1500, selling=2500, stock=10
    const uniqueSuffix = Date.now().toString().slice(-6);
    const createProdRes = await fetch(`${baseUrl}/api/products`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        article: `POS-${uniqueSuffix}`,
        barcode: `MN-9${uniqueSuffix.slice(-4)}`,
        brand: 'Bata',
        category: 'Men',
        costPrice: 1500,
        maxPrice: 2500,
        totalStock: 10,
      }),
    });
    assert.equal(createProdRes.status, 201);
    const createdProd = (await createProdRes.json()) as { productId: number };
    testProdId = createdProd.productId;

    // 2. Cashier price-floor bypass attempts MUST fail with 400 + requiresAdminOverride
    // 2a. NaN / negative price
    const nanPriceRes = await fetch(`${baseUrl}/api/pos/checkout`, {
      method: 'POST',
      headers: cashierHeaders,
      body: JSON.stringify({
        items: [{ productId: testProdId, quantity: 1, unitPrice: 'not-a-number', discount: 0 }],
        paymentMethod: 'CASH',
      }),
    });
    assert.equal(nanPriceRes.status, 400);

    // 2b. Discount reducing effective unit price below floor (2500 - 500 = 2000 < 2500)
    const discountBypassRes = await fetch(`${baseUrl}/api/pos/checkout`, {
      method: 'POST',
      headers: cashierHeaders,
      body: JSON.stringify({
        items: [{ productId: testProdId, quantity: 1, unitPrice: 2500, discount: 500 }],
        paymentMethod: 'CASH',
        paidAmount: 2000,
      }),
    });
    assert.equal(discountBypassRes.status, 400);
    const bypassBody = (await discountBypassRes.json()) as { requiresAdminOverride?: boolean };
    assert.equal(bypassBody.requiresAdminOverride, true);

    // 3. Atomic ROLLBACK test: selling more than available stock (15 > 10) preserves stock at 10
    const overStockRes = await fetch(`${baseUrl}/api/pos/checkout`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        items: [{ productId: testProdId, quantity: 15, unitPrice: 2500, discount: 0 }],
        paymentMethod: 'CASH',
        paidAmount: 37500,
      }),
    });
    assert.equal(overStockRes.status, 400);
    const prodAfterRollback = (await (await fetch(`${baseUrl}/api/products/${testProdId}`, { headers: adminHeaders })).json()) as {
      product: { totalStock: number };
    };
    assert.equal(prodAfterRollback.product.totalStock, 10, 'Failed checkout must roll back stock to 10');

    // 4. Successful sale of 2 pairs with Rs. 400 total line discount (Admin authorized)
    // Net revenue = (2 * 2500) - 400 = 4600, COGS = 2 * 1500 = 3000, Profit = 1600
    const offlineTxId = `tx-${uniqueSuffix}`;
    const checkoutRes = await fetch(`${baseUrl}/api/pos/checkout`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        clientTxId: offlineTxId,
        items: [{ productId: testProdId, quantity: 2, unitPrice: 2500, discount: 400 }],
        paymentMethod: 'CASH',
        paidAmount: 4600,
      }),
    });
    assert.equal(checkoutRes.status, 201);
    const checkoutBody = (await checkoutRes.json()) as {
      invoiceNumber: string;
      sale: { id: number; total_amount: number; items: Array<{ id: number; subtotal: number }> };
    };
    assert.equal(Number(checkoutBody.sale.total_amount), 4600);
    assert.equal(checkoutBody.sale.items.length, 1);

    // Stock deducted to 8
    const prodAfterSale = (await (await fetch(`${baseUrl}/api/products/${testProdId}`, { headers: adminHeaders })).json()) as {
      product: { totalStock: number };
    };
    assert.equal(prodAfterSale.product.totalStock, 8);

    // 5. Offline idempotency: re-submitting same clientTxId returns 200 alreadySynced without deducting stock again
    const dupSyncRes = await fetch(`${baseUrl}/api/pos/checkout`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        clientTxId: offlineTxId,
        items: [{ productId: testProdId, quantity: 2, unitPrice: 2500, discount: 400 }],
        paymentMethod: 'CASH',
        paidAmount: 4600,
      }),
    });
    assert.equal(dupSyncRes.status, 200);
    const dupSyncBody = (await dupSyncRes.json()) as { alreadySynced?: boolean; invoiceNumber: string };
    assert.equal(dupSyncBody.alreadySynced, true);
    assert.equal(dupSyncBody.invoiceNumber, checkoutBody.invoiceNumber);

    const prodAfterDupSync = (await (await fetch(`${baseUrl}/api/products/${testProdId}`, { headers: adminHeaders })).json()) as {
      product: { totalStock: number };
    };
    assert.equal(prodAfterDupSync.product.totalStock, 8, 'Duplicate offline sync must not double-deduct stock');

    // 6. Reports verification: allTime.totalProfit & today.profit must NOT double-subtract Rs. 400 discount
    // All-time profit for this sale = (2500*2 - 400) - (1500*2) = 1600
    const reportRes = await fetch(`${baseUrl}/api/reports/dashboard`, { headers: adminHeaders });
    assert.equal(reportRes.status, 200);
    const reportBody = (await reportRes.json()) as {
      today: { totalSales: number; profit: number };
      allTime: { totalRevenue: number; totalProfit: number; salesCount: number };
    };
    assert.equal(reportBody.today.profit, reportBody.allTime.totalProfit);
    assert.equal(reportBody.allTime.totalRevenue, 4600);
    assert.equal(reportBody.allTime.totalProfit, 1600);

    // 7. Return verification: verify-invoice uses created_by user join & calculates effectiveUnitPrice = 2300 (no double discount)
    const verifyRetRes = await fetch(
      `${baseUrl}/api/returns/verify-invoice/${encodeURIComponent(checkoutBody.invoiceNumber)}`,
      { headers: adminHeaders }
    );
    assert.equal(verifyRetRes.status, 200);
    const verifyRetBody = (await verifyRetRes.json()) as {
      sale: { cashierName: string };
      items: Array<{ id: number; effectiveUnitPrice: number; returnableQuantity: number }>;
    };
    assert.equal(verifyRetBody.sale.cashierName, 'Store Owner');
    assert.equal(verifyRetBody.items[0].effectiveUnitPrice, 2300);
    assert.equal(verifyRetBody.items[0].returnableQuantity, 2);

    // Process return of 1 pair -> refund 2300, stock restored 8 -> 9
    const saleItemId = verifyRetBody.items[0].id;
    const processRetRes = await fetch(`${baseUrl}/api/returns`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        originalSaleId: checkoutBody.sale.id,
        reason: 'Size too small',
        items: [{ saleItemId, productId: testProdId, quantity: 1 }],
      }),
    });
    assert.equal(processRetRes.status, 201);
    const processRetBody = (await processRetRes.json()) as { totalRefundAmount: number; returnNumber: string };
    assert.equal(processRetBody.totalRefundAmount, 2300);

    // Attempting to return 2 more pairs when only 1 remains returnable -> fails atomically & rolls back
    const overRetRes = await fetch(`${baseUrl}/api/returns`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        originalSaleId: checkoutBody.sale.id,
        reason: 'Duplicate return attempt',
        items: [{ saleItemId, productId: testProdId, quantity: 2 }],
      }),
    });
    assert.equal(overRetRes.status, 400);

    const prodAfterReturn = (await (await fetch(`${baseUrl}/api/products/${testProdId}`, { headers: adminHeaders })).json()) as {
      product: { totalStock: number };
    };
    assert.equal(prodAfterReturn.product.totalStock, 9);

    // 8. Inventory adjust + ledger audit trail
    const adjRes = await fetch(`${baseUrl}/api/inventory/adjust`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ productId: testProdId, newStock: 14, notes: 'Cycle count reconciliation' }),
    });
    assert.equal(adjRes.status, 200);
    const adjBody = (await adjRes.json()) as { prevStock: number; newStock: number; qtyChange: number };
    assert.equal(adjBody.prevStock, 9);
    assert.equal(adjBody.newStock, 14);
    assert.equal(adjBody.qtyChange, 5);

    const ledgerRes = await fetch(`${baseUrl}/api/inventory/ledger?productId=${testProdId}`, { headers: adminHeaders });
    assert.equal(ledgerRes.status, 200);
    const ledgerBody = (await ledgerRes.json()) as { movements: Array<{ movement_type: string; qty_change: number }> };
    const types = ledgerBody.movements.map((m) => m.movement_type);
    assert.ok(types.includes('ADJUSTMENT'));
    assert.ok(types.includes('SALE_RETURN'));
    assert.ok(types.includes('SALE'));

    // 9. Wholesale Khata sale updates customer outstanding_balance & customer_ledger running balance
    const wsTenantRes = await pgClient.query<{ id: number }>(
      `INSERT INTO tenants (id, name, subscription_plan, subscription_start_date, subscription_end_date, subscription_status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [901, 'Wholesale Test Depot', 'YEARLY', new Date().toISOString(), new Date(Date.now() + 86400000 * 365).toISOString(), 'ACTIVE']
    );
    wholesaleTenantId = wsTenantRes.rows[0].id;

    await pgClient.query(
      `INSERT INTO company_settings (tenant_id, business_type, pricing_mode, allow_half_carton, low_stock_threshold)
       VALUES ($1, 'WHOLESALE', 'FIXED', true, 5)`,
      [wholesaleTenantId]
    );

    const wsAdminEmail = `ws.admin.${uniqueSuffix}@wholesaleshoes.com`;
    const wsAdminRes = await pgClient.query<{ id: number }>(
      `INSERT INTO users (tenant_id, name, email, phone, password_hash, quick_password, role, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'ADMIN', 'APPROVED')
       RETURNING id`,
      [wholesaleTenantId, 'Wholesale Owner', wsAdminEmail, '+923009998877', 'hash', 'pass']
    );
    wholesaleAdminId = wsAdminRes.rows[0].id;

    const wsToken = generateToken({
      id: wholesaleAdminId,
      tenantId: wholesaleTenantId,
      name: 'Wholesale Owner',
      email: wsAdminEmail,
      role: 'ADMIN',
      status: 'APPROVED',
    });
    const wsHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${wsToken}`,
      'X-Tenant-Id': String(wholesaleTenantId),
    };

    const wsProdRes = await fetch(`${baseUrl}/api/products`, {
      method: 'POST',
      headers: wsHeaders,
      body: JSON.stringify({
        article: `WS-${uniqueSuffix}`,
        barcode: `MN-8${uniqueSuffix.slice(-4)}`,
        brand: 'Service',
        category: 'Men',
        costPrice: 1800,
        maxPrice: 2500,
        pairsPerCarton: 12,
        totalStock: 24,
      }),
    });
    assert.equal(wsProdRes.status, 201);
    const wsProdBody = (await wsProdRes.json()) as { productId: number };
    wholesaleProdId = wsProdBody.productId;

    const wsCustRes = await pgClient.query<{ id: number }>(
      `INSERT INTO customers (tenant_id, name, phone, shop_name, market_name, city, email, address, notes, credit_limit, current_balance, outstanding_balance, ntn_number, customer_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING id`,
      [wholesaleTenantId, 'Khan Wholesalers', '+923110001122', 'Khan Footwear', 'Shah Alam', 'Lahore', '', '', '', 200000, 0, 0, '', 'WHOLESALER']
    );
    wholesaleCustomerId = wsCustRes.rows[0].id;

    const khataRes = await fetch(`${baseUrl}/api/pos/checkout`, {
      method: 'POST',
      headers: wsHeaders,
      body: JSON.stringify({
        customerId: wholesaleCustomerId,
        items: [{ productId: wholesaleProdId, quantity: 4, unitPrice: 2500, discount: 0 }],
        paymentMethod: 'KHATA',
        paidAmount: 3000,
      }),
    });
    assert.equal(khataRes.status, 201);
    const khataBody = (await khataRes.json()) as {
      sale: { remaining_balance: number; previous_balance: number; total_amount: number };
    };
    assert.equal(Number(khataBody.sale.previous_balance), 0);
    assert.equal(Number(khataBody.sale.total_amount), 10000);
    assert.equal(Number(khataBody.sale.remaining_balance), 7000);

    const ledgerCheck = await pgClient.query<{ running_balance: number; balance_change: number }>(
      'SELECT running_balance, balance_change FROM customer_ledger WHERE customer_id = $1 ORDER BY id DESC',
      [wholesaleCustomerId]
    );
    assert.ok(ledgerCheck.rows.length > 0);
    assert.equal(Number(ledgerCheck.rows[0].running_balance), 7000);
    assert.equal(Number(ledgerCheck.rows[0].balance_change), 7000);
  } finally {
    if (testProdId) {
      await fetch(
        `http://127.0.0.1:${(server.address() as any).port}/api/products/${testProdId}`,
        { method: 'DELETE', headers: adminHeaders }
      ).catch(() => {});
    }
    if (wholesaleProdId && wholesaleTenantId) {
      await pgClient.query('DELETE FROM products WHERE id = $1 AND tenant_id = $2', [wholesaleProdId, wholesaleTenantId]).catch(() => {});
    }
    if (wholesaleAdminId) {
      await pgClient.query('DELETE FROM users WHERE id = $1', [wholesaleAdminId]).catch(() => {});
    }
    if (wholesaleTenantId) {
      await pgClient.query('DELETE FROM company_settings WHERE tenant_id = $1', [wholesaleTenantId]).catch(() => {});
      await pgClient.query('DELETE FROM tenants WHERE id = $1', [wholesaleTenantId]).catch(() => {});
    }
    await pgClient.query('DELETE FROM users WHERE id = $1', [cashierId]).catch(() => {});
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});

test('offline syncEngine: FIFO ordering, transient network pause, and validation failure handling', async () => {
  const queue: QueuedSale[] = [
    {
      clientTxId: 'tx-second',
      createdAt: '2026-01-01T10:05:00.000Z',
      items: [{ productId: 1, article: 'SF-1', name: 'Shoe 1', quantity: 1, unitPrice: 2000, discount: 0 }],
      customerId: null,
      paymentMethod: 'CASH',
      cashReceived: 2000,
      changeGiven: 0,
      totalAmount: 2000,
      subtotal: 2000,
      totalDiscount: 0,
      notes: '',
      status: 'PENDING',
    },
    {
      clientTxId: 'tx-first',
      createdAt: '2026-01-01T10:00:00.000Z',
      items: [{ productId: 1, article: 'SF-1', name: 'Shoe 1', quantity: 1, unitPrice: 2000, discount: 0 }],
      customerId: null,
      paymentMethod: 'CASH',
      cashReceived: 2000,
      changeGiven: 0,
      totalAmount: 2000,
      subtotal: 2000,
      totalDiscount: 0,
      notes: '',
      status: 'PENDING',
    },
  ];

  const storage: OfflineSyncStorageAdapter = {
    async getSales() {
      return queue;
    },
    async updateSaleStatus(clientTxId, status, extra) {
      const target = queue.find((s) => s.clientTxId === clientTxId);
      if (target) {
        target.status = status;
        if (extra) Object.assign(target, extra);
      }
    },
  };

  const submittedOrder: string[] = [];
  const res1 = await processOfflineSalesQueue(storage, {
    async submitCheckout(payload) {
      submittedOrder.push(payload.clientTxId);
      return { invoiceNumber: `INV-${submittedOrder.length}` };
    },
  });

  assert.deepEqual(submittedOrder, ['tx-first', 'tx-second']);
  assert.equal(res1.synced, 2);
  assert.equal(res1.failed, 0);
  assert.equal(queue.every((q) => q.status === 'SYNCED'), true);

  // Transient network error leaves item PENDING and aborts remaining queue
  queue[0].status = 'PENDING';
  queue[1].status = 'PENDING';
  const resNet = await processOfflineSalesQueue(storage, {
    async submitCheckout() {
      throw new Error('Failed to fetch');
    },
  });
  assert.equal(resNet.abortedByNetwork, true);
  assert.equal(resNet.failed, 1);
  assert.equal(queue.find((q) => q.clientTxId === 'tx-first')?.status, 'PENDING');

  // Non-network business error marks item FAILED without aborting subsequent items
  const resBiz = await processOfflineSalesQueue(storage, {
    async submitCheckout(payload) {
      if (payload.clientTxId === 'tx-first') {
        throw new Error('Insufficient stock');
      }
      return { invoiceNumber: 'INV-OK' };
    },
  });
  assert.equal(resBiz.synced, 1);
  assert.equal(resBiz.failed, 1);
  assert.equal(queue.find((q) => q.clientTxId === 'tx-first')?.status, 'FAILED');
  assert.equal(queue.find((q) => q.clientTxId === 'tx-second')?.status, 'SYNCED');
});
