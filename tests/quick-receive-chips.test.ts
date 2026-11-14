import test from 'node:test';
import assert from 'node:assert/strict';

import {
  filterDisplayQuickReceiveChips,
  generateRetailQuickReceiveChips,
  generateWholesaleQuickReceiveChips,
} from '../src/components/pos/QuickReceiveChips.tsx';

test('generateRetailQuickReceiveChips: returns 5 chips for 3250 with 3300 between Exact and 3500', () => {
  const chips = generateRetailQuickReceiveChips(3250);
  assert.deepEqual(
    chips.map((c) => c.amount),
    [3250, 3300, 3500, 4000, 5000]
  );
  assert.equal(chips[0].isExact, true);
  assert.equal(chips[0].label, 'Exact');
  assert.equal(chips.some((c) => c.amount % 100 === 75), false);
});

test('filterDisplayQuickReceiveChips: hides Exact when > 3 non-exact chips exist, renders when < 4', () => {
  // 3250 has 4 non-exact chips [3300, 3500, 4000, 5000] (> 3) -> Exact is hidden
  const for3250 = filterDisplayQuickReceiveChips(generateRetailQuickReceiveChips(3250));
  assert.deepEqual(
    for3250.map((c) => c.amount),
    [3300, 3500, 4000, 5000]
  );

  // 4250 has 3 non-exact chips [4300, 4500, 5000] (< 4) -> Exact is kept
  const for4250 = filterDisplayQuickReceiveChips(generateRetailQuickReceiveChips(4250));
  assert.deepEqual(
    for4250.map((c) => c.amount),
    [4250, 4300, 4500, 5000]
  );

  // 5000 has 0 non-exact chips (< 4) -> Exact is kept
  const for5000 = filterDisplayQuickReceiveChips(generateRetailQuickReceiveChips(5000));
  assert.deepEqual(
    for5000.map((c) => c.amount),
    [5000]
  );
});

test('generateRetailQuickReceiveChips: ignores rare Rs. 75 note and supports up to 5 chips across tiers', () => {
  // Small bill below 100 uses Rs. 50 increment (never Rs. 75)
  assert.deepEqual(
    generateRetailQuickReceiveChips(40).map((c) => c.amount),
    [40, 50, 100, 500, 1000]
  );

  // Bill between 5000 and 10000
  assert.deepEqual(
    generateRetailQuickReceiveChips(6250).map((c) => c.amount),
    [6250, 6300, 6500, 7000, 10000]
  );

  // Exact multiple of 5000 returns Exact only
  assert.deepEqual(
    generateRetailQuickReceiveChips(10000).map((c) => c.amount),
    [10000]
  );

  // Bill above 10000 returns up to 5 chips
  assert.deepEqual(
    generateRetailQuickReceiveChips(12250).map((c) => c.amount),
    [12250, 12500, 13000, 15000, 20000]
  );
});

test('generateWholesaleQuickReceiveChips: caps at invoice + ledger balance for wholesale accounts', () => {
  const withLedger = generateWholesaleQuickReceiveChips(3250, 20000);
  assert.ok(withLedger.every((c) => c.amount <= 23250));
  assert.equal(withLedger[0].amount, 3250);
  assert.equal(withLedger[0].label, 'Bill Only');
  assert.equal(withLedger[withLedger.length - 1].amount, 23250);
  assert.equal(withLedger[withLedger.length - 1].label, 'Pay All');

  const displayWholesale = filterDisplayQuickReceiveChips(withLedger, {
    isWholesale: true,
    customerLedgerBalance: 20000,
  });
  assert.equal(displayWholesale[displayWholesale.length - 1].label, 'Pay All');
});
