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
 * Real-world cash payment rules:
 * 1. If invoice is an exact multiple of Rs. 5,000 (e.g. Rs. 5,000, 10,000, 15,000, 20,000, 50,000):
 *    Exactly (total / 5000) notes of Rs. 5,000 pay the bill in full with zero change.
 *    A customer never tenders an extra Rs. 5,000 note when 1 note is already sufficient.
 *    -> Returns [total] (Exact only).
 * 2. If invoice is below Rs. 5,000 (e.g. Rs. 1,200, Rs. 3,800, Rs. 4,000):
 *    Offers exact amount, intermediate notes (next 500 / 1,000), and a single Rs. 5,000 note.
 * 3. If invoice is between Rs. 5,000 and Rs. 10,000 (e.g. Rs. 5,500, Rs. 8,000):
 *    Offers exact amount, intermediate notes (next 500 / 1,000), and two Rs. 5,000 notes = Rs. 10,000.
 * 4. If invoice exceeds Rs. 10,000 (and is not an exact multiple of 5,000):
 *    Offers exact amount, next Rs. 5,000 multiple, next Rs. 10,000 multiple, and Rs. 50,000 milestone packet where appropriate.
 *
 * Constraints:
 * - Never displays irrelevant amounts below the invoice total.
 * - At most 4 chips.
 */
export function generateRetailQuickReceiveChips(totalAmount: number): QuickReceiveChip[] {
  const total = Math.max(0, Math.round(totalAmount));
  if (total <= 0) return [];

  // Always include the exact invoice amount
  // RULE 1: If the invoice is ALREADY an exact multiple of Rs. 5,000 (the highest Pakistani banknote),
  // e.g. Rs. 5,000, Rs. 10,000, Rs. 15,000, Rs. 20,000:
  // Exactly (total / 5000) notes of Rs. 5,000 pay the bill in full with zero change.
  // A customer never hands an extra Rs. 5,000 note (e.g. Rs. 10,000 for a Rs. 5,000 bill)
  // when 1 note is completely sufficient.
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
    // Invoices below Rs. 5,000 (not a multiple of 5,000):
    // Offer intermediate small-note combinations (next 500, next 1,000)
    // plus exactly one Rs. 5,000 banknote (the highest Pakistani denomination).
    const next500 = Math.ceil(total / 500) * 500;
    if (next500 > total && next500 < 5000) {
      candidates.add(next500);
    }

    const next1000 = Math.ceil(total / 1000) * 1000;
    if (next1000 > total && next1000 < 5000) {
      candidates.add(next1000);
    }

    // Single Rs. 5,000 banknote tender
    candidates.add(5000);
  } else if (total < 10000) {
    // Invoices between Rs. 5,000 and Rs. 10,000 (e.g. 5,500, 8,000):
    // Offer intermediate note tender (next 500, next 1,000)
    // plus two Rs. 5,000 banknotes = Rs. 10,000 as the final tender chip.
    const next500 = Math.ceil(total / 500) * 500;
    if (next500 > total && next500 < 10000) {
      candidates.add(next500);
    }

    const next1000 = Math.ceil(total / 1000) * 1000;
    if (next1000 > total && next1000 < 10000) {
      candidates.add(next1000);
    }

    // Two Rs. 5,000 notes = Rs. 10,000
    candidates.add(10000);
  } else {
    // Invoices exceeding Rs. 10,000 (and not a multiple of 5,000):
    // 1. Next Rs. 5,000 banknote multiple (e.g. 12,000 -> 15,000 [three 5k notes])
    const next5000 = Math.ceil(total / 5000) * 5000;
    if (next5000 > total) {
      candidates.add(next5000);
    }

    // 2. Next Rs. 10,000 multiple (e.g. 12,000 -> 20,000 [four 5k notes], 16,000 -> 20,000)
    const next10000 = Math.ceil(total / 10000) * 10000;
    if (next10000 > total) {
      candidates.add(next10000);
    }

    // 3. For invoices between Rs. 20,000 and Rs. 48,000, include Rs. 50,000 (ten Rs. 5,000 notes / standard packet)
    if (total > 20000 && total < 50000 && candidates.size < 4) {
      candidates.add(50000);
    }

    // 4. Large invoices exceeding Rs. 50,000: generate next 50,000 and 100,000 milestones
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

  // Sort ascending and strictly limit to at most 4 chips
  const sorted = Array.from(candidates).sort((a, b) => a - b).slice(0, 4);

  return sorted.map((amt) => ({
    amount: amt,
    isExact: amt === total,
    label: amt === total ? 'Exact' : undefined,
  }));
}

interface QuickReceiveChipsProps {
  totalAmount: number;
  cashReceived: number | '';
  currencySymbol?: string;
  onSelectAmount: (amount: number) => void;
  formatPrice?: (price: number) => string;
}

export const QuickReceiveChips: React.FC<QuickReceiveChipsProps> = ({
  totalAmount,
  cashReceived,
  currencySymbol = 'Rs.',
  onSelectAmount,
  formatPrice = (val) => val.toLocaleString('en-PK', { maximumFractionDigits: 0 }),
}) => {
  const chips = React.useMemo(() => generateRetailQuickReceiveChips(totalAmount), [totalAmount]);

  if (chips.length === 0) return null;

  return (
    <div className="space-y-1.5" aria-label="Quick cash receive suggestions">
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1">
          <Banknote className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
          <span>Quick Receive Note:</span>
        </span>
        <span className="text-[10px] text-slate-400 dark:text-slate-500">
          {chips.length === 1 ? 'Tap for exact cash' : 'Tap note for instant change'}
        </span>
      </div>

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
              className={`relative py-1.5 px-1 rounded-xl border text-center transition-all duration-150 cursor-pointer select-none active:scale-[0.97] flex flex-col items-center justify-center min-h-[38px] ${
                isSelected
                  ? 'bg-purple-600 dark:bg-purple-600 border-purple-500 text-white shadow-sm shadow-purple-600/30 font-bold'
                  : 'bg-white dark:bg-[#0A0E1A] hover:bg-purple-50 dark:hover:bg-purple-950/40 text-slate-700 dark:text-slate-200 hover:text-purple-700 dark:hover:text-purple-300 border-purple-200/80 dark:border-purple-800/60 hover:border-purple-400 dark:hover:border-purple-600 font-semibold'
              }`}
              title={
                chip.isExact
                  ? `Exact invoice amount: ${currencySymbol} ${formatPrice(chip.amount)}`
                  : `Customer tenders ${currencySymbol} ${formatPrice(chip.amount)} note`
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
                {chip.isExact ? 'Exact' : 'Cash'}
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
