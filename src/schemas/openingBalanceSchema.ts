import { z } from 'zod';

/** Largest value that fits NUMERIC(12, 2). */
export const MAX_OPENING_BALANCE = 9_999_999_999.99;

/** Parses user input ('', '1,250.5', 1250.5) into a number; empty input means 0. */
const amountField = z.preprocess(
  (value) => {
    if (value === undefined || value === null) return 0;
    if (typeof value === 'string') {
      const cleaned = value.replace(/,/g, '').trim();
      return cleaned === '' ? 0 : Number(cleaned);
    }
    return value;
  },
  z
    .number({ message: 'Opening balance must be a valid number.' })
    .finite('Opening balance must be a valid number.')
    .min(0, 'Opening balance cannot be negative.')
    .max(MAX_OPENING_BALANCE, 'Opening balance is too large.')
    .transform((n) => Math.round(n * 100) / 100)
);

/**
 * Customer opening balance (wholesale stores).
 * The amount is always a receivable: money the customer already owes the store.
 */
export const customerOpeningBalanceSchema = z.object({
  openingBalance: amountField.default(0),
});

/**
 * Supplier opening balance (retail and wholesale stores).
 * - PAYABLE: the store owes the supplier (credit balance, increases what we owe).
 * - ADVANCE: the store prepaid the supplier (debit balance, reduces what we owe).
 */
export const SUPPLIER_OPENING_BALANCE_TYPES = ['PAYABLE', 'ADVANCE'] as const;
export type SupplierOpeningBalanceType = (typeof SUPPLIER_OPENING_BALANCE_TYPES)[number];

export const supplierOpeningBalanceSchema = z.object({
  openingBalance: amountField.default(0),
  openingBalanceType: z.enum(SUPPLIER_OPENING_BALANCE_TYPES).default('PAYABLE'),
});

export type CustomerOpeningBalanceInput = z.infer<typeof customerOpeningBalanceSchema>;
export type SupplierOpeningBalanceInput = z.infer<typeof supplierOpeningBalanceSchema>;
