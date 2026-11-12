/**
 * Modular Ledger & Accounting Service Layer.
 * Centralizes customer Khata balance locking/reconciliation and supplier voucher generation
 * for reuse across POS, customer, purchase, and supplier workflows.
 */

import { pgClient } from '../../db/index.ts';
import { roundCurrency } from '../../utils/posCalculations.ts';

export async function fetchLockedCustomerPreviousBalance(
  customerId: number,
  tenantId: number
): Promise<number> {
  const custBalRes = await pgClient.query<{ outstanding_balance: string; current_balance: string }>(
    `SELECT COALESCE(outstanding_balance, current_balance, 0)::numeric as outstanding_balance
     FROM customers
     WHERE id = $1 AND tenant_id = $2
     FOR UPDATE`,
    [customerId, tenantId]
  );

  if (custBalRes.rows.length === 0) {
    return 0;
  }

  return Math.max(0, roundCurrency(parseFloat(custBalRes.rows[0].outstanding_balance || '0') || 0));
}

export async function recordCustomerSaleKhataEntry(params: {
  tenantId: number;
  customerId: number;
  effectiveSaleDate: string | null;
  saleId: number;
  invoiceNumber: string;
  currentCartTotal: number;
  effectivePaidAmount: number;
  balanceChange: number;
  remainingBalance: number;
  paymentMethod: string;
  notes: string;
}): Promise<void> {
  await pgClient.query(
    `UPDATE customers
     SET outstanding_balance = $1,
         current_balance = $1
     WHERE id = $2 AND tenant_id = $3`,
    [params.remainingBalance, params.customerId, params.tenantId]
  );

  await pgClient.query(
    `INSERT INTO customer_ledger (
      tenant_id, customer_id, transaction_date, invoice_id, invoice_number,
      total_bill, amount_paid, balance_change, running_balance, payment_method, notes
    ) VALUES ($1, $2, COALESCE($3, NOW()::date::text), $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      params.tenantId,
      params.customerId,
      params.effectiveSaleDate,
      params.saleId,
      params.invoiceNumber,
      params.currentCartTotal,
      params.effectivePaidAmount,
      params.balanceChange,
      params.remainingBalance,
      params.paymentMethod,
      params.notes,
    ]
  );
}

/**
 * Generates sequential tenant-scoped supplier payment voucher number (SPAY-000001 / SPAY-T2-000001).
 */
export async function generateSupplierPaymentNumber(tenantId: number): Promise<string> {
  const lastPay = await pgClient.query<{ payment_number: string }>(
    "SELECT payment_number FROM supplier_payments WHERE tenant_id = $1 AND payment_number LIKE 'SPAY-%' ORDER BY id DESC LIMIT 1",
    [tenantId]
  );

  let nextNum = 1;
  if (lastPay.rows.length > 0) {
    const rawNum = lastPay.rows[0].payment_number.replace(/^SPAY-(?:T\d+-)?/, '');
    const parsed = parseInt(rawNum, 10);
    if (!isNaN(parsed)) {
      nextNum = parsed + 1;
    }
  }

  const padded = String(nextNum).padStart(6, '0');
  return `SPAY-${padded}`;
}
