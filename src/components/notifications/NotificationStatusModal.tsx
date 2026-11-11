import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, CheckCircle2, AlertTriangle, AlertCircle, X, Shield, RefreshCw, ExternalLink } from 'lucide-react';

export interface NotificationModalData {
  isOpen: boolean;
  type: 'success' | 'warning' | 'error' | 'info';
  title: string;
  message: string;
  details?: string;
  actionText?: string;
  onAction?: () => void;
  showBrowserGuide?: boolean;
}

interface NotificationStatusModalProps {
  modal: NotificationModalData | null;
  onClose: () => void;
}

export const NotificationStatusModal: React.FC<NotificationStatusModalProps> = ({ modal, onClose }) => {
  if (!modal || !modal.isOpen) return null;

  const {
    type,
    title,
    message,
    details,
    actionText,
    onAction,
    showBrowserGuide,
  } = modal;

  const getIcon = () => {
    switch (type) {
      case 'success':
        return (
          <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-700/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-sm">
            <CheckCircle2 className="w-6 h-6 stroke-[2.2]" />
          </div>
        );
      case 'warning':
        return (
          <div className="w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700/60 flex items-center justify-center text-amber-600 dark:text-amber-400 shadow-sm">
            <AlertTriangle className="w-6 h-6 stroke-[2.2]" />
          </div>
        );
      case 'error':
        return (
          <div className="w-12 h-12 rounded-2xl bg-rose-100 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-700/60 flex items-center justify-center text-rose-600 dark:text-rose-400 shadow-sm">
            <AlertCircle className="w-6 h-6 stroke-[2.2]" />
          </div>
        );
      case 'info':
      default:
        return (
          <div className="w-12 h-12 rounded-2xl bg-purple-100 dark:bg-purple-950/60 border border-purple-300 dark:border-purple-700/60 flex items-center justify-center text-purple-600 dark:text-purple-400 shadow-sm">
            <Bell className="w-6 h-6 stroke-[2.2]" />
          </div>
        );
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="relative w-full max-w-md bg-white dark:bg-[#0E1628] rounded-2xl border border-slate-200 dark:border-purple-900/60 shadow-2xl overflow-hidden"
          role="dialog"
          aria-modal="true"
        >
          {/* Header Accent Bar */}
          <div
            className={`h-1.5 w-full ${
              type === 'success'
                ? 'bg-emerald-500'
                : type === 'warning'
                ? 'bg-amber-500'
                : type === 'error'
                ? 'bg-rose-500'
                : 'bg-purple-600'
            }`}
          />

          <div className="p-5 sm:p-6 space-y-4">
            {/* Top Row: Icon + Title + Close Button */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                {getIcon()}
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-snug">
                    {title}
                  </h3>
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    POS Notification System
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Message Body */}
            <div className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
              <p>{message}</p>
            </div>

            {/* Browser Guide when permission is blocked */}
            {showBrowserGuide && (
              <div className="p-3.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/60 text-xs text-amber-900 dark:text-amber-200 space-y-2">
                <div className="flex items-center gap-1.5 font-bold text-amber-800 dark:text-amber-300 text-xs">
                  <Shield className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span>How to Unblock Notifications:</span>
                </div>
                <ol className="list-decimal list-inside space-y-1 text-[11px] text-amber-800 dark:text-amber-300/90 pl-1 leading-normal">
                  <li>
                    Look at your browser's address bar at the top and tap the{' '}
                    <strong>lock or site settings icon (🔒)</strong>.
                  </li>
                  <li>
                    Find <strong>Notifications</strong> and change it to{' '}
                    <strong>Allow</strong>.
                  </li>
                  <li>
                    Return here and tap <strong>Check Permission</strong> or refresh the page.
                  </li>
                </ol>
              </div>
            )}

            {/* Technical Details Accordion (if provided) */}
            {details && (
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#0A0E1A] border border-slate-200 dark:border-slate-800 text-[11px] font-mono text-slate-600 dark:text-slate-400 max-h-24 overflow-y-auto break-all">
                <span className="font-bold text-slate-500 dark:text-slate-400 block mb-0.5">Details:</span>
                {details}
              </div>
            )}

            {/* Action Buttons */}
            <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800/80">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                {actionText ? 'Dismiss' : 'Got It'}
              </button>
              {actionText && onAction && (
                <button
                  type="button"
                  onClick={() => {
                    onAction();
                    onClose();
                  }}
                  className={`px-4 py-2 rounded-xl text-xs font-bold text-white transition cursor-pointer shadow-xs active:scale-95 flex items-center gap-1.5 ${
                    type === 'warning'
                      ? 'bg-amber-600 hover:bg-amber-500'
                      : type === 'error'
                      ? 'bg-rose-600 hover:bg-rose-500'
                      : 'bg-purple-600 hover:bg-purple-500'
                  }`}
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>{actionText}</span>
                </button>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
