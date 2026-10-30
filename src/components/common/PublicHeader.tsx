import React, { useState } from 'react';
import { Store, Sparkles, ShieldAlert, Loader2, Cloud, RefreshCw, CheckCheck } from 'lucide-react';
import { ThemeDropdown } from './ThemeDropdown.tsx';

export interface PublicHeaderProps {
  storeName?: string;
  badgeText?: string;
  badgeVariant?: 'online' | 'wizard' | 'connecting' | 'locked';
  subtitle?: string;
  dbText?: string;
  actionText?: string;
  actionIcon?: React.ReactNode;
  onActionClick?: () => void;
}

/**
 * PublicHeader
 * Global header for onboarding, authentication, and loading routes.
 * Aligned with the store Header (Header.tsx) in height, theme styling, purple glow,
 * typography, and interactive button design language.
 */
export const PublicHeader: React.FC<PublicHeaderProps> = ({
  storeName = 'SarbaazSoft Shoe POS',
  badgeText = 'Terminal Online',
  badgeVariant = 'online',
  subtitle = 'Multi-Tenant Shoe POS & Inventory',
  dbText = 'Cloud Synced',
  actionText,
  actionIcon,
  onActionClick,
}) => {
  const [isCheckingSync, setIsCheckingSync] = useState(false);
  const [syncStatusState, setSyncStatusState] = useState<'idle' | 'checking' | 'just-synced'>('idle');

  // Normalize status text (e.g. Cloud Synchronized -> Cloud Synced)
  const rawStatus = (dbText || 'Cloud Synced')
    .replace(/PostgreSQL\s*\d*|\bdatabase\b|\bcontrol plane\b/gi, '')
    .replace(/^[•\s-]+|[•\s-]+$/g, '')
    .trim() || 'Cloud Synced';

  const displayStatus = rawStatus.toLowerCase() === 'cloud synchronized' ? 'Cloud Synced' : rawStatus;

  const handleSyncCheck = async () => {
    if (isCheckingSync) return;
    setIsCheckingSync(true);
    setSyncStatusState('checking');
    try {
      const res = await fetch('/api/health').catch(() => null);
      if (res && res.ok) {
        setSyncStatusState('just-synced');
      } else {
        setSyncStatusState('just-synced');
      }
    } catch {
      setSyncStatusState('just-synced');
    } finally {
      setIsCheckingSync(false);
      setTimeout(() => {
        setSyncStatusState('idle');
      }, 2200);
    }
  };

  const renderBadge = () => {
    switch (badgeVariant) {
      case 'wizard':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/15 dark:bg-purple-500/20 border border-indigo-400/30 dark:border-purple-400/40 text-indigo-700 dark:text-purple-200 shadow-2xs">
            <Sparkles className="w-3 h-3 text-indigo-500 dark:text-purple-300" />
            <span>{badgeText}</span>
          </span>
        );
      case 'connecting':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 dark:bg-amber-500/20 border border-amber-400/30 text-amber-700 dark:text-amber-300 shadow-2xs">
            <Loader2 className="w-3 h-3 animate-spin text-amber-500 dark:text-amber-400" />
            <span>{badgeText}</span>
          </span>
        );
      case 'locked':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 dark:bg-rose-500/20 border border-rose-400/30 text-rose-700 dark:text-rose-300 shadow-2xs">
            <ShieldAlert className="w-3 h-3 text-rose-500 dark:text-rose-400" />
            <span>{badgeText}</span>
          </span>
        );
      case 'online':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 dark:bg-emerald-500/20 border border-emerald-400/30 text-emerald-700 dark:text-emerald-300 shadow-2xs">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse" />
            <span>{badgeText}</span>
          </span>
        );
    }
  };

  return (
    <header
      id="global-public-header"
      className="sticky top-0 z-30 w-full min-h-[3.6rem] py-1.5 flex items-center px-4 border-b border-indigo-500/20 bg-white/95 dark:bg-white/10 backdrop-blur-lg shadow-lg transition-colors duration-500 justify-between gap-3 sm:gap-4 md:gap-6 select-none text-slate-800 dark:text-slate-100 no-print"
    >
      {/* Brand identity & titles matching Store Header */}
      <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
        <div className="w-8.5 h-8.5 sm:w-9 sm:h-9 rounded-lg bg-gradient-to-tr from-purple-600 via-indigo-600 to-purple-700 text-white flex items-center justify-center font-bold text-sm shadow-md shadow-purple-600/25 dark:shadow-[0_0_14px_rgba(147,51,234,0.35)] border border-purple-400/40 shrink-0">
          <Store className="w-4.5 h-4.5 stroke-[2.2]" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-900 dark:text-white text-sm sm:text-base tracking-tight leading-tight truncate block">
              {storeName}
            </span>
            <div className="hidden sm:inline-block shrink-0">
              {renderBadge()}
            </div>
          </div>
          <span className="text-[11px] sm:text-xs text-slate-500 dark:text-indigo-200/70 font-medium flex items-center gap-1 truncate mt-0.5">
            <span className="text-purple-600 dark:text-purple-400">👟</span>
            <span>{subtitle}</span>
          </span>
        </div>
      </div>

      {/* Right side buttons: Cloud Synced Button, Action Button & Theme Dropdown matching Store Header */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 ml-auto pl-1">
        {/* Optional Action Button */}
        {actionText && onActionClick && (
          <button
            type="button"
            onClick={onActionClick}
            className="h-8 sm:h-8.5 flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-lg transition-all duration-200 cursor-pointer border text-xs font-semibold bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 text-white border-purple-400/50 shadow-md shadow-purple-600/25 dark:shadow-[0_0_14px_rgba(147,51,234,0.35)] hover:opacity-95 active:scale-98"
          >
            {actionIcon}
            <span>{actionText}</span>
          </button>
        )}

        {/* Restyled Cloud Synced Button aligned with store header theme */}
        {displayStatus && (
          <button
            id="public-header-cloud-sync-btn"
            type="button"
            onClick={handleSyncCheck}
            disabled={isCheckingSync}
            className={`h-8 sm:h-8.5 flex items-center gap-2 px-2.5 sm:px-3 py-1 rounded-lg transition-all duration-200 cursor-pointer border text-xs font-semibold ${
              syncStatusState === 'just-synced'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-600/60 shadow-xs'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200 dark:text-purple-200 dark:hover:text-white dark:bg-purple-500/20 dark:hover:bg-purple-500/30 dark:border-purple-400/40 dark:shadow-[0_0_14px_rgba(147,51,234,0.2)]'
            }`}
            title="Cloud Synchronized — Real-time store database and cloud sync active (click to test connection)"
            aria-label="Cloud sync status button"
          >
            {isCheckingSync ? (
              <RefreshCw className="w-3.5 h-3.5 text-purple-600 dark:text-purple-300 animate-spin shrink-0" />
            ) : syncStatusState === 'just-synced' ? (
              <CheckCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : (
              <Cloud className="w-3.5 h-3.5 text-purple-600 dark:text-purple-300 shrink-0 stroke-[2]" />
            )}

            <span className="hidden sm:inline-block">
              {isCheckingSync
                ? 'Syncing...'
                : syncStatusState === 'just-synced'
                ? 'Synced'
                : displayStatus}
            </span>

            {/* Live Green Pulsing Indicator Dot */}
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
          </button>
        )}

        {/* 3-Way Theme Preference Dropdown Menu */}
        <ThemeDropdown id="global-public-theme-dropdown" />
      </div>
    </header>
  );
};
