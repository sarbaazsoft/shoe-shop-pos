import React, { useState } from 'react';
import { Lock, Eye, EyeOff, CheckCircle2, AlertCircle } from 'lucide-react';
import { PasswordStrengthIndicator } from './PasswordStrengthIndicator.tsx';
import { PasswordRequirementsTooltip } from './PasswordRequirementsTooltip.tsx';
import { evaluatePasswordStrength, type PasswordStrengthResult } from '../../utils/passwordStrength.ts';

export interface PasswordFieldProps {
  id?: string;
  name?: string;
  label?: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  autoComplete?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  minChars?: number;
  showStrengthIndicator?: boolean;
  showChecklist?: boolean;
  compactStrength?: boolean;
  helperText?: React.ReactNode;
  className?: string;
  inputClassName?: string;
  isConfirmation?: boolean;
  matchTargetValue?: string;
  onStrengthChange?: (result: PasswordStrengthResult) => void;
}

export const PasswordField: React.FC<PasswordFieldProps> = ({
  id,
  name = 'password',
  label,
  value,
  onChange,
  placeholder = '••••••••',
  required = false,
  autoComplete = 'current-password',
  autoFocus = false,
  disabled = false,
  minChars = 8,
  showStrengthIndicator = false,
  compactStrength = false,
  helperText,
  className = '',
  inputClassName = '',
  isConfirmation = false,
  matchTargetValue,
  onStrengthChange,
}) => {
  const [showPassword, setShowPassword] = useState(false);
  const [_isFocused, setIsFocused] = useState(false);

  const strength = evaluatePasswordStrength(value, minChars);

  // Dynamic border classes
  let dynamicBorderClass = '';
  if (isConfirmation && matchTargetValue !== undefined && value.length > 0) {
    const isMatch = value === matchTargetValue && value.length >= Math.min(minChars, 6);
    dynamicBorderClass = isMatch
      ? 'password-border-match border-emerald-500'
      : 'password-border-mismatch border-rose-500';
  } else if (value.length > 0) {
    dynamicBorderClass = strength.borderColorClass;
  }

  const isMatch = isConfirmation && matchTargetValue !== undefined && value.length > 0 && value === matchTargetValue;
  const isMismatch = isConfirmation && matchTargetValue !== undefined && value.length > 0 && value !== matchTargetValue;

  return (
    <div className={`w-full ${className}`}>
      {label && (
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
            <label htmlFor={id} className="text-xs font-bold text-slate-700 dark:text-slate-300">
              {label}
            </label>
            {!isConfirmation && (
              <PasswordRequirementsTooltip minChars={minChars} password={value} />
            )}
          </div>
          {isConfirmation && value.length > 0 && (
            <span
              className={`text-[11px] font-semibold flex items-center gap-1 ${
                isMatch ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'
              }`}
            >
              {isMatch ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Passwords match</span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>Passwords do not match</span>
                </>
              )}
            </span>
          )}
        </div>
      )}

      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-purple-600 dark:text-purple-400">
          <Lock className="w-4 h-4" />
        </div>

        <input
          id={id}
          name={name}
          type={showPassword ? 'text' : 'password'}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          required={required}
          disabled={disabled}
          placeholder={placeholder}
          value={value}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onChange={(e) => onChange(e.target.value)}
          className={`app-input w-full bg-slate-50 dark:bg-slate-900/80 rounded-xl text-xs sm:text-sm font-sans py-2.5 pl-[2.125rem] pr-16 transition outline-none text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-400 ${dynamicBorderClass} ${inputClassName}`}
        />

        {/* Right side icon grouping: Info Tooltip (if no label) + Success feedback icon & Toggle Password Eye */}
        <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center gap-1.5">
          {!label && !isConfirmation && (
            <PasswordRequirementsTooltip minChars={minChars} password={value} />
          )}

          {/* Success icon feedback when Strong or Very Strong */}
          {!isConfirmation && strength.isStrong && (
            <div
              className="flex items-center text-emerald-500 animate-in fade-in zoom-in duration-200"
              title={strength.level === 'very-strong' ? 'Very Strong Password Verified' : 'Strong Password Verified'}
            >
              <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
            </div>
          )}

          {/* Success icon feedback when Passwords match on confirmation field */}
          {isConfirmation && isMatch && (
            <div
              className="flex items-center text-emerald-500 animate-in fade-in zoom-in duration-200"
              title="Passwords Match"
            >
              <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
            </div>
          )}

          {/* Mismatch warning icon on confirmation field */}
          {isConfirmation && isMismatch && (
            <div
              className="flex items-center text-rose-500 animate-in fade-in zoom-in duration-200"
              title="Passwords do not match"
            >
              <AlertCircle className="w-4 h-4" />
            </div>
          )}

          <button
            type="button"
            tabIndex={-1}
            onClick={() => setShowPassword(!showPassword)}
            className="p-1 text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-200 transition cursor-pointer"
            title={showPassword ? 'Hide password' : 'Show password'}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {helperText && !showStrengthIndicator && (
        <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">{helperText}</p>
      )}

      {/* Real-time Strength Indicator (Meter Only, Weak–Very Strong) */}
      {showStrengthIndicator && (
        <PasswordStrengthIndicator
          password={value}
          minChars={minChars}
          compact={compactStrength}
          onStrengthChange={onStrengthChange}
        />
      )}
    </div>
  );
};
