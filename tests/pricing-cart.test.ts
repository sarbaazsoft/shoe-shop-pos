import test from 'node:test';
import assert from 'node:assert/strict';

import {
  roundCurrency,
  calculateCostPlusPrice,
  calculateProfitMarginPercent,
  calculateReturnNetUnitPrice,
  calculateCartTotals,
  reconcileInvoiceBalance,
} from '../src/utils/posCalculations.ts';
import {
  validateAndNormalizeProductPricing,
  isHalfCartonAllowed,
  calculateMinSaleQuantity,
} from '../src/schemas/productSchema.ts';

test('pricing: real-time cost-plus price and profit margin calculations', () => {
  assert.equal(calculateCostPlusPrice(2000, 25), 2500);
  assert.equal(calculateCostPlusPrice(1500, 0), 1500);
  assert.equal(calculateCostPlusPrice(0, 40), 0);
  assert.equal(calculateCostPlusPrice(Number.NaN, 30), 0);

  assert.equal(calculateProfitMarginPercent(2000, 2500), 25);
  assert.equal(calculateProfitMarginPercent(2500, 2000), -20);
  assert.equal(calculateProfitMarginPercent(0, 500), 100);
  assert.equal(calculateProfitMarginPercent(0, 0), 0);
  assert.equal(roundCurrency(123.456), 123.46);
  assert.equal(roundCurrency(Number.POSITIVE_INFINITY), 0);
});

test('pricing: FIXED vs NEGOTIABLE validation edge cases', () => {
  const invalidNaN = validateAndNormalizeProductPricing({
    pricingMode: 'FIXED',
    costPrice: 'abc',
    maxPrice: 1000,
  });
  assert.equal(invalidNaN.success, false);

  const negBoundaryFail = validateAndNormalizeProductPricing({
    pricingMode: 'NEGOTIABLE',
    costPrice: 1500,
    minPrice: 1400,
    maxPrice: 1900,
  });
  assert.equal(negBoundaryFail.success, false);
  assert.ok(negBoundaryFail.fieldErrors.minPrice);

  const negBoundaryPass = validateAndNormalizeProductPricing({
    pricingMode: 'NEGOTIABLE',
    costPrice: 1500,
    minPrice: 1500,
    maxPrice: 1900,
  });
  assert.equal(negBoundaryPass.success, true);
  assert.equal(negBoundaryPass.data?.minPrice, 1500);
  assert.equal(negBoundaryPass.data?.maxPrice, 1900);
});

test('cart & wholesale packing: isHalfCartonAllowed and calculateMinSaleQuantity', () => {
  assert.equal(isHalfCartonAllowed({ allowHalfCarton: false }, { allowHalfCarton: true }), false);
  assert.equal(isHalfCartonAllowed({ allow_half_carton: false }, { allowHalfCarton: true }), false);
  assert.equal(isHalfCartonAllowed(undefined, { allowHalfCarton: false }), false);
  assert.equal(isHalfCartonAllowed(undefined, { allowHalfCarton: true }), true);
  assert.equal(isHalfCartonAllowed({ allowHalfCarton: true }, { allowHalfCarton: false }), true);

  assert.equal(calculateMinSaleQuantity({ pairsPerCarton: 12, allowHalfCarton: true }, { businessType: 'WHOLESALE', allowHalfCarton: true }), 6);
  assert.equal(calculateMinSaleQuantity({ pairsPerCarton: 16, allowHalfCarton: true }, { businessType: 'WHOLESALE', allowHalfCarton: true }), 8);
  assert.equal(calculateMinSaleQuantity({ pairsPerCarton: 16, allowHalfCarton: false }, { businessType: 'WHOLESALE', allowHalfCarton: true }), 16);
  assert.equal(calculateMinSaleQuantity({ pairsPerCarton: 12, allowHalfCarton: false }, { businessType: 'RETAIL', allowHalfCarton: false }), 1);
});

test('regression: calculateReturnNetUnitPrice prevents double-subtraction of item discount', () => {
  // Suppose 2 pairs sold at Rs. 2000/pair with Rs. 400 total line discount:
  // sale_items.subtotal saved in DB is (2000 * 2) - 400 = 3600 -> net unit price = 1800 (NOT 1600!).
  const netUnit = calculateReturnNetUnitPrice({
    soldQuantity: 2,
    unitPrice: 2000,
    discount: 400,
    subtotal: 3600,
  });
  assert.equal(netUnit, 1800);

  // Fallback when subtotal is omitted computes (unitPrice * soldQty - discount) / soldQty
  const fallbackUnit = calculateReturnNetUnitPrice({
    soldQuantity: 2,
    unitPrice: 2000,
    discount: 400,
  });
  assert.equal(fallbackUnit, 1800);

  // Explicit effectiveUnitPrice takes precedence
  const explicitUnit = calculateReturnNetUnitPrice({
    effectiveUnitPrice: 1750,
    soldQuantity: 2,
    subtotal: 3600,
  });
  assert.equal(explicitUnit, 1750);
});

test('cart calculations: calculateCartTotals handles items, line discounts, and exchanges', () => {
  const summary = calculateCartTotals(
    [
      { quantity: 2, unitPrice: 2500, discount: 200 },
      { quantity: 1, unitPrice: 1500, discount: 0 },
    ],
    [{ quantity: 1, unitRefundPrice: 1800 }]
  );

  assert.equal(summary.totalItemsCount, 3);
  assert.equal(summary.grossSubtotal, 6500);
  assert.equal(summary.totalDiscounts, 200);
  assert.equal(summary.newSaleTotal, 6300);
  assert.equal(summary.totalExchangeCredit, 1800);
  assert.equal(summary.netDifference, 4500);
  assert.equal(summary.netTotalPayable, 4500);

  const creditSurplus = calculateCartTotals(
    [{ quantity: 1, unitPrice: 1000, discount: 0 }],
    [{ quantity: 1, unitRefundPrice: 1500 }]
  );
  assert.equal(creditSurplus.netDifference, -500);
  assert.equal(creditSurplus.netTotalPayable, 0);
});

test('ledger reconciliation: reconcileInvoiceBalance handles retail, wholesale Khata, and return credit reducing prior balance', () => {
  // 1. Retail checkout with cash overpayment gives change
  const retailOverpay = reconcileInvoiceBalance({
    isWholesaleStore: false,
    customerPreviousBalance: 0,
    calculatedSubtotal: 4000,
    calculatedTotalDiscount: 500,
    totalExchangeCredit: 0,
    effectivePaidAmount: 4000,
  });
  assert.equal(retailOverpay.totalAmountDue, 3500);
  assert.equal(retailOverpay.remainingBalance, 0);
  assert.equal(retailOverpay.changeGivenDue, 500);

  // 2. Wholesale Khata sale adding to existing customer balance
  const wholesaleKhata = reconcileInvoiceBalance({
    isWholesaleStore: true,
    customerPreviousBalance: 10000,
    calculatedSubtotal: 12000,
    calculatedTotalDiscount: 1000,
    totalExchangeCredit: 0,
    effectivePaidAmount: 5000,
  });
  assert.equal(wholesaleKhata.currentCartTotal, 11000);
  assert.equal(wholesaleKhata.totalAmountDue, 21000);
  assert.equal(wholesaleKhata.remainingBalance, 16000);
  assert.equal(wholesaleKhata.balanceChange, 6000);
  assert.equal(wholesaleKhata.changeGivenDue, 0);

  // 3. Wholesale return credit exceeding new invoice reduces customer prior Khata balance
  // Prev Khata: 10,000 | New items: 2,000 | Return credit: 5,000 -> netCurrentInvoice = -3,000
  // Total due: 7,000 | Paid: 0 -> remainingBalance: 7,000 | balanceChange: -3,000 | changeGivenDue: 0
  const wholesaleCreditAbsorbed = reconcileInvoiceBalance({
    isWholesaleStore: true,
    customerPreviousBalance: 10000,
    calculatedSubtotal: 2000,
    calculatedTotalDiscount: 0,
    totalExchangeCredit: 5000,
    effectivePaidAmount: 0,
  });
  assert.equal(wholesaleCreditAbsorbed.netCurrentInvoice, -3000);
  assert.equal(wholesaleCreditAbsorbed.totalAmountDue, 7000);
  assert.equal(wholesaleCreditAbsorbed.remainingBalance, 7000);
  assert.equal(wholesaleCreditAbsorbed.balanceChange, -3000);
  assert.equal(wholesaleCreditAbsorbed.changeGivenDue, 0);

  // 4. Wholesale return credit exceeding BOTH new invoice AND prior Khata balance triggers cash refund
  const wholesaleNetRefund = reconcileInvoiceBalance({
    isWholesaleStore: true,
    customerPreviousBalance: 1000,
    calculatedSubtotal: 2000,
    calculatedTotalDiscount: 0,
    totalExchangeCredit: 5000,
    effectivePaidAmount: 0,
  });
  assert.equal(wholesaleNetRefund.totalAmountDue, 0);
  assert.equal(wholesaleNetRefund.remainingBalance, 0);
  assert.equal(wholesaleNetRefund.balanceChange, -1000);
  assert.equal(wholesaleNetRefund.changeGivenDue, 2000);
});
