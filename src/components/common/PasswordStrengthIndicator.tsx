import React from 'react';
import { CheckCircle2, Shield, ShieldAlert, ShieldCheck } from 'lucide-react';
import { evaluatePasswordStrength, type PasswordStrengthResult } from '../../utils/passwordStrength.ts';

export interface PasswordStrengthIndicatorProps {
  password: string;
  minChars?: number;
  showChecklist?: boolean;
  compact?: boolean;
  className?: string;
  onStrengthChange?: (result: PasswordStrengthResult) => void;
}

export const PasswordStrengthIndicator: React.FC<PasswordStrengthIndicatorProps> = ({
  password,
  minChars = 8,
  compact = false,
  className = '',
  onStrengthChange,
}) => {
  const result = evaluatePasswordStrength(password, minChars);

  React.useEffect(() => {
    if (onStrengthChange) {
      onStrengthChange(result);
    }
  }, [password, minChars, onStrengthChange]);

  // When no password has been entered yet, keep the UI clean with no requirement text
  if (!password) {
    return null;
  }

  return (
    <div className={`mt-2 space-y-1.5 animate-in fade-in duration-150 ${className}`}>
      {/* Real-time Strength Meter & Level Badge (Weak–Very Strong) */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {result.level === 'weak' && (
            <ShieldAlert className="w-3.5 h-3.5 text-rose-500 shrink-0 animate-in fade-in" />
          )}
          {result.level === 'medium' && (
            <Shield className="w-3.5 h-3.5 text-amber-500 shrink-0 animate-in fade-in" />
          )}
          {result.level === 'strong' && (
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0 animate-in fade-in zoom-in" />
          )}
          {result.level === 'very-strong' && (
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 animate-in fade-in zoom-in" />
          )}
          <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
            Strength:
          </span>
          <span
            className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wider transition-colors duration-200 ${
              result.level === 'weak'
                ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-900/60'
                : result.level === 'medium'
                ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-900/60'
                : result.level === 'strong'
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/80 shadow-xs'
                : 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/80 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700/80 shadow-xs font-extrabold'
            }`}
          >
            {result.label}
          </span>
        </div>

        {/* Success Icon Feedback when Strong or Very Strong */}
        {result.isStrong && (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 animate-in fade-in zoom-in duration-200">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0 stroke-[2.5]" />
            <span>{result.level === 'very-strong' ? 'Very Strong' : 'Strong'}</span>
          </span>
        )}
      </div>

      {/* 4-Segment Strength Progress Bar (Weak–Very Strong) */}
      <div className="grid grid-cols-4 gap-1.5 h-1.5 w-full">
        {/* Segment 1: Weak */}
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            result.score >= 1 ? 'bg-rose-500 shadow-xs' : 'bg-slate-200 dark:bg-slate-800'
          }`}
        />
        {/* Segment 2: Medium */}
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            result.score >= 2
              ? result.score >= 3
                ? 'bg-emerald-500 shadow-xs'
                : 'bg-amber-500 shadow-xs'
              : 'bg-slate-200 dark:bg-slate-800'
          }`}
        />
        {/* Segment 3: Strong */}
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            result.score >= 3
              ? result.score >= 4
                ? 'bg-emerald-500 shadow-xs'
                : 'bg-emerald-500 shadow-xs'
              : 'bg-slate-200 dark:bg-slate-800'
          }`}
        />
        {/* Segment 4: Very Strong */}
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            result.score >= 4 || result.level === 'very-strong'
              ? 'bg-emerald-600 shadow-xs'
              : 'bg-slate-200 dark:bg-slate-800'
          }`}
        />
      </div>
    </div>
  );
};
