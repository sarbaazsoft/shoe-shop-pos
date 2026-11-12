/**
 * Shared pure calculation helpers for POS pricing, profit margins, cart totals,
 * return unit prices, and wholesale Khata balance reconciliation.
 */

export interface CartCalculationItem {
  quantity: number;
  unitPrice: number;
  discount?: number;
}

export interface CartTotalsSummary {
  totalItemsCount: number;
  grossSubtotal: number;
  totalDiscounts: number;
  newSaleTotal: number;
  totalExchangeCredit: number;
  netDifference: number;
  netTotalPayable: number;
}

export function roundCurrency(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

/**
 * Calculates cost-plus selling price from cost and profit margin percentage.
 */
export function calculateCostPlusPrice(costPrice: number, profitMarginPercent: number): number {
  const safeCost = Number.isFinite(costPrice) && costPrice > 0 ? costPrice : 0;
  const safeMargin = Number.isFinite(profitMarginPercent) ? profitMarginPercent : 0;
  return Math.max(0, Math.round(safeCost * (1 + safeMargin / 100)));
}

/**
 * Calculates profit margin percentage relative to cost price.
 */
export function calculateProfitMarginPercent(costPrice: number, sellingPrice: number): number {
  const safeCost = Number.isFinite(costPrice) ? costPrice : 0;
  const safeSell = Number.isFinite(sellingPrice) ? sellingPrice : 0;
  if (safeCost <= 0) return safeSell > 0 ? 100 : 0;
  return roundCurrency(((safeSell - safeCost) / safeCost) * 100);
}

/**
 * Computes net refund unit price for a sold line item.
 * Note: `sale_items.subtotal` already equals `(unit_price * quantity) - discount`,
 * so discount MUST NOT be subtracted a second time.
 */
export function calculateReturnNetUnitPrice(item: {
  effectiveUnitPrice?: number | string | null;
  soldQuantity?: number | string | null;
  quantity?: number | string | null;
  subtotal?: number | string | null;
  unitPrice?: number | string | null;
  unit_price?: number | string | null;
  discount?: number | string | null;
}): number {
  const explicitEffective = Number(item.effectiveUnitPrice);
  if (Number.isFinite(explicitEffective) && explicitEffective >= 0) {
    return roundCurrency(explicitEffective);
  }

  const soldQty = Number(item.soldQuantity ?? item.quantity ?? 0) || 0;
  const unitPrice = Number(item.unitPrice ?? item.unit_price ?? 0) || 0;
  const discount = Number(item.discount ?? 0) || 0;

  if (soldQty <= 0) {
    return Number.isFinite(unitPrice) && unitPrice >= 0 ? roundCurrency(unitPrice) : 0;
  }

  const hasSubtotal = item.subtotal !== undefined && item.subtotal !== null && item.subtotal !== '';
  const parsedSubtotal = Number(item.subtotal);
  if (hasSubtotal && Number.isFinite(parsedSubtotal)) {
    return Math.max(0, roundCurrency(parsedSubtotal / soldQty));
  }

  return Math.max(0, roundCurrency((unitPrice * soldQty - discount) / soldQty));
}

/**
 * Computes POS cart totals and exchange net difference.
 */
export function calculateCartTotals(
  items: CartCalculationItem[],
  exchangeItems: Array<{ quantity?: number; unitRefundPrice?: number; subtotal?: number }> = []
): CartTotalsSummary {
  const totalItemsCount = items.reduce((acc, item) => acc + (Number(item.quantity) || 0), 0);
  const grossSubtotal = items.reduce(
    (acc, item) => acc + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0),
    0
  );
  const totalDiscounts = items.reduce((acc, item) => acc + (Number(item.discount) || 0), 0);
  const newSaleTotal = Math.max(0, roundCurrency(grossSubtotal - totalDiscounts));

  const totalExchangeCredit = roundCurrency(
    exchangeItems.reduce((acc, ex) => {
      const sub =
        ex.subtotal !== undefined && ex.subtotal !== null
          ? Number(ex.subtotal) || 0
          : (Number(ex.quantity) || 0) * (Number(ex.unitRefundPrice) || 0);
      return acc + sub;
    }, 0)
  );

  const netDifference = roundCurrency(newSaleTotal - totalExchangeCredit);
  const netTotalPayable = Math.max(0, netDifference);

  return {
    totalItemsCount,
    grossSubtotal: roundCurrency(grossSubtotal),
    totalDiscounts: roundCurrency(totalDiscounts),
    newSaleTotal,
    totalExchangeCredit,
    netDifference,
    netTotalPayable,
  };
}

export interface InvoiceBalanceReconciliationInput {
  isWholesaleStore: boolean;
  customerPreviousBalance: number;
  calculatedSubtotal: number;
  calculatedTotalDiscount: number;
  totalExchangeCredit: number;
  effectivePaidAmount: number;
}

export interface InvoiceBalanceReconciliationResult {
  netCurrentInvoice: number;
  currentCartTotal: number;
  totalAmountDue: number;
  remainingBalance: number;
  balanceChange: number;
  changeGivenDue: number;
}

/**
 * Reconciles invoice net due, customer previous Khata balance, remaining balance,
 * customer ledger balance delta, and cash change / return refund.
 */
export function reconcileInvoiceBalance(
  input: InvoiceBalanceReconciliationInput
): InvoiceBalanceReconciliationResult {
  const prevBalance = Math.max(0, roundCurrency(input.customerPreviousBalance || 0));
  const netSaleAfterDiscount = roundCurrency(input.calculatedSubtotal - input.calculatedTotalDiscount);
  const netDifference = roundCurrency(netSaleAfterDiscount - input.totalExchangeCredit);
  const paid = Math.max(0, roundCurrency(input.effectivePaidAmount || 0));

  const netCurrentInvoice = input.isWholesaleStore
    ? netDifference
    : Math.max(0, netDifference);

  const rawDueWithPrev = roundCurrency(prevBalance + netCurrentInvoice);
  const totalAmountDue = input.isWholesaleStore
    ? Math.max(0, rawDueWithPrev)
    : roundCurrency(netCurrentInvoice + prevBalance);

  const currentCartTotal = Math.max(0, netCurrentInvoice);
  const remainingBalance = Math.max(0, roundCurrency(totalAmountDue - paid));
  const balanceChange = roundCurrency(remainingBalance - prevBalance);

  let changeGivenDue = 0;
  if (paid > totalAmountDue) {
    changeGivenDue = roundCurrency(paid - totalAmountDue);
  } else if (input.isWholesaleStore) {
    if (rawDueWithPrev < 0) {
      changeGivenDue = Math.abs(rawDueWithPrev);
    }
  } else if (netDifference < 0) {
    changeGivenDue = Math.abs(netDifference);
  }

  return {
    netCurrentInvoice,
    currentCartTotal,
    totalAmountDue,
    remainingBalance,
    balanceChange,
    changeGivenDue,
  };
}
