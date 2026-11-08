import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  X,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { api } from '../../services/api.ts';
import type { PlatformNotification, PlatformNotificationType } from '../../types.ts';
import { ClickableMessage } from '../common/ClickableMessage.tsx';
import { connectRealtimeNotificationStream } from '../../services/pushNotificationClient.ts';

export interface PosNotificationBannerProps {
  currentUser: any;
  companySettings: any;
  onNavigateTab?: (tab: string) => void;
}

interface BannerNoticeItem {
  id: string | number;
  rawId?: number;
  title: string;
  message: string;
  type: PlatformNotificationType;
  targetRole?: string;
  storeName?: string;
  actionUrl?: string;
  actionLabel?: string;
  createdAt?: string;
  isWelcome?: boolean;
}

export const PosNotificationBanner: React.FC<PosNotificationBannerProps> = ({
  currentUser,
  companySettings,
  onNavigateTab,
}) => {
  const userId = currentUser?.id || currentUser?.userId || 0;
  const userRole = String(currentUser?.role || '').toUpperCase();
  const isCashier = userRole === 'CASHIER';
  const cashierName =
    String(currentUser?.name || '').trim() ||
    String(currentUser?.email || '').split('@')[0] ||
    'Cashier';
  const storeName =
    companySettings?.name ||
    companySettings?.company_name ||
    companySettings?.companyName ||
    'Shoe Store';

  const dismissedStorageKey = `pos_cashier_dismissed_notices_${userId}`;
  const welcomeDismissedKey = `pos_cashier_dismissed_welcome_${userId}`;

  const [rawServerNotices, setRawServerNotices] = useState<PlatformNotification[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [dismissedIds, setDismissedIds] = useState<Set<string | number>>(() => {
    try {
      const stored = localStorage.getItem(dismissedStorageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        return new Set(Array.isArray(parsed) ? parsed : []);
      }
    } catch {}
    return new Set();
  });

  const [isWelcomeDismissed, setIsWelcomeDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(welcomeDismissedKey) === 'true';
    } catch {
      return false;
    }
  });

  const isFetchingRef = useRef(false);

  // Fetch Super Admin notices and cashier announcements from backend
  const fetchNotices = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    try {
      const res = await api.notifications.grouped(10);
      if (res && Array.isArray(res.notices)) {
        setRawServerNotices(res.notices);
      }
    } catch (err) {
      console.warn('Failed to fetch POS banner notices:', err);
    } finally {
      isFetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    fetchNotices();

    // Auto-refresh notices every 30 seconds
    const interval = setInterval(fetchNotices, 30000);

    // Listen to custom platform announcement events dispatched in window
    const handlePlatformEvent = () => {
      fetchNotices();
    };
    window.addEventListener('platform:announcement', handlePlatformEvent);

    // Connect to real-time notification stream for immediate delivery of notices
    const cleanupStream = connectRealtimeNotificationStream((payload) => {
      const targetRole = payload.targetRole ? String(payload.targetRole).toUpperCase() : 'ALL';
      const isSuperAdminOnly =
        targetRole === 'SUPERADMIN' ||
        (payload.title || '').toLowerCase().includes('new free trial') ||
        (payload.title || '').toLowerCase().includes('renewal request');

      if (!isSuperAdminOnly && (targetRole === 'ALL' || targetRole === 'CASHIER')) {
        fetchNotices();
      }
    });

    return () => {
      clearInterval(interval);
      window.removeEventListener('platform:announcement', handlePlatformEvent);
      if (cleanupStream) cleanupStream();
    };
  }, [fetchNotices]);

  // Combine Super Admin notices + exactly ONE cashier welcome message with strict deduplication
  const activeNotices = useMemo<BannerNoticeItem[]>(() => {
    const list: BannerNoticeItem[] = [];
    const seenTitles = new Set<string>();
    let hasWelcomeNotice = false;

    // 1. Process server notices
    for (const n of rawServerNotices) {
      if (dismissedIds.has(n.id) || dismissedIds.has(String(n.id))) continue;

      const titleLower = (n.title || '').toLowerCase();
      const msgLower = (n.message || '').toLowerCase();
      const targetRole = (n.targetRole || 'ALL').toUpperCase();

      // Role isolation: Cashiers receive ALL or CASHIER notices; non-cashiers (ADMIN) only receive ALL or ADMIN notices
      if (targetRole === 'SUPERADMIN') continue;
      if (isCashier) {
        if (targetRole !== 'ALL' && targetRole !== 'CASHIER') continue;
      } else {
        if (targetRole === 'CASHIER') continue;
      }

      // Filter out SuperAdmin-only administrative events
      if (
        titleLower.includes('new free trial') ||
        titleLower.includes('renewal request') ||
        msgLower.includes('free tier store registered') ||
        (n.actionUrl || '').includes('/superadmin')
      ) {
        continue;
      }

      // Filter out store-owner specific welcome notices from POS banner
      if (
        titleLower.includes('welcome to sarbaazsoft') ||
        msgLower.includes('thank you for choosing sarbaazsoft')
      ) {
        continue;
      }

      const isThisAWelcomeNotice =
        titleLower.includes('welcome') ||
        msgLower.includes('welcome') ||
        msgLower.includes('account has been activated');

      // CRITICAL: Cashier welcome message is strictly for Cashier role. Store owner/admin must never receive or view it.
      if (isThisAWelcomeNotice) {
        if (!isCashier) {
          continue;
        }
        if (hasWelcomeNotice || isWelcomeDismissed) {
          continue;
        }
        hasWelcomeNotice = true;
      }

      // Deduplicate by normalized title
      const normTitle = (n.title || '').trim().toLowerCase();
      if (normTitle && seenTitles.has(normTitle)) {
        continue;
      }
      if (normTitle) seenTitles.add(normTitle);

      list.push({
        id: n.id,
        rawId: n.id,
        title: n.title,
        message: n.message,
        type: n.type || 'INFO',
        targetRole,
        storeName: n.storeName,
        actionUrl: n.actionUrl,
        actionLabel: n.actionLabel,
        createdAt: n.createdAt,
        isWelcome: isThisAWelcomeNotice,
      });
    }

    // 2. Only inject cashier welcome notice if the current user is strictly a CASHIER
    if (isCashier && !hasWelcomeNotice && !isWelcomeDismissed) {
      const canonicalWelcomeTitle = `Welcome to ${storeName}, ${cashierName}!`;
      const normWelcomeTitle = canonicalWelcomeTitle.trim().toLowerCase();

      if (!seenTitles.has(normWelcomeTitle)) {
        seenTitles.add(normWelcomeTitle);
        list.unshift({
          id: 'welcome-cashier',
          title: canonicalWelcomeTitle,
          message:
            'Your Cashier counter account is ready. Ring up footwear sales, scan shoe barcodes, or use the F-key shortcuts (F1 Barcode, F2 Search, F4 Return/Exchange, F9 Fullscreen).',
          type: 'SUCCESS',
          targetRole: 'CASHIER',
          isWelcome: true,
          createdAt: new Date().toISOString(),
        });
      }
    }

    return list;
  }, [rawServerNotices, dismissedIds, isWelcomeDismissed, storeName, cashierName, isCashier]);

  // Keep currentIndex valid when active notices change
  useEffect(() => {
    if (currentIndex >= activeNotices.length) {
      setCurrentIndex(Math.max(0, activeNotices.length - 1));
    }
  }, [activeNotices.length, currentIndex]);

  // Dismiss a notice
  const handleDismiss = async (notice: BannerNoticeItem, e?: React.MouseEvent) => {
    e?.stopPropagation();

    // Mark dismissed locally
    setDismissedIds((prev) => {
      const next = new Set(prev);
      next.add(notice.id);
      next.add(String(notice.id));
      try {
        localStorage.setItem(dismissedStorageKey, JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });

    // If welcome message, mark welcome dismissed
    if (notice.isWelcome) {
      setIsWelcomeDismissed(true);
      try {
        localStorage.setItem(welcomeDismissedKey, 'true');
      } catch {}
    }

    // If server notice, inform backend to mark dismissed/read
    if (typeof notice.id === 'number' || notice.rawId) {
      const notifId = notice.rawId || Number(notice.id);
      try {
        await api.notifications.dismissAnnouncement(notifId);
      } catch (err) {
        console.warn('Could not sync notice dismissal with server:', err);
      }
    }
  };

  // Dismiss all active notices
  const handleDismissAll = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setIsWelcomeDismissed(true);
    try {
      localStorage.setItem(welcomeDismissedKey, 'true');
    } catch {}

    const allIds = activeNotices.map((n) => n.id);
    setDismissedIds((prev) => {
      const next = new Set(prev);
      allIds.forEach((id) => {
        next.add(id);
        next.add(String(id));
      });
      try {
        localStorage.setItem(dismissedStorageKey, JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });

    try {
      await api.notifications.dismissAllAnnouncements();
    } catch (err) {
      console.warn('Could not dismiss all announcements on server:', err);
    }
  };

  // If no active notices, render null (no layout disruption)
  if (activeNotices.length === 0) {
    return null;
  }

  const currentNotice = activeNotices[currentIndex] || activeNotices[0];
  const isUrgent = currentNotice.type === 'URGENT';
  const isSuccess = currentNotice.type === 'SUCCESS' || currentNotice.isWelcome;
  const isWarning = currentNotice.type === 'WARNING';

  // Badge configuration based on notice type and origin
  const badgeConfig = currentNotice.isWelcome
    ? {
        label: 'Welcome Cashier',
        icon: CheckCircle2,
        badgeClass:
          'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700/60 shadow-xs',
      }
    : isUrgent
    ? {
        label: 'Urgent Notice',
        icon: AlertTriangle,
        badgeClass:
          'bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-200 border-rose-300 dark:border-rose-700/60 shadow-xs animate-pulse',
      }
    : isWarning
    ? {
        label: 'System Notice',
        icon: AlertTriangle,
        badgeClass:
          'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700/60 shadow-xs',
      }
    : {
        label: 'Super Admin Notice',
        icon: ShieldCheck,
        badgeClass:
          'bg-purple-100 dark:bg-purple-900/60 text-purple-800 dark:text-purple-200 border-purple-300 dark:border-purple-600/50 shadow-xs',
      };

  const BadgeIcon = badgeConfig.icon;

  return (
    <div
      id="pos-persistent-top-banner"
      className="w-full no-print select-none transition-all duration-200"
      role="region"
      aria-label="POS Terminal Announcements & Cashier Notice"
    >
      <div
        className={`relative overflow-hidden rounded-2xl border px-3.5 py-2.5 sm:px-4 sm:py-3 transition-colors duration-300 shadow-sm ${
          isUrgent
            ? 'bg-gradient-to-r from-rose-50 via-rose-100/50 to-orange-50 border-rose-300/90 text-rose-950 dark:from-[#21090f] dark:via-[#1c0d16] dark:to-[#170a1c] dark:border-rose-500/40 dark:text-rose-100 dark:shadow-[0_0_20px_rgba(244,63,94,0.18)]'
            : isSuccess
            ? 'bg-gradient-to-r from-emerald-50/90 via-teal-50/70 to-purple-50/80 border-emerald-300/80 text-emerald-950 dark:from-[#091f16] dark:via-[#0c1822] dark:to-[#170d28] dark:border-emerald-500/40 dark:text-emerald-100 dark:shadow-[0_0_20px_rgba(16,185,129,0.16)]'
            : isWarning
            ? 'bg-gradient-to-r from-amber-50 via-amber-100/50 to-orange-50 border-amber-300/80 text-amber-950 dark:from-[#231706] dark:via-[#1e1308] dark:to-[#170d1e] dark:border-amber-500/40 dark:text-amber-100 dark:shadow-[0_0_20px_rgba(245,158,11,0.16)]'
            : 'bg-gradient-to-r from-purple-50/95 via-indigo-50/80 to-slate-50 border-purple-200 dark:from-[#180a2e] dark:via-[#120c24] dark:to-[#0c1322] dark:border-purple-500/40 text-slate-900 dark:text-purple-100 dark:shadow-[0_0_20px_rgba(147,51,234,0.18)]'
        }`}
      >
        {/* Subtle decorative background glow */}
        <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-purple-500/10 dark:bg-purple-500/15 blur-2xl pointer-events-none" />

        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* LEFT: Badge, Icon, Title and Formatted Message */}
          <div className="flex items-start sm:items-center gap-2.5 sm:gap-3 flex-1 min-w-0">
            {/* Visual Icon Box */}
            <div
              className={`shrink-0 w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center border shadow-xs ${
                isUrgent
                  ? 'bg-rose-500 text-white border-rose-400'
                  : isSuccess
                  ? 'bg-emerald-600 dark:bg-emerald-500 text-white border-emerald-400'
                  : isWarning
                  ? 'bg-amber-500 text-white border-amber-400'
                  : 'bg-gradient-to-br from-purple-600 to-indigo-600 text-white border-purple-400/50'
              }`}
            >
              {currentNotice.isWelcome ? (
                <Sparkles className="w-4 h-4 sm:w-4.5 sm:h-4.5 stroke-[2.2]" />
              ) : isUrgent ? (
                <AlertTriangle className="w-4 h-4 sm:w-4.5 sm:h-4.5 stroke-[2.2] animate-bounce" />
              ) : (
                <BadgeIcon className="w-4 h-4 sm:w-4.5 sm:h-4.5 stroke-[2.2]" />
              )}
            </div>

            {/* Notice Title and Body Text */}
            <div className="flex-1 min-w-0 pr-1">
              <div className="flex flex-wrap items-center gap-2 mb-0.5">
                {/* Notice Origin Badge */}
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${badgeConfig.badgeClass}`}
                >
                  <BadgeIcon className="w-3 h-3" />
                  <span>{badgeConfig.label}</span>
                </span>

                {/* Multiple Notices Indicator */}
                {activeNotices.length > 1 && (
                  <span className="text-[10.5px] font-mono font-semibold px-1.5 py-0.2 rounded bg-black/5 dark:bg-white/10 text-slate-600 dark:text-purple-300">
                    {currentIndex + 1} of {activeNotices.length}
                  </span>
                )}

                {/* Notice Title */}
                <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                  {currentNotice.title}
                </h4>
              </div>

              {/* Notice Message with Clickable Links */}
              <div className="text-[11.5px] sm:text-xs leading-relaxed text-slate-700 dark:text-slate-300 line-clamp-2 sm:line-clamp-none">
                <ClickableMessage
                  text={currentNotice.message}
                  className="font-normal"
                  linkClassName="font-semibold underline text-purple-700 dark:text-purple-300 hover:text-purple-900 dark:hover:text-purple-100"
                />
              </div>
            </div>
          </div>

          {/* RIGHT: Action Link, Pagination controls, and Dismiss Button */}
          <div className="flex items-center justify-between md:justify-end gap-2 shrink-0 pt-1 md:pt-0 border-t md:border-t-0 border-slate-200/60 dark:border-purple-800/40">
            {/* Optional Action Button if provided */}
            {currentNotice.actionUrl && (
              <button
                type="button"
                onClick={() => {
                  if (currentNotice.actionUrl?.startsWith('/')) {
                    const tabMatch = currentNotice.actionUrl.replace(/^\//, '').split('?')[0];
                    if (onNavigateTab && tabMatch) {
                      onNavigateTab(tabMatch);
                      return;
                    }
                  }
                  window.location.href = currentNotice.actionUrl!;
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-white dark:bg-purple-900/60 hover:bg-slate-50 dark:hover:bg-purple-800/80 text-purple-700 dark:text-purple-200 border border-purple-300 dark:border-purple-600/60 shadow-xs cursor-pointer transition-colors"
              >
                <span>{currentNotice.actionLabel || 'View Details'}</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            )}

            {/* Pagination Controls when there are multiple notices */}
            {activeNotices.length > 1 && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  id="pos-banner-prev-notice-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : activeNotices.length - 1));
                  }}
                  className="p-1 rounded-md text-slate-600 dark:text-purple-300 hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer transition-colors"
                  title="Previous notice"
                  aria-label="Previous notice"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>

                <div className="flex items-center gap-1 px-1">
                  {activeNotices.map((_, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setCurrentIndex(idx)}
                      className={`h-1.5 rounded-full transition-all cursor-pointer ${
                        idx === currentIndex
                          ? 'w-4 bg-purple-600 dark:bg-purple-400'
                          : 'w-1.5 bg-slate-300 dark:bg-slate-700 hover:bg-slate-400'
                      }`}
                      title={`Go to notice ${idx + 1}`}
                      aria-label={`Go to notice ${idx + 1}`}
                    />
                  ))}
                </div>

                <button
                  type="button"
                  id="pos-banner-next-notice-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCurrentIndex((prev) => (prev < activeNotices.length - 1 ? prev + 1 : 0));
                  }}
                  className="p-1 rounded-md text-slate-600 dark:text-purple-300 hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer transition-colors"
                  title="Next notice"
                  aria-label="Next notice"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Dismiss Notice Button */}
            <div className="flex items-center gap-1.5 ml-1">
              <button
                type="button"
                id={`pos-banner-dismiss-btn-${currentNotice.id}`}
                onClick={(e) => handleDismiss(currentNotice, e)}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900 dark:text-purple-300 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 border border-transparent hover:border-slate-300 dark:hover:border-purple-500/40 transition-colors cursor-pointer"
                title="Dismiss this notice"
                aria-label="Dismiss this notice"
              >
                <X className="w-3.5 h-3.5 stroke-[2.2]" />
                <span className="hidden sm:inline">Dismiss</span>
              </button>

              {activeNotices.length > 1 && (
                <button
                  type="button"
                  id="pos-banner-dismiss-all-btn"
                  onClick={handleDismissAll}
                  className="text-[10.5px] font-semibold text-slate-500 hover:text-slate-800 dark:text-purple-400 dark:hover:text-purple-200 px-1.5 py-1 hover:underline cursor-pointer"
                  title="Dismiss all notices"
                >
                  Dismiss all
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
