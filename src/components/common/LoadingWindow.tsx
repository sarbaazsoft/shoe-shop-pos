import React from 'react';
import { Shield, Sparkles } from 'lucide-react';
import { ShowroomBackground } from './ShowroomBackground.tsx';
import { PublicHeader } from './PublicHeader.tsx';
import { PublicFooter } from './PublicFooter.tsx';
import { ShoeIcon } from './ShoeIcon.tsx';

export interface LoadingWindowProps {
  storeName?: string;
  statusMessage?: string;
  subtitle?: string;
  isAdmin?: boolean;
  logoSrc?: string | null;
  activeTab?: string;
}

/**
 * LoadingWindow
 *
 * Polished post-login and state-transition loading window rendered against the
 * high-fidelity Showroom Background (`shoeStoreBg`). Aligned cleanly for both:
 * 1. Store Owner & Cashier loading (ShoeIcon, store name, POS workspace status)
 * 2. SuperAdmin loading (Shield emblem, POS SaaS C-Panel, platform control plane status)
 */
export const LoadingWindow: React.FC<LoadingWindowProps> = ({
  storeName,
  statusMessage,
  subtitle,
  isAdmin = false,
  logoSrc,
}) => {
  const isSuperAdminView =
    isAdmin ||
    Boolean(
      storeName &&
        (storeName.toLowerCase().includes('c-panel') ||
          storeName.toLowerCase().includes('superadmin') ||
          storeName.toLowerCase().includes('pos admin'))
    );

  const effectiveTitle = isSuperAdminView
    ? storeName || 'POS SaaS C-Panel'
    : storeName || 'Store Workspace';

  const effectiveStatus = statusMessage || (
    isSuperAdminView
      ? 'Connecting to SuperAdmin Control Plane...'
      : 'Entering Store Workspace...'
  );

  const effectiveSubtitle = subtitle || (
    isSuperAdminView
      ? 'Loading platform telemetry, tenant registry, and security protocols...'
      : 'Synchronizing product catalog, offline sales cache, and registers...'
  );

  return (
    <div
      id="showroom-loading-viewport"
      className="min-h-screen w-full flex flex-col justify-between relative overflow-x-hidden bg-slate-200 dark:bg-[#0A0E1A] text-slate-900 dark:text-slate-100 font-sans selection:bg-purple-600 selection:text-white transition-colors duration-200"
      role="status"
      aria-live="polite"
    >
      {/* 1. Showroom Background Image Layer (70% Opacity) */}
      <ShowroomBackground />

      {/* 2. Public Header Aligned with Store & Admin Bar */}
      <PublicHeader
        storeName={effectiveTitle}
        badgeText="Connecting..."
        badgeVariant="connecting"
        subtitle={isSuperAdminView ? 'Multi-Tenant POS Cloud • SuperAdmin' : 'Dual-engine wholesale shoe shop POS'}
        dbText={isSuperAdminView ? 'Platform Online' : 'Tenant Scoped'}
        isSuperAdmin={isSuperAdminView}
        logoSrc={logoSrc}
      />

      {/* 3. Centered Loading Window */}
      <main className="relative z-10 flex-1 flex flex-col justify-center items-center px-4 py-8 sm:px-6">
        <div className="w-full max-w-md mx-auto bg-white/95 dark:bg-[#131B2E]/95 backdrop-blur-2xl rounded-3xl p-6 sm:p-8 shadow-2xl border border-white/50 dark:border-purple-800/70 text-center relative overflow-hidden transition-all duration-300">
          {/* Top Decorative Gradient Accent Bar */}
          <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-purple-600 via-indigo-600 to-emerald-500" />

          {/* Ambient Glow Orbs inside Modal Window */}
          <div className="absolute -top-16 -right-16 w-36 h-36 bg-purple-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute -bottom-16 -left-16 w-36 h-36 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />

          {/* Brand Icon: SuperAdmin Shield vs Store ShoeIcon */}
          <div className="relative mb-4 mt-1 flex justify-center">
            {isSuperAdminView ? (
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-purple-600/30 border border-purple-400/40 relative">
                <Shield className="w-8 h-8 text-white" />
                <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 border-2 border-white dark:border-[#131B2E]"></span>
                </span>
              </div>
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-white dark:bg-slate-900 flex items-center justify-center shadow-lg border border-purple-500/25 overflow-hidden relative">
                <ShoeIcon
                  src={logoSrc || '/pwa-192x192.png'}
                  alt={`${effectiveTitle} Logo`}
                  className="w-full h-full object-cover rounded-2xl"
                />
                <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 border-2 border-white dark:border-[#131B2E]"></span>
                </span>
              </div>
            )}
          </div>

          {/* Title & Badge */}
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight mb-1">
            {effectiveTitle}
          </h2>

          <div className="mb-4">
            {isSuperAdminView ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[11px] font-bold bg-purple-500/15 dark:bg-purple-900/40 border border-purple-400/30 text-purple-700 dark:text-purple-300">
                <Shield className="w-3 h-3 text-purple-600 dark:text-purple-400" />
                <span>Multi-Tenant Platform Control Plane</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[11px] font-bold bg-indigo-500/15 dark:bg-indigo-900/40 border border-indigo-400/30 text-indigo-700 dark:text-indigo-300">
                <Sparkles className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                <span>Wholesale &amp; Retail POS Suite</span>
              </span>
            )}
          </div>

          {/* Animated Spinner with Radiant Ring */}
          <div className="relative w-12 h-12 mx-auto my-4 flex items-center justify-center">
            <div className="absolute inset-0 rounded-full border-3 border-purple-500/20 dark:border-purple-400/20" />
            <div className="absolute inset-0 rounded-full border-3 border-transparent border-t-purple-600 border-r-indigo-600 animate-spin" />
            {isSuperAdminView ? (
              <Shield className="w-5 h-5 text-purple-600 dark:text-purple-400 animate-pulse" />
            ) : (
              <Sparkles className="w-5 h-5 text-purple-600 dark:text-purple-400 animate-pulse" />
            )}
          </div>

          {/* Status Text & Explanatory Subtitle */}
          <h3 className="text-sm sm:text-base font-semibold text-slate-800 dark:text-slate-100 mb-1.5">
            {effectiveStatus}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-xs mx-auto">
            {effectiveSubtitle}
          </p>

          {/* Indeterminate Smooth Progress Bar */}
          <div className="w-full bg-slate-100 dark:bg-slate-800/80 rounded-full h-1.5 overflow-hidden mt-5 mb-4">
            <div className="h-full bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 animate-pulse rounded-full w-full" />
          </div>

          {/* Quick Security & Integrity Badges */}
          <div className="flex items-center justify-center gap-2 text-[11px] font-medium text-slate-400 dark:text-slate-500 pt-1">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {isSuperAdminView ? 'Platform Online' : 'Database Scoped'}
            </span>
            <span>•</span>
            <span>Offline Resilient</span>
            <span>•</span>
            <span>Encrypted</span>
          </div>
        </div>
      </main>

      {/* 4. Global Public Footer with Bold Credit */}
      <PublicFooter storeName={effectiveTitle} subtitle={effectiveSubtitle} />
    </div>
  );
};
