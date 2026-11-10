import React from 'react';
import { Banknote } from 'lucide-react';

export interface QuickReceiveChip {
  amount: number;
  isExact: boolean;
  label?: string;
}

/**
 * Calculates dynamic quick-receive cash denominations in Pakistani Rupees (PKR)
 * based on the invoice amount and the highest Pakistani banknote denomination (Rs. 5,000).
 *
 * Real-world retail cash payment rules:
 * 1. If invoice is an exact multiple of Rs. 5,000 (e.g. Rs. 5,000, 10,000, 15,000, 20,000, 50,000):
 *    Exactly (total / 5000) notes of Rs. 5,000 pay the bill in full with zero change.
 *    -> Returns [total] (Exact only).
 * 2. If invoice is below Rs. 5,000:
 *    Offers exact amount, intermediate notes (next 500 / 1,000), and a single Rs. 5,000 note.
 * 3. If invoice is between Rs. 5,000 and Rs. 10,000:
 *    Offers exact amount, intermediate notes (next 500 / 1,000), and two Rs. 5,000 notes = Rs. 10,000.
 * 4. If invoice exceeds Rs. 10,000 (and is not an exact multiple of 5,000):
 *    Offers exact amount, next Rs. 5,000 multiple, next Rs. 10,000 multiple, and Rs. 50,000 milestone packet.
 */
export function generateRetailQuickReceiveChips(totalAmount: number): QuickReceiveChip[] {
  const total = Math.max(0, Math.round(totalAmount));
  if (total <= 0) return [];

  // RULE 1: If the invoice is ALREADY an exact multiple of Rs. 5,000
  if (total % 5000 === 0) {
    return [
      {
        amount: total,
        isExact: true,
        label: 'Exact',
      },
    ];
  }

  const candidates = new Set<number>();
  candidates.add(total);

  if (total < 5000) {
    const next500 = Math.ceil(total / 500) * 500;
    if (next500 > total && next500 < 5000) {
      candidates.add(next500);
    }

    const next1000 = Math.ceil(total / 1000) * 1000;
    if (next1000 > total && next1000 < 5000) {
      candidates.add(next1000);
    }

    candidates.add(5000);
  } else if (total < 10000) {
    const next500 = Math.ceil(total / 500) * 500;
    if (next500 > total && next500 < 10000) {
      candidates.add(next500);
    }

    const next1000 = Math.ceil(total / 1000) * 1000;
    if (next1000 > total && next1000 < 10000) {
      candidates.add(next1000);
    }

    candidates.add(10000);
  } else {
    const next5000 = Math.ceil(total / 5000) * 5000;
    if (next5000 > total) {
      candidates.add(next5000);
    }

    const next10000 = Math.ceil(total / 10000) * 10000;
    if (next10000 > total) {
      candidates.add(next10000);
    }

    if (total > 20000 && total < 50000 && candidates.size < 4) {
      candidates.add(50000);
    }

    if (total > 50000) {
      const next50000 = Math.ceil(total / 50000) * 50000;
      if (next50000 > total && candidates.size < 4) {
        candidates.add(next50000);
      }
      const next100000 = Math.ceil(total / 100000) * 100000;
      if (next100000 > total && candidates.size < 4) {
        candidates.add(next100000);
      }
    }
  }

  const sorted = Array.from(candidates).sort((a, b) => a - b).slice(0, 4);

  return sorted.map((amt) => ({
    amount: amt,
    isExact: amt === total,
    label: amt === total ? 'Exact' : undefined,
  }));
}

/**
 * Calculates dynamic quick-receive cash tender chips tailored for B2B wholesale transactions.
 *
 * Core Rules:
 * 1. Smart Chip Capping:
 *    Calculates totalCombined = (Current Invoice Total) + (Customer Khata Ledger Due Balance).
 *    Strict Invariant: NEVER suggest or display any chip amount exceeding totalCombined.
 * 2. Dynamic Wholesale Denominations:
 *    Intelligently incorporates wholesale cash milestones (e.g., 20,000, 50,000, 100,000, etc.)
 *    that are <= totalCombined.
 * 3. Cashier Context:
 *    - If customer has an existing Khata ledger balance:
 *      Includes current invoice ('Bill Only') and full combined balance ('Pay All'),
 *      plus clean intermediate wholesale milestones between 0 and totalCombined.
 *    - If walk-in cash customer (ledger balance = 0):
 *      Includes the exact invoice ('Exact') plus round wholesale milestone tenders <= invoice total.
 * 4. Density:
 *    Returns up to 4 clean, distinct, ascending chips.
 */
export function generateWholesaleQuickReceiveChips(
  invoiceAmount: number,
  ledgerBalance: number = 0
): QuickReceiveChip[] {
  const invoice = Math.max(0, Math.round(invoiceAmount));
  const ledger = Math.max(0, Math.round(ledgerBalance));
  const totalCombined = invoice + ledger;

  if (totalCombined <= 0) return [];

  const candidatesMap = new Map<number, QuickReceiveChip>();

  // 1. Current Invoice Amount (if > 0 and <= totalCombined)
  if (invoice > 0 && invoice <= totalCombined) {
    candidatesMap.set(invoice, {
      amount: invoice,
      isExact: invoice === totalCombined,
      label: ledger > 0 ? 'Bill Only' : 'Exact Bill',
    });
  }

  // 2. Full Combined Settlement (Bill + Ledger) if customer has ledger balance
  if (ledger > 0 && totalCombined > 0) {
    candidatesMap.set(totalCombined, {
      amount: totalCombined,
      isExact: true,
      label: 'Pay All',
    });
  }

  // 3. Wholesale B2B milestone denominations (20k, 50k, 100k, etc.)
  const wholesaleMilestones = [
    5000, 10000, 20000, 25000, 50000, 75000, 100000, 150000, 200000, 250000, 500000, 1000000,
  ];

  // Strictly enforce capping at totalCombined (Never exceed combined balance)
  for (const milestone of wholesaleMilestones) {
    if (milestone <= totalCombined && milestone > 0) {
      if (!candidatesMap.has(milestone)) {
        candidatesMap.set(milestone, {
          amount: milestone,
          isExact: milestone === totalCombined,
          label: milestone === totalCombined ? (ledger > 0 ? 'Pay All' : 'Exact') : undefined,
        });
      }
    }
  }

  // Filter and sort ascending
  const allValid = Array.from(candidatesMap.values())
    .filter((c) => c.amount <= totalCombined && c.amount > 0)
    .sort((a, b) => a.amount - b.amount);

  if (allValid.length <= 4) {
    return allValid;
  }

  // If more than 4 chips, intelligently select the 4 most effective chips:
  const essentialSet = new Set<number>();
  if (invoice > 0) essentialSet.add(invoice);
  if (ledger > 0) essentialSet.add(totalCombined);

  // Prioritized wholesale milestones (100k, 50k, 20k)
  const preferredMilestones = [100000, 50000, 20000, 10000, 200000, 25000, 5000, 150000, 500000];
  for (const m of preferredMilestones) {
    if (essentialSet.size >= 4) break;
    if (m <= totalCombined && allValid.some((c) => c.amount === m)) {
      essentialSet.add(m);
    }
  }

  // If still room, pick closest to totalCombined
  if (essentialSet.size < 4) {
    for (let i = allValid.length - 1; i >= 0; i--) {
      if (essentialSet.size >= 4) break;
      essentialSet.add(allValid[i].amount);
    }
  }

  const selected = allValid
    .filter((c) => essentialSet.has(c.amount))
    .sort((a, b) => a.amount - b.amount);

  // Final invariant check: NEVER suggest or display an amount exceeding totalCombined
  return selected.filter((c) => c.amount <= totalCombined);
}

interface QuickReceiveChipsProps {
  totalAmount: number;
  customerLedgerBalance?: number;
  isWholesale?: boolean;
  cashReceived: number | '';
  currencySymbol?: string;
  onSelectAmount: (amount: number) => void;
  formatPrice?: (price: number) => string;
}

export const QuickReceiveChips: React.FC<QuickReceiveChipsProps> = ({
  totalAmount,
  customerLedgerBalance = 0,
  isWholesale = false,
  cashReceived,
  currencySymbol = 'Rs.',
  onSelectAmount,
  formatPrice = (val) => val.toLocaleString('en-PK', { maximumFractionDigits: 0 }),
}) => {
  const chips = React.useMemo(() => {
    if (isWholesale) {
      return generateWholesaleQuickReceiveChips(totalAmount, customerLedgerBalance);
    }
    return generateRetailQuickReceiveChips(totalAmount);
  }, [isWholesale, totalAmount, customerLedgerBalance]);

  if (chips.length === 0) return null;

  const totalCombined = Math.max(0, Math.round(totalAmount + Math.max(0, customerLedgerBalance || 0)));

  return (
    <div className="space-y-1.5" aria-label="Quick cash receive suggestions">
      {/* Properly aligned Header & Quick-Receive Notes */}
      <div className="flex items-center justify-between text-[11px] pb-0.5">
        <span className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
          <Banknote className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 shrink-0" />
          <span>{isWholesale ? 'Wholesale Quick Tender:' : 'Quick Receive Note:'}</span>
        </span>
        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
          {isWholesale
            ? customerLedgerBalance && customerLedgerBalance > 0
              ? `Max Balance: ${currencySymbol} ${formatPrice(totalCombined)}`
              : `Capped at Invoice: ${currencySymbol} ${formatPrice(totalAmount)}`
            : chips.length === 1
            ? 'Tap for exact cash'
            : 'Tap note for instant change'}
        </span>
      </div>

      {/* Grid of Dynamic Quick-Receive Amount Chips */}
      <div
        className="grid gap-1.5"
        style={{
          gridTemplateColumns: `repeat(${chips.length}, minmax(0, 1fr))`,
        }}
      >
        {chips.map((chip) => {
          const isSelected =
            typeof cashReceived === 'number'
              ? cashReceived === chip.amount
              : chip.isExact && cashReceived === '';

          return (
            <button
              key={chip.amount}
              type="button"
              onClick={() => onSelectAmount(chip.amount)}
              className={`relative py-1.5 px-1 rounded-xl border text-center transition-all duration-150 cursor-pointer select-none active:scale-[0.97] flex flex-col items-center justify-center min-h-[42px] ${
                isSelected
                  ? 'bg-purple-600 dark:bg-purple-600 border-purple-500 text-white shadow-sm shadow-purple-600/30 font-bold ring-2 ring-purple-500/20'
                  : 'bg-white dark:bg-[#0A0E1A] hover:bg-purple-50 dark:hover:bg-purple-950/40 text-slate-700 dark:text-slate-200 hover:text-purple-700 dark:hover:text-purple-300 border-purple-200/80 dark:border-purple-800/60 hover:border-purple-400 dark:hover:border-purple-600 font-semibold'
              }`}
              title={
                chip.label
                  ? `${chip.label}: ${currencySymbol} ${formatPrice(chip.amount)}`
                  : `Tender ${currencySymbol} ${formatPrice(chip.amount)}`
              }
            >
              <span
                className={`text-[9px] font-black tracking-wider uppercase leading-none mb-0.5 ${
                  isSelected
                    ? 'text-purple-100'
                    : chip.isExact
                    ? 'text-purple-600 dark:text-purple-400 font-extrabold'
                    : 'text-slate-400 dark:text-slate-500'
                }`}
              >
                {chip.label || (chip.isExact ? 'Exact' : 'Cash')}
              </span>
              <span className="font-mono font-bold text-xs tracking-tight leading-none">
                {formatPrice(chip.amount)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
