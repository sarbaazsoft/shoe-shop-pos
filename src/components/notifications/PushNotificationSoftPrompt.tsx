import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Bell,
  BellRing,
  ShoppingBag,
  AlertTriangle,
  Radio,
  CheckCircle2,
  X,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import {
  shouldShowSoftPushPrompt,
  dismissSoftPushPrompt,
  subscribeDeviceToWebPush,
} from '../../services/pushNotificationClient.ts';
import { playAudioFeedback } from '../../utils/audio.ts';

interface PushNotificationSoftPromptProps {
  currentUser?: any;
  variant?: 'floating-banner' | 'card' | 'inline';
  onPermissionChange?: (permission: NotificationPermission, isSubscribed: boolean) => void;
  className?: string;
}

export const PushNotificationSoftPrompt: React.FC<PushNotificationSoftPromptProps> = ({
  currentUser,
  variant = 'floating-banner',
  onPermissionChange,
  className = '',
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [statusFeedback, setStatusFeedback] = useState<{
    type: 'success' | 'denied' | 'error';
    message: string;
  } | null>(null);

  const userRole = String(currentUser?.role || 'ADMIN').toUpperCase();

  const evaluateVisibility = () => {
    // Only show if user is authenticated and browser hasn't decided or user hasn't dismissed recently
    if (!currentUser) {
      setIsVisible(false);
      return;
    }
    const eligible = shouldShowSoftPushPrompt();
    setIsVisible(eligible);
  };

  useEffect(() => {
    // Delay prompt slightly so user lands on dashboard first
    const timer = setTimeout(() => {
      evaluateVisibility();
    }, 1200);

    const handleSoftPromptUpdated = () => {
      evaluateVisibility();
    };

    const handlePushStatusChanged = (e: any) => {
      const perm = e?.detail?.permission;
      if (perm && perm !== 'default') {
        setIsVisible(false);
      }
    };

    window.addEventListener('pos:push-soft-prompt-updated', handleSoftPromptUpdated);
    window.addEventListener('pos:push-status-changed', handlePushStatusChanged);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('pos:push-soft-prompt-updated', handleSoftPromptUpdated);
      window.removeEventListener('pos:push-status-changed', handlePushStatusChanged);
    };
  }, [currentUser]);

  const handleAllowClick = async () => {
    if (isSubscribing) return;
    setIsSubscribing(true);
    setStatusFeedback(null);

    try {
      const res = await subscribeDeviceToWebPush(userRole);

      if (res.success && res.permission === 'granted') {
        try {
          playAudioFeedback.success();
        } catch {}

        setStatusFeedback({
          type: 'success',
          message: 'Real-time alerts active! You will now receive instant counter notifications.',
        });

        onPermissionChange?.('granted', true);

        // Auto-dismiss after brief celebration
        setTimeout(() => {
          setIsVisible(false);
        }, 1600);
      } else if (res.permission === 'denied') {
        setStatusFeedback({
          type: 'denied',
          message: 'Notifications are blocked in your browser. You can enable them anytime from the top notification menu.',
        });

        onPermissionChange?.('denied', false);

        // Dismiss soft prompt and remember denial
        setTimeout(() => {
          dismissSoftPushPrompt(7);
          setIsVisible(false);
        }, 3200);
      } else {
        // User dismissed native prompt or error occurred
        dismissSoftPushPrompt(3);
        setIsVisible(false);
      }
    } catch (err: any) {
      setStatusFeedback({
        type: 'error',
        message: err?.message || 'Could not enable notifications. Please check your browser permissions.',
      });
      setTimeout(() => {
        dismissSoftPushPrompt(2);
        setIsVisible(false);
      }, 2500);
    } finally {
      setIsSubscribing(false);
    }
  };

  const handleDismiss = () => {
    // Snooze soft prompt for 3 days
    dismissSoftPushPrompt(3);
    setIsVisible(false);
  };

  if (!isVisible) return null;

  const content = (
    <div
      className={`relative overflow-hidden rounded-2xl bg-white dark:bg-slate-900 border border-purple-200/90 dark:border-purple-800/60 shadow-2xl shadow-purple-500/15 dark:shadow-purple-950/50 p-4 sm:p-5 text-slate-800 dark:text-slate-100 ${className}`}
    >
      {/* Decorative subtle ambient gradient accent */}
      <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-purple-500 via-indigo-500 to-pink-500" />

      {/* Close button */}
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss notification prompt"
        className="absolute top-3.5 right-3.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
      >
        <X className="w-4 h-4" />
      </button>

      {/* Header section with icon */}
      <div className="flex items-start gap-3.5 pr-6 mb-3">
        <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-950/80 border border-purple-200 dark:border-purple-800/80 flex items-center justify-center shrink-0 text-purple-600 dark:text-purple-300 shadow-inner">
          <BellRing className="w-5 h-5 animate-bounce" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">
              Enable Real-Time POS Alerts
            </h4>
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wide bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-700">
              <Radio className="w-2.5 h-2.5 animate-pulse text-purple-500" />
              Live
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
            Never miss important counter transactions, inventory alerts, or customer updates.
          </p>
        </div>
      </div>

      {/* Concrete Benefit Chips */}
      <div className="space-y-2 mb-4 bg-slate-50/80 dark:bg-slate-950/50 rounded-xl p-3 border border-slate-100 dark:border-slate-800/60 text-[11.5px]">
        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
          <div className="w-5 h-5 rounded-md bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <ShoppingBag className="w-3 h-3" />
          </div>
          <span>
            <strong className="text-slate-900 dark:text-white font-semibold">Instant Order & Sales:</strong> Live audio chime and popups for sales, returns, and counter exchanges.
          </span>
        </div>

        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
          <div className="w-5 h-5 rounded-md bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-3 h-3" />
          </div>
          <span>
            <strong className="text-slate-900 dark:text-white font-semibold">Low Stock Warnings:</strong> Real-time heads-up when popular shoe sizes or cartons run low.
          </span>
        </div>

        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
          <div className="w-5 h-5 rounded-md bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-3 h-3" />
          </div>
          <span>
            <strong className="text-slate-900 dark:text-white font-semibold">Platform & Store Notices:</strong> Critical store announcements, register closures, and account updates.
          </span>
        </div>
      </div>

      {/* Inline Feedback Alert (if user just clicked allow or was denied) */}
      {statusFeedback && (
        <div
          className={`mb-3 p-2.5 rounded-xl text-xs flex items-start gap-2 ${
            statusFeedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800'
              : statusFeedback.type === 'denied'
              ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800'
              : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 border border-rose-200 dark:border-rose-800'
          }`}
        >
          {statusFeedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          )}
          <span className="leading-snug">{statusFeedback.message}</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={handleAllowClick}
          disabled={isSubscribing}
          className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-md shadow-purple-600/25 hover:shadow-lg hover:shadow-purple-600/35 active:scale-[0.98] transition cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed"
        >
          {isSubscribing ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Connecting FCM...</span>
            </>
          ) : (
            <>
              <Bell className="w-3.5 h-3.5" />
              <span>Allow Notifications</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={handleDismiss}
          disabled={isSubscribing}
          className="px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 font-semibold text-xs transition cursor-pointer disabled:opacity-50"
        >
          Maybe Later
        </button>
      </div>
    </div>
  );

  if (variant === 'inline' || variant === 'card') {
    return content;
  }

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 w-[calc(100vw-2rem)] max-w-sm sm:max-w-md z-50 pointer-events-auto"
        >
          {content}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
