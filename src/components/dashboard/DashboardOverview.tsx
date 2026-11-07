import React, { useState, useEffect, useRef } from 'react';
import { ShoppingCart, Boxes, Users, AlertTriangle, Calendar, ChevronDown, Truck, RefreshCw, RotateCcw, BarChart3, Building2, Settings, Store, Sparkles, X, CheckCircle2, AlertCircle, TrendingUp, DollarSign } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { api } from '../../services/api.ts';
import { formatCurrency } from '../../utils/priceFormat.ts';
import { isFreeTrial, calculateDaysLeft, normalizeSubscriptionPlan, getAvailableTemplateChips, getRenewalMessageTemplate, resolveDefaultRenewalTemplateType, type RenewalTemplateType } from '../../utils/subscription.ts';
import { BrandLogo } from '../common/BrandLogo.tsx';
import { StatCard, triggerStatRecount } from '../common/StatCard.tsx';
import { RetailShoeMetrics, useDataPerIntersectionObserver, type RetailShoeMetricsData } from '../common/RetailShoeMetrics.tsx';
import { LuxuryBadge } from '../common/Badge.tsx';

interface CustomWeeklySalesTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
  currency: string;
}

const CustomWeeklySalesTooltip: React.FC<CustomWeeklySalesTooltipProps> = ({
  active,
  payload,
  label,
  currency,
}) => {
  if (!active || !payload || !payload.length) return null;

  const dataPoint = payload[0]?.payload || {};
  const salesVal = Number(dataPoint.amount ?? payload.find((p) => p.dataKey === 'amount')?.value ?? 0);
  const txVal = Number(dataPoint.txCount ?? payload.find((p) => p.dataKey === 'txCount')?.value ?? 0);
  const avgTicket = txVal > 0 ? Math.round(salesVal / txVal) : 0;

  return (
    <div className="bg-slate-900/95 dark:bg-[#0E1526]/95 backdrop-blur-md border border-slate-700/80 dark:border-purple-500/30 shadow-2xl rounded-xl p-3 text-xs min-w-44 select-none z-50">
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800 dark:border-slate-800/80 text-[11px]">
        <span className="font-bold text-white flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5 text-indigo-400" />
          <span>{label}</span>
        </span>
        {dataPoint.date && (
          <span className="text-slate-400 font-mono text-[10px]">
            {dataPoint.date}
          </span>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-slate-300 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_6px_#6366F1]" />
            <span>Sales Revenue:</span>
          </span>
          <span className="font-bold font-mono text-indigo-300">
            {formatCurrency(salesVal, currency)}
          </span>
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="text-slate-300 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_6px_#06B6D4]" />
            <span>Transactions:</span>
          </span>
          <span className="font-bold font-mono text-cyan-300">
            {txVal} {txVal === 1 ? 'order' : 'orders'}
          </span>
        </div>

        {txVal > 0 && (
          <div className="pt-1.5 mt-1 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400">
            <span>Avg Order Value:</span>
            <span className="font-mono text-emerald-400 font-semibold">
              {formatCurrency(avgTicket, currency)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

interface CustomMonthlySalesTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
  currency: string;
}

const CustomMonthlySalesTooltip: React.FC<CustomMonthlySalesTooltipProps> = ({
  active,
  payload,
  label,
  currency,
}) => {
  if (!active || !payload || !payload.length) return null;

  const dataPoint = payload[0]?.payload || {};
  const salesVal = Number(dataPoint.amount ?? payload.find((p) => p.dataKey === 'amount')?.value ?? 0);
  const txVal = Number(dataPoint.txCount ?? payload.find((p) => p.dataKey === 'txCount')?.value ?? 0);
  const avgTicket = txVal > 0 ? Math.round(salesVal / txVal) : 0;

  return (
    <div className="bg-slate-900/95 dark:bg-[#0E1526]/95 backdrop-blur-md border border-slate-700/80 dark:border-cyan-500/30 shadow-2xl rounded-xl p-3 text-xs min-w-44 select-none z-50">
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800 dark:border-slate-800/80 text-[11px]">
        <span className="font-bold text-white flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5 text-cyan-400" />
          <span>{label} {dataPoint.yearLabel ? `(${dataPoint.yearLabel})` : ''}</span>
        </span>
        {dataPoint.month && (
          <span className="text-slate-400 font-mono text-[10px]">
            {dataPoint.month}
          </span>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-slate-300 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_6px_#06B6D4]" />
            <span>Monthly Revenue:</span>
          </span>
          <span className="font-bold font-mono text-cyan-300">
            {formatCurrency(salesVal, currency)}
          </span>
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="text-slate-300 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#10B981]" />
            <span>Completed Orders:</span>
          </span>
          <span className="font-bold font-mono text-emerald-300">
            {txVal} {txVal === 1 ? 'order' : 'orders'}
          </span>
        </div>

        {txVal > 0 && (
          <div className="pt-1.5 mt-1 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400">
            <span>Avg Order Value:</span>
            <span className="font-mono text-emerald-400 font-semibold">
              {formatCurrency(avgTicket, currency)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

interface DashboardOverviewProps {
  currentUser: any;
  companySettings: any;
  onNavigate: (tab: string) => void;
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  currentUser,
  companySettings,
  onNavigate,
}) => {
  const tenantId = currentUser?.tenantId || currentUser?.tenant_id || companySettings?.id || '1';
  const userId = currentUser?.id || currentUser?.email || 'owner';
  const visitKey = `pos_store_owner_visited_${tenantId}_${userId}`;
  const dismissKey = `pos_welcome_banner_dismissed_${tenantId}_${userId}`;

  const [activeNotices, setActiveNotices] = useState<any[]>([]);

  const loadNotices = async () => {
    try {
      const res = await api.notifications.grouped(5);
      if (res && Array.isArray(res.notices)) {
        const seen = new Set<string>();
        const unique = res.notices.filter((n: any) => {
          const key = (n.title || '').trim().toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        setActiveNotices(unique);
      }
    } catch (err) {
      console.warn('Dashboard active notices fetch:', err);
    }
  };

  const handleDismissNotice = async (noticeId: number | string) => {
    try {
      setActiveNotices((prev) => prev.filter((n) => n.id !== noticeId));
      await api.notifications.dismiss(noticeId, 'NOTICE');
    } catch (err) {
      console.error('Failed to dismiss notice from dashboard:', err);
    }
  };

  const isServerWelcomeDismissed = Boolean(
    companySettings?.welcomeDismissed ||
    companySettings?.welcome_dismissed ||
    currentUser?.welcomeDismissed
  );

  const checkWelcomeDismissedLocally = () => {
    try {
      if (typeof localStorage === 'undefined') return false;
      return (
        localStorage.getItem(dismissKey) === 'true' ||
        localStorage.getItem(`pos_welcome_banner_dismissed_${tenantId}`) === 'true' ||
        localStorage.getItem(`pos_welcome_banner_dismissed_${tenantId}_${userId}`) === 'true' ||
        localStorage.getItem('pos_welcome_partner_dismissed') === 'true' ||
        localStorage.getItem(`pos_welcome_partner_dismissed_${tenantId}`) === 'true' ||
        localStorage.getItem('pos_welcome_dismissed_universal') === 'true'
      );
    } catch {
      return false;
    }
  };

  const [showWelcomeBanner, setShowWelcomeBanner] = useState<boolean>(() => {
    if (isServerWelcomeDismissed || checkWelcomeDismissedLocally()) {
      return false;
    }
    return true;
  });

  // Automatically keep banner dismissed if server reports welcomeDismissed
  useEffect(() => {
    if (companySettings?.welcomeDismissed || companySettings?.welcome_dismissed || currentUser?.welcomeDismissed) {
      setShowWelcomeBanner(false);
      try {
        localStorage.setItem(dismissKey, 'true');
        localStorage.setItem(`pos_welcome_banner_dismissed_${tenantId}`, 'true');
        localStorage.setItem('pos_welcome_partner_dismissed', 'true');
        localStorage.setItem('pos_welcome_dismissed_universal', 'true');
      } catch {}
    }
  }, [companySettings?.welcomeDismissed, companySettings?.welcome_dismissed, currentUser?.welcomeDismissed, dismissKey, tenantId]);

  const [isFirstTime] = useState<boolean>(() => {
    try {
      if (currentUser?.onboardingCompleted === false) {
        return true;
      }
      const visited = localStorage.getItem(visitKey);
      return visited !== 'true';
    } catch {
      return false;
    }
  });

  // Automatically record visit after initial session mount so future sessions are recognized as Returning
  useEffect(() => {
    try {
      if (!localStorage.getItem(visitKey)) {
        const timer = setTimeout(() => {
          localStorage.setItem(visitKey, 'true');
        }, 1500);
        return () => clearTimeout(timer);
      }
    } catch {}
  }, [visitKey]);

  const currentPlanRaw =
    companySettings?.subscriptionPlan ||
    companySettings?.subscription_plan ||
    currentUser?.subscriptionPlan ||
    currentUser?.plan ||
    companySettings?.subscriptionType ||
    companySettings?.subscription_type;

  const currentStatusRaw =
    companySettings?.subscriptionStatus ||
    companySettings?.subscription_status ||
    currentUser?.subscriptionStatus ||
    '';

  const subEndDate =
    companySettings?.subscriptionEndDate ||
    companySettings?.subscription_end_date ||
    currentUser?.subscriptionEndDate;

  const daysRemaining = calculateDaysLeft(subEndDate, new Date(), currentPlanRaw);
  const normPlan = normalizeSubscriptionPlan(currentPlanRaw);
  const isExpired = String(currentStatusRaw).toUpperCase() === 'EXPIRED';
  const isActive1Year = !isExpired && normPlan === 'YEARLY';
  const isActive6Month = !isExpired && normPlan === '6_MONTHS';

  const isFree =
    currentPlanRaw === '6_MONTHS' ||
    currentPlanRaw === 'YEARLY' ||
    currentPlanRaw === '6_months' ||
    currentPlanRaw === '1_year'
      ? false
      : isFreeTrial(currentPlanRaw);

  // Renewal / Upgrade Modal state with Dynamic Templates
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [selectedUpgradePlan, setSelectedUpgradePlan] = useState<'6_MONTHS' | 'YEARLY'>(() => {
    return isActive1Year ? 'YEARLY' : 'YEARLY';
  });
  const [activeTemplateChip, setActiveTemplateChip] = useState<RenewalTemplateType>(() => {
    const plan: '6_MONTHS' | 'YEARLY' = isActive1Year ? 'YEARLY' : 'YEARLY';
    return resolveDefaultRenewalTemplateType(
      currentStatusRaw,
      currentPlanRaw,
      plan
    );
  });
  const [hasUserEditedNotes, setHasUserEditedNotes] = useState(false);
  const [upgradeNotes, setUpgradeNotes] = useState<string>(() => {
    const plan: '6_MONTHS' | 'YEARLY' = isActive1Year ? 'YEARLY' : 'YEARLY';
    const initType = resolveDefaultRenewalTemplateType(
      currentStatusRaw,
      currentPlanRaw,
      plan
    );
    return getRenewalMessageTemplate(initType, plan, currentPlanRaw);
  });
  const [isSubmittingUpgrade, setIsSubmittingUpgrade] = useState(false);
  const [upgradeSuccessMessage, setUpgradeSuccessMessage] = useState<string | null>(null);
  const [upgradeErrorMessage, setUpgradeErrorMessage] = useState<string | null>(null);

  const handleOpenUpgradeModal = () => {
    setUpgradeSuccessMessage(null);
    setUpgradeErrorMessage(null);
    const plan: '6_MONTHS' | 'YEARLY' = isActive1Year ? 'YEARLY' : 'YEARLY';
    setSelectedUpgradePlan(plan);
    const defaultType = resolveDefaultRenewalTemplateType(
      currentStatusRaw,
      currentPlanRaw,
      plan
    );
    setActiveTemplateChip(defaultType);
    setHasUserEditedNotes(false);
    setUpgradeNotes(getRenewalMessageTemplate(defaultType, plan, currentPlanRaw));
    setIsUpgradeModalOpen(true);
  };

  const handleSelectUpgradePlan = (plan: '6_MONTHS' | 'YEARLY') => {
    setSelectedUpgradePlan(plan);
    if (!hasUserEditedNotes) {
      const defaultType = resolveDefaultRenewalTemplateType(
        currentStatusRaw,
        currentPlanRaw,
        plan
      );
      setActiveTemplateChip(defaultType);
      setUpgradeNotes(getRenewalMessageTemplate(defaultType, plan, currentPlanRaw));
    }
  };

  const handleSelectTemplateChip = (chipType: RenewalTemplateType) => {
    setActiveTemplateChip(chipType);
    setHasUserEditedNotes(false);
    setUpgradeNotes(getRenewalMessageTemplate(chipType, selectedUpgradePlan, currentPlanRaw));
  };

  // Context-aware greeting and subtext based on user requirements:
  // 1. First-Time Login / New Store Owner:
  //    Greeting: "Welcome to your new store! You are currently on the 30-day Free Tier."
  //    Subtext: "Explore all features, and when you are ready, upgrade to our Premium 6-Month or Yearly Plan to keep your store active."
  // 2. Returning Free Tier Store Owner:
  //    Greeting: "Welcome back! Enjoying your Free Tier trial?"
  //    Subtext: "If you are satisfied with our service, upgrade to our Premium 6-Month or Yearly Plan."
  const storeName =
    companySettings?.name ||
    companySettings?.company_name ||
    companySettings?.companyName ||
    'Your Store';

  const isCashier = currentUser?.role === 'CASHIER';
  let bannerGreeting = '';
  let bannerSubtext = '';
  let showRenewUpgradeButton = false;
  let bannerBadge = '';

  if (isCashier) {
    bannerGreeting = `Welcome to ${storeName}, ${currentUser?.name || 'Cashier'}!`;
    bannerSubtext = 'Your cashier terminal is ready. Click "Open POS" or press F9 anytime to begin processing customer sales and counter checkouts.';
    bannerBadge = 'Cashier Station';
    showRenewUpgradeButton = false;
  } else if (isFree) {
    if (isFirstTime) {
      bannerGreeting = 'Welcome to your new store! You are currently on the 30-day Free Tier.';
      bannerSubtext = 'Explore all features, and when you are ready, upgrade to our Premium 6-Month or Yearly Plan to keep your store active.';
      showRenewUpgradeButton = true;
      bannerBadge = '30-Day Free Tier';
    } else {
      bannerGreeting = 'Welcome back! Enjoying your Free Tier trial?';
      bannerSubtext = 'If you are satisfied with our service, upgrade to our Premium 6-Month or Yearly Plan.';
      showRenewUpgradeButton = true;
      bannerBadge = 'Free Tier Trial';
    }
  } else {
    bannerGreeting = 'Welcome back! Thank you for being a valued Premium subscriber.';
    if (isActive6Month) {
      bannerSubtext = `Your store is running on the 6-Month Premium Plan (${daysRemaining} days remaining). You can renew or upgrade to the 1-Year Plan at any time.`;
      bannerBadge = '6-Month Premium';
      showRenewUpgradeButton = true;
    } else {
      bannerSubtext = 'Thank you for choosing SarbaazSoft to power your footwear business. Your premium 1-Year store license is active.';
      bannerBadge = '1-Year Premium';
      showRenewUpgradeButton = isExpired || daysRemaining <= 30;
    }
  }

  const handleDismissWelcomeBanner = () => {
    try {
      localStorage.setItem('pos_welcome_partner_dismissed', 'true');
      localStorage.setItem(`pos_welcome_partner_dismissed_${tenantId}`, 'true');
      localStorage.setItem(dismissKey, 'true');
      localStorage.setItem(`pos_welcome_banner_dismissed_${tenantId}`, 'true');
      localStorage.setItem(`pos_welcome_banner_dismissed_${tenantId}_${userId}`, 'true');
      localStorage.setItem('pos_welcome_dismissed_universal', 'true');

      // Call backend to permanently record tenant welcome dismissal in DB
      api.notifications.dismissWelcome().catch(() => {});
      api.notifications.dismiss('welcome', 'WELCOME').catch(() => {});

      const welcomeNotices = activeNotices.filter((n) => {
        const titleLower = (n.title || '').toLowerCase();
        const msgLower = (n.message || '').toLowerCase();
        return (
          titleLower.includes('welcome') ||
          msgLower.includes('welcome') ||
          msgLower.includes('thank you for choosing')
        );
      });
      for (const wn of welcomeNotices) {
        if (wn?.id) {
          api.notifications.dismiss(wn.id, 'NOTICE').catch(() => {});
        }
      }
      setActiveNotices((prev) =>
        prev.filter((n) => {
          const titleLower = (n.title || '').toLowerCase();
          const msgLower = (n.message || '').toLowerCase();
          return (
            !titleLower.includes('welcome') &&
            !msgLower.includes('welcome') &&
            !msgLower.includes('thank you for choosing')
          );
        })
      );
    } catch {}
    setShowWelcomeBanner(false);
  };

  const handleRequestUpgrade = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSubmittingUpgrade(true);
    setUpgradeErrorMessage(null);
    setUpgradeSuccessMessage(null);
    try {
      const res = await api.settings.requestSubscriptionRenewal({
        plan: selectedUpgradePlan,
        notes: upgradeNotes.trim() || undefined,
      });
      setUpgradeSuccessMessage(
        res?.message || 'Subscription renewal request has been sent to the SuperAdmin for approval.'
      );
      setUpgradeNotes('');
    } catch (err: any) {
      setUpgradeErrorMessage(
        err?.message || 'Failed to submit subscription renewal request. Please try again.'
      );
    } finally {
      setIsSubmittingUpgrade(false);
    }
  };

  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState<'7days' | 'month' | 'year'>('7days');
  const [activeChartMetric, setActiveChartMetric] = useState<'all' | 'sales' | 'orders'>('all');
  const [activeMonthlyMetric, setActiveMonthlyMetric] = useState<'all' | 'sales' | 'orders'>('all');
  const dashboardContainerRef = useRef<HTMLDivElement | null>(null);


  // Initial data accurately reflecting metrics from reference design with dynamic fallback
  const [dashboardData, setDashboardData] = useState<{
    todaySales: number;
    allTimeRevenue: number;
    totalProducts: number;
    totalCustomers: number;
    lowStockCount: number;
    totalPurchases: number;
    sevenDaySales: { date: string; label: string; amount: number; txCount: number }[];
    monthlySales: { month: string; label: string; yearLabel?: string; amount: number; txCount: number }[];
    recentTransactions: {
      type: string;
      reference: string;
      customerName: string;
      amount: number;
      status: string;
      date: string;
      timeString?: string;
    }[];
    topSelling: {
      productId: number;
      name: string;
      categoryName?: string;
      brandName?: string;
      brandLogo?: string;
      imageUrl?: string;
      stock: number;
      unitsSold: number;
    }[];
    topBrands: {
      id?: number;
      name: string;
      logo?: string;
      soldCount: number;
      percentage: number;
      subtitle: string;
    }[];
    retailShoeMetrics?: RetailShoeMetricsData | null;
  }>({
    todaySales: 0,
    allTimeRevenue: 0,
    totalProducts: 0,
    totalCustomers: 0,
    lowStockCount: 0,
    totalPurchases: 0,
    sevenDaySales: [],
    monthlySales: [],
    recentTransactions: [],
    topSelling: [],
    topBrands: [],
    retailShoeMetrics: null,
  });

  const currency =
    companySettings?.currency_symbol || companySettings?.currencySymbol || 'Rs.';

  const isRefreshingRef = useRef(false);

  const loadData = async () => {
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;
    try {
      setLoading(true);
      const res = await api.reports.getDashboard();
      if (res) {
        setDashboardData({
          todaySales: Number(res.today?.totalSales) || 0,
          allTimeRevenue: Number(res.allTime?.totalRevenue) || 0,
          totalProducts: Number(res.inventory?.totalProducts) || 0,
          totalCustomers: Number(res.customers?.totalCount) || 0,
          lowStockCount: Number(res.inventory?.lowStockCount) || 0,
          totalPurchases: Number(res.purchases?.totalPurchases) || 0,
          sevenDaySales: Array.isArray(res.sevenDaysSales)
            ? res.sevenDaysSales.map((d: any, idx: number) => ({
                date: d.date || '',
                label: d.label || `Day ${idx + 1}`,
                amount: Number(d.amount) || 0,
                txCount: Number(d.count || d.txCount) || 0,
              }))
            : [],
          monthlySales: Array.isArray(res.monthlySales)
            ? res.monthlySales.map((m: any, idx: number) => ({
                month: m.month || '',
                label: m.label || `M${idx + 1}`,
                yearLabel: m.yearLabel || '',
                amount: Number(m.amount) || 0,
                txCount: Number(m.count || m.txCount) || 0,
              }))
            : [],
          recentTransactions: Array.isArray(res.recentTransactions)
            ? res.recentTransactions.map((tx: any) => ({
                type: tx.type || 'Sale',
                reference: tx.reference || '',
                customerName: tx.customerName || tx.customer_name || 'Walk-in Customer',
                amount: Number(tx.amount) || 0,
                status: tx.status || 'Completed',
                date: tx.date || new Date().toISOString(),
                timeString: tx.timeString || '',
              }))
            : [],
          topSelling: Array.isArray(res.topSelling)
            ? res.topSelling.map((prod: any) => ({
                productId: prod.productId || prod.id,
                name: prod.name || '',
                categoryName: prod.categoryName || '',
                brandName: prod.brandName || '',
                brandLogo: prod.brandLogo || '',
                stock: prod.stock !== undefined ? Number(prod.stock) : 0,
                unitsSold: Number(prod.unitsSold || prod.sold || 0),
                imageUrl: prod.imageUrl || '',
              }))
            : [],
          topBrands: Array.isArray(res.topBrands)
            ? res.topBrands.map((b: any) => ({
                id: b.id,
                name: b.name || 'Brand',
                logo: b.logo || '',
                soldCount: Number(b.soldCount) || 0,
                percentage: Number(b.percentage) || 0,
                subtitle: b.subtitle || `${b.soldCount || 0} units`,
              }))
            : [],
          retailShoeMetrics: res.retailShoeMetrics || null,
        });
      }
    } catch (err) {
      console.warn('Dashboard metrics fetch notice:', err);
    } finally {
      isRefreshingRef.current = false;
      setLoading(false);
      triggerStatRecount();
    }
  };

  useEffect(() => {
    loadData();
    loadNotices();
  }, []);

  const formattedDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  // Derived 7-Day Performance Metrics for Immediate Store Owner Insights
  const sevenDaySalesTotal = dashboardData.sevenDaySales.reduce(
    (sum, d) => sum + (Number(d.amount) || 0),
    0
  );
  const sevenDayTxTotal = dashboardData.sevenDaySales.reduce(
    (sum, d) => sum + (Number(d.txCount) || 0),
    0
  );
  const averageDailySales = Math.round(
    sevenDaySalesTotal / Math.max(1, dashboardData.sevenDaySales.length)
  );
  const peakSalesDay = dashboardData.sevenDaySales.reduce(
    (max, d) => ((Number(d.amount) || 0) > (Number(max?.amount) || 0) ? d : max),
    dashboardData.sevenDaySales[0] || { label: 'None', amount: 0, txCount: 0 }
  );

  // Derived 6-Month Monthly Performance Metrics
  const monthlySalesTotal = dashboardData.monthlySales.reduce(
    (sum, m) => sum + (Number(m.amount) || 0),
    0
  );
  const monthlyTxTotal = dashboardData.monthlySales.reduce(
    (sum, m) => sum + (Number(m.txCount) || 0),
    0
  );
  const averageMonthlySales = Math.round(
    monthlySalesTotal / Math.max(1, dashboardData.monthlySales.length)
  );
  const peakMonth = dashboardData.monthlySales.reduce(
    (max, m) => ((Number(m.amount) || 0) > (Number(max?.amount) || 0) ? m : max),
    dashboardData.monthlySales[0] || { label: 'None', amount: 0, txCount: 0, yearLabel: '' }
  );

  // Month-over-Month (MoM) calculation
  const momGrowth = (() => {
    const len = dashboardData.monthlySales.length;
    if (len < 2) return 0;
    const current = Number(dashboardData.monthlySales[len - 1]?.amount) || 0;
    const prev = Number(dashboardData.monthlySales[len - 2]?.amount) || 0;
    if (prev === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - prev) / prev) * 100);
  })();

  // Fallback 7-day data formatted for Recharts
  const chartData =
    dashboardData.sevenDaySales.length > 0
      ? dashboardData.sevenDaySales
      : Array.from({ length: 7 }, (_, i) => {
          const d = new Date();
          d.setDate(d.getDate() - (6 - i));
          return {
            date: d.toISOString().split('T')[0],
            label: d.toLocaleDateString('en-US', { weekday: 'short' }),
            amount: 0,
            txCount: 0,
          };
        });

  // Fallback monthly data formatted for Recharts
  const monthlyChartData =
    dashboardData.monthlySales.length > 0
      ? dashboardData.monthlySales
      : Array.from({ length: 6 }, (_, i) => {
          const d = new Date();
          d.setMonth(d.getMonth() - (5 - i));
          return {
            month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
            label: d.toLocaleDateString('en-US', { month: 'short' }),
            yearLabel: String(d.getFullYear()),
            amount: 0,
            txCount: 0,
          };
        });

  useDataPerIntersectionObserver(dashboardContainerRef, [loading, dashboardData]);

  return (
    <div
      ref={dashboardContainerRef}
      className="p-4 sm:p-6 lg:p-7 space-y-6 max-w-7xl mx-auto select-none bg-[#F8FAFC] dark:bg-[#0A0E1A] min-h-screen text-slate-800 dark:text-slate-100 transition-colors"
    >
      {/* DASHBOARD HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            Dashboard
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Welcome back, {currentUser?.name || 'Store Owner'}! Here's what's happening with your store today.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-white dark:bg-[#0E1628] border border-slate-200/90 dark:border-[#1A263D] text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-2xs">
            <Calendar className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>{formattedDate}</span>
          </div>
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            title={loading ? "Refreshing metrics..." : "Refresh metrics & recount stats"}
            className="btn-outline-landing p-1.5 rounded-xl bg-white hover:text-blue-600 border border-slate-200/90 shadow-2xs dark:bg-purple-500/20 dark:hover:bg-purple-500/30 dark:text-purple-200 dark:hover:text-white dark:border-purple-400/40 dark:shadow-[0_0_14px_rgba(147,51,234,0.2)] text-slate-500 cursor-pointer transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-600 dark:text-purple-300' : 'text-slate-500 dark:text-purple-300'}`} />
          </button>
        </div>
      </div>

      {/* High-Priority Active Platform Notices Banner (strictly excluding welcome notices so only ONE single welcome message is rendered) */}
      {(() => {
        const displayNotices = activeNotices.filter((notice) => {
          const titleLower = (notice.title || '').toLowerCase();
          const msgLower = (notice.message || '').toLowerCase();
          const isWelcome =
            titleLower.includes('welcome') ||
            msgLower.includes('welcome') ||
            msgLower.includes('thank you for choosing') ||
            msgLower.includes('sarbaazsoft') ||
            notice.type === 'WELCOME';
          return !isWelcome;
        });

        if (displayNotices.length === 0) return null;

        return (
          <div className="space-y-3" id="dashboard-active-notices-container">
            {displayNotices.map((notice) => {
            const isUrgent = notice.is_urgent || notice.type === 'URGENT' || notice.type === 'WARNING';
            return (
              <div
                key={notice.id}
                className={`p-4 rounded-2xl border transition-all shadow-md relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-4 ${
                  isUrgent
                    ? 'bg-gradient-to-r from-amber-500/15 via-rose-500/10 to-orange-500/15 border-amber-400/50 dark:border-amber-500/40 dark:bg-amber-950/40 text-slate-900 dark:text-amber-100'
                    : 'bg-gradient-to-r from-purple-500/15 via-indigo-500/10 to-blue-500/15 border-purple-300/50 dark:border-purple-500/40 dark:bg-purple-950/40 text-slate-900 dark:text-purple-100'
                }`}
              >
                <div className="flex items-start gap-3.5 min-w-0 z-10">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-xs border ${
                      isUrgent
                        ? 'bg-amber-500 text-white border-amber-300/40'
                        : 'bg-purple-600 text-white border-purple-400/40'
                    }`}
                  >
                    {isUrgent ? (
                      <AlertTriangle className="w-4 h-4 animate-pulse" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          isUrgent
                            ? 'bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700/60'
                            : 'bg-purple-100 dark:bg-purple-900/60 text-purple-800 dark:text-purple-300 border border-purple-300 dark:border-purple-700/60'
                        }`}
                      >
                        {notice.type || 'Notice'}
                      </span>
                      {notice.created_at && (
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          {new Date(notice.created_at).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm sm:text-base font-bold tracking-tight text-slate-900 dark:text-white leading-snug">
                      {notice.title}
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-1 leading-relaxed max-w-3xl whitespace-pre-line">
                      {notice.message}
                    </p>
                  </div>
                </div>

                <div className="flex items-center flex-wrap gap-2.5 shrink-0 self-end md:self-center z-10">
                  {notice.action_text && notice.action_url && (
                    <button
                      type="button"
                      onClick={() => {
                        if (notice.action_url?.startsWith('/')) {
                          const tabName = notice.action_url.replace(/^\/(dashboard\/)?/, '');
                          onNavigate(tabName || 'dashboard');
                        } else if (notice.action_url?.includes('renew') || notice.action_url?.includes('upgrade')) {
                          handleOpenUpgradeModal();
                        } else {
                          onNavigate(notice.action_url);
                        }
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shadow-xs cursor-pointer flex items-center gap-1.5 active:scale-95 text-white ${
                        isUrgent
                          ? 'bg-amber-600 hover:bg-amber-500'
                          : 'bg-purple-600 hover:bg-purple-500'
                      }`}
                    >
                      <span>{notice.action_text}</span>
                      <span>&rarr;</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleDismissNotice(notice.id)}
                    className="px-2.5 py-1.5 rounded-xl bg-white/80 dark:bg-slate-800/80 hover:bg-white dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-semibold transition cursor-pointer flex items-center gap-1 shadow-2xs active:scale-95"
                    title="Dismiss this notice"
                    aria-label="Dismiss notice"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>Dismiss</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        );
      })()}

      {/* Single Unified Context-Aware Store Owner / Cashier Welcome Greeting Banner (Restyled with Light BG, Border, and Shadow) */}
      {showWelcomeBanner && (
        <div
          id="dashboard-welcome-banner"
          className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-purple-50/80 via-indigo-50/50 to-blue-50/40 dark:from-[#131B2E] dark:via-purple-950/30 dark:to-[#0f172a] border border-purple-200/90 dark:border-purple-800/60 shadow-sm text-slate-900 dark:text-white relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition-all"
        >
          <div className="flex items-start gap-3.5 min-w-0 z-10">
            <div className="w-10 h-10 rounded-xl bg-purple-600 text-white flex items-center justify-center shrink-0 shadow-xs border border-purple-400/40">
              <Store className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <LuxuryBadge
                  tone="purple"
                  size="xs"
                  icon={<Sparkles className="w-3 h-3 text-purple-600 dark:text-purple-300" />}
                >
                  {bannerBadge}
                </LuxuryBadge>
                <span className="text-xs font-mono text-purple-700 dark:text-purple-300/80">• {storeName}</span>
              </div>
              <h2 className="text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-white leading-snug">
                {bannerGreeting}
              </h2>
              {bannerSubtext && (
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-1 leading-relaxed max-w-3xl">
                  {bannerSubtext}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-2.5 shrink-0 self-end md:self-center z-10">
            {showRenewUpgradeButton && (
              <button
                id="dashboard-renew-upgrade-subscription-btn"
                type="button"
                onClick={handleOpenUpgradeModal}
                className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white text-xs font-bold transition shadow-xs cursor-pointer flex items-center gap-1.5 active:scale-95 border border-amber-300/40"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Renew / Upgrade Subscription</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => onNavigate('pos')}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow-xs cursor-pointer flex items-center gap-1.5 active:scale-95"
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              <span>Open POS</span>
            </button>

            <button
              type="button"
              onClick={handleDismissWelcomeBanner}
              className="p-2 rounded-xl bg-white/80 hover:bg-white dark:bg-slate-800/80 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-700 transition cursor-pointer shadow-2xs"
              title="Dismiss announcement"
              aria-label="Dismiss welcome banner"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ROW 1: 5 KPI METRIC CARDS WITH ANIMATED COUNTER */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {/* Card 1: Today's Sales */}
        <StatCard
          id="stat-today-sales"
          title="Today's Sales"
          value={dashboardData.todaySales}
          prefix={`${currency} `}
          icon={ShoppingCart}
          iconColor="blue"
          sparkline="blue"
          trendIndicator={
            dashboardData.todaySales > 0
              ? { value: 'Active', direction: 'up', label: 'today' }
              : undefined
          }
          loading={loading}
          delay={0}
          duration={1200}
        />

        {/* Card 2: Total Products */}
        <StatCard
          id="stat-total-products"
          title="Total Products"
          value={dashboardData.totalProducts}
          icon={Boxes}
          iconColor="purple"
          sparkline="purple"
          trendIndicator={
            dashboardData.totalProducts > 0
              ? { value: `${dashboardData.totalProducts}`, direction: 'up', label: 'in inventory' }
              : undefined
          }
          loading={loading}
          delay={0}
          duration={1200}
        />

        {/* Card 3: Total Customers */}
        <StatCard
          id="stat-total-customers"
          title="Total Customers"
          value={dashboardData.totalCustomers}
          icon={Users}
          iconColor="cyan"
          sparkline="cyan"
          trendIndicator={
            dashboardData.totalCustomers > 0
              ? { value: `${dashboardData.totalCustomers}`, direction: 'up', label: 'registered' }
              : undefined
          }
          loading={loading}
          delay={0}
          duration={1200}
        />

        {/* Card 4: Low Stock Items */}
        <StatCard
          id="stat-low-stock"
          title="Low Stock Items"
          value={dashboardData.lowStockCount}
          icon={AlertTriangle}
          iconColor="rose"
          sparkline="rose"
          valueClassName="text-rose-600 dark:text-rose-400"
          trendIndicator={
            dashboardData.lowStockCount > 0
              ? { value: `${dashboardData.lowStockCount}`, direction: 'down', label: 'restock needed' }
              : undefined
          }
          loading={loading}
          delay={0}
          duration={1200}
        />

        {/* Card 5: Total Purchases */}
        <StatCard
          id="stat-total-purchases"
          title="Total Purchases"
          value={dashboardData.totalPurchases}
          prefix={`${currency} `}
          icon={Truck}
          iconColor="sky"
          sparkline="sky"
          trendIndicator={
            dashboardData.totalPurchases > 0
              ? { value: `${dashboardData.totalPurchases}`, direction: 'up', label: 'orders' }
              : undefined
          }
          loading={loading}
          delay={0}
          duration={1200}
        />
      </div>

      {/* DYNAMIC RETAIL SHOE METRICS (Sales Target, Category Breakdown, Inventory Clearance) */}
      <RetailShoeMetrics
        metrics={dashboardData.retailShoeMetrics}
        todaySales={dashboardData.todaySales}
        totalProducts={dashboardData.totalProducts}
        lowStockCount={dashboardData.lowStockCount}
        allTimeRevenue={dashboardData.allTimeRevenue}
        sevenDaySalesTotal={sevenDaySalesTotal}
        topSelling={dashboardData.topSelling}
        currency={currency}
        loading={loading}
        onNavigate={onNavigate}
        variant="dashboard"
      />

      {/* ROW 2: DUAL SALES TRENDS CHARTS (Weekly Sales Trends + Monthly Sales Trends) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Chart 1: Weekly Sales Trends (Recharts AreaChart Integration) */}
        <div className="app-card p-5 flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2.5 mb-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 dark:bg-purple-500/20 text-indigo-600 dark:text-purple-300 flex items-center justify-center font-bold">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    Weekly Sales Trends
                    <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50">
                      7-Day Velocity
                    </span>
                  </h2>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Live daily revenue &amp; checkout volume trends
                  </p>
                </div>
              </div>

              {/* View / Metric Toggles */}
              <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900/80 rounded-xl border border-slate-200 dark:border-purple-900/40 text-xs">
                <button
                  type="button"
                  onClick={() => setActiveChartMetric('all')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer text-[11px] ${
                    activeChartMetric === 'all'
                      ? 'bg-white dark:bg-purple-600 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  Both
                </button>
                <button
                  type="button"
                  onClick={() => setActiveChartMetric('sales')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer text-[11px] flex items-center gap-1 ${
                    activeChartMetric === 'sales'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                  <span>Sales</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveChartMetric('orders')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer text-[11px] flex items-center gap-1 ${
                    activeChartMetric === 'orders'
                      ? 'bg-cyan-600 text-white shadow-xs'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-300" />
                  <span>Orders</span>
                </button>
              </div>
            </div>

            {/* Quick Performance Insights Strip */}
            <div className="grid grid-cols-3 gap-2.5 my-2.5 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800/80">
              <div className="space-y-0.5">
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium block">
                  7-Day Revenue
                </span>
                <span className="text-xs sm:text-sm font-bold font-mono text-slate-900 dark:text-white block truncate">
                  {formatCurrency(sevenDaySalesTotal, currency)}
                </span>
              </div>
              <div className="space-y-0.5 border-x border-slate-200 dark:border-slate-800 px-2.5">
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium block">
                  Daily Average
                </span>
                <span className="text-xs sm:text-sm font-bold font-mono text-indigo-600 dark:text-indigo-300 block truncate">
                  {formatCurrency(averageDailySales, currency)}
                </span>
              </div>
              <div className="space-y-0.5 pl-1">
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium block">
                  Peak Day
                </span>
                <span className="text-xs sm:text-sm font-bold font-mono text-emerald-600 dark:text-emerald-400 block truncate">
                  {peakSalesDay?.label || '—'} {peakSalesDay?.amount > 0 ? `(${formatCurrency(peakSalesDay.amount, currency)})` : ''}
                </span>
              </div>
            </div>
          </div>

          {/* Recharts Canvas */}
          <div className="w-full h-48 sm:h-52 pt-1">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={chartData}
                margin={{ top: 8, right: 8, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="dashboardSalesGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366F1" stopOpacity={0.45} />
                    <stop offset="95%" stopColor="#6366F1" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="dashboardTxGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06B6D4" stopOpacity={0.38} />
                    <stop offset="95%" stopColor="#06B6D4" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="currentColor"
                  className="text-slate-200 dark:text-slate-800/80"
                />
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: 'currentColor' }}
                  className="text-slate-500 dark:text-slate-400 font-medium"
                  dy={4}
                />
                <YAxis
                  yAxisId="sales"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: 'currentColor' }}
                  className="text-slate-400 dark:text-slate-500 font-mono"
                  tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`)}
                />
                <YAxis
                  yAxisId="tx"
                  orientation="right"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: 'currentColor' }}
                  className="text-cyan-600/70 dark:text-cyan-400/70 font-mono"
                  hide={activeChartMetric === 'sales'}
                  tickFormatter={(v) => `${v}`}
                />
                <Tooltip content={<CustomWeeklySalesTooltip currency={currency} />} />
                {(activeChartMetric === 'all' || activeChartMetric === 'sales') && (
                  <Area
                    yAxisId="sales"
                    type="monotone"
                    dataKey="amount"
                    name="Sales Revenue"
                    stroke="#6366F1"
                    strokeWidth={2.6}
                    fillOpacity={1}
                    fill="url(#dashboardSalesGrad)"
                    activeDot={{ r: 6, stroke: '#6366F1', strokeWidth: 2, fill: '#ffffff' }}
                  />
                )}
                {(activeChartMetric === 'all' || activeChartMetric === 'orders') && (
                  <Area
                    yAxisId="tx"
                    type="monotone"
                    dataKey="txCount"
                    name="Orders / Invoices"
                    stroke="#06B6D4"
                    strokeWidth={2.2}
                    fillOpacity={1}
                    fill="url(#dashboardTxGrad)"
                    activeDot={{ r: 5, stroke: '#06B6D4', strokeWidth: 2, fill: '#ffffff' }}
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Monthly Sales Trends (Recharts BarChart Integration) */}
        <div className="app-card p-5 flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2.5 mb-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/10 dark:bg-cyan-500/20 text-cyan-600 dark:text-cyan-300 flex items-center justify-center font-bold">
                  <BarChart3 className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    Monthly Sales Trends
                    <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-cyan-100 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800/50">
                      6-Mo Rolling
                    </span>
                    {momGrowth !== 0 && (
                      <span className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full flex items-center gap-0.5 ${
                        momGrowth >= 0
                          ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50'
                          : 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/50'
                      }`}>
                        {momGrowth >= 0 ? '+' : ''}{momGrowth}% MoM
                      </span>
                    )}
                  </h2>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Macro store trajectory &amp; volume expansion
                  </p>
                </div>
              </div>

              {/* View / Metric Toggles */}
              <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900/80 rounded-xl border border-slate-200 dark:border-cyan-900/40 text-xs">
                <button
                  type="button"
                  onClick={() => setActiveMonthlyMetric('all')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer text-[11px] ${
                    activeMonthlyMetric === 'all'
                      ? 'bg-white dark:bg-cyan-600 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  Both
                </button>
                <button
                  type="button"
                  onClick={() => setActiveMonthlyMetric('sales')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer text-[11px] flex items-center gap-1 ${
                    activeMonthlyMetric === 'sales'
                      ? 'bg-cyan-600 text-white shadow-xs'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                  <span>Sales</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveMonthlyMetric('orders')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer text-[11px] flex items-center gap-1 ${
                    activeMonthlyMetric === 'orders'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>Orders</span>
                </button>
              </div>
            </div>

            {/* Quick Performance Insights Strip */}
            <div className="grid grid-cols-3 gap-2.5 my-2.5 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800/80">
              <div className="space-y-0.5">
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium block">
                  6-Mo Revenue
                </span>
                <span className="text-xs sm:text-sm font-bold font-mono text-slate-900 dark:text-white block truncate">
                  {formatCurrency(monthlySalesTotal, currency)}
                </span>
              </div>
              <div className="space-y-0.5 border-x border-slate-200 dark:border-slate-800 px-2.5">
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium block">
                  Monthly Average
                </span>
                <span className="text-xs sm:text-sm font-bold font-mono text-cyan-600 dark:text-cyan-300 block truncate">
                  {formatCurrency(averageMonthlySales, currency)}
                </span>
              </div>
              <div className="space-y-0.5 pl-1">
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium block">
                  Peak Month
                </span>
                <span className="text-xs sm:text-sm font-bold font-mono text-emerald-600 dark:text-emerald-400 block truncate">
                  {peakMonth?.label || '—'} {peakMonth?.amount > 0 ? `(${formatCurrency(peakMonth.amount, currency)})` : ''}
                </span>
              </div>
            </div>
          </div>

          {/* Recharts Canvas */}
          <div className="w-full h-48 sm:h-52 pt-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={monthlyChartData}
                margin={{ top: 8, right: 8, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="dashboardMonthlySalesGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#06B6D4" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#0284C7" stopOpacity={0.3} />
                  </linearGradient>
                  <linearGradient id="dashboardMonthlyTxGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10B981" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#059669" stopOpacity={0.3} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="currentColor"
                  className="text-slate-200 dark:text-slate-800/80"
                />
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: 'currentColor' }}
                  className="text-slate-500 dark:text-slate-400 font-medium"
                  dy={4}
                />
                <YAxis
                  yAxisId="sales"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: 'currentColor' }}
                  className="text-slate-400 dark:text-slate-500 font-mono"
                  tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`)}
                />
                <YAxis
                  yAxisId="tx"
                  orientation="right"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: 'currentColor' }}
                  className="text-emerald-600/70 dark:text-emerald-400/70 font-mono"
                  hide={activeMonthlyMetric === 'sales'}
                  tickFormatter={(v) => `${v}`}
                />
                <Tooltip content={<CustomMonthlySalesTooltip currency={currency} />} />
                {(activeMonthlyMetric === 'all' || activeMonthlyMetric === 'sales') && (
                  <Bar
                    yAxisId="sales"
                    dataKey="amount"
                    name="Monthly Revenue"
                    fill="url(#dashboardMonthlySalesGrad)"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={36}
                  />
                )}
                {(activeMonthlyMetric === 'all' || activeMonthlyMetric === 'orders') && (
                  <Bar
                    yAxisId="tx"
                    dataKey="txCount"
                    name="Completed Invoices"
                    fill="url(#dashboardMonthlyTxGrad)"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={28}
                  />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ROW 3: BEST SELLING BRANDS & PRODUCTS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-5">
        {/* Card 1: Best Selling Brands (Span 6 on md/lg/xl) */}
        <div className="md:col-span-1 lg:col-span-6 xl:col-span-6 app-card p-5 flex flex-col justify-between min-w-0">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Best Selling Brands
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('inventory')}
              className="text-xs font-bold text-blue-600 dark:text-cyan-400 hover:underline cursor-pointer"
            >
              View Catalog
            </button>
          </div>

          {/* Circular Donut Gauges with Brand Logos / Placeholders */}
          {dashboardData.topBrands.length === 0 ? (
            <div className="py-8 text-center text-slate-400 dark:text-slate-500 text-xs">
              No brand performance data yet.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:gap-4 py-2 my-auto min-w-0">
              {dashboardData.topBrands.slice(0, 2).map((brand, idx) => {
                const pct = brand.percentage || 0;
                const circumference = 238.76;
                const strokeColor = idx === 0 ? '#3B82F6' : '#8B5CF6';

                return (
                  <div key={`top-brand-${brand.id || brand.name || idx}-${idx}`} className="flex flex-col items-center text-center min-w-0">
                    <div className="relative w-20 h-20 sm:w-24 sm:h-24 max-w-full flex items-center justify-center shrink-0">
                      <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                        {/* Track */}
                        <circle
                          cx="50"
                          cy="50"
                          r="38"
                          className="text-slate-100 dark:text-slate-800 stroke-current"
                          strokeWidth="7"
                          fill="none"
                        />
                        {/* Progress Arc */}
                        <circle
                          cx="50"
                          cy="50"
                          r="38"
                          stroke={strokeColor}
                          strokeWidth="7"
                          strokeLinecap="round"
                          fill="none"
                          strokeDasharray={circumference}
                          strokeDashoffset={circumference}
                          data-per={pct}
                          data-per-role="donut"
                          data-circumference={circumference}
                          data-stagger-index={idx}
                          className={`${idx === 0 ? 'neon-glow-blue' : ''}`}
                        />
                      </svg>
                      {/* Brand Logo or Placeholder in center of ring */}
                      <div className="absolute inset-0 flex items-center justify-center p-2">
                        <BrandLogo
                          logo={brand.logo}
                          name={brand.name}
                          size="sm"
                          className="pointer-events-none"
                        />
                      </div>
                    </div>
                    <div className="mt-2.5 w-full min-w-0 px-1">
                      <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                        {brand.name}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono mt-0.5 truncate">
                        {brand.subtitle}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Card 2: Best Selling Products (Span 6 on md/lg/xl) */}
        <div className="md:col-span-1 lg:col-span-6 xl:col-span-6 app-card p-5 flex flex-col justify-between min-w-0">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Best Selling Products
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('inventory')}
              className="text-xs font-bold text-blue-600 dark:text-cyan-400 hover:underline cursor-pointer"
            >
              View All
            </button>
          </div>

          {dashboardData.topSelling.length === 0 ? (
            <div className="py-8 text-center text-slate-400 dark:text-slate-500 text-xs">
              No product sales recorded yet.
            </div>
          ) : (
            <div className="space-y-3 my-auto min-w-0">
              {dashboardData.topSelling.slice(0, 3).map((prod, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between gap-2 p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition min-w-0"
                >
                  <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                    <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-slate-100 dark:bg-slate-950/60 overflow-hidden shrink-0 border border-slate-200/60 dark:border-slate-800">
                      <img
                        src={
                          prod.imageUrl ||
                          'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=150&auto=format&fit=crop&q=80'
                        }
                        alt={prod.name}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                        {prod.name}
                      </div>
                      <div className="mt-0.5 sm:mt-1 flex items-center gap-1.5 flex-wrap">
                        {prod.categoryName && (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-cyan-400 border border-blue-200/80 dark:border-cyan-500/30 whitespace-nowrap">
                            {prod.categoryName}
                          </span>
                        )}
                        {prod.brandName && (
                          <div className="inline-flex items-center gap-1 min-w-0">
                            <BrandLogo logo={prod.brandLogo} name={prod.brandName} size="xs" />
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium truncate max-w-[80px]">
                              {prod.brandName}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0 ml-1">
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                      Stock: {prod.stock}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5 whitespace-nowrap">
                      Sold: {prod.unitsSold}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ROW 4: LATEST TRANSACTIONS & QUICK ACTIONS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Latest Transactions (Span 7) */}
        <div className="lg:col-span-7 app-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Latest Transactions
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('reports')}
              className="text-xs font-bold text-blue-600 dark:text-cyan-400 hover:underline cursor-pointer"
            >
              View All
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="dark:bg-gradient-to-r dark:from-purple-900 dark:via-indigo-950 dark:to-slate-900">
                <tr className="border-b border-slate-100 dark:border-purple-800/80 text-slate-400 dark:text-white font-semibold">
                  <th className="py-2.5 px-3 font-semibold">Transaction ID #</th>
                  <th className="py-2.5 px-3 font-semibold">Customer Name</th>
                  <th className="py-2.5 px-3 font-semibold">Status</th>
                  <th className="py-2.5 px-3 font-semibold">Time</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-slate-400 dark:text-slate-500">
                      <div className="flex flex-col items-center justify-center space-y-2">
                        <RefreshCw className="w-6 h-6 animate-spin text-blue-600 dark:text-purple-400 mx-auto" />
                        <p className="font-medium text-xs">Loading recent transactions...</p>
                      </div>
                    </td>
                  </tr>
                ) : dashboardData.recentTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400 dark:text-slate-500">
                      No transactions recorded yet.
                    </td>
                  </tr>
                ) : (
                  dashboardData.recentTransactions.map((tx, idx) => (
                  <tr
                    key={idx}
                    className="table-row-hover"
                  >
                    <td className="py-3 font-semibold text-blue-600 dark:text-cyan-400 cursor-pointer hover:underline">
                      {tx.reference}
                    </td>
                    <td className="py-3 text-slate-800 dark:text-slate-200 font-medium">
                      {tx.customerName}
                    </td>
                    <td className="py-3">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10.5px] font-semibold ${
                          idx % 2 === 1
                            ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60'
                            : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60'
                        }`}
                      >
                        {tx.status}
                      </span>
                    </td>
                    <td className="py-3 text-slate-500 dark:text-slate-400 font-mono text-[11px]">
                      {tx.timeString || (tx.date ? new Date(tx.date).toLocaleDateString() : '—')}
                    </td>
                    <td className="py-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                      {formatCurrency(tx.amount, currency)}
                    </td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Quick Actions (Span 5) */}
        <div className="lg:col-span-5 app-card p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 mb-4">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Quick Actions
            </h2>
            <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
              Shortcuts F1–F7
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 flex-1">
            {/* Action 1: New Sale (F1) */}
            <button
              type="button"
              onClick={() => onNavigate('pos')}
              className="quick-action-btn p-3.5 rounded-xl border border-slate-200/90 dark:border-slate-800/90 bg-slate-50/70 dark:bg-slate-950/50 text-left transition-all duration-200 flex flex-col justify-between group cursor-pointer shadow-2xs overflow-hidden"
            >
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-purple-600 dark:text-purple-400 group-hover:scale-105 group-hover:border-purple-300 dark:group-hover:border-purple-500/50 transition shadow-2xs">
                  <ShoppingCart className="w-4 h-4" />
                </div>
                <kbd className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 group-hover:border-purple-300 dark:group-hover:border-purple-500/50 group-hover:text-purple-700 dark:group-hover:text-purple-300 transition">
                  F1
                </kbd>
              </div>
              <div className="mt-3">
                <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-300 transition">
                  New Sale
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 transition">
                  Counter POS
                </div>
              </div>
            </button>

            {/* Action 2: Add Product (F2) */}
            <button
              type="button"
              onClick={() => onNavigate('inventory')}
              className="quick-action-btn p-3.5 rounded-xl border border-slate-200/90 dark:border-slate-800/90 bg-slate-50/70 dark:bg-slate-950/50 text-left transition-all duration-200 flex flex-col justify-between group cursor-pointer shadow-2xs overflow-hidden"
            >
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-purple-600 dark:text-purple-400 group-hover:scale-105 group-hover:border-purple-300 dark:group-hover:border-purple-500/50 transition shadow-2xs">
                  <Boxes className="w-4 h-4" />
                </div>
                <kbd className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 group-hover:border-purple-300 dark:group-hover:border-purple-500/50 group-hover:text-purple-700 dark:group-hover:text-purple-300 transition">
                  F2
                </kbd>
              </div>
              <div className="mt-3">
                <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-300 transition">
                  Add Product
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 transition">
                  Shoe Catalog
                </div>
              </div>
            </button>

            {/* Action 3: New Purchase (F3) */}
            <button
              type="button"
              onClick={() => onNavigate('purchases')}
              className="quick-action-btn p-3.5 rounded-xl border border-slate-200/90 dark:border-slate-800/90 bg-slate-50/70 dark:bg-slate-950/50 text-left transition-all duration-200 flex flex-col justify-between group cursor-pointer shadow-2xs overflow-hidden"
            >
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-purple-600 dark:text-purple-400 group-hover:scale-105 group-hover:border-purple-300 dark:group-hover:border-purple-500/50 transition shadow-2xs">
                  <Truck className="w-4 h-4" />
                </div>
                <kbd className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 group-hover:border-purple-300 dark:group-hover:border-purple-500/50 group-hover:text-purple-700 dark:group-hover:text-purple-300 transition">
                  F3
                </kbd>
              </div>
              <div className="mt-3">
                <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-300 transition">
                  New Purchase
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 transition">
                  Stock Receiving
                </div>
              </div>
            </button>

            {/* Action 4: Sales Return (F4) */}
            <button
              type="button"
              onClick={() => onNavigate('returns')}
              className="quick-action-btn p-3.5 rounded-xl border border-slate-200/90 dark:border-slate-800/90 bg-slate-50/70 dark:bg-slate-950/50 text-left transition-all duration-200 flex flex-col justify-between group cursor-pointer shadow-2xs overflow-hidden"
            >
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-purple-600 dark:text-purple-400 group-hover:scale-105 group-hover:border-purple-300 dark:group-hover:border-purple-500/50 transition shadow-2xs">
                  <RotateCcw className="w-4 h-4" />
                </div>
                <kbd className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 group-hover:border-purple-300 dark:group-hover:border-purple-500/50 group-hover:text-purple-700 dark:group-hover:text-purple-300 transition">
                  F4
                </kbd>
              </div>
              <div className="mt-3">
                <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-300 transition">
                  Sales Return
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 transition">
                  Shoe Exchange
                </div>
              </div>
            </button>

            {/* Action 5: Customers (F5) */}
            <button
              type="button"
              onClick={() => onNavigate('customers')}
              className="quick-action-btn p-3.5 rounded-xl border border-slate-200/90 dark:border-slate-800/90 bg-slate-50/70 dark:bg-slate-950/50 text-left transition-all duration-200 flex flex-col justify-between group cursor-pointer shadow-2xs overflow-hidden"
            >
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-purple-600 dark:text-purple-400 group-hover:scale-105 group-hover:border-purple-300 dark:group-hover:border-purple-500/50 transition shadow-2xs">
                  <Users className="w-4 h-4" />
                </div>
                <kbd className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 group-hover:border-purple-300 dark:group-hover:border-purple-500/50 group-hover:text-purple-700 dark:group-hover:text-purple-300 transition">
                  F5
                </kbd>
              </div>
              <div className="mt-3">
                <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-300 transition">
                  Customers
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 transition">
                  Loyalty &amp; Credit
                </div>
              </div>
            </button>

            {/* Action 6: Sales Reports (F6) */}
            <button
              type="button"
              onClick={() => onNavigate('reports')}
              className="quick-action-btn p-3.5 rounded-xl border border-slate-200/90 dark:border-slate-800/90 bg-slate-50/70 dark:bg-slate-950/50 text-left transition-all duration-200 flex flex-col justify-between group cursor-pointer shadow-2xs overflow-hidden"
            >
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-purple-600 dark:text-purple-400 group-hover:scale-105 group-hover:border-purple-300 dark:group-hover:border-purple-500/50 transition shadow-2xs">
                  <BarChart3 className="w-4 h-4" />
                </div>
                <kbd className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 group-hover:border-purple-300 dark:group-hover:border-purple-500/50 group-hover:text-purple-700 dark:group-hover:text-purple-300 transition">
                  F6
                </kbd>
              </div>
              <div className="mt-3">
                <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-300 transition">
                  Sales Reports
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 transition">
                  Daily Analytics
                </div>
              </div>
            </button>

            {/* Action 7: Suppliers (Alt+S) */}
            <button
              type="button"
              onClick={() => onNavigate('suppliers')}
              className="quick-action-btn p-3.5 rounded-xl border border-slate-200/90 dark:border-slate-800/90 bg-slate-50/70 dark:bg-slate-950/50 text-left transition-all duration-200 flex flex-col justify-between group cursor-pointer shadow-2xs overflow-hidden"
            >
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-purple-600 dark:text-purple-400 group-hover:scale-105 group-hover:border-purple-300 dark:group-hover:border-purple-500/50 transition shadow-2xs">
                  <Building2 className="w-4 h-4" />
                </div>
                <kbd className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 group-hover:border-purple-300 dark:group-hover:border-purple-500/50 group-hover:text-purple-700 dark:group-hover:text-purple-300 transition">
                  Alt+S
                </kbd>
              </div>
              <div className="mt-3">
                <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-300 transition">
                  Suppliers
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 transition">
                  Vendor Accounts
                </div>
              </div>
            </button>

            {/* Action 8: Root System Settings (F7) - Exclusively Platform Owner (SUPERADMIN) */}
            {(currentUser?.role || '').toUpperCase() === 'SUPERADMIN' && (
              <button
                type="button"
                onClick={() => onNavigate('settings')}
                className="quick-action-btn p-3.5 rounded-xl border border-slate-200/90 dark:border-slate-800/90 bg-slate-50/70 dark:bg-slate-950/50 text-left transition-all duration-200 flex flex-col justify-between group cursor-pointer shadow-2xs overflow-hidden"
              >
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-purple-600 dark:text-purple-400 group-hover:scale-105 group-hover:border-purple-300 dark:group-hover:border-purple-500/50 transition shadow-2xs">
                    <Settings className="w-4 h-4" />
                  </div>
                  <kbd className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 group-hover:border-purple-300 dark:group-hover:border-purple-500/50 group-hover:text-purple-700 dark:group-hover:text-purple-300 transition">
                    F7
                  </kbd>
                </div>
                <div className="mt-3">
                  <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-300 transition">
                    Root Settings
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 transition">
                    Platform Owner Only
                  </div>
                </div>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Renew / Upgrade Subscription Modal matching ProductFormModal */}
      {isUpgradeModalOpen && (
        <div
          id="dashboard-renew-subscription-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="dashboard-upgrade-title"
          className="form-modal-theme fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isSubmittingUpgrade) {
              setIsUpgradeModalOpen(false);
            }
          }}
        >
          <div
            className="relative w-full max-w-xl bg-white dark:bg-[#131B2E] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[94vh] border border-slate-200 dark:border-purple-800/80 animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header matching ProductFormModal dark gradient */}
            {(() => {
              const availableChips = getAvailableTemplateChips(
                currentPlanRaw,
                currentStatusRaw,
                selectedUpgradePlan
              );

              return (
                <>
                  <div className="bg-slate-50 dark:bg-gradient-to-r dark:from-purple-900 dark:via-indigo-950 dark:to-slate-900 border-b border-slate-200 dark:border-purple-800/80 text-slate-800 dark:text-white px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold shadow-2xs ${
                          isExpired
                            ? 'bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300 border border-amber-500/20 dark:border-amber-400/30'
                            : 'bg-purple-500/10 text-purple-600 dark:bg-purple-500/20 dark:text-purple-300 border border-purple-500/20 dark:border-purple-400/30'
                        }`}
                      >
                        <Sparkles className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 id="dashboard-upgrade-title" className="font-bold text-base text-slate-900 dark:text-white tracking-tight">
                          {isExpired
                            ? 'Subscription Expired — Renew Store License'
                            : isActive1Year
                            ? 'Extend Active 1-Year Subscription'
                            : isActive6Month
                            ? 'Renew or Upgrade Store Subscription'
                            : isFree
                            ? 'Free Tier Evaluation — Upgrade Store License'
                            : 'Renew Store Subscription'}
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-purple-200/80">
                          {isExpired
                            ? 'Select a renewal plan below to notify the SuperAdmin for immediate reactivation'
                            : isActive1Year
                            ? 'Store holds active 1-Year Premium License. Request a 12-month extension from SuperAdmin.'
                            : isActive6Month
                            ? 'Renew your 6-month license or upgrade to a 1-year premium plan'
                            : isFree
                            ? 'Request a plan upgrade from Platform SuperAdmin to keep your footwear POS active'
                            : 'Request a subscription extension from the Platform SuperAdmin'}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsUpgradeModalOpen(false)}
                      disabled={isSubmittingUpgrade}
                      aria-label="Close dialog"
                      className="p-1.5 text-slate-400 hover:text-slate-700 dark:text-purple-300 dark:hover:text-white rounded-lg hover:bg-slate-200/60 dark:hover:bg-white/10 transition cursor-pointer disabled:opacity-50"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Modal Form */}
                  <form onSubmit={handleRequestUpgrade} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
                    {/* Expired Alert Banner inside Modal */}
                    {isExpired && (
                      <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-700/60 flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-200">
                        <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold">Your store subscription is currently EXPIRED.</span>
                          <p className="text-[11px] text-amber-700 dark:text-amber-300/90 mt-0.5">
                            Select a renewal plan below to notify the SuperAdmin for immediate 1-click reactivation.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Grouped rounded container: Current License Summary */}
                    <div className="p-4 rounded-2xl bg-white dark:bg-gradient-to-b dark:from-[#131B2E]/90 dark:to-[#0A0E1A]/80 border border-gray-200 dark:border-[#1A263D] shadow-xs">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-purple-300 mb-2.5 flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-purple-500" />
                        <span>Store License Overview</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800">
                          <span className="text-[10px] font-mono uppercase text-slate-400 dark:text-slate-500 block">
                            Current Plan
                          </span>
                          <span className="font-mono font-bold text-slate-900 dark:text-white mt-0.5 block">
                            {isFree
                              ? '30-Day Free Tier Trial'
                              : isActive1Year
                              ? '1-Year Premium Plan'
                              : isActive6Month
                              ? '6 Months Plan'
                              : 'Active Subscription'}
                          </span>
                        </div>
                        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800">
                          <span className="text-[10px] font-mono uppercase text-slate-400 dark:text-slate-500 block">
                            Status &amp; Expiry
                          </span>
                          <span className="font-mono font-bold text-slate-900 dark:text-white truncate mt-0.5 block">
                            {isExpired
                              ? `EXPIRED • 0d left`
                              : `Active • ${daysRemaining}d left`}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Notice indicating active plan status for active paid tiers */}
                    {isActive1Year && (
                      <div className="p-3.5 rounded-xl bg-purple-50/80 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/60 flex items-start gap-2.5 text-xs text-purple-900 dark:text-purple-200">
                        <CheckCircle2 className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0 mt-0.5" />
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold">Store holds an active 1-Year Premium License</span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
                              {daysRemaining} days remaining
                            </span>
                          </div>
                          <p className="text-[11px] text-purple-700 dark:text-purple-300/80 mt-1 leading-relaxed">
                            Your store is already active on our highest tier. 6-Month renewal is hidden to prevent unnecessary downgrade. You can request a 1-year extension (+12 months) below.
                          </p>
                        </div>
                      </div>
                    )}

                    {isActive6Month && (
                      <div className="p-3.5 rounded-xl bg-purple-50/80 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/60 flex items-start gap-2.5 text-xs text-purple-900 dark:text-purple-200">
                        <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0 mt-0.5" />
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold">Store holds an active 6-Month Premium License</span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
                              {daysRemaining} days remaining
                            </span>
                          </div>
                          <p className="text-[11px] text-purple-700 dark:text-purple-300/80 mt-1 leading-relaxed">
                            You can renew your current 6-month tier (+6 months) or upgrade to the 1-Year Premium Plan (+12 months) for maximum value.
                          </p>
                        </div>
                      </div>
                    )}

                    {upgradeSuccessMessage && (
                      <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-700/60 flex items-center gap-2.5 text-xs text-emerald-700 dark:text-emerald-300 font-semibold">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                        <span>{upgradeSuccessMessage}</span>
                      </div>
                    )}

                    {upgradeErrorMessage && (
                      <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-700/60 flex items-center gap-2.5 text-xs text-rose-700 dark:text-rose-300 font-semibold">
                        <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                        <span>{upgradeErrorMessage}</span>
                      </div>
                    )}

                    {/* Grouped rounded container: Interactive Plan Selection */}
                    <div className="p-4 rounded-2xl bg-white dark:bg-gradient-to-b dark:from-[#131B2E]/90 dark:to-[#0A0E1A]/80 border border-gray-200 dark:border-[#1A263D] shadow-xs space-y-2.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          {isActive1Year ? 'Extension Plan Duration' : 'Select Extension Plan'}{' '}
                          <span className="text-rose-500">*</span>
                        </label>
                        {!isActive1Year && (
                          <span className="text-[10px] text-slate-500 dark:text-purple-300/70">
                            Click to switch duration
                          </span>
                        )}
                      </div>

                      {/* If store is active on 1-Year, hide 6-month option to avoid redundant/downgrade choices */}
                      {isActive1Year ? (
                        <button
                          type="button"
                          onClick={() => handleSelectUpgradePlan('YEARLY')}
                          className="w-full p-3.5 rounded-xl border border-purple-600 bg-purple-50/80 dark:bg-purple-950/60 dark:border-purple-400 ring-2 ring-purple-500/30 shadow-xs text-left transition cursor-pointer relative"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-bold text-slate-900 dark:text-white">
                                Extend 1-Year Premium License (+12 Months)
                              </span>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/70 text-emerald-700 dark:text-emerald-300">
                                Current Active Tier
                              </span>
                            </div>
                            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/70 text-emerald-700 dark:text-emerald-300">
                              YEARLY
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                            Extends your active store license by +12 months from current expiry date with uninterrupted POS access and full support.
                          </p>
                        </button>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <button
                            type="button"
                            onClick={() => handleSelectUpgradePlan('6_MONTHS')}
                            className={`p-3.5 rounded-xl border text-left transition cursor-pointer relative ${
                              selectedUpgradePlan === '6_MONTHS'
                                ? 'border-purple-600 bg-purple-50/80 dark:bg-purple-950/60 dark:border-purple-400 ring-2 ring-purple-500/30 shadow-xs'
                                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0A0E1A] hover:border-purple-300 dark:hover:border-purple-900/60'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-slate-900 dark:text-white">
                                {isActive6Month ? 'Renew 6 Months (+6 Mos)' : '6 Months Plan'}
                              </span>
                              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-900/70 text-purple-700 dark:text-purple-300">
                                {isActive6Month ? 'Current Plan' : '6_MONTHS'}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                              {isActive6Month
                                ? 'Extends your current 6-month license by +6 months from current expiration.'
                                : 'Full POS, offline sync, inventory management & reports for 6 months.'}
                            </p>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleSelectUpgradePlan('YEARLY')}
                            className={`p-3.5 rounded-xl border text-left transition cursor-pointer relative ${
                              selectedUpgradePlan === 'YEARLY'
                                ? 'border-purple-600 bg-purple-50/80 dark:bg-purple-950/60 dark:border-purple-400 ring-2 ring-purple-500/30 shadow-xs'
                                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0A0E1A] hover:border-purple-300 dark:hover:border-purple-900/60'
                            }`}
                          >
                            <span className="absolute -top-2 right-3 px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wide bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-2xs">
                              {isActive6Month ? 'Upgrade Tier • Best Value' : 'Best Value'}
                            </span>
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-slate-900 dark:text-white">
                                {isActive6Month ? 'Upgrade to 1 Year (12 Mos)' : 'Yearly Plan (1 Year)'}
                              </span>
                              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/70 text-emerald-700 dark:text-emerald-300">
                                YEARLY
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                              {isActive6Month
                                ? 'Upgrade to 12 months uninterrupted license with priority support & maximum savings.'
                                : 'Maximum savings with 12 months uninterrupted license & priority support.'}
                            </p>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Grouped rounded container: Dynamic Payment Message & Quick Action Selector Chips */}
                    <div className="p-4 rounded-2xl bg-white dark:bg-gradient-to-b dark:from-[#131B2E]/90 dark:to-[#0A0E1A]/80 border border-gray-200 dark:border-[#1A263D] shadow-xs space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                          Message / Payment Reference for SuperAdmin
                        </label>
                        <span className="text-[10px] text-purple-600 dark:text-purple-400 font-semibold">
                          Quick Templates:
                        </span>
                      </div>

                      {/* Quick Action Template Selector Chips */}
                      <div className="flex flex-wrap gap-1.5">
                        {availableChips.map((chip) => {
                          const isSelected = activeTemplateChip === chip.type && !hasUserEditedNotes;
                          return (
                            <button
                              key={chip.type}
                              type="button"
                              onClick={() => handleSelectTemplateChip(chip.type)}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer flex items-center gap-1 border ${
                                isSelected
                                  ? 'bg-purple-600 text-white border-purple-500 shadow-xs'
                                  : 'bg-slate-100 dark:bg-purple-950/40 text-slate-700 dark:text-purple-200 border-slate-200 dark:border-purple-900/60 hover:bg-purple-100 dark:hover:bg-purple-900/60'
                              }`}
                            >
                              <span>[{chip.label}]</span>
                            </button>
                          );
                        })}
                      </div>

                      {/* Editable Textarea */}
                      <div className="relative">
                        <textarea
                          rows={3}
                          value={upgradeNotes}
                          onChange={(e) => {
                            setUpgradeNotes(e.target.value);
                            setHasUserEditedNotes(true);
                          }}
                          placeholder={
                            isActive1Year
                              ? 'e.g. Hi Admin, extending active 1-Year Premium License (+12 Months) for my store. Payment Ref ID: [Insert Ref ID]'
                              : isActive6Month && selectedUpgradePlan === 'YEARLY'
                              ? 'e.g. Hi Admin, currently on 6-Month Plan and upgrading to 1 Year Premium Plan for my store. Payment Ref ID: [Insert Ref ID]'
                              : isFree
                              ? 'e.g. Hi Admin, completed Free Tier evaluation and upgrading to 1 Year Premium Plan for my store. Payment Ref ID: [Insert Ref ID]'
                              : 'e.g. Hi Admin, renewing store subscription. Payment Ref ID: [Insert Ref ID]'
                          }
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-purple-400/40 bg-white dark:bg-purple-500/20 text-xs text-slate-900 dark:text-purple-100 outline-none focus:border-indigo-600 dark:focus:border-purple-400 transition leading-relaxed"
                        />
                      </div>
                      <p className="text-[10px] text-slate-500 dark:text-purple-300/80">
                        Tip: Pre-filled with standard format. Simply replace <code className="bg-slate-100 dark:bg-purple-950/60 px-1 py-0.5 rounded text-purple-600 dark:text-purple-300 font-mono">[Insert Ref ID]</code> with your actual bank/online transfer reference ID.
                      </p>
                    </div>
                  </form>

                  {/* Modal Footer Buttons matching ProductFormModal */}
                  <div className="px-6 py-4 border-t border-slate-200 dark:border-purple-800/80 bg-slate-50/70 dark:bg-[#0D1322]/70 flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setIsUpgradeModalOpen(false);
                        onNavigate('settings');
                      }}
                      className="text-xs text-purple-600 dark:text-purple-400 hover:underline font-semibold cursor-pointer"
                    >
                      Manage in Settings
                    </button>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setIsUpgradeModalOpen(false)}
                        disabled={isSubmittingUpgrade}
                        className="btn-secondary px-4 py-2.5 text-xs font-semibold cursor-pointer"
                      >
                        Close
                      </button>
                      <button
                        type="button"
                        onClick={handleRequestUpgrade}
                        disabled={isSubmittingUpgrade}
                        className="btn-primary px-5 py-2.5 text-xs flex items-center gap-1.5 cursor-pointer shadow-md font-bold disabled:opacity-50"
                      >
                        {isSubmittingUpgrade ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Submitting...</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>
                              {isActive1Year
                                ? 'Send 1-Year Extension Request'
                                : isActive6Month && selectedUpgradePlan === 'YEARLY'
                                ? 'Send Upgrade Request to SuperAdmin'
                                : isFree
                                ? 'Send Upgrade Request to SuperAdmin'
                                : 'Submit Renewal Request'}
                            </span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};
