import React from 'react';
import { ShoeIcon } from './ShoeIcon.tsx';
import {
  LayoutDashboard,
  ShoppingCart,
  Boxes,
  Truck,
  RotateCcw,
  Users,
  TrendingUp,
  Settings,
  Search,
  Bell,
  Sun,
  ShieldCheck,
  Building2,
  Sparkles,
} from 'lucide-react';

interface TenantWorkspaceSkeletonProps {
  storeName?: string;
  activeTab?: string;
  statusMessage?: string;
}

/**
 * TenantWorkspaceSkeleton
 *
 * High-fidelity layout skeleton that directly mirrors the final layout of the
 * tenant workspace (Sidebar + Header + Main Dashboard/POS layout) while
 * `isInitializing` or `isRequestedTenantVerified` is false.
 * Prevents jarring layout shifts and provides a fluid, polished loading experience.
 */
export const TenantWorkspaceSkeleton: React.FC<TenantWorkspaceSkeletonProps> = ({
  storeName,
  activeTab = 'dashboard',
  statusMessage = 'Connecting to store workspace...',
}) => {
  const isPosTab = activeTab === 'pos';

  return (
    <div
      id="tenant-workspace-skeleton"
      className="flex w-full min-h-screen h-screen bg-[#F8FAFC] dark:bg-[#0A0E1A] text-slate-900 dark:text-slate-100 transition-colors overflow-hidden select-none"
      aria-label="Loading workspace..."
      role="status"
    >
      {/* 1. LEFT DESKTOP SIDEBAR SKELETON (w-64) */}
      <aside className="hidden md:flex flex-col w-64 shrink-0 h-screen bg-white/95 dark:bg-[#0D1322] border-r border-indigo-500/20 shadow-lg select-none justify-between overflow-hidden">
        {/* Top: Store Brand Header aligned with top Header bar (exact h-[3.6rem]) */}
        <div className="h-[3.6rem] px-4 flex items-center justify-between border-b border-indigo-500/20 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-white dark:bg-slate-900 flex items-center justify-center font-bold text-sm shrink-0 shadow-xs border border-indigo-500/25 p-1 overflow-hidden">
              <ShoeIcon className="w-full h-full object-contain rounded-md" />
            </div>
            <div className="min-w-0 flex-1">
              {storeName ? (
                <div className="text-xs font-bold text-slate-800 dark:text-white truncate tracking-tight">
                  {storeName}
                </div>
              ) : (
                <div className="h-3 w-28 rounded bg-slate-200 dark:bg-slate-700/80 animate-pulse" />
              )}
              <div className="text-[10px] text-slate-400 dark:text-indigo-200/60 font-medium truncate mt-0.5">
                SarbaazSoft Shoe POS
              </div>
            </div>
          </div>
          <div className="w-5 h-5 rounded-md bg-slate-100 dark:bg-slate-800 animate-pulse" />
        </div>

        {/* Middle: Navigation Items List */}
        <div className="flex-1 px-3 py-3 space-y-4 overflow-hidden">
          {/* Section 1: COUNTER & INVENTORY */}
          <div className="space-y-1">
            <div className="px-3 py-1 flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 tracking-wider uppercase">
                Counter &amp; Inventory
              </span>
            </div>
            {/* Dashboard / POS */}
            <div
              className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold ${
                !isPosTab
                  ? 'bg-purple-500/10 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-200/60 dark:border-purple-800/50 shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/40'
              }`}
            >
              <LayoutDashboard className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
              <div className="h-3 w-20 rounded bg-slate-200 dark:bg-slate-700/80 animate-pulse" />
            </div>
            {/* POS Terminal */}
            <div
              className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold ${
                isPosTab
                  ? 'bg-purple-500/10 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-200/60 dark:border-purple-800/50 shadow-xs'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <ShoppingCart className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <div className="h-3 w-24 rounded bg-slate-200 dark:bg-slate-700/80 animate-pulse" />
              <span className="ml-auto text-[9px] px-1 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-400">
                F1
              </span>
            </div>
            {/* Catalog */}
            <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-500 dark:text-slate-400">
              <Boxes className="w-4 h-4 text-slate-400 shrink-0" />
              <div className="h-3 w-24 rounded bg-slate-200/80 dark:bg-slate-800/80 animate-pulse" />
              <span className="ml-auto text-[9px] px-1 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-400">
                F2
              </span>
            </div>
          </div>

          {/* Section 2: SALES & PURCHASES */}
          <div className="space-y-1">
            <div className="px-3 py-1">
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 tracking-wider uppercase">
                Sales &amp; Purchases
              </span>
            </div>
            <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-500 dark:text-slate-400">
              <Truck className="w-4 h-4 text-slate-400 shrink-0" />
              <div className="h-3 w-20 rounded bg-slate-200/80 dark:bg-slate-800/80 animate-pulse" />
              <span className="ml-auto text-[9px] px-1 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-400">
                F3
              </span>
            </div>
            <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-500 dark:text-slate-400">
              <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
              <div className="h-3 w-16 rounded bg-slate-200/80 dark:bg-slate-800/80 animate-pulse" />
            </div>
            <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-500 dark:text-slate-400">
              <RotateCcw className="w-4 h-4 text-slate-400 shrink-0" />
              <div className="h-3 w-16 rounded bg-slate-200/80 dark:bg-slate-800/80 animate-pulse" />
              <span className="ml-auto text-[9px] px-1 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-400">
                F4
              </span>
            </div>
            <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-500 dark:text-slate-400">
              <Users className="w-4 h-4 text-slate-400 shrink-0" />
              <div className="h-3 w-20 rounded bg-slate-200/80 dark:bg-slate-800/80 animate-pulse" />
              <span className="ml-auto text-[9px] px-1 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-400">
                F5
              </span>
            </div>
          </div>

          {/* Section 3: ADMINISTRATION & REPORTS */}
          <div className="space-y-1">
            <div className="px-3 py-1">
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 tracking-wider uppercase">
                Administration
              </span>
            </div>
            <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-500 dark:text-slate-400">
              <TrendingUp className="w-4 h-4 text-slate-400 shrink-0" />
              <div className="h-3 w-18 rounded bg-slate-200/80 dark:bg-slate-800/80 animate-pulse" />
              <span className="ml-auto text-[9px] px-1 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-400">
                F6
              </span>
            </div>
            <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-500 dark:text-slate-400">
              <Settings className="w-4 h-4 text-slate-400 shrink-0" />
              <div className="h-3 w-16 rounded bg-slate-200/80 dark:bg-slate-800/80 animate-pulse" />
            </div>
          </div>
        </div>

        {/* Bottom: Store Account / User Profile Pill */}
        <div className="p-3 border-t border-indigo-500/20 bg-slate-50/50 dark:bg-slate-900/40">
          <div className="flex items-center gap-2.5 p-2 rounded-xl bg-white dark:bg-[#131B2E] border border-slate-200/80 dark:border-purple-800/40 shadow-xs">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="h-3 w-20 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
              <div className="h-2 w-14 rounded bg-slate-100 dark:bg-slate-800 animate-pulse mt-1" />
            </div>
          </div>
        </div>
      </aside>

      {/* 2. RIGHT AREA: HEADER + MAIN CONTENT SKELETON */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto bg-[#F8FAFC] dark:bg-[#0A0E1A]">
        {/* Top Header Bar Skeleton (exact h-[3.6rem] matching real Header) */}
        <header className="px-4 border-b border-indigo-500/20 bg-white/95 dark:bg-white/10 backdrop-blur-lg shadow-sm flex items-center justify-between gap-2.5 sm:gap-4 min-h-[3.6rem] py-1.5 shrink-0 select-none z-20">
          {/* Left: Mobile hamburger & breadcrumb / store indicator */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-slate-200/80 dark:bg-slate-800/80 animate-pulse md:hidden" />
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                {storeName || 'Store Workspace'}
              </span>
              <span className="text-slate-400 dark:text-slate-600 text-xs">/</span>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {isPosTab ? 'POS Terminal' : 'Dashboard Overview'}
              </span>
            </div>
          </div>

          {/* Center: Search input bar placeholder */}
          <div className="hidden sm:flex items-center flex-1 max-w-md mx-4">
            <div className="w-full h-8.5 rounded-xl bg-slate-100 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/60 px-3 flex items-center gap-2 text-slate-400 dark:text-slate-500 text-xs">
              <Search className="w-3.5 h-3.5" />
              <span className="truncate">Scan shoe barcode or search article...</span>
              <span className="ml-auto text-[10px] px-1 py-0.5 rounded bg-slate-200/60 dark:bg-slate-700/60 text-slate-500">
                F1
              </span>
            </div>
          </div>

          {/* Right: Quick Controls & User Pill */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Live Synchronizing Badge */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-50 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-800/50 text-[11px] font-semibold text-purple-700 dark:text-purple-300 shadow-2xs">
              <div className="w-1.5 h-1.5 rounded-full bg-purple-600 dark:bg-purple-400 animate-ping" />
              <span className="hidden sm:inline">Connecting</span>
            </div>

            {/* Theme Toggle Button Skeleton */}
            <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60 flex items-center justify-center text-slate-400">
              <Sun className="w-3.5 h-3.5" />
            </div>

            {/* Alerts Bell Skeleton */}
            <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60 flex items-center justify-center text-slate-400 relative">
              <Bell className="w-3.5 h-3.5" />
            </div>

            {/* User Avatar Skeleton */}
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-500/30 to-indigo-500/30 border border-purple-300/40 dark:border-purple-700/40 animate-pulse" />
          </div>
        </header>

        {/* Main Content Area Skeleton */}
        <main className="flex-1 p-4 sm:p-6 space-y-6 max-w-7xl mx-auto w-full overflow-x-hidden">
          {isPosTab ? (
            /* POS TERMINAL SKELETON LAYOUT */
            <div className="space-y-4">
              {/* POS Notification Banner Skeleton */}
              <div className="h-12 rounded-xl bg-gradient-to-r from-purple-50/70 via-indigo-50/50 to-blue-50/40 dark:from-purple-950/20 dark:via-indigo-950/20 dark:to-slate-900/40 border border-purple-200/70 dark:border-purple-800/40 p-3 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-lg bg-purple-200 dark:bg-purple-900/60 animate-pulse" />
                  <div className="h-3 w-48 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
                </div>
                <div className="h-3 w-24 rounded bg-slate-200/80 dark:bg-slate-700/80 animate-pulse" />
              </div>

              {/* POS Two-Column Grid */}
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
                {/* Left 8 Cols: Barcode Input & Cart Table Skeleton */}
                <div className="xl:col-span-8 rounded-2xl bg-white dark:bg-[#131B2E] border border-slate-200/80 dark:border-purple-800/40 shadow-sm overflow-hidden p-4 space-y-4">
                  {/* Scanner Bar Header */}
                  <div className="h-10 rounded-xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 flex items-center px-3 justify-between">
                    <div className="h-3.5 w-64 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
                    <div className="h-6 w-20 rounded bg-slate-200/80 dark:bg-slate-700/80 animate-pulse" />
                  </div>
                  {/* Cart Table Rows Skeleton */}
                  <div className="space-y-2 pt-2">
                    {[1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className="h-14 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800/60 p-3 flex items-center justify-between gap-4"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-slate-800 animate-pulse shrink-0" />
                          <div className="space-y-1.5">
                            <div className="h-3 w-36 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
                            <div className="h-2 w-20 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="h-4 w-12 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
                          <div className="h-4 w-16 rounded bg-slate-300 dark:bg-slate-600 animate-pulse" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right 4 Cols: Checkout Totals Summary Skeleton */}
                <div className="xl:col-span-4 rounded-2xl bg-white dark:bg-[#131B2E] border border-slate-200/80 dark:border-purple-800/40 shadow-sm p-4 space-y-4">
                  <div className="h-4 w-28 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800 space-y-3">
                    <div className="flex justify-between items-center">
                      <div className="h-3 w-16 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
                      <div className="h-3 w-20 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="h-3 w-20 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
                      <div className="h-3 w-14 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
                    </div>
                    <div className="h-px bg-slate-200 dark:bg-slate-800" />
                    <div className="flex justify-between items-center pt-1">
                      <div className="h-4 w-24 rounded bg-slate-300 dark:bg-slate-600 animate-pulse" />
                      <div className="h-6 w-28 rounded bg-purple-300 dark:bg-purple-800 animate-pulse" />
                    </div>
                  </div>
                  <div className="h-11 rounded-xl bg-emerald-500/30 dark:bg-emerald-600/30 border border-emerald-400/40 animate-pulse" />
                </div>
              </div>
            </div>
          ) : (
            /* DASHBOARD SKELETON LAYOUT */
            <>
              {/* Top: Welcome Greeting Banner Skeleton */}
              <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-purple-50/90 via-indigo-50/60 to-blue-50/40 dark:from-[#131B2E] dark:via-purple-950/30 dark:to-[#0f172a] border border-purple-200/90 dark:border-purple-800/60 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3.5 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-purple-600/30 text-purple-600 dark:text-purple-300 flex items-center justify-center shrink-0 border border-purple-400/30 animate-pulse">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/60 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-700/60">
                        Workspace Active
                      </span>
                      <span className="text-xs font-mono text-purple-700 dark:text-purple-300/80">
                        • {storeName || 'Connecting...'}
                      </span>
                    </div>
                    <div className="h-5 w-48 sm:w-64 rounded bg-slate-300/80 dark:bg-slate-700/80 animate-pulse" />
                    <div className="h-3 w-64 sm:w-80 rounded bg-slate-200/80 dark:bg-slate-800/80 animate-pulse" />
                  </div>
                </div>
                <div className="flex items-center gap-2.5 shrink-0">
                  <div className="h-9 w-24 rounded-xl bg-purple-600/20 dark:bg-purple-900/40 border border-purple-300/40 dark:border-purple-700/40 animate-pulse" />
                  <div className="h-9 w-24 rounded-xl bg-emerald-600/20 dark:bg-emerald-900/40 border border-emerald-300/40 dark:border-emerald-700/40 animate-pulse" />
                </div>
              </div>

              {/* Row: 5 KPI Metric Cards Skeleton */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                {[
                  { label: "Today's Sales", color: 'emerald' },
                  { label: "Today's Invoices", color: 'indigo' },
                  { label: 'Low Stock Alert', color: 'amber' },
                  { label: 'Cash in Register', color: 'blue' },
                  { label: 'Active Catalog', color: 'purple' },
                ].map((item, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-2xl border border-slate-200/80 dark:border-purple-800/40 bg-white/90 dark:bg-[#131B2E]/90 shadow-xs space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                        {item.label}
                      </span>
                      <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60 animate-pulse" />
                    </div>
                    <div className="h-6 w-24 rounded bg-slate-300 dark:bg-slate-700 animate-pulse" />
                    <div className="h-2 w-16 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
                  </div>
                ))}
              </div>

              {/* Lower Workspace Area: 2-Column split (Table + Summary Card) */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left 2 Cols: Activity Table Skeleton */}
                <div className="lg:col-span-2 rounded-2xl border border-slate-200/80 dark:border-purple-800/40 bg-white dark:bg-[#131B2E] shadow-xs p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 pb-3">
                    <div className="h-4 w-36 rounded bg-slate-300 dark:bg-slate-700 animate-pulse" />
                    <div className="h-7 w-20 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
                  </div>
                  <div className="space-y-3">
                    {[1, 2, 3, 4, 5].map((row) => (
                      <div
                        key={row}
                        className="flex items-center justify-between py-2 border-b border-slate-50 dark:border-slate-800/40"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse shrink-0" />
                          <div className="space-y-1">
                            <div className="h-3 w-32 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
                            <div className="h-2 w-16 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
                          </div>
                        </div>
                        <div className="h-4 w-18 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right 1 Col: Quick Actions Card Skeleton */}
                <div className="rounded-2xl border border-slate-200/80 dark:border-purple-800/40 bg-white dark:bg-[#131B2E] shadow-xs p-5 space-y-4">
                  <div className="h-4 w-28 rounded bg-slate-300 dark:bg-slate-700 animate-pulse border-b border-slate-100 dark:border-slate-800/80 pb-3" />
                  <div className="space-y-2.5">
                    {[1, 2, 3].map((item) => (
                      <div
                        key={item}
                        className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800 flex items-center gap-3"
                      >
                        <div className="w-8 h-8 rounded-lg bg-slate-200/80 dark:bg-slate-800 animate-pulse shrink-0" />
                        <div className="space-y-1 flex-1">
                          <div className="h-3 w-28 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
                          <div className="h-2 w-36 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </main>
      </div>

      {/* Floating Status Notification Pill (Discreet, non-blocking) */}
      <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2.5 px-3.5 py-2 rounded-full bg-slate-900/85 dark:bg-slate-800/90 text-white text-xs font-medium backdrop-blur-md shadow-xl border border-white/10 animate-in fade-in slide-in-from-bottom-2 duration-300">
        <div className="w-3.5 h-3.5 border-2 border-purple-400 border-t-transparent rounded-full animate-spin shrink-0" />
        <span className="truncate max-w-[200px] sm:max-w-xs">{statusMessage}</span>
      </div>
    </div>
  );
};
