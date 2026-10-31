import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Bell,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Flame,
  Info,
  ShoppingBag,
  ArrowLeftRight,
  Search,
  Filter,
  CheckCheck,
  RefreshCw,
  Clock,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Store,
  Globe,
  Radio,
  Check,
  X,
  FileText,
  Calendar,
  Layers,
  Sparkles,
} from 'lucide-react';
import { api } from '../../services/api.ts';
import { HistoricalNotificationItem, PlatformNotificationType } from '../../types.ts';
import { formatCurrency } from '../../utils/priceFormat.ts';

interface NotificationsViewProps {
  currentUser: any;
  companySettings: any;
  onNavigateTab: (tab: string) => void;
}

type TabCategory = 'all' | 'notices' | 'operational' | 'sales' | 'returns' | 'urgent';

export const NotificationsView: React.FC<NotificationsViewProps> = ({
  currentUser,
  companySettings,
  onNavigateTab,
}) => {
  const [items, setItems] = useState<HistoricalNotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(15);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 15,
    total: 0,
    totalPages: 1,
  });
  const [stats, setStats] = useState({
    totalNotices: 0,
    totalOperational: 0,
    unreadNotices: 0,
    unreadOperational: 0,
  });
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const searchTimeoutRef = useRef<any>(null);

  const currency = companySettings?.currency_symbol || companySettings?.currencySymbol || 'Rs.';

  const fetchHistory = async () => {
    try {
      setLoading(true);
      const res = await api.notifications.all({
        page,
        limit,
        tab: activeTab,
        search: searchQuery,
        sortOrder,
        unreadOnly,
      });

      if (res) {
        setItems(res.items || []);
        if (res.pagination) {
          setPagination(res.pagination);
        }
        if (res.stats) {
          setStats(res.stats);
        }
      }
    } catch (err) {
      console.warn('Failed to load notification history:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [page, limit, activeTab, sortOrder, unreadOnly]);

  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      setPage(1);
      fetchHistory();
    }, 280);

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [searchQuery]);

  const handleDismiss = async (item: HistoricalNotificationItem) => {
    try {
      setDismissingId(item.id);
      // Instant optimistic UI update
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, isRead: true } : i)));

      await api.notifications.dismiss(item.id, item.itemType);

      // Decrement unread counts
      if (!item.isRead) {
        setStats((prev) => ({
          ...prev,
          unreadNotices: item.kind === 'NOTICE' ? Math.max(0, prev.unreadNotices - 1) : prev.unreadNotices,
          unreadOperational: item.kind === 'OPERATIONAL' ? Math.max(0, prev.unreadOperational - 1) : prev.unreadOperational,
        }));
      }
    } catch (err) {
      console.warn('Failed to dismiss item:', err);
    } finally {
      setDismissingId(null);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      setIsMarkingAll(true);
      // Optimistic update
      setItems((prev) => prev.map((i) => ({ ...i, isRead: true })));
      setStats((prev) => ({
        ...prev,
        unreadNotices: 0,
        unreadOperational: 0,
      }));

      await api.notifications.markAllRead();
      await fetchHistory();
    } catch (err) {
      console.warn('Failed to mark all as read:', err);
    } finally {
      setIsMarkingAll(false);
    }
  };

  const handleActionClick = (item: HistoricalNotificationItem) => {
    handleDismiss(item);

    if (item.actionUrl) {
      try {
        if (item.actionUrl.startsWith('/')) {
          const tabMatch = item.actionUrl.replace(/^\/+/, '').split('?')[0];
          if (tabMatch && tabMatch !== 'notifications') {
            onNavigateTab(tabMatch);
            return;
          }
        }
        window.open(item.actionUrl, '_blank');
      } catch {
        window.location.href = item.actionUrl;
      }
      return;
    }

    if (item.itemType === 'RETURN' || item.returnNumber) {
      onNavigateTab('returns');
      if (item.invoiceNumber || item.returnNumber) {
        setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent('returns:inspect-invoice', {
              detail: { invoice: item.invoiceNumber, returnNumber: item.returnNumber },
            })
          );
        }, 150);
      }
    } else if (item.itemType === 'SALE' || item.invoiceNumber) {
      onNavigateTab('reports');
      if (item.invoiceNumber) {
        setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent('pos:open-receipt', { detail: { invoiceNumber: item.invoiceNumber } })
          );
        }, 150);
      }
    }
  };

  const formatTimestamp = (dateStr?: string | null) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      const diffMs = Date.now() - d.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays < 7) return `${diffDays}d ago`;
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  const formatFullDate = (dateStr?: string | null) => {
    if (!dateStr) return '';
    try {
      return new Date(dateStr).toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  const getTypeBadge = (item: HistoricalNotificationItem) => {
    const t = String(item.type || '').toUpperCase();
    if (item.kind === 'NOTICE') {
      switch (t) {
        case 'URGENT':
          return {
            label: 'Urgent Notice',
            badgeClass: 'bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-300 border-rose-300 dark:border-rose-700',
            cardBg: 'border-rose-300 dark:border-rose-900/60 bg-rose-50/40 dark:bg-rose-950/20',
            icon: <Flame className="w-3 h-3 text-rose-600 dark:text-rose-400" />,
          };
        case 'WARNING':
          return {
            label: 'Warning',
            badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300 border-amber-300 dark:border-amber-700',
            cardBg: 'border-amber-300 dark:border-amber-900/60 bg-amber-50/40 dark:bg-amber-950/20',
            icon: <AlertTriangle className="w-3 h-3 text-amber-600 dark:text-amber-400" />,
          };
        case 'SUCCESS':
          return {
            label: 'Announcement',
            badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700',
            cardBg: 'border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/30 dark:bg-emerald-950/15',
            icon: <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />,
          };
        default:
          return {
            label: 'Notice • Info',
            badgeClass: 'bg-indigo-100 text-indigo-800 dark:bg-purple-900/60 dark:text-purple-300 border-indigo-300 dark:border-purple-700',
            cardBg: 'border-indigo-200 dark:border-purple-900/40 bg-indigo-50/30 dark:bg-purple-950/20',
            icon: <Info className="w-3 h-3 text-indigo-600 dark:text-purple-400" />,
          };
      }
    } else {
      if (item.itemType === 'SALE') {
        return {
          label: 'POS Sale',
          badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700',
          cardBg: 'border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/20 dark:bg-emerald-950/10',
          icon: <ShoppingBag className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />,
        };
      }
      if (item.itemType === 'RETURN') {
        return {
          label: 'Customer Return',
          badgeClass: 'bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-300 border-rose-300 dark:border-rose-700',
          cardBg: 'border-rose-200 dark:border-rose-900/40 bg-rose-50/20 dark:bg-rose-950/10',
          icon: <ArrowLeftRight className="w-3 h-3 text-rose-600 dark:text-rose-400" />,
        };
      }
      return {
        label: 'Counter Event',
        badgeClass: 'bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-300 border-purple-300 dark:border-purple-700',
        cardBg: 'border-purple-200 dark:border-purple-900/40 bg-purple-50/20 dark:bg-purple-950/10',
        icon: <Bell className="w-3 h-3 text-purple-600 dark:text-purple-400" />,
      };
    }
  };

  const totalUnreadCount = stats.unreadNotices + stats.unreadOperational;

  return (
    <div className="p-4 sm:p-6 lg:p-7 space-y-5 max-w-7xl mx-auto select-none bg-[#F8FAFC] dark:bg-[#0A0E1A] min-h-screen text-slate-800 dark:text-slate-100 transition-colors">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200/80 dark:border-purple-900/30">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-purple-800 flex items-center justify-center text-white shadow-md shadow-purple-600/20">
              <Bell className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight font-heading flex items-center gap-2">
                <span>Notification History & Activity Logs</span>
                {totalUnreadCount > 0 && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-200 border border-purple-300 dark:border-purple-700">
                    {totalUnreadCount} Unread
                  </span>
                )}
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Complete audit trail of SuperAdmin announcements, subscription alerts, and POS counter transactions.
              </p>
            </div>
          </div>
        </div>

        {/* Global Actions */}
        <div className="flex items-center gap-2 self-start md:self-auto">
          {totalUnreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              disabled={isMarkingAll || loading}
              className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs transition shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span>{isMarkingAll ? 'Marking All...' : 'Mark All as Read'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={fetchHistory}
            disabled={loading}
            className="p-2 rounded-xl bg-white dark:bg-[#120726] border border-slate-200/90 dark:border-purple-800/40 text-slate-700 dark:text-purple-200 hover:text-purple-600 dark:hover:text-white shadow-2xs transition cursor-pointer disabled:opacity-50"
            title="Refresh Notification Feed"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-purple-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* STATS OVERVIEW CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#120726]/60 border border-slate-200/80 dark:border-purple-900/40 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-purple-300/70 mb-1">
            <span className="font-medium">Total Alerts</span>
            <Layers className="w-3.5 h-3.5 text-purple-500" />
          </div>
          <div className="text-xl font-bold text-slate-900 dark:text-white font-heading">
            {stats.totalNotices + stats.totalOperational}
          </div>
          <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">All captured events</div>
        </div>

        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#120726]/60 border border-slate-200/80 dark:border-purple-900/40 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-purple-300/70 mb-1">
            <span className="font-medium">Platform Notices</span>
            <Globe className="w-3.5 h-3.5 text-indigo-500" />
          </div>
          <div className="text-xl font-bold text-slate-900 dark:text-white font-heading">
            {stats.totalNotices}
          </div>
          <div className="text-[10px] text-indigo-600 dark:text-indigo-400 mt-0.5 font-medium">
            {stats.unreadNotices} unread
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#120726]/60 border border-slate-200/80 dark:border-purple-900/40 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-purple-300/70 mb-1">
            <span className="font-medium">POS Activities</span>
            <ShoppingBag className="w-3.5 h-3.5 text-emerald-500" />
          </div>
          <div className="text-xl font-bold text-slate-900 dark:text-white font-heading">
            {stats.totalOperational}
          </div>
          <div className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5 font-medium">
            {stats.unreadOperational} active in drawer
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#120726]/60 border border-slate-200/80 dark:border-purple-900/40 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-purple-300/70 mb-1">
            <span className="font-medium">Unread Total</span>
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          </div>
          <div className="text-xl font-bold text-slate-900 dark:text-white font-heading">
            {totalUnreadCount}
          </div>
          <div className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5 font-medium">
            Requires acknowledgment
          </div>
        </div>
      </div>

      {/* FILTER & SEARCH TOOLBAR */}
      <div className="p-3.5 rounded-2xl bg-white dark:bg-[#120726]/80 border border-slate-200/90 dark:border-purple-900/40 shadow-xs space-y-3">
        {/* Category Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
          {(
            [
              { key: 'all', label: 'All Items', count: stats.totalNotices + stats.totalOperational },
              { key: 'notices', label: 'Platform Notices', count: stats.totalNotices },
              { key: 'operational', label: 'POS Activity', count: stats.totalOperational },
              { key: 'sales', label: 'Sales' },
              { key: 'returns', label: 'Returns' },
              { key: 'urgent', label: 'Urgent Only' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                setActiveTab(tab.key);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-xl font-semibold text-xs transition cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === tab.key
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 dark:bg-purple-950/40 text-slate-600 dark:text-purple-200 hover:text-purple-700 dark:hover:text-white'
              }`}
            >
              <span>{tab.label}</span>
              {'count' in tab && tab.count !== undefined && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                    activeTab === tab.key
                      ? 'bg-purple-800 text-purple-100'
                      : 'bg-slate-200 dark:bg-purple-900/60 text-slate-700 dark:text-purple-300'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Search, Status & Sorting Controls */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 pt-2 border-t border-slate-100 dark:border-purple-900/30">
          <div className="relative w-full sm:w-80">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search notifications, invoices, keywords..."
              className="w-full h-8.5 bg-slate-50 dark:bg-[#0A0E1A] border border-slate-200 dark:border-purple-900/50 rounded-xl pl-9 pr-8 text-xs text-slate-800 dark:text-white placeholder:text-slate-400 outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/20"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">
            {/* Unread Only Toggle */}
            <button
              type="button"
              onClick={() => {
                setUnreadOnly(!unreadOnly);
                setPage(1);
              }}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer flex items-center gap-1.5 ${
                unreadOnly
                  ? 'bg-purple-50 border-purple-300 text-purple-700 dark:bg-purple-950/60 dark:border-purple-700 dark:text-purple-200'
                  : 'bg-white dark:bg-[#0A0E1A] border-slate-200 dark:border-purple-900/50 text-slate-600 dark:text-purple-300/80 hover:bg-slate-50'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${unreadOnly ? 'bg-purple-600' : 'bg-slate-300 dark:bg-slate-600'}`} />
              <span>Unread Only</span>
            </button>

            {/* Sort Order */}
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as 'desc' | 'asc')}
              className="h-8.5 bg-white dark:bg-[#0A0E1A] border border-slate-200 dark:border-purple-900/50 rounded-xl px-2.5 text-xs text-slate-700 dark:text-purple-200 outline-none cursor-pointer"
            >
              <option value="desc">Newest First</option>
              <option value="asc">Oldest First</option>
            </select>

            {/* Limit Selector */}
            <select
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
              className="h-8.5 bg-white dark:bg-[#0A0E1A] border border-slate-200 dark:border-purple-900/50 rounded-xl px-2 text-xs text-slate-700 dark:text-purple-200 outline-none cursor-pointer"
            >
              <option value={10}>10 / page</option>
              <option value={15}>15 / page</option>
              <option value={25}>25 / page</option>
              <option value={50}>50 / page</option>
            </select>
          </div>
        </div>
      </div>

      {/* NOTIFICATION CARDS LIST */}
      <div className="space-y-2.5">
        {loading ? (
          <div className="py-16 text-center space-y-3">
            <RefreshCw className="w-7 h-7 mx-auto animate-spin text-purple-600" />
            <p className="text-xs font-semibold text-slate-500 dark:text-purple-300">
              Loading notification records...
            </p>
          </div>
        ) : items.length === 0 ? (
          <div className="py-16 px-4 text-center rounded-2xl bg-white dark:bg-[#120726]/40 border border-slate-200/80 dark:border-purple-900/30">
            <div className="w-12 h-12 rounded-2xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-300 flex items-center justify-center mx-auto mb-3 border border-purple-200/80 dark:border-purple-800/40">
              <CheckCircle2 className="w-6 h-6 stroke-[2]" />
            </div>
            <h3 className="text-base font-bold text-slate-800 dark:text-white font-heading">
              No notifications found
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mt-1">
              {searchQuery
                ? `No alerts matching "${searchQuery}". Try adjusting your search or tab filters.`
                : 'All caught up! There are no active or historical notifications matching this criteria.'}
            </p>
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="mt-3.5 px-3 py-1.5 rounded-xl bg-purple-600 text-white text-xs font-semibold cursor-pointer"
              >
                Clear Search Filter
              </button>
            )}
          </div>
        ) : (
          items.map((item) => {
            const badge = getTypeBadge(item);
            const isUnread = !item.isRead;
            const isDismissing = dismissingId === item.id;

            return (
              <div
                key={item.id}
                className={`p-4 rounded-2xl border transition-all duration-200 ${
                  isUnread
                    ? `shadow-xs ${badge.cardBg} ring-1 ring-purple-400/20`
                    : 'bg-white/80 dark:bg-[#120726]/40 border-slate-200/80 dark:border-purple-900/30 opacity-85 hover:opacity-100 hover:bg-white dark:hover:bg-[#120726]/60'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  {/* Left Column: Badges, Title, Message */}
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1 border ${badge.badgeClass}`}
                      >
                        {badge.icon}
                        <span>{badge.label}</span>
                      </span>

                      {/* Scope Badge */}
                      {item.kind === 'NOTICE' ? (
                        <span className="text-[10px] font-medium text-slate-500 dark:text-purple-300/80 flex items-center gap-1">
                          {!item.tenantId ? (
                            <>
                              <Globe className="w-3 h-3 text-slate-400 dark:text-purple-400" />
                              <span>Platform Announcement</span>
                            </>
                          ) : (
                            <>
                              <Store className="w-3 h-3 text-indigo-500" />
                              <span>Direct Store Alert</span>
                            </>
                          )}
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium text-slate-500 dark:text-purple-300/80 flex items-center gap-1">
                          <Store className="w-3 h-3 text-emerald-500" />
                          <span>Counter Register Activity</span>
                        </span>
                      )}

                      {/* Unread indicator */}
                      {isUnread && (
                        <span className="inline-flex items-center gap-1 text-[9px] font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/60 px-1.5 py-0.5 rounded-full border border-rose-200 dark:border-rose-900">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                          <span>Unread</span>
                        </span>
                      )}
                    </div>

                    <h4 className="text-sm font-bold text-slate-900 dark:text-white leading-snug font-heading">
                      {item.title}
                    </h4>

                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line">
                      {item.message}
                    </p>

                    {/* Metadata line: Timestamp & Expiry */}
                    <div className="flex items-center gap-3 pt-1 text-[10px] text-slate-400 dark:text-slate-500 flex-wrap">
                      <span className="flex items-center gap-1" title={formatFullDate(item.createdAt)}>
                        <Clock className="w-3 h-3" />
                        <span>{formatTimestamp(item.createdAt)}</span>
                        <span className="opacity-60">({formatFullDate(item.createdAt)})</span>
                      </span>

                      {item.expiresAt && (
                        <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                          <Calendar className="w-3 h-3" />
                          <span>Expires: {formatTimestamp(item.expiresAt)}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right Column: Actions */}
                  <div className="flex items-center sm:flex-col gap-2 shrink-0 self-end sm:self-start">
                    {(item.actionUrl || item.invoiceNumber || item.returnNumber) && (
                      <button
                        type="button"
                        onClick={() => handleActionClick(item)}
                        className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs transition cursor-pointer flex items-center gap-1 shadow-xs"
                      >
                        <span>
                          {item.actionLabel ||
                            (item.itemType === 'SALE'
                              ? 'View Receipt'
                              : item.itemType === 'RETURN'
                              ? 'Inspect Return'
                              : 'Open Link')}
                        </span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    )}

                    {isUnread ? (
                      <button
                        type="button"
                        onClick={() => handleDismiss(item)}
                        disabled={isDismissing}
                        className="px-2.5 py-1 rounded-xl bg-white dark:bg-purple-900/40 hover:bg-slate-100 dark:hover:bg-purple-800/40 text-slate-700 dark:text-purple-200 border border-slate-200 dark:border-purple-700 text-[11px] font-semibold transition cursor-pointer flex items-center gap-1 shadow-2xs disabled:opacity-50"
                        title="Mark as read / dismiss"
                      >
                        <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                        <span>{isDismissing ? 'Saving...' : 'Dismiss'}</span>
                      </button>
                    ) : (
                      <span className="text-[10px] font-medium text-slate-400 dark:text-purple-300/60 flex items-center gap-1 px-2 py-1">
                        <CheckCheck className="w-3 h-3 text-emerald-500" />
                        <span>Acknowledged</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* PAGINATION FOOTER */}
      {pagination.totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-200/80 dark:border-purple-900/30 text-xs">
          <span className="text-slate-500 dark:text-slate-400">
            Showing page <span className="font-bold text-slate-800 dark:text-white">{pagination.page}</span> of{' '}
            <span className="font-bold text-slate-800 dark:text-white">{pagination.totalPages}</span> ({pagination.total} total notifications)
          </span>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={pagination.page <= 1 || loading}
              className="px-3 py-1.5 rounded-xl bg-white dark:bg-[#120726] border border-slate-200 dark:border-purple-800/40 text-slate-700 dark:text-purple-200 hover:bg-slate-50 dark:hover:bg-purple-900/40 disabled:opacity-40 disabled:cursor-not-allowed font-semibold cursor-pointer flex items-center gap-1"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Previous</span>
            </button>

            <span className="px-3 py-1 font-bold text-purple-600 dark:text-purple-300">
              {pagination.page}
            </span>

            <button
              type="button"
              onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
              disabled={pagination.page >= pagination.totalPages || loading}
              className="px-3 py-1.5 rounded-xl bg-white dark:bg-[#120726] border border-slate-200 dark:border-purple-800/40 text-slate-700 dark:text-purple-200 hover:bg-slate-50 dark:hover:bg-purple-900/40 disabled:opacity-40 disabled:cursor-not-allowed font-semibold cursor-pointer flex items-center gap-1"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
