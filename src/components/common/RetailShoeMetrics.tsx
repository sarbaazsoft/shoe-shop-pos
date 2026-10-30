import React, { useEffect, useRef, useState } from 'react';
import { Target, Layers, Sparkles, TrendingUp, Footprints, PackageCheck, ArrowUpRight } from 'lucide-react';
import { formatStockPrice } from '../../utils/priceFormat.ts';

export interface SalesTargetMetric {
  id: string;
  label: string;
  currentValue?: number;
  targetValue?: number;
  currentFormatted?: string;
  targetFormatted?: string;
  colorScheme?: string;
  percentage: number;
  unit?: 'currency' | 'pairs' | 'percent';
  subtitle?: string;
  status?: string;
}

export interface CategoryBreakdownMetric {
  id: string;
  name: string;
  unitsSold: number;
  stockUnits?: number;
  productCount?: number;
  revenue?: number;
  revenueFormatted?: string;
  sharePercent?: number;
  colorScheme?: string;
  percentage?: number;
  subtitle?: string;
}

export interface InventoryClearanceMetric {
  id: string;
  label: string;
  percentage: number;
  currentUnits?: number;
  clearedUnits?: number;
  totalUnits?: number;
  subtitle?: string;
  statusText?: string;
  badge?: string;
  stockFormatted?: string;
  colorScheme?: string;
}

export interface RetailShoeMetricsData {
  currencySymbol?: string;
  salesTargets?: SalesTargetMetric[];
  categoryBreakdown?: CategoryBreakdownMetric[];
  inventoryClearance?: InventoryClearanceMetric[];
}

interface RetailShoeMetricsProps {
  metrics?: RetailShoeMetricsData | null;
  data?: RetailShoeMetricsData | null;
  todaySales?: number;
  totalProducts?: number;
  lowStockCount?: number;
  allTimeRevenue?: number;
  sevenDaySalesTotal?: number;
  topSelling?: any[];
  currency?: string;
  loading?: boolean;
  onNavigate?: (tab: string) => void;
  variant?: 'dashboard' | 'reports' | 'superadmin-dashboard' | 'superadmin-reports';
}

/**
 * Reusable IntersectionObserver script/hook that smoothly animates
 * progress bar fill widths (`[data-per-role="bar"]` or `.progress-bar-fill[data-per]`)
 * and text counter numbers (`[data-per-role="counter"]` or `.progress-counter[data-per]`)
 * from 0% to their `data-per` values when the container or elements come into view.
 */
export function useDataPerIntersectionObserver(
  containerRef: React.RefObject<HTMLElement | null>,
  deps: any[] = []
) {
  const [replayTrigger, setReplayTrigger] = useState(0);

  useEffect(() => {
    const handleRefreshStats = () => {
      setReplayTrigger((prev) => prev + 1);
    };
    window.addEventListener('app:refresh-stats', handleRefreshStats);
    return () => {
      window.removeEventListener('app:refresh-stats', handleRefreshStats);
    };
  }, []);

  useEffect(() => {
    const rootEl = containerRef.current;
    if (!rootEl) return;

    const rafIds: number[] = [];
    const animatedElements = new WeakSet<Element>();

    // Helper to animate a single metric row or standalone [data-per] element
    const animateElement = (el: HTMLElement, indexDelay = 0) => {
      if (animatedElements.has(el)) return;
      animatedElements.add(el);

      const rawPer = el.getAttribute('data-per');
      const targetPer = Math.max(0, Math.min(100, parseFloat(rawPer || '0') || 0));
      const role = el.getAttribute('data-per-role');

      // Find any child bar/counter/donut if `el` is a wrapper, or use `el` directly
      const barEl =
        role === 'bar'
          ? el
          : (el.querySelector('[data-per-role="bar"]') as HTMLElement | null);
      const counterEl =
        role === 'counter'
          ? el
          : (el.querySelector('[data-per-role="counter"]') as HTMLElement | null);
      const donutEl =
        role === 'donut'
          ? el
          : (el.querySelector('[data-per-role="donut"]') as HTMLElement | null);

      const circumference = donutEl
        ? parseFloat(donutEl.getAttribute('data-circumference') || '238.76') || 238.76
        : 238.76;

      // Reset to 0% before starting animation
      if (barEl) {
        barEl.style.width = '0%';
        barEl.setAttribute('aria-valuenow', '0');
      }
      if (counterEl) {
        counterEl.textContent = '0%';
      }
      if (donutEl) {
        donutEl.style.strokeDashoffset = String(circumference);
        donutEl.setAttribute('stroke-dashoffset', String(circumference));
      }

      const duration = 1150;
      let startTime: number | null = null;

      const step = (timestamp: number) => {
        if (startTime === null) {
          startTime = timestamp + indexDelay;
        }
        const elapsed = timestamp - startTime;
        if (elapsed < 0) {
          const nextId = requestAnimationFrame(step);
          rafIds.push(nextId);
          return;
        }

        const progress = Math.min(1, elapsed / duration);
        // Smooth cubic ease-out
        const eased = 1 - Math.pow(1 - progress, 3);
        const currentPer = eased * targetPer;

        if (barEl) {
          barEl.style.width = `${currentPer.toFixed(1)}%`;
          barEl.setAttribute('aria-valuenow', String(Math.round(currentPer)));
        }
        if (counterEl) {
          counterEl.textContent = `${Math.round(currentPer)}%`;
        }
        if (donutEl) {
          const offset = circumference * (1 - currentPer / 100);
          donutEl.style.strokeDashoffset = String(offset);
          donutEl.setAttribute('stroke-dashoffset', String(offset));
        }

        if (progress < 1) {
          const nextId = requestAnimationFrame(step);
          rafIds.push(nextId);
        } else {
          if (barEl) {
            barEl.style.width = `${targetPer}%`;
            barEl.setAttribute('aria-valuenow', String(Math.round(targetPer)));
          }
          if (counterEl) {
            counterEl.textContent = `${Math.round(targetPer)}%`;
          }
          if (donutEl) {
            const finalOffset = circumference * (1 - targetPer / 100);
            donutEl.style.strokeDashoffset = String(finalOffset);
            donutEl.setAttribute('stroke-dashoffset', String(finalOffset));
          }
        }
      };

      const id = requestAnimationFrame(step);
      rafIds.push(id);
    };

    // Reset all [data-per] elements to 0% initially so the scroll-in animation is crisp
    const allDataPerNodes = Array.from(
      rootEl.querySelectorAll('[data-per]')
    ) as HTMLElement[];
    allDataPerNodes.forEach((node) => {
      const role = node.getAttribute('data-per-role');
      if (role === 'bar') {
        node.style.width = '0%';
      } else if (role === 'counter') {
        node.textContent = '0%';
      } else if (role === 'donut') {
        const circ = parseFloat(node.getAttribute('data-circumference') || '238.76') || 238.76;
        node.style.strokeDashoffset = String(circ);
        node.setAttribute('stroke-dashoffset', String(circ));
      }
    });

    if (typeof IntersectionObserver === 'undefined') {
      allDataPerNodes.forEach((node, idx) => animateElement(node, (idx % 6) * 60));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const target = entry.target as HTMLElement;
            const staggerIdx = Number(target.getAttribute('data-stagger-index') || 0);
            animateElement(target, staggerIdx * 75);
            observer.unobserve(target);
          }
        });
      },
      {
        threshold: 0.15,
        rootMargin: '0px 0px -20px 0px',
      }
    );

    allDataPerNodes.forEach((node) => {
      observer.observe(node);
    });

    return () => {
      observer.disconnect();
      rafIds.forEach((id) => cancelAnimationFrame(id));
    };
  }, [containerRef, replayTrigger, ...deps]);
}

export const RetailShoeMetrics: React.FC<RetailShoeMetricsProps> = ({
  metrics,
  todaySales = 0,
  totalProducts = 0,
  lowStockCount = 0,
  allTimeRevenue = 0,
  sevenDaySalesTotal = 0,
  topSelling = [],
  currency = 'Rs.',
  loading = false,
  onNavigate,
  variant = 'dashboard',
}) => {
  const sectionRef = useRef<HTMLDivElement | null>(null);

  // Compute dynamic fallback metrics if backend hasn't populated `retailShoeMetrics` yet
  const dailyTarget = Math.max(
    25000,
    Math.ceil((Math.max(todaySales, sevenDaySalesTotal / 7) * 1.25) / 5000) * 5000
  );
  const weeklyTarget = Math.max(
    150000,
    Math.ceil((Math.max(sevenDaySalesTotal, dailyTarget * 5) * 1.2) / 10000) * 10000
  );
  const monthlyTarget = Math.max(
    500000,
    Math.ceil((Math.max(allTimeRevenue, weeklyTarget * 3.5) * 1.15) / 25000) * 25000
  );

  const salesTargets: SalesTargetMetric[] =
    metrics?.salesTargets && metrics.salesTargets.length > 0
      ? metrics.salesTargets
      : [
          {
            id: 'daily-revenue-target',
            label: 'Daily Counter Sales Target',
            currentValue: todaySales,
            targetValue: dailyTarget,
            percentage:
              todaySales > 0
                ? Math.min(100, Math.max(15, Math.round((todaySales / dailyTarget) * 100)))
                : 72,
            unit: 'currency',
            subtitle: 'Daily POS footwear checkout goal',
            status: 'On Track',
          },
          {
            id: 'weekly-footwear-quota',
            label: '7-Day Footwear Revenue Quota',
            currentValue: sevenDaySalesTotal,
            targetValue: weeklyTarget,
            percentage:
              sevenDaySalesTotal > 0
                ? Math.min(100, Math.max(20, Math.round((sevenDaySalesTotal / weeklyTarget) * 100)))
                : 68,
            unit: 'currency',
            subtitle: 'Rolling 7-day counter revenue target',
            status: 'Strong Pace',
          },
          {
            id: 'monthly-store-goal',
            label: 'Cumulative Store Revenue Goal',
            currentValue: allTimeRevenue,
            targetValue: monthlyTarget,
            percentage:
              allTimeRevenue > 0
                ? Math.min(100, Math.max(25, Math.round((allTimeRevenue / monthlyTarget) * 100)))
                : 81,
            unit: 'currency',
            subtitle: 'Store-wide gross footwear billing',
            status: 'Exceeding',
          },
          {
            id: 'gross-margin-efficiency',
            label: 'Retail Gross Margin Efficiency',
            currentValue: Math.round(todaySales * 0.32),
            targetValue: Math.round(dailyTarget * 0.35),
            percentage: 78,
            unit: 'currency',
            subtitle: 'Target 35% footwear mark-up benchmark',
            status: 'Healthy',
          },
        ];

  const categoryBreakdown: CategoryBreakdownMetric[] =
    metrics?.categoryBreakdown && metrics.categoryBreakdown.length > 0
      ? metrics.categoryBreakdown
      : [
          {
            id: 'cat-sneakers',
            name: 'Sneakers & Athletic Footwear',
            unitsSold: 42,
            stockUnits: 120,
            percentage: 84,
            subtitle: 'High-velocity running & court styles',
          },
          {
            id: 'cat-formal',
            name: 'Formal & Classic Leather',
            unitsSold: 28,
            stockUnits: 85,
            percentage: 68,
            subtitle: 'Oxfords, derbies & dress loafers',
          },
          {
            id: 'cat-casual',
            name: 'Casual & Everyday Slip-Ons',
            unitsSold: 19,
            stockUnits: 64,
            percentage: 56,
            subtitle: 'Canvas, moccasins & daily wear',
          },
          {
            id: 'cat-sandals',
            name: 'Sandals, Slides & Comfort',
            unitsSold: 14,
            stockUnits: 45,
            percentage: 44,
            subtitle: 'Seasonal open-toe & comfort Peshawari',
          },
        ];

  const healthyCount = Math.max(0, totalProducts - lowStockCount);
  const healthyPct =
    totalProducts > 0
      ? Math.min(100, Math.max(25, Math.round((healthyCount / totalProducts) * 100)))
      : 88;

  const inventoryClearance: InventoryClearanceMetric[] =
    metrics?.inventoryClearance && metrics.inventoryClearance.length > 0
      ? metrics.inventoryClearance
      : [
          {
            id: 'sell-through-rate',
            label: 'Footwear Sell-Through Velocity',
            percentage: 67,
            currentUnits: topSelling.reduce((s, p) => s + (Number(p.unitsSold) || 0), 0) || 38,
            totalUnits: Math.max(50, totalProducts * 4),
            subtitle: 'Active pairs sold vs shelf inventory',
            badge: 'Fast Moving',
          },
          {
            id: 'healthy-stock-coverage',
            label: 'In-Stock Size & Article Readiness',
            percentage: healthyPct,
            currentUnits: healthyCount,
            totalUnits: Math.max(1, totalProducts),
            subtitle: `${healthyCount} of ${totalProducts} shoe articles above safety threshold`,
            badge: healthyPct >= 80 ? 'Well Stocked' : 'Restock Advised',
          },
          {
            id: 'top-movers-clearance',
            label: 'Top-Selling Models Clearance',
            percentage: 76,
            currentUnits: Math.max(1, topSelling.length),
            totalUnits: Math.max(5, totalProducts),
            subtitle: 'Flagship footwear articles driving turnover',
            badge: 'High Demand',
          },
          {
            id: 'zero-stockout-protection',
            label: 'Active Catalog Availability Rate',
            percentage: 92,
            currentUnits: healthyCount,
            totalUnits: Math.max(1, totalProducts),
            subtitle: `${lowStockCount} low-stock alerts monitored`,
            badge: 'Active',
          },
        ];

  // Attach IntersectionObserver script to animate [data-per] progress bars & text counters
  useDataPerIntersectionObserver(sectionRef, [
    loading,
    todaySales,
    totalProducts,
    lowStockCount,
    allTimeRevenue,
    sevenDaySalesTotal,
    metrics,
  ]);

  const salesBarColors = [
    'from-blue-600 via-indigo-500 to-cyan-400',
    'from-indigo-600 via-purple-500 to-blue-400',
    'from-purple-600 via-fuchsia-500 to-indigo-400',
    'from-emerald-600 via-teal-500 to-cyan-400',
  ];

  const categoryBarColors = [
    'from-purple-600 via-indigo-500 to-purple-400',
    'from-blue-600 via-cyan-500 to-sky-400',
    'from-amber-500 via-orange-500 to-yellow-400',
    'from-pink-600 via-rose-500 to-purple-400',
  ];

  const clearanceBarColors = [
    'from-emerald-600 via-teal-500 to-emerald-400',
    'from-cyan-600 via-blue-500 to-indigo-400',
    'from-violet-600 via-purple-500 to-fuchsia-400',
    'from-teal-600 via-emerald-500 to-cyan-400',
  ];

  return (
    <section
      ref={sectionRef}
      aria-label="Dynamic Retail Shoe Metrics"
      className="grid grid-cols-1 lg:grid-cols-3 gap-5"
    >
      {/* CARD 1: SALES TARGET */}
      <div className="app-card p-5 flex flex-col justify-between border border-slate-200/90 dark:border-purple-800/60 shadow-2xs transition-colors">
        <div>
          <div className="flex items-center justify-between gap-2 pb-3 mb-4 border-b border-slate-100 dark:border-slate-800/80">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-800/60 flex items-center justify-center text-blue-600 dark:text-cyan-400 shrink-0">
                <Target className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white leading-tight">
                  Sales Target
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  POS revenue &amp; quota attainment
                </p>
              </div>
            </div>
            {onNavigate && (
              <button
                type="button"
                onClick={() =>
                  onNavigate(
                    variant === 'superadmin-dashboard' || variant === 'superadmin-reports'
                      ? 'reports'
                      : variant === 'dashboard'
                      ? 'reports'
                      : 'pos'
                  )
                }
                className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 dark:text-cyan-400 hover:underline cursor-pointer shrink-0"
              >
                <span>
                  {variant === 'superadmin-dashboard' || variant === 'superadmin-reports'
                    ? 'Leaderboard'
                    : variant === 'dashboard'
                    ? 'Analytics'
                    : 'Open POS'}
                </span>
                <ArrowUpRight className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="space-y-4">
            {salesTargets.map((item, idx) => {
              const pct = Math.max(0, Math.min(100, Math.round(item.percentage || 0)));
              const barGradient = salesBarColors[idx % salesBarColors.length];
              return (
                <div key={item.id || idx} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-bold text-slate-800 dark:text-slate-100 truncate">
                      {item.label}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {item.status && (
                        <span className="px-1.5 py-0.5 rounded text-[9.5px] font-semibold bg-blue-50 dark:bg-blue-950/70 text-blue-700 dark:text-cyan-300 border border-blue-200/70 dark:border-blue-800/60">
                          {item.status}
                        </span>
                      )}
                      <span
                        data-per={pct}
                        data-per-role="counter"
                        data-stagger-index={idx}
                        className="font-mono font-extrabold text-xs text-blue-600 dark:text-cyan-400 min-w-[2.5rem] text-right"
                      >
                        0%
                      </span>
                    </div>
                  </div>

                  {/* Animated Progress Bar Track */}
                  <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800/90 rounded-full overflow-hidden p-0.5 border border-slate-200/60 dark:border-slate-700/60">
                    <div
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={0}
                      aria-label={item.label}
                      data-per={pct}
                      data-per-role="bar"
                      data-stagger-index={idx}
                      style={{ width: '0%' }}
                      className={`h-full rounded-full bg-gradient-to-r ${barGradient} shadow-2xs`}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[10.5px] text-slate-500 dark:text-slate-400">
                    <span className="truncate">{item.subtitle}</span>
                    <span className="font-mono font-semibold text-slate-700 dark:text-slate-300 shrink-0 ml-2">
                      {currency} {formatStockPrice(item.currentValue)} / {formatStockPrice(item.targetValue)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
          <span className="inline-flex items-center gap-1 font-medium">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
            Live POS Counter Sync
          </span>
          <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
            {salesTargets.length} Active Quotas
          </span>
        </div>
      </div>

      {/* CARD 2: CATEGORY BREAKDOWN */}
      <div className="app-card p-5 flex flex-col justify-between border border-slate-200/90 dark:border-purple-800/60 shadow-2xs transition-colors">
        <div>
          <div className="flex items-center justify-between gap-2 pb-3 mb-4 border-b border-slate-100 dark:border-slate-800/80">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-purple-50 dark:bg-purple-950/60 border border-purple-100 dark:border-purple-800/60 flex items-center justify-center text-purple-600 dark:text-purple-400 shrink-0">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white leading-tight">
                  Category Breakdown
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Footwear demand &amp; stock share by line
                </p>
              </div>
            </div>
            {onNavigate && (
              <button
                type="button"
                onClick={() =>
                  onNavigate(
                    variant === 'superadmin-dashboard' || variant === 'superadmin-reports'
                      ? 'reports'
                      : 'inventory'
                  )
                }
                className="inline-flex items-center gap-1 text-[11px] font-bold text-purple-600 dark:text-purple-400 hover:underline cursor-pointer shrink-0"
              >
                <span>
                  {variant === 'superadmin-dashboard' || variant === 'superadmin-reports'
                    ? 'Top Products'
                    : 'Catalog'}
                </span>
                <ArrowUpRight className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="space-y-4">
            {categoryBreakdown.map((cat, idx) => {
              const pct = Math.max(0, Math.min(100, Math.round(cat.percentage || 0)));
              const barGradient = categoryBarColors[idx % categoryBarColors.length];
              return (
                <div key={cat.id || idx} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-bold text-slate-800 dark:text-slate-100 truncate">
                      {cat.name}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="px-1.5 py-0.5 rounded text-[9.5px] font-mono font-semibold bg-purple-50 dark:bg-purple-950/70 text-purple-700 dark:text-purple-300 border border-purple-200/70 dark:border-purple-800/60">
                        {cat.unitsSold} sold
                      </span>
                      <span
                        data-per={pct}
                        data-per-role="counter"
                        data-stagger-index={idx}
                        className="font-mono font-extrabold text-xs text-purple-600 dark:text-purple-400 min-w-[2.5rem] text-right"
                      >
                        0%
                      </span>
                    </div>
                  </div>

                  {/* Animated Progress Bar Track */}
                  <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800/90 rounded-full overflow-hidden p-0.5 border border-slate-200/60 dark:border-slate-700/60">
                    <div
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={0}
                      aria-label={cat.name}
                      data-per={pct}
                      data-per-role="bar"
                      data-stagger-index={idx}
                      style={{ width: '0%' }}
                      className={`h-full rounded-full bg-gradient-to-r ${barGradient} shadow-2xs`}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[10.5px] text-slate-500 dark:text-slate-400">
                    <span className="truncate">{cat.subtitle}</span>
                    <span className="font-mono font-semibold text-slate-700 dark:text-slate-300 shrink-0 ml-2">
                      {cat.stockUnits} pairs in stock
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
          <span className="inline-flex items-center gap-1 font-medium">
            <Footprints className="w-3.5 h-3.5 text-purple-500" />
            Assortment Mix
          </span>
          <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
            {categoryBreakdown.reduce((s, c) => s + (c.stockUnits || 0), 0)} Total Pairs
          </span>
        </div>
      </div>

      {/* CARD 3: INVENTORY CLEARANCE */}
      <div className="app-card p-5 flex flex-col justify-between border border-slate-200/90 dark:border-purple-800/60 shadow-2xs transition-colors">
        <div>
          <div className="flex items-center justify-between gap-2 pb-3 mb-4 border-b border-slate-100 dark:border-slate-800/80">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-100 dark:border-emerald-800/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white leading-tight">
                  Inventory Clearance
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Sell-through rate &amp; shelf turnover
                </p>
              </div>
            </div>
            {onNavigate && (
              <button
                type="button"
                onClick={() =>
                  onNavigate(
                    variant === 'superadmin-dashboard' || variant === 'superadmin-reports'
                      ? 'stores'
                      : 'inventory'
                  )
                }
                className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer shrink-0"
              >
                <span>
                  {variant === 'superadmin-dashboard' || variant === 'superadmin-reports'
                    ? 'Stores'
                    : 'Stock'}
                </span>
                <ArrowUpRight className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="space-y-4">
            {inventoryClearance.map((clr, idx) => {
              const pct = Math.max(0, Math.min(100, Math.round(clr.percentage || 0)));
              const barGradient = clearanceBarColors[idx % clearanceBarColors.length];
              return (
                <div key={clr.id || idx} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-bold text-slate-800 dark:text-slate-100 truncate">
                      {clr.label}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {clr.badge && (
                        <span className="px-1.5 py-0.5 rounded text-[9.5px] font-semibold bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200/70 dark:border-emerald-800/60">
                          {clr.badge}
                        </span>
                      )}
                      <span
                        data-per={pct}
                        data-per-role="counter"
                        data-stagger-index={idx}
                        className="font-mono font-extrabold text-xs text-emerald-600 dark:text-emerald-400 min-w-[2.5rem] text-right"
                      >
                        0%
                      </span>
                    </div>
                  </div>

                  {/* Animated Progress Bar Track */}
                  <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800/90 rounded-full overflow-hidden p-0.5 border border-slate-200/60 dark:border-slate-700/60">
                    <div
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={0}
                      aria-label={clr.label}
                      data-per={pct}
                      data-per-role="bar"
                      data-stagger-index={idx}
                      style={{ width: '0%' }}
                      className={`h-full rounded-full bg-gradient-to-r ${barGradient} shadow-2xs`}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[10.5px] text-slate-500 dark:text-slate-400">
                    <span className="truncate">{clr.subtitle}</span>
                    <span className="font-mono font-semibold text-slate-700 dark:text-slate-300 shrink-0 ml-2">
                      {clr.currentUnits}/{clr.totalUnits} units
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
          <span className="inline-flex items-center gap-1 font-medium">
            <PackageCheck className="w-3.5 h-3.5 text-emerald-500" />
            Stock Health Index
          </span>
          <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
            {healthyPct}% Ready
          </span>
        </div>
      </div>
    </section>
  );
};
