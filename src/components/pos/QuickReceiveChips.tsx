import React from 'react';
import { Banknote } from 'lucide-react';

export interface QuickReceiveChip {
  amount: number;
  isExact: boolean;
  label?: string;
}

/**
 * Calculates dynamic quick-receive cash denominations in Pakistani Rupees (PKR)
 * tailored specifically for retail footwear checkouts.
 *
 * Rules:
 * - Strict limit of at most 4 chips.
 * - Always includes the "Exact Amount".
 * - Small invoices (<= Rs. 1,000): next 100, next 500, or Rs. 1,000 note.
 * - Medium invoices (Rs. 1,001 to Rs. 5,000): rounds to next 500, 1,000, and 5,000 note.
 * - Larger invoices (Rs. 5,001+): rounds to next 1,000, 5,000, 10,000, 15,000+ notes.
 */
export function generateRetailQuickReceiveChips(totalAmount: number): QuickReceiveChip[] {
  const total = Math.max(0, Math.round(totalAmount));
  if (total <= 0) return [];

  const candidates = new Set<number>();
  // 1. Always include the exact invoice amount
  candidates.add(total);

  if (total <= 1000) {
    // Next 100 (e.g. 320 -> 400)
    const next100 = Math.ceil(total / 100) * 100;
    if (next100 > total) candidates.add(next100);

    // Next 500 note (e.g. 320 -> 500, 750 -> 1000)
    const next500 = Math.ceil(total / 500) * 500;
    if (next500 > total) candidates.add(next500);

    // Next 1,000 note
    const next1000 = Math.ceil(total / 1000) * 1000;
    if (next1000 > total) candidates.add(next1000);

    // Fill up to 4 with convenient common notes (500, 1000, 1500, 2000, 5000)
    const standardNotes = [500, 1000, 1500, 2000, 5000];
    for (const note of standardNotes) {
      if (candidates.size >= 4) break;
      if (note > total) candidates.add(note);
    }
  } else if (total <= 5000) {
    // Medium retail invoices (Rs. 1,001 to Rs. 5,000)
    // Common customer tender: exact, next 500, next 1,000, Rs. 5,000 note
    // E.g., if total is Rs. 3,250 -> 3,250 (Exact), 3,500, 4,000, 5,000
    const next500 = Math.ceil(total / 500) * 500;
    if (next500 > total) candidates.add(next500);

    const next1000 = Math.ceil(total / 1000) * 1000;
    if (next1000 > total) candidates.add(next1000);

    // 5,000 paper note is very common for retail footwear bills
    const next5000 = Math.ceil(total / 5000) * 5000;
    if (next5000 > total) candidates.add(next5000);

    // If still have fewer than 4 chips, provide next intermediate note
    let step = (next1000 > total ? next1000 : next500) + 1000;
    while (candidates.size < 4 && step <= 10000) {
      if (step > total) candidates.add(step);
      step += 1000;
    }

    // Fallback if still under 4 (e.g. if total was near 5,000)
    if (candidates.size < 4) {
      const extraNotes = [6000, 10000];
      for (const note of extraNotes) {
        if (candidates.size >= 4) break;
        if (note > total) candidates.add(note);
      }
    }
  } else {
    // Larger retail invoices (Rs. 5,001 to Rs. 10,000+)
    // Suggest rounding to next 1,000
    const next1000 = Math.ceil(total / 1000) * 1000;
    if (next1000 > total) candidates.add(next1000);

    // Suggest rounding to next 5,000 (e.g. 6,800 -> 10,000)
    const next5000 = Math.ceil(total / 5000) * 5000;
    if (next5000 > total) candidates.add(next5000);

    // Suggest rounding to next 10,000
    const next10000 = Math.ceil(total / 10000) * 10000;
    if (next10000 > total) candidates.add(next10000);

    // Additional 5,000 note increments (e.g. 15,000, 20,000)
    let extraStep = (next5000 > total ? next5000 : total) + 5000;
    while (candidates.size < 4 && extraStep <= 100000) {
      if (extraStep > total) candidates.add(extraStep);
      extraStep += 5000;
    }
  }

  // Sort ascending and strictly limit to 4 chips
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
          Tap note for instant change
        </span>
      </div>

      <div className="grid grid-cols-4 gap-1.5">
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
