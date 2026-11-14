import React, { useEffect, useRef } from 'react';
import { Clock, LogOut, ShieldAlert } from 'lucide-react';
import { formatCountdownSeconds } from '../../utils/cashierIdleTimer.ts';

interface CashierIdleWarningModalProps {
  isOpen: boolean;
  remainingSeconds: number;
  totalWarningSeconds: number;
  cashierName?: string;
  storeName?: string;
  onStaySignedIn: () => void;
  onLogoutNow: () => void;
}

export const CashierIdleWarningModal: React.FC<CashierIdleWarningModalProps> = ({
  isOpen,
  remainingSeconds,
  totalWarningSeconds,
  cashierName,
  storeName,
  onStaySignedIn,
  onLogoutNow,
}) => {
  const stayButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const focusTimer = window.setTimeout(() => {
      stayButtonRef.current?.focus();
    }, 30);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onStaySignedIn();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onStaySignedIn]);

  if (!isOpen) return null;

  const progressPct = Math.max(
    0,
    Math.min(100, (remainingSeconds / Math.max(1, totalWarningSeconds)) * 100)
  );
  const isUrgent = remainingSeconds <= 15;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="cashier-idle-warning-title"
      aria-describedby="cashier-idle-warning-desc"
      className="form-modal-theme fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 animate-in fade-in duration-150"
    >
      <div className="relative w-full max-w-md rounded-2xl bg-white dark:bg-[#0E1628] border border-slate-200 dark:border-purple-800/70 shadow-2xl p-6 space-y-5">
        <div className="flex items-start gap-3.5">
          <div
            className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border shadow-xs ${
              isUrgent
                ? 'bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800/70 text-rose-600 dark:text-rose-400'
                : 'bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800/70 text-amber-600 dark:text-amber-400'
            }`}
          >
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h3
              id="cashier-idle-warning-title"
              className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white tracking-tight"
            >
              Session Inactivity Warning
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
              {cashierName ? `${cashierName}` : 'Cashier Session'}
              {storeName ? ` • ${storeName}` : ''}
            </p>
          </div>
        </div>

        <div
          className={`rounded-xl border p-4 space-y-3 ${
            isUrgent
              ? 'bg-rose-50/80 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800/60'
              : 'bg-amber-50/80 dark:bg-amber-950/25 border-amber-200 dark:border-amber-800/60'
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
              <Clock
                className={`w-4 h-4 shrink-0 ${
                  isUrgent ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'
                }`}
              />
              <span>Auto-logout countdown</span>
            </div>
            <span
              data-testid="cashier-idle-countdown"
              className={`font-mono text-lg font-black tabular-nums ${
                isUrgent ? 'text-rose-600 dark:text-rose-400' : 'text-amber-700 dark:text-amber-300'
              }`}
            >
              {formatCountdownSeconds(remainingSeconds)}
            </span>
          </div>

          <div className="h-2 w-full rounded-full bg-slate-200/80 dark:bg-slate-800 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                isUrgent
                  ? 'bg-gradient-to-r from-rose-500 to-rose-600'
                  : 'bg-gradient-to-r from-amber-500 to-orange-500'
              }`}
              style={{ width: `${progressPct}%` }}
            />
          </div>

          <p
            id="cashier-idle-warning-desc"
            className="text-xs leading-relaxed text-slate-700 dark:text-slate-300"
          >
            Your cashier terminal has been inactive. For counter security, your session will be cleared and redirected to the login screen in{' '}
            <strong className="font-bold tabular-nums">{remainingSeconds}s</strong>.
          </p>
        </div>

        <div className="flex flex-col-reverse sm:flex-row gap-2.5 pt-1">
          <button
            type="button"
            id="cashier-idle-logout-now-btn"
            onClick={onLogoutNow}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs sm:text-sm font-bold transition cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Log Out Now</span>
          </button>
          <button
            ref={stayButtonRef}
            type="button"
            id="cashier-idle-stay-signed-in-btn"
            onClick={onStaySignedIn}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-xs sm:text-sm font-bold shadow-md shadow-purple-600/20 transition cursor-pointer"
          >
            <span>Stay Signed In</span>
          </button>
        </div>
      </div>
    </div>
  );
};
