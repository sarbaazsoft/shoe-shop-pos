import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Mail, UserX, Users, CheckCircle2 } from 'lucide-react';
import type { useRememberedAccount } from '../../hooks/useRememberedAccount.ts';
import { isValidEmail } from '../../utils/textFormat.ts';

type RememberedAccountState = ReturnType<typeof useRememberedAccount>;

interface RememberedEmailFieldProps {
  account: RememberedAccountState;
  email: string;
  onEmailChange: (value: string) => void;
  /** Called whenever the visible account changes, so the parent can clear password / errors. */
  onAccountViewChange?: () => void;
  inputId: string;
  label: string;
  placeholder: string;
  inputClassName: string;
  disabled?: boolean;
}

const linkButtonClass =
  'inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold transition cursor-pointer ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/60 disabled:opacity-50 disabled:cursor-not-allowed';

/**
 * Email row for login forms.
 * - With a remembered email: shows it as non-editable text with "Use another account" and
 *   "Forget this account" actions.
 * - Otherwise (or after switching): shows the normal editable email input, with a way back to
 *   the remembered account when one exists.
 */
export const RememberedEmailField: React.FC<RememberedEmailFieldProps> = ({
  account,
  email,
  onEmailChange,
  onAccountViewChange,
  inputId,
  label,
  placeholder,
  inputClassName,
  disabled = false,
}) => {
  const { rememberedEmail, isShowingRemembered } = account;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const switchButtonRef = useRef<HTMLButtonElement | null>(null);
  const pendingFocus = useRef<'input' | 'switch' | null>(null);
  const [statusMessage, setStatusMessage] = useState('');

  // Keep the visible value in sync when the locked view is shown.
  useEffect(() => {
    if (isShowingRemembered && rememberedEmail && email !== rememberedEmail) {
      onEmailChange(rememberedEmail);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isShowingRemembered, rememberedEmail]);

  // Move focus to a sensible control after the view swaps (keyboard / screen reader users).
  useEffect(() => {
    if (pendingFocus.current === 'input') inputRef.current?.focus();
    if (pendingFocus.current === 'switch') switchButtonRef.current?.focus();
    pendingFocus.current = null;
  }, [isShowingRemembered]);

  const handleUseAnother = () => {
    pendingFocus.current = 'input';
    account.useAnotherAccount();
    onEmailChange('');
    onAccountViewChange?.();
    setStatusMessage('Switched to another account. Enter a different email address.');
  };

  const handleReturn = () => {
    if (!rememberedEmail) return;
    pendingFocus.current = 'switch';
    account.returnToRemembered();
    onEmailChange(rememberedEmail);
    onAccountViewChange?.();
    setStatusMessage(`Signing in as ${rememberedEmail}.`);
  };

  const handleForget = () => {
    pendingFocus.current = 'input';
    account.forget();
    onEmailChange('');
    onAccountViewChange?.();
    setStatusMessage('Saved account forgotten. Enter your email address.');
  };

  const initial = (rememberedEmail || '?').charAt(0).toUpperCase();

  return (
    <div>
      <div className="sr-only" role="status" aria-live="polite">
        {statusMessage}
      </div>

      {isShowingRemembered && rememberedEmail ? (
        <div>
          <span
            id={`${inputId}-label`}
            className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5"
          >
            Signing in as
          </span>
          <div
            role="group"
            aria-labelledby={`${inputId}-label`}
            className="flex items-center gap-3 rounded-xl border border-purple-200/80 dark:border-purple-800/60 bg-purple-50/70 dark:bg-slate-900/80 px-3 py-2.5"
          >
            <span
              aria-hidden="true"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-purple-600 to-indigo-600 text-sm font-black text-white"
            >
              {initial}
            </span>
            <span className="min-w-0 flex-1">
              <span
                id={inputId}
                title={rememberedEmail}
                className="block truncate text-xs sm:text-sm font-semibold text-slate-900 dark:text-white"
              >
                {rememberedEmail}
              </span>
              <span className="block text-[11px] text-slate-500 dark:text-purple-200/70">
                Remembered on this device
              </span>
            </span>
          </div>

          {/* Lets browsers / password managers pair the saved password with this account. Not focusable. */}
          <input
            type="email"
            name="email"
            value={rememberedEmail}
            readOnly
            tabIndex={-1}
            aria-hidden="true"
            autoComplete="username"
            className="sr-only"
          />

          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <button
              ref={switchButtonRef}
              type="button"
              disabled={disabled}
              onClick={handleUseAnother}
              className={`${linkButtonClass} text-purple-700 hover:bg-purple-50 dark:text-purple-300 dark:hover:bg-purple-950/50`}
            >
              <Users className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Use another account</span>
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={handleForget}
              className={`${linkButtonClass} text-rose-600 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/40`}
            >
              <UserX className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Forget this account</span>
            </button>
          </div>
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor={inputId} className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              {label}
            </label>
            {isValidEmail(email) && (
              <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1 animate-in fade-in duration-200">
                <CheckCircle2 className="w-3 h-3" /> Valid email
              </span>
            )}
          </div>
          <div className="relative">
            <div className={`absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none transition-colors duration-200 ${
              isValidEmail(email) ? 'text-emerald-500' : 'text-purple-600 dark:text-purple-400'
            }`}>
              <Mail className="w-4 h-4" />
            </div>
            <input
              ref={inputRef}
              id={inputId}
              name="email"
              type="email"
              required
              autoComplete="username"
              placeholder={placeholder}
              value={email}
              onChange={(e) => onEmailChange(e.target.value)}
              className={`${inputClassName} transition-all duration-200 ${
                isValidEmail(email)
                  ? '!border-2 !border-emerald-500 dark:!border-emerald-500/80 !ring-2 !ring-emerald-500/20 pr-9'
                  : ''
              }`}
            />
            {isValidEmail(email) && (
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-emerald-500 animate-in fade-in zoom-in duration-200">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            )}
          </div>

          {rememberedEmail && (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              <button
                type="button"
                disabled={disabled}
                onClick={handleReturn}
                className={`${linkButtonClass} text-purple-700 hover:bg-purple-50 dark:text-purple-300 dark:hover:bg-purple-950/50 max-w-full`}
              >
                <ArrowLeft className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">Back to {rememberedEmail}</span>
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={handleForget}
                className={`${linkButtonClass} text-rose-600 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/40`}
              >
                <UserX className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Forget this account</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
