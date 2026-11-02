import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, CheckCircle2, Shield, ShieldAlert, ShieldCheck, AlertCircle } from 'lucide-react';
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
  showChecklist = true,
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

  if (!password) {
    if (!showChecklist || compact) return null;

    // Show initial checklist hint if requested
    return (
      <div className={`mt-2 space-y-1.5 animate-in fade-in duration-200 ${className}`}>
        <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-medium">
          <span className="flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-slate-400" />
            <span>Password Security Requirements</span>
          </span>
          <span className="text-[10px] font-mono text-slate-400">Min {minChars} chars</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-0.5">
          {result.requirements.map((req) => (
            <div
              key={req.id}
              className="flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500 font-medium transition-colors"
            >
              <div className="w-3.5 h-3.5 rounded-full border border-slate-300 dark:border-slate-700 flex items-center justify-center shrink-0" />
              <span>{req.label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`mt-2 space-y-2 animate-in fade-in duration-150 ${className}`}>
      {/* Real-time Strength Meter & Level Badge */}
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
          <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
            Strength:
          </span>
          <span
            className={`text-[11px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wider transition-colors duration-200 ${
              result.level === 'weak'
                ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-900/60'
                : result.level === 'medium'
                ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-900/60'
                : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/80 shadow-xs'
            }`}
          >
            {result.label}
          </span>
        </div>

        {/* Success Icon Feedback when Strong */}
        {result.isStrong ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/60 animate-in fade-in zoom-in duration-200">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0 stroke-[2.5]" />
            <span>Strong Password</span>
          </span>
        ) : (
          <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">
            {result.score}/4 Requirements
          </span>
        )}
      </div>

      {/* 3-Segment Strength Progress Bar */}
      <div className="grid grid-cols-3 gap-1.5 h-1.5 w-full">
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
              ? result.level === 'strong'
                ? 'bg-emerald-500 shadow-xs'
                : 'bg-amber-500 shadow-xs'
              : 'bg-slate-200 dark:bg-slate-800'
          }`}
        />
        {/* Segment 3: Strong */}
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            result.score >= 4 || result.level === 'strong'
              ? 'bg-emerald-500 shadow-xs'
              : 'bg-slate-200 dark:bg-slate-800'
          }`}
        />
      </div>

      {/* Requirements Checklist */}
      {showChecklist && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 pt-1 border-t border-slate-100 dark:border-slate-800/60">
          {result.requirements.map((req) => (
            <div
              key={req.id}
              className={`flex items-center gap-1.5 text-[11px] font-medium transition-colors duration-200 ${
                req.met
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-slate-400 dark:text-slate-500'
              }`}
            >
              <div
                className={`w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0 transition-all duration-200 ${
                  req.met
                    ? 'bg-emerald-500 text-white shadow-2xs'
                    : 'border border-slate-300 dark:border-slate-700 bg-transparent'
                }`}
              >
                {req.met && <Check className="w-2.5 h-2.5 stroke-[3]" />}
              </div>
              <span className={req.met ? 'font-semibold' : ''}>{req.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
