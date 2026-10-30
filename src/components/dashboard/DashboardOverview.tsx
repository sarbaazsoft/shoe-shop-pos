import React, { useState, useEffect, useRef } from 'react';
import { ShoppingCart, Boxes, Users, AlertTriangle, Calendar, ChevronDown, Truck, RefreshCw, RotateCcw, BarChart3, Building2, Settings, Store, Sparkles, X, CheckCircle2, AlertCircle } from 'lucide-react';
import { api } from '../../services/api.ts';
import { formatCurrency } from '../../utils/priceFormat.ts';
import { isFreeTrial, calculateDaysLeft, RENEWAL_TEMPLATE_CHIPS, getRenewalMessageTemplate, resolveDefaultRenewalTemplateType, type RenewalTemplateType } from '../../utils/subscription.ts';
import { BrandLogo } from '../common/BrandLogo.tsx';
import { StatCard, triggerStatRecount } from '../common/StatCard.tsx';
import { RetailShoeMetrics, useDataPerIntersectionObserver, type RetailShoeMetricsData } from '../common/RetailShoeMetrics.tsx';

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

  const [showWelcomeBanner, setShowWelcomeBanner] = useState<boolean>(() => {
    try {
      if (
        localStorage.getItem(dismissKey) === 'true' ||
        localStorage.getItem('pos_welcome_partner_dismissed') === 'true'
      ) {
        return false;
      }
      return true;
    } catch {
      return true;
    }
  });

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
    companySettings?.subscriptionType ||
    companySettings?.subscription_type ||
    currentUser?.subscriptionPlan ||
    currentUser?.plan;

  const isFree = isFreeTrial(currentPlanRaw);

  // Renewal / Upgrade Modal state with Dynamic Templates
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [selectedUpgradePlan, setSelectedUpgradePlan] = useState<'6_MONTHS' | 'YEARLY'>('YEARLY');
  const [activeTemplateChip, setActiveTemplateChip] = useState<RenewalTemplateType>(() =>
    resolveDefaultRenewalTemplateType(
      companySettings?.subscriptionStatus || companySettings?.subscription_status,
      currentPlanRaw
    )
  );
  const [hasUserEditedNotes, setHasUserEditedNotes] = useState(false);
  const [upgradeNotes, setUpgradeNotes] = useState<string>(() => {
    const initType = resolveDefaultRenewalTemplateType(
      companySettings?.subscriptionStatus || companySettings?.subscription_status,
      currentPlanRaw
    );
    return getRenewalMessageTemplate(initType, 'YEARLY');
  });
  const [isSubmittingUpgrade, setIsSubmittingUpgrade] = useState(false);
  const [upgradeSuccessMessage, setUpgradeSuccessMessage] = useState<string | null>(null);
  const [upgradeErrorMessage, setUpgradeErrorMessage] = useState<string | null>(null);

  const handleOpenUpgradeModal = () => {
    setUpgradeSuccessMessage(null);
    setUpgradeErrorMessage(null);
    setSelectedUpgradePlan('YEARLY');
    const defaultType = resolveDefaultRenewalTemplateType(
      companySettings?.subscriptionStatus || companySettings?.subscription_status,
      currentPlanRaw
    );
    setActiveTemplateChip(defaultType);
    setHasUserEditedNotes(false);
    setUpgradeNotes(getRenewalMessageTemplate(defaultType, 'YEARLY'));
    setIsUpgradeModalOpen(true);
  };

  const handleSelectUpgradePlan = (plan: '6_MONTHS' | 'YEARLY') => {
    setSelectedUpgradePlan(plan);
    if (!hasUserEditedNotes) {
      setUpgradeNotes(getRenewalMessageTemplate(activeTemplateChip, plan));
    }
  };

  const handleSelectTemplateChip = (chipType: RenewalTemplateType) => {
    setActiveTemplateChip(chipType);
    setHasUserEditedNotes(false);
    setUpgradeNotes(getRenewalMessageTemplate(chipType, selectedUpgradePlan));
  };

  // Context-aware greeting and subtext based on user requirements:
  // 1. First-Time Login / New Store Owner:
  //    Greeting: "Welcome to your new store! You are currently on the 30-day Free Tier."
  //    Subtext: "Explore all features, and when you are ready, upgrade to our Premium 6-Month or Yearly Plan to keep your store active."
  // 2. Returning Free Tier Store Owner:
  //    Greeting: "Welcome back! Enjoying your Free Tier trial?"
  //    Subtext: "If you are satisfied with our service, upgrade to our Premium 6-Month or Yearly Plan."
  // 3. Returning Paid Tier Store Owner:
  //    Greeting: "Welcome back! Thank you for being a valued Premium subscriber."
  let bannerGreeting = '';
  let bannerSubtext = '';
  let showRenewUpgradeButton = false;
  let bannerBadge = '';

  if (isFree) {
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
    bannerSubtext = 'Thank you for choosing SarbaazSoft to power your footwear business. Your premium store license is active.';
    showRenewUpgradeButton = false;
    bannerBadge = 'Premium Subscriber';
  }

  const handleDismissWelcomeBanner = () => {
    try {
      localStorage.setItem('pos_welcome_partner_dismissed', 'true');
      localStorage.setItem(dismissKey, 'true');
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

  const storeName =
    companySettings?.name ||
    companySettings?.company_name ||
    companySettings?.companyName ||
    'Your Store';

  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState<'7days' | 'month' | 'year'>('7days');
  const [hoveredPoint, setHoveredPoint] = useState<number | null>(null);
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
  }, []);

  const formattedDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  // Calculate coordinates for dual-spline Sales & Transactions chart
  const chartWidth = 560;
  const chartHeight = 200;
  const paddingLeft = 36;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 30;

  const innerWidth = chartWidth - paddingLeft - paddingRight;
  const innerHeight = chartHeight - paddingTop - paddingBottom;

  const points = dashboardData.sevenDaySales.map((d, index) => {
    const denom = Math.max(1, dashboardData.sevenDaySales.length - 1);
    const x = paddingLeft + (index / denom) * innerWidth;
    // Scale against highest value or min 100
    const maxVal = Math.max(
      100,
      ...dashboardData.sevenDaySales.map((s) => Math.max(s.amount || 0, s.txCount || 0))
    );
    const ySales = paddingTop + innerHeight - ((d.amount || 0) / maxVal) * innerHeight;
    const yTx = paddingTop + innerHeight - ((d.txCount || 0) / maxVal) * innerHeight;
    return { x, ySales, yTx, ...d };
  });

  // Helper function to build smooth cubic Bezier splines
  const buildSplinePath = (pts: { x: number; y: number }[]) => {
    if (pts.length === 0) return '';
    if (pts.length === 1) return `M ${pts[0].x},${pts[0].y}`;
    let d = `M ${pts[0].x},${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i === 0 ? 0 : i - 1];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;
      const cp1x = p1.x + (p2.x - p0.x) / 5;
      const cp1y = p1.y + (p2.y - p0.y) / 5;
      const cp2x = p2.x - (p3.x - p1.x) / 5;
      const cp2y = p2.y - (p3.y - p1.y) / 5;
      d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
    }
    return d;
  };

  const salesLinePath = buildSplinePath(points.map((p) => ({ x: p.x, y: p.ySales })));
  const txLinePath = buildSplinePath(points.map((p) => ({ x: p.x, y: p.yTx })));

  const baselineY = paddingTop + innerHeight;
  const lastX = points.length > 0 ? points[points.length - 1].x : innerWidth;
  const firstX = points.length > 0 ? points[0].x : paddingLeft;

  const salesAreaPath = points.length > 0 && salesLinePath ? `${salesLinePath} L ${lastX},${baselineY} L ${firstX},${baselineY} Z` : '';
  const txAreaPath = points.length > 0 && txLinePath ? `${txLinePath} L ${lastX},${baselineY} L ${firstX},${baselineY} Z` : '';

  const sevenDaySalesTotal = dashboardData.sevenDaySales.reduce(
    (sum, d) => sum + (Number(d.amount) || 0),
    0
  );

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

      {/* Context-Aware Store Owner Welcome Greeting Banner */}
      {showWelcomeBanner && (
        <div
          id="dashboard-welcome-banner"
          className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-purple-900/95 via-indigo-900/90 to-slate-900 border border-purple-400/40 text-white shadow-xl relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
        >
          <div className="flex items-start gap-3.5 min-w-0 z-10">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-500 to-indigo-500 flex items-center justify-center shrink-0 shadow-md border border-purple-300/30">
              <Store className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/30 border border-purple-400/40 text-purple-200">
                  <Sparkles className="w-3 h-3 text-purple-300" />
                  {bannerBadge}
                </span>
                <span className="text-xs font-mono text-purple-300/80">• {storeName}</span>
              </div>
              <h2 className="text-base sm:text-lg font-bold tracking-tight text-white leading-snug">
                {bannerGreeting}
              </h2>
              {bannerSubtext && (
                <p className="text-xs sm:text-sm text-purple-100/90 mt-1 leading-relaxed max-w-3xl">
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
                className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white text-xs font-bold transition shadow-md cursor-pointer flex items-center gap-1.5 active:scale-95 border border-amber-300/40"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Renew / Upgrade Subscription</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => onNavigate('pos')}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow-sm cursor-pointer flex items-center gap-1.5 active:scale-95"
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              <span>Open POS</span>
            </button>

            <button
              type="button"
              onClick={handleDismissWelcomeBanner}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition cursor-pointer"
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

      {/* ROW 2: 3 CARDS (Sales Overview + Best Selling Brands + Best Selling Products) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-5">
        {/* Card 1: Sales Overview (Full on md/lg, span 5 on xl) */}
        <div className="md:col-span-2 lg:col-span-12 xl:col-span-5 app-card p-5 flex flex-col justify-between">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Sales Overview
            </h2>

            <div className="flex items-center gap-3">
              {/* Chart Legend */}
              <div className="flex items-center gap-2.5 text-[11px]">
                <div className="flex items-center gap-1 text-slate-600 dark:text-slate-300">
                  <span className="w-2 h-2 rounded-full bg-[#3B82F6] dark:shadow-[0_0_6px_#3B82F6]" />
                  <span>Sales Amount</span>
                </div>
                <div className="flex items-center gap-1 text-slate-600 dark:text-slate-300">
                  <span className="w-2 h-2 rounded-full bg-[#06B6D4] dark:shadow-[0_0_6px_#06B6D4]" />
                  <span>Transactions</span>
                </div>
              </div>

              {/* Timeframe selector */}
              <div className="relative">
                <select
                  value={timeframe}
                  onChange={(e: any) => setTimeframe(e.target.value)}
                  className="appearance-none bg-slate-50 dark:bg-purple-500/20 border border-slate-200 dark:border-purple-400/40 text-[11px] font-medium text-slate-700 dark:text-purple-200 py-1 pl-2.5 pr-6 rounded-lg outline-none cursor-pointer hover:border-blue-400 dark:hover:bg-purple-500/30 dark:hover:text-white dark:hover:border-purple-400/60 dark:shadow-[0_0_14px_rgba(147,51,234,0.2)] transition"
                >
                  <option value="7days" className="dark:bg-[#120726] dark:text-purple-100">Last 7 Days</option>
                  <option value="month" className="dark:bg-[#120726] dark:text-purple-100">This Month</option>
                  <option value="year" className="dark:bg-[#120726] dark:text-purple-100">This Year</option>
                </select>
                <ChevronDown className="w-3 h-3 text-slate-400 dark:text-purple-300 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Dual Spline Chart Canvas */}
          <div className="relative w-full overflow-hidden">
            <svg
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              className="w-full h-48 overflow-visible"
            >
              <defs>
                {/* Sales Area Gradient */}
                <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.0" />
                </linearGradient>

                {/* Transactions Area Gradient */}
                <linearGradient id="txGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#06B6D4" stopOpacity="0.32" />
                  <stop offset="100%" stopColor="#06B6D4" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Dotted Horizontal Grid lines */}
              {[100, 80, 60, 40, 20, 0].map((val) => {
                const y = paddingTop + innerHeight - (val / 100) * innerHeight;
                return (
                  <g key={val}>
                    <line
                      x1={paddingLeft}
                      y1={y}
                      x2={paddingLeft + innerWidth}
                      y2={y}
                      stroke="currentColor"
                      className="text-slate-100 dark:text-[#1A263D] stroke-1"
                      strokeDasharray="3 3"
                    />
                    <text
                      x={paddingLeft - 8}
                      y={y + 3}
                      textAnchor="end"
                      className="text-[9.5px] font-mono fill-slate-400 dark:fill-slate-500"
                    >
                      {val}
                    </text>
                  </g>
                );
              })}

              {/* Sales Area Fill */}
              <path d={salesAreaPath} fill="url(#salesGrad)" />

              {/* Transactions Area Fill */}
              <path d={txAreaPath} fill="url(#txGrad)" />

              {/* Sales Spline Curve */}
              <path
                d={salesLinePath}
                fill="none"
                stroke="#3B82F6"
                strokeWidth="2.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="neon-glow-blue"
              />

              {/* Transactions Spline Curve */}
              <path
                d={txLinePath}
                fill="none"
                stroke="#06B6D4"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="neon-glow-cyan"
              />

              {/* Point Markers and Tooltips */}
              {points.map((p, i) => {
                const isHovered = hoveredPoint === i;
                return (
                  <g
                    key={`point-${p.label}`}
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredPoint(i)}
                    onMouseLeave={() => setHoveredPoint(null)}
                  >
                    {/* Sales Node Circle */}
                    <circle
                      cx={p.x}
                      cy={p.ySales}
                      r={isHovered ? 5.5 : 3.5}
                      className="fill-white dark:fill-[#0A0E1A] stroke-[#3B82F6] transition-all"
                      strokeWidth="2.5"
                    />

                    {/* Tx Node Circle */}
                    <circle
                      cx={p.x}
                      cy={p.yTx}
                      r={isHovered ? 5 : 3}
                      className="fill-white dark:fill-[#0A0E1A] stroke-[#06B6D4] transition-all"
                      strokeWidth="2"
                    />

                    {/* X-Axis Day Labels */}
                    <text
                      x={p.x}
                      y={chartHeight - 8}
                      textAnchor="middle"
                      className="text-[10px] font-medium fill-slate-500 dark:fill-slate-400"
                    >
                      {p.label}
                    </text>

                    {/* Interactive Tooltip Bubble on Hover */}
                    {isHovered && (
                      <g className="pointer-events-none">
                        <rect
                          x={Math.max(paddingLeft, Math.min(p.x - 55, chartWidth - 120))}
                          y={Math.min(p.ySales, p.yTx) - 44}
                          width="110"
                          height="36"
                          rx="8"
                          className="fill-slate-900 dark:fill-[#131F37] stroke stroke-slate-700 dark:stroke-[#1E2D4A] shadow-xl"
                        />
                        <text
                          x={Math.max(paddingLeft + 55, Math.min(p.x, chartWidth - 65))}
                          y={Math.min(p.ySales, p.yTx) - 28}
                          textAnchor="middle"
                          className="text-[9.5px] font-bold fill-white font-mono"
                        >
                          Sales: {p.amount}
                        </text>
                        <text
                          x={Math.max(paddingLeft + 55, Math.min(p.x, chartWidth - 65))}
                          y={Math.min(p.ySales, p.yTx) - 15}
                          textAnchor="middle"
                          className="text-[9px] font-medium fill-cyan-400 font-mono"
                        >
                          {p.txCount} Transactions
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {/* Card 2: Best Selling Brands (Span 1 on md, 6 on lg, 4 on xl) */}
        <div className="md:col-span-1 lg:col-span-6 xl:col-span-4 app-card p-5 flex flex-col justify-between min-w-0">
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

        {/* Card 3: Best Selling Products (Span 1 on md, 6 on lg, 3 on xl) */}
        <div className="md:col-span-1 lg:col-span-6 xl:col-span-3 app-card p-5 flex flex-col justify-between min-w-0">
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

      {/* ROW 3: LATEST TRANSACTIONS & QUICK ACTIONS */}
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
            <div className="bg-slate-50 dark:bg-gradient-to-r dark:from-purple-900 dark:via-indigo-950 dark:to-slate-900 border-b border-slate-200 dark:border-purple-800/80 text-slate-800 dark:text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-600 dark:bg-purple-500/20 dark:text-purple-300 border border-blue-500/20 dark:border-purple-400/30 flex items-center justify-center font-bold shadow-2xs">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 id="dashboard-upgrade-title" className="font-bold text-base text-slate-900 dark:text-white tracking-tight">
                    Renew / Upgrade Store Subscription
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-purple-200/80">
                    Request a plan upgrade from Platform SuperAdmin to keep your footwear POS active
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
                      {isFree ? '30-Day Free Tier Trial' : 'Active Subscription'}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800">
                    <span className="text-[10px] font-mono uppercase text-slate-400 dark:text-slate-500 block">
                      Store Name
                    </span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white truncate mt-0.5 block">
                      {storeName}
                    </span>
                  </div>
                </div>
              </div>

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
                    Select Extension Plan <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[10px] text-slate-500 dark:text-purple-300/70">
                    Click to switch duration
                  </span>
                </div>
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
                        6 Months Plan
                      </span>
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-900/70 text-purple-700 dark:text-purple-300">
                        6_MONTHS
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                      Full POS, offline sync, inventory management & reports for 6 months.
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
                      Best Value
                    </span>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900 dark:text-white">
                        Yearly Plan (1 Year)
                      </span>
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/70 text-emerald-700 dark:text-emerald-300">
                        YEARLY
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                      Maximum savings with 12 months uninterrupted license & priority support.
                    </p>
                  </button>
                </div>
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
                  {RENEWAL_TEMPLATE_CHIPS.map((chip) => {
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
                    placeholder="e.g. Hi Admin, completed Free Tier evaluation and upgrading to 1 Year Premium Plan for my store. Payment Ref ID: [Insert Ref ID]"
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
                      <span>Submit Renewal Request</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
