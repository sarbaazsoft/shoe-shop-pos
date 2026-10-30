import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, Store, CheckCircle2, Power, Plus, RefreshCw, Wand2, Lock, LogOut, TrendingUp, Clock, KeyRound, FileCode2, Mail, AlertCircle, Eye, EyeOff, Fingerprint, ArrowRight, LayoutDashboard, Search, Menu, X, PanelLeftClose, PanelLeftOpen, Sun, Moon, Keyboard, Calendar, Globe, Download, Upload, FileText, Trash2, BarChart3, User as UserIcon, Building2, ChevronDown, UserCog, ShieldCheck, Sliders, Sparkles, Megaphone, Send, Radio, Info, AlertTriangle, ExternalLink, Bell, BellRing, CheckCheck, Check, SlidersHorizontal, CreditCard } from 'lucide-react';
import { api, setAuthSession } from '../../services/api';
import { ShowroomBackground } from '../common/ShowroomBackground';
import { PublicHeader } from '../common/PublicHeader';
import { PublicFooter } from '../common/PublicFooter';
import { UserAvatar } from '../common/UserAvatar';
import { ThemeDropdown } from '../common/ThemeDropdown';
import { UserProfileModal } from '../auth/UserProfileModal';
import { RememberedEmailField } from '../auth/RememberedEmailField';
import { useRememberedAccount } from '../../hooks/useRememberedAccount';
import { getRememberedEmail, normalizeRememberedEmail } from '../../utils/rememberedAccount';
import { StatCard, triggerStatRecount } from '../common/StatCard';
import { RetailShoeMetrics, useDataPerIntersectionObserver, type RetailShoeMetricsData } from '../common/RetailShoeMetrics';
import { SuperAdminReportsView } from './SuperAdminReportsView';
import { SettingsView } from '../settings/SettingsView';
import { useTheme } from '../../context/ThemeContext';
import { toTitleCaseLive, toTitleCaseTrimmed, toLowerTrimmed } from '../../utils/textFormat';
import type { SuperAdminStoreRow, TrialActivation, SuperAdminReportProduct, SuperAdminReportBreakdown, SuperAdminSevenDayPoint, SuperAdminRecentTransaction, User, PlatformNotification, PlatformNotificationType } from '../../types';

interface SuperAdminControlPanelProps {
  currentUser: User | null;
  onUserAuthenticated: (user: User, token: string) => void;
  onLogout: () => void;
  onOpenStore: (tenantId: number) => void;
  onOpenOnboarding: (tenantId: number) => void;
  onTenantsUpdated: () => void;
  onOpenProfile?: () => void;
}

type SuperAdminTab = 'dashboard' | 'stores' | 'trials' | 'requests' | 'notifications' | 'reports' | 'manifests' | 'settings';

export const SuperAdminControlPanel: React.FC<SuperAdminControlPanelProps> = ({
  currentUser,
  onUserAuthenticated,
  onLogout,
  onOpenStore,
  onOpenOnboarding,
  onTenantsUpdated,
  onOpenProfile,
}) => {
  const { theme, toggleTheme } = useTheme();
  const isSuperAdmin = currentUser?.role === 'SUPERADMIN';

  // SuperAdmin user menu dropdown & profile modal states
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // SuperAdmin Notifications Dropdown state
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const [notifMenuFilter, setNotifMenuFilter] = useState<'ALL' | 'RENEWALS' | 'TRIALS' | 'ANNOUNCEMENTS'>('ALL');
  const notifMenuRef = useRef<HTMLDivElement>(null);
  const [superAdminReadNotifs, setSuperAdminReadNotifs] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('pos_superadmin_read_notifs');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // SuperAdmin Platform Tools Dropdown state (Send Notification, Import Data, Export Platform Backup)
  const [showToolsDropdown, setShowToolsDropdown] = useState(false);
  const toolsMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserDropdown(false);
      }
      if (notifMenuRef.current && !notifMenuRef.current.contains(event.target as Node)) {
        setShowNotifDropdown(false);
      }
      if (toolsMenuRef.current && !toolsMenuRef.current.contains(event.target as Node)) {
        setShowToolsDropdown(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowUserDropdown(false);
        setShowNotifDropdown(false);
        setShowToolsDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleOpenProfile = () => {
    if (onOpenProfile) {
      onOpenProfile();
    } else {
      setIsProfileModalOpen(true);
    }
  };

  // Login / Reset form state when not authenticated as SUPERADMIN
  const [authTab, setAuthTab] = useState<'login' | 'forgot' | 'reset'>('login');
  // Remembered SuperAdmin email (email only; separate from store-login memory).
  const account = useRememberedAccount('platform');
  const [email, setEmail] = useState(() => getRememberedEmail('platform') ?? '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authInfo, setAuthInfo] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  // Dashboard Layout & Sidebar State (aligned with Store Sidebar & Header)
  const [activeTab, setActiveTab] = useState<SuperAdminTab>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'EXPIRED' | 'SUSPENDED' | 'ONLINE'>('ALL');
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('superadmin_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const toggleCollapse = useCallback(() => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('superadmin_sidebar_collapsed', String(next));
      } catch {}
      return next;
    });
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Control panel state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState({
    totalStores: 0,
    activeStores: 0,
    suspendedStores: 0,
    expiredStores: 0,
    activeTrials: 0,
    totalTrials: 0,
    pendingRequests: 0,
    totalPlatformRevenue: 0,
    totalPlatformProducts: 0,
  });
  const [stores, setStores] = useState<SuperAdminStoreRow[]>([]);
  const [trialActivations, setTrialActivations] = useState<TrialActivation[]>([]);
  const [extendingTrialId, setExtendingTrialId] = useState<number | null>(null);
  const [trialStatusFilter, setTrialStatusFilter] = useState<'ALL' | 'ACTIVE' | 'EXPIRED'>('ALL');
  const [reportProducts, setReportProducts] = useState<SuperAdminReportProduct[]>([]);
  const [reportCategories, setReportCategories] = useState<SuperAdminReportBreakdown[]>([]);
  const [reportBrands, setReportBrands] = useState<SuperAdminReportBreakdown[]>([]);
  const [sevenDaySales, setSevenDaySales] = useState<SuperAdminSevenDayPoint[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<SuperAdminRecentTransaction[]>([]);
  const [chartTimeframe, setChartTimeframe] = useState<'7days' | 'month' | 'year'>('7days');
  const [hoveredChartPoint, setHoveredChartPoint] = useState<number | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [exportingStoreId, setExportingStoreId] = useState<number | null>(null);
  const [exportingPlatform, setExportingPlatform] = useState(false);
  const [importSqlModalOpen, setImportSqlModalOpen] = useState(false);
  const [sqlImportText, setSqlImportText] = useState('');
  const [sqlFileName, setSqlFileName] = useState<string | null>(null);
  const [importingPlatformSql, setImportingPlatformSql] = useState(false);
  const [loadingSampleSql, setLoadingSampleSql] = useState(false);
  const [importSqlError, setImportSqlError] = useState<string | null>(null);
  const sqlFileInputRef = useRef<HTMLInputElement | null>(null);
  const superAdminWorkspaceRef = useRef<HTMLDivElement | null>(null);
  const [storeToDelete, setStoreToDelete] = useState<SuperAdminStoreRow | null>(null);
  const [deletingStore, setDeletingStore] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Newly provisioned credentials banner
  const [provisionedBanner, setProvisionedBanner] = useState<{
    tenantId: number;
    storeName: string;
    adminEmail: string;
    initialPassword: string;
    subscriptionPlan?: string;
    subscriptionStartDate?: string;
    subscriptionEndDate?: string;
    subscriptionStatus?: string;
    onboardingUrl: string;
    manifestUrl: string;
  } | null>(null);

  // Create Store Modal (Store Name, Owner Email, Password, Subscription Plan, Business Type, Pricing Policy)
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newStoreName, setNewStoreName] = useState('');
  const [newOwnerName, setNewOwnerName] = useState('');
  const [newOwnerEmail, setNewOwnerEmail] = useState('');
  const [newOwnerPassword, setNewOwnerPassword] = useState('admin123');
  const [newOwnerConfirmPassword, setNewOwnerConfirmPassword] = useState('admin123');
  const [showNewOwnerPassword, setShowNewOwnerPassword] = useState(false);
  const [newSubscriptionPlan, setNewSubscriptionPlan] = useState<'free_tier' | '6_MONTHS' | 'YEARLY'>('free_tier');
  const [newBusinessType, setNewBusinessType] = useState<'RETAIL' | 'WHOLESALE'>('RETAIL');
  const [newPricingMode, setNewPricingMode] = useState<'FIXED' | 'NEGOTIABLE'>('FIXED');
  const [newMinSellingQuantity, setNewMinSellingQuantity] = useState<number>(1.0);
  const [creatingStore, setCreatingStore] = useState(false);
  const [createStoreError, setCreateStoreError] = useState<string | null>(null);

  useEffect(() => {
    if (createModalOpen) setCreateStoreError(null);
  }, [createModalOpen]);

  // Edit Store Subscription Modal
  const [storeToEditSub, setStoreToEditSub] = useState<SuperAdminStoreRow | null>(null);
  const [editSubPlan, setEditSubPlan] = useState<'free_tier' | '6_MONTHS' | 'YEARLY'>('YEARLY');
  const [editSubEndDate, setEditSubEndDate] = useState<string>('');
  const [editSubStatus, setEditSubStatus] = useState<'ACTIVE' | 'EXPIRED' | 'SUSPENDED'>('ACTIVE');
  const [savingSub, setSavingSub] = useState(false);

  // Platform Custom Notifications & Broadcasts State
  const [notificationsList, setNotificationsList] = useState<PlatformNotification[]>([]);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [notificationModalOpen, setNotificationModalOpen] = useState(false);
  const [notifTargetTenantId, setNotifTargetTenantId] = useState<string>('ALL');
  const [notifTitle, setNotifTitle] = useState('');
  const [notifMessage, setNotifMessage] = useState('');
  const [notifType, setNotifType] = useState<PlatformNotificationType>('INFO');
  const [notifActionUrl, setNotifActionUrl] = useState('');
  const [notifActionLabel, setNotifActionLabel] = useState('');
  const [notifExpiryHours, setNotifExpiryHours] = useState('0');
  const [sendingNotif, setSendingNotif] = useState(false);
  const [notifError, setNotifError] = useState<string | null>(null);
  const [deletingNotifId, setDeletingNotifId] = useState<number | null>(null);
  const [notifFilterTarget, setNotifFilterTarget] = useState<'ALL' | 'GLOBAL' | 'TARGETED'>('ALL');
  const [notifFilterType, setNotifFilterType] = useState<string>('ALL');

  const loadNotifications = useCallback(async () => {
    if (!isSuperAdmin) return;
    try {
      setLoadingNotifications(true);
      const res = await api.superAdmin.getNotifications();
      if (res && Array.isArray(res.notifications)) {
        setNotificationsList(res.notifications);
      }
    } catch (err: any) {
      console.warn('Failed to load notifications:', err);
    } finally {
      setLoadingNotifications(false);
    }
  }, [isSuperAdmin]);

  const handleSendNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notifTitle.trim() || !notifMessage.trim()) {
      setNotifError('Please provide both notification title and message.');
      return;
    }
    setSendingNotif(true);
    setNotifError(null);
    try {
      const tenantId =
        notifTargetTenantId === 'ALL' || !notifTargetTenantId
          ? null
          : Number(notifTargetTenantId);

      let expiresAt: string | null = null;
      const hours = parseInt(notifExpiryHours, 10);
      if (hours > 0) {
        const d = new Date(Date.now() + hours * 60 * 60 * 1000);
        expiresAt = d.toISOString();
      }

      const res = await api.superAdmin.sendNotification({
        tenantId,
        title: notifTitle.trim(),
        message: notifMessage.trim(),
        type: notifType,
        actionUrl: notifActionUrl.trim() || undefined,
        actionLabel: notifActionLabel.trim() || undefined,
        expiresAt,
      });

      setSuccessMessage(res.message || 'Custom notification dispatched successfully!');
      setNotificationModalOpen(false);
      setNotifTitle('');
      setNotifMessage('');
      setNotifActionUrl('');
      setNotifActionLabel('');
      setNotifExpiryHours('0');
      setNotifType('INFO');
      setNotifTargetTenantId('ALL');
      await loadNotifications();
    } catch (err: any) {
      setNotifError(err.message || 'Failed to send notification.');
    } finally {
      setSendingNotif(false);
    }
  };

  const handleDeleteNotification = async (id: number) => {
    if (!window.confirm('Are you sure you want to revoke and delete this notification? Store terminals will no longer see it.')) {
      return;
    }
    setDeletingNotifId(id);
    try {
      await api.superAdmin.deleteNotification(id);
      setNotificationsList((prev) => prev.filter((n) => n.id !== id));
      setSuccessMessage('Notification revoked successfully.');
    } catch (err: any) {
      setError(err.message || 'Failed to revoke notification.');
    } finally {
      setDeletingNotifId(null);
    }
  };

  const loadOverview = useCallback(async () => {
    if (!isSuperAdmin) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.superAdmin.getOverview();
      if (data.metrics) setMetrics(data.metrics);
      if (Array.isArray(data.stores)) setStores(data.stores);
      if (Array.isArray(data.trialActivations)) {
        setTrialActivations(data.trialActivations);
      } else {
        const trialsRes = await api.superAdmin.getTrialActivations().catch(() => null);
        if (trialsRes?.trials) setTrialActivations(trialsRes.trials);
      }
      if (data.reports) {
        if (Array.isArray(data.reports.topProducts)) setReportProducts(data.reports.topProducts);
        if (Array.isArray(data.reports.topCategories)) setReportCategories(data.reports.topCategories);
        if (Array.isArray(data.reports.topBrands)) setReportBrands(data.reports.topBrands);
        if (Array.isArray(data.reports.sevenDaySales)) setSevenDaySales(data.reports.sevenDaySales);
        if (Array.isArray(data.reports.recentTransactions)) setRecentTransactions(data.reports.recentTransactions);
      }
      await loadNotifications();
    } catch (err: any) {
      setError(err.message || 'Failed to load SuperAdmin overview.');
    } finally {
      setLoading(false);
      triggerStatRecount();
    }
  }, [isSuperAdmin, loadNotifications]);

  const handleExtendTrial = async (trialId: number, days: number = 30) => {
    setExtendingTrialId(trialId);
    setError(null);
    setSuccessMessage(null);
    try {
      const res = await api.superAdmin.extendTrialActivation(trialId, days);
      setSuccessMessage(res.message || `Extended trial by ${days} days.`);
      await loadOverview();
      onTenantsUpdated();
    } catch (err: any) {
      setError(err.message || 'Failed to extend trial duration.');
    } finally {
      setExtendingTrialId(null);
    }
  };

  const handleMarkAllNotifsRead = () => {
    const allIds = formattedSuperAdminNotifs.map((n) => n.id);
    const updated = Array.from(new Set([...superAdminReadNotifs, ...allIds]));
    setSuperAdminReadNotifs(updated);
    try {
      localStorage.setItem('pos_superadmin_read_notifs', JSON.stringify(updated));
    } catch {}
  };

  const handleMarkNotifRead = (id: string) => {
    if (superAdminReadNotifs.includes(id)) return;
    const updated = [...superAdminReadNotifs, id];
    setSuperAdminReadNotifs(updated);
    try {
      localStorage.setItem('pos_superadmin_read_notifs', JSON.stringify(updated));
    } catch {}
  };

  const formattedSuperAdminNotifs = useMemo(() => {
    const items: Array<{
      id: string;
      rawId?: number;
      category: 'RENEWAL' | 'TRIAL' | 'ANNOUNCEMENT';
      title: string;
      message: string;
      storeName: string;
      tenantId?: number;
      createdAt: string;
      isUnread: boolean;
      actionLabel?: string;
      onAction?: () => void;
      onDelete?: () => void;
    }> = [];

    // 1. Process platform notifications (Renewal requests, Free trials, Broadcasts)
    notificationsList.forEach((notif) => {
      const titleLower = (notif.title || '').toLowerCase();
      const msgLower = (notif.message || '').toLowerCase();
      const isRenewal = titleLower.includes('renewal') || msgLower.includes('renewal');
      const isTrial = titleLower.includes('trial') || msgLower.includes('trial');

      let category: 'RENEWAL' | 'TRIAL' | 'ANNOUNCEMENT' = 'ANNOUNCEMENT';
      if (isRenewal) category = 'RENEWAL';
      else if (isTrial) category = 'TRIAL';

      const notifKey = `pn-${notif.id}`;
      const isUnread = !superAdminReadNotifs.includes(notifKey);

      let actionLabel = '';
      let onAction: (() => void) | undefined = undefined;

      if (isRenewal) {
        actionLabel = 'Manage Subscription';
        onAction = () => {
          handleMarkNotifRead(notifKey);
          setShowNotifDropdown(false);
          const targetStore = notif.tenantId
            ? stores.find((s) => s.id === notif.tenantId)
            : stores.find((s) => notif.title.toLowerCase().includes(s.name.toLowerCase()));
          if (targetStore) {
            setStoreToEditSub(targetStore);
          } else {
            setActiveTab('stores');
            if (notif.storeName && notif.storeName !== 'All Stores (Platform Broadcast)') {
              setSearchQuery(notif.storeName);
            }
          }
        };
      } else if (isTrial) {
        actionLabel = 'View Store';
        onAction = () => {
          handleMarkNotifRead(notifKey);
          setShowNotifDropdown(false);
          if (notif.tenantId) {
            onOpenStore(notif.tenantId);
          } else {
            setActiveTab('trials');
          }
        };
      }

      items.push({
        id: notifKey,
        rawId: notif.id,
        category,
        title: notif.title,
        message: notif.message,
        storeName: notif.storeName || 'Platform',
        tenantId: notif.tenantId || undefined,
        createdAt: notif.createdAt,
        isUnread,
        actionLabel,
        onAction,
        onDelete: () => {
          handleDeleteNotification(notif.id);
        },
      });
    });

    // 2. Add recent 30-day trial activations from trialActivations if not already present
    trialActivations.slice(0, 15).forEach((trial) => {
      const trialKey = `trial-${trial.id}`;
      const alreadyHasPn = items.some(
        (it) => it.category === 'TRIAL' && (it.tenantId === trial.tenantId || it.storeName.toLowerCase() === trial.storeName.toLowerCase())
      );
      if (!alreadyHasPn) {
        const isUnread = !superAdminReadNotifs.includes(trialKey);
        items.push({
          id: trialKey,
          category: 'TRIAL',
          title: `Free Trial Activated: ${trial.storeName}`,
          message: `Owner ${trial.userName} (${trial.email}) activated 30-day Free Tier. ${trial.daysRemaining} days left.`,
          storeName: trial.storeName,
          tenantId: trial.tenantId || undefined,
          createdAt: trial.activatedAt || trial.trialStartDate,
          isUnread,
          actionLabel: '+30d Extend',
          onAction: () => {
            handleMarkNotifRead(trialKey);
            handleExtendTrial(trial.id, 30);
          },
        });
      }
    });

    // 3. Add expiring stores (<= 3 days remaining) or already expired stores as renewal prompts
    stores
      .filter((s) => s.status === 'ACTIVE' && ((s.daysLeft !== undefined && s.daysLeft <= 3) || s.subscriptionStatus === 'EXPIRED'))
      .slice(0, 5)
      .forEach((st) => {
        const expKey = `exp-${st.id}-${st.subscriptionStatus}`;
        const alreadyHasRenewal = items.some((it) => it.category === 'RENEWAL' && it.tenantId === st.id);
        if (!alreadyHasRenewal) {
          const isUnread = !superAdminReadNotifs.includes(expKey);
          const daysRemaining = st.daysLeft ?? 0;
          items.push({
            id: expKey,
            category: 'RENEWAL',
            title: st.subscriptionStatus === 'EXPIRED' ? `Store Subscription Expired: ${st.name}` : `Subscription Expiring Soon: ${st.name}`,
            message: `${st.name} (${st.subscriptionPlan || 'Free Tier'}) has ${daysRemaining <= 0 ? 'expired' : `${daysRemaining} days remaining`}. Review renewal plan.`,
            storeName: st.name,
            tenantId: st.id,
            createdAt: st.subscriptionEndDate || new Date().toISOString(),
            isUnread,
            actionLabel: 'Extend Subscription',
            onAction: () => {
              handleMarkNotifRead(expKey);
              setShowNotifDropdown(false);
              setStoreToEditSub(st);
            },
          });
        }
      });

    // Sort by createdAt desc
    return items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [notificationsList, trialActivations, stores, superAdminReadNotifs, handleDeleteNotification, handleExtendTrial, onOpenStore]);

  const filteredNotifsList = useMemo(() => {
    if (notifMenuFilter === 'RENEWALS') {
      return formattedSuperAdminNotifs.filter((n) => n.category === 'RENEWAL');
    }
    if (notifMenuFilter === 'TRIALS') {
      return formattedSuperAdminNotifs.filter((n) => n.category === 'TRIAL');
    }
    if (notifMenuFilter === 'ANNOUNCEMENTS') {
      return formattedSuperAdminNotifs.filter((n) => n.category === 'ANNOUNCEMENT');
    }
    return formattedSuperAdminNotifs;
  }, [formattedSuperAdminNotifs, notifMenuFilter]);

  const unreadSuperAdminNotifsCount = useMemo(() => {
    return formattedSuperAdminNotifs.filter((n) => n.isUnread).length;
  }, [formattedSuperAdminNotifs]);

  useEffect(() => {
    if (isSuperAdmin) {
      loadOverview();
    }
  }, [isSuperAdmin, loadOverview]);

  useEffect(() => {
    if (isSuperAdmin) {
      triggerStatRecount();
    }
  }, [activeTab, isSuperAdmin]);

  useDataPerIntersectionObserver(superAdminWorkspaceRef, [
    loading,
    activeTab,
    stores.length,
    metrics.totalPlatformRevenue,
    metrics.totalPlatformProducts,
    reportProducts.length,
    reportCategories.length,
  ]);

  // Keyboard shortcuts (Ctrl+B to toggle sidebar, F1-F5 for tabs)
  useEffect(() => {
    if (!isSuperAdmin) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleCollapse();
        return;
      }
      if (['F1', 'F2', 'F3', 'F4', 'F5'].includes(e.key)) {
        e.preventDefault();
        if (e.key === 'F1') setActiveTab('stores');
        if (e.key === 'F2') setActiveTab('trials');
        if (e.key === 'F3') setCreateModalOpen(true);
        if (e.key === 'F4') setActiveTab('reports');
        if (e.key === 'F5') setActiveTab('manifests');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSuperAdmin, toggleCollapse]);

  const handleSuperAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthInfo(null);
    setAuthLoading(true);
    try {
      const loginEmail =
        account.isShowingRemembered && account.rememberedEmail ? account.rememberedEmail : email;
      const res = await api.auth.login({
        email: loginEmail,
        password,
      });
      if (res.user?.role !== 'SUPERADMIN') {
        throw new Error('Access denied: This account does not have SUPERADMIN privileges.');
      }
      setAuthSession(res.token, res.user);
      account.remember(res.user?.email || loginEmail);
      onUserAuthenticated(res.user, res.token);
    } catch (err: any) {
      setAuthError(err.message || 'SuperAdmin login failed.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSuperAdminForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);
    setAuthInfo(null);
    try {
      const res = await api.auth.forgotPassword({ email: email.trim() });
      setResetToken('');
      setAuthInfo(
        res.message ||
          'Password reset token and link have been sent to your email. Please check your inbox and enter the verification token below.'
      );
      setAuthTab('reset');
    } catch (err: any) {
      setAuthError(err.message || 'Failed to request reset token.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSuperAdminResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);
    setAuthInfo(null);
    try {
      await api.auth.resetPassword({ email, token: resetToken.trim(), newPassword });
      setAuthInfo('SuperAdmin password has been reset successfully! You can now sign in.');
      setResetToken('');
      setNewPassword('');
      setPassword('');
      if (account.rememberedEmail && normalizeRememberedEmail(email) !== account.rememberedEmail) {
        account.useAnotherAccount();
      }
      setAuthTab('login');
    } catch (err: any) {
      setAuthError(err.message || 'Password reset failed.');
    } finally {
      setAuthLoading(false);
    }
  };

  const triggerSqlDownload = (filename: string, sqlContent: string) => {
    const blob = new Blob([sqlContent], { type: 'application/sql;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || `store-backup-${new Date().toISOString().slice(0, 10)}.sql`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleToggleStoreStatus = async (store: SuperAdminStoreRow) => {
    const nextStatus = store.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    setTogglingId(store.id);
    setError(null);
    setSuccessMessage(null);
    try {
      const res = await api.superAdmin.toggleTenantStatus(store.id, nextStatus);
      setSuccessMessage(
        res.message ||
          `Store '${store.name}' is now ${nextStatus}.`
      );
      await loadOverview();
      onTenantsUpdated();
    } catch (err: any) {
      setError(err.message || 'Failed to toggle tenant status.');
    } finally {
      setTogglingId(null);
    }
  };

  const handleExportStoreSql = async (store: SuperAdminStoreRow) => {
    setExportingStoreId(store.id);
    setError(null);
    setSuccessMessage(null);
    try {
      const res = await api.superAdmin.exportTenantSql(store.id);
      triggerSqlDownload(res.filename, res.sql);
      setSuccessMessage(
        `Exported backup '${res.filename}' for ${store.name} (${res.totalRows} store records).`
      );
    } catch (err: any) {
      setError(err.message || `Failed to export SQL for store '${store.name}'.`);
    } finally {
      setExportingStoreId(null);
    }
  };

  const handleExportPlatformSql = async () => {
    setExportingPlatform(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const res = await api.superAdmin.exportPlatformSql();
      triggerSqlDownload(res.filename, res.sql);
      setSuccessMessage(
        `Exported complete platform SQL backup '${res.filename}' (${res.totalRows} total rows across all stores).`
      );
    } catch (err: any) {
      setError(err.message || 'Failed to export platform SQL backup.');
    } finally {
      setExportingPlatform(false);
    }
  };

  const handleSqlFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportSqlError(null);
    setSqlFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      setSqlImportText(String(ev.target?.result || ''));
    };
    reader.onerror = () => {
      setImportSqlError('Failed to read the selected .sql file.');
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleLoadMultiStoreSampleSql = async (autoExecute = false) => {
    setLoadingSampleSql(true);
    setImportSqlError(null);
    try {
      const resp = await fetch('/multi-store-pos-import.sql');
      if (!resp.ok) {
        throw new Error('Could not fetch /multi-store-pos-import.sql from public folder.');
      }
      const text = await resp.text();
      setSqlImportText(text);
      setSqlFileName('multi-store-pos-import.sql (24 Stores • 2,400 Products • 240 Purchases • 480 Sales)');
      if (autoExecute) {
        setImportingPlatformSql(true);
        const res = await api.superAdmin.importPlatformSql(text);
        setSuccessMessage(
          res.message ||
            'Imported multi-store SQL backup (24 stores, 2,400 Products, 240 purchases, 480 sales) successfully!'
        );
        setImportSqlModalOpen(false);
        await loadOverview();
        onTenantsUpdated();
      }
    } catch (err: any) {
      setImportSqlError(err.message || 'Failed to load sample multi-store SQL file.');
    } finally {
      setLoadingSampleSql(false);
      setImportingPlatformSql(false);
    }
  };

  const handleExecutePlatformSqlImport = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!sqlImportText.trim()) {
      setImportSqlError('Please select a .sql file, load the 24-store preset, or paste SQL statements.');
      return;
    }
    setImportingPlatformSql(true);
    setImportSqlError(null);
    setError(null);
    setSuccessMessage(null);
    try {
      const res = await api.superAdmin.importPlatformSql(sqlImportText);
      setSuccessMessage(
        res.message || 'Platform SQL script executed and imported successfully!'
      );
      setImportSqlModalOpen(false);
      await loadOverview();
      onTenantsUpdated();
    } catch (err: any) {
      setImportSqlError(err.message || 'Failed to import SQL script.');
    } finally {
      setImportingPlatformSql(false);
    }
  };

  const handleConfirmDeleteStore = async () => {
    if (!storeToDelete) return;
    const targetStore = storeToDelete;
    setDeletingStore(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const res = await api.superAdmin.deleteTenant(targetStore.id);
      const msg =
        res.message || `Store '${targetStore.name}' has been permanently deleted.`;
      setStores((prev) => prev.filter((s) => s.id !== targetStore.id));
      setStoreToDelete(null);
      setSuccessMessage(msg);
      await loadOverview();
      onTenantsUpdated();
    } catch (err: any) {
      setError(err.message || 'Failed to delete store tenant.');
    } finally {
      setDeletingStore(false);
    }
  };

  const handleCreateStore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStoreName.trim() || !newOwnerName.trim()) {
      setCreateStoreError('Enter both the store name and owner name.');
      return;
    }
    const normalizedOwnerEmail = toLowerTrimmed(newOwnerEmail);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizedOwnerEmail)) {
      setCreateStoreError('Enter a valid owner email address.');
      return;
    }
    if (newOwnerPassword.trim().length < 4) {
      setCreateStoreError('Owner password must be at least 4 characters.');
      return;
    }
    if (newOwnerPassword !== newOwnerConfirmPassword) {
      setCreateStoreError('Passwords do not match. Check the confirmation and try again.');
      return;
    }
    setCreatingStore(true);
    setCreateStoreError(null);
    setError(null);
    setSuccessMessage(null);
    try {
      const res = await api.superAdmin.createTenant({
        storeName: toTitleCaseTrimmed(newStoreName),
        ownerName: toTitleCaseTrimmed(newOwnerName),
        ownerEmail: normalizedOwnerEmail,
        password: newOwnerPassword,
        subscriptionPlan: newSubscriptionPlan,
        businessType: newBusinessType,
        pricingMode: newBusinessType === 'WHOLESALE' ? 'FIXED' : newPricingMode,
        minSellingQuantity: newBusinessType === 'WHOLESALE' ? newMinSellingQuantity : 1.0,
        allowHalfCarton: newBusinessType === 'WHOLESALE' ? newMinSellingQuantity <= 0.5 : true,
      });
      if (res.provisioned) {
        setProvisionedBanner(res.provisioned);
      }
      setSuccessMessage(
        `Store '${toTitleCaseTrimmed(newStoreName)}' provisioned successfully!`
      );
      setCreateModalOpen(false);
      setNewStoreName('');
      setNewOwnerName('');
      setNewOwnerEmail('');
      setNewOwnerPassword('admin123');
      setNewOwnerConfirmPassword('admin123');
      setNewSubscriptionPlan('free_tier');
      setNewBusinessType('RETAIL');
      setNewPricingMode('FIXED');
      setNewMinSellingQuantity(1.0);


      await loadOverview();
      onTenantsUpdated();
    } catch (err: any) {
      const message = err?.code === 'EMAIL_ALREADY_EXISTS'
        ? 'This email already belongs to an account, including the SuperAdmin account. Use a different email for this store owner.'
        : err.message || 'Failed to provision new store.';
      setCreateStoreError(message);
    } finally {
      setCreatingStore(false);
    }
  };

  const handleOpenEditSubscription = (store: SuperAdminStoreRow) => {
    setStoreToEditSub(store);
    setEditSubPlan(store.subscriptionPlan === 'free_tier' ? 'free_tier' : store.subscriptionPlan === '6_MONTHS' ? '6_MONTHS' : 'YEARLY');
    const rawEnd = store.subscriptionEndDate ? new Date(store.subscriptionEndDate) : new Date();
    const formattedDateInput = !Number.isNaN(rawEnd.getTime())
      ? rawEnd.toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    setEditSubEndDate(formattedDateInput);
    const currentStatus = (store.subscriptionStatus || store.status || 'ACTIVE').toUpperCase();
    setEditSubStatus(
      currentStatus === 'EXPIRED'
        ? 'EXPIRED'
        : currentStatus === 'SUSPENDED'
        ? 'SUSPENDED'
        : 'ACTIVE'
    );
  };

  const handleSaveSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeToEditSub) return;
    setSavingSub(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const endIso = editSubEndDate ? new Date(`${editSubEndDate}T23:59:59.999Z`).toISOString() : undefined;
      const res = await api.superAdmin.updateTenantSubscription(storeToEditSub.id, {
        subscriptionPlan: editSubPlan,
        subscriptionEndDate: endIso,
        subscriptionStatus: editSubStatus,
      });
      setSuccessMessage(
        res.message || `Updated subscription and expiry date for '${storeToEditSub.name}'.`
      );
      setStoreToEditSub(null);
      await loadOverview();
      onTenantsUpdated();
    } catch (err: any) {
      setError(err.message || 'Failed to update store subscription.');
    } finally {
      setSavingSub(false);
    }
  };

  // Render SuperAdmin Dedicated Login Screen aligned with Store Auth Page if not logged in as SUPERADMIN
  if (!isSuperAdmin) {
    return (
      <div className="min-h-screen w-full flex flex-col justify-between relative overflow-x-hidden bg-slate-200 dark:bg-[#0A0E1A] text-slate-900 dark:text-slate-100 font-sans selection:bg-purple-600 selection:text-white transition-colors duration-200">
        {/* Showroom Background Image Layer (aligned with Store Auth Page) */}
        <ShowroomBackground />

        {/* Top Application Bar with backdrop blur */}
        <PublicHeader
          storeName="POS SaaS C-Panel"
          badgeText="Control Plane Online"
          badgeVariant="online"
          subtitle="Multi-Tenant Retail POS Cloud • SuperAdmin Access"
          dbText="System Secure • Active"
        />

        {/* Main Content Area - Centered Login Form Card */}
        <main className="relative z-10 w-full flex-1 flex items-center justify-center px-4 py-8 sm:py-12">
          <div className="w-full max-w-md mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={isVisible ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 16, scale: 0.98 }}
              transition={{
                duration: 0.4,
                ease: [0.16, 1, 0.3, 1],
              }}
              className="w-full"
            >
              <div className="app-card bg-white/95 dark:bg-gradient-to-b dark:from-slate-900/95 dark:via-indigo-950/90 dark:to-slate-900/95 backdrop-blur-xl border border-purple-200/80 dark:border-purple-800/80 shadow-2xl shadow-purple-950/10 dark:shadow-[0_10px_35px_rgba(15,23,42,0.8),0_0_25px_rgba(147,51,234,0.2)] rounded-2xl sm:rounded-3xl p-6 sm:p-8 text-slate-800 dark:text-slate-100 transition-colors">
                {/* SuperAdmin Icon Header */}
                <div className="text-center mb-6">
                  <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-purple-600/30 dark:shadow-[0_0_14px_rgba(147,51,234,0.35)] border border-purple-400/40 dark:border-purple-400/50">
                    <Shield className="w-6 h-6" />
                  </div>
                  <h2
                    id="superadmin-auth-title"
                    className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight"
                  >
                    POS SaaS C-Panel
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-purple-200/80 mt-1 font-medium">
                    Platform SuperAdmin Control Plane
                  </p>
                </div>

                {/* Card Tabs Navigation - Responsive Scrollable Underline Navigation */}
                <div
                  style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                  className="flex items-center justify-between border-b border-slate-200/80 dark:border-purple-900/60 mb-6 overflow-x-auto no-scrollbar scrollbar-none tab-scrollbar-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden [&::-webkit-scrollbar-thumb]:hidden [&::-webkit-scrollbar-track]:hidden"
                >
                  <button
                    id="superadmin-tab-login"
                    type="button"
                    data-active={authTab === 'login'}
                    onClick={() => {
                      setAuthTab('login');
                      setAuthError(null);
                      setAuthInfo(null);
                      if (account.isShowingRemembered && account.rememberedEmail) {
                        setEmail(account.rememberedEmail);
                      }
                    }}
                    className={`tab-underline-link relative flex-1 py-3 text-xs sm:text-sm font-semibold transition-colors duration-300 flex items-center justify-center space-x-1.5 whitespace-nowrap cursor-pointer shrink-0 ${
                      authTab === 'login'
                        ? 'active text-purple-600 dark:text-purple-400 font-bold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-300'
                    }`}
                  >
                    <Fingerprint
                      className={`w-4 h-4 transition-colors duration-200 ${
                        authTab === 'login'
                          ? 'text-purple-600 dark:text-purple-400'
                          : 'text-slate-400 dark:text-slate-500'
                      }`}
                    />
                    <span>Sign In</span>
                    {authTab === 'login' && (
                      <motion.div
                        layoutId="superAdminAuthActiveUnderline"
                        className="absolute bottom-0 left-0 right-0 h-[3px] rounded-full bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 shadow-[0_2px_8px_rgba(147,51,234,0.45)] pointer-events-none z-10"
                        transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                      />
                    )}
                  </button>

                  <button
                    id="superadmin-tab-forgot"
                    type="button"
                    data-active={authTab === 'forgot' || authTab === 'reset'}
                    onClick={() => {
                      setAuthTab('forgot');
                      setAuthError(null);
                      setAuthInfo(null);
                    }}
                    className={`tab-underline-link relative flex-1 py-3 text-xs sm:text-sm font-semibold transition-colors duration-300 flex items-center justify-center space-x-1.5 whitespace-nowrap cursor-pointer shrink-0 ${
                      authTab === 'forgot' || authTab === 'reset'
                        ? 'active text-purple-600 dark:text-purple-400 font-bold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-300'
                    }`}
                  >
                    <KeyRound
                      className={`w-4 h-4 transition-colors duration-200 ${
                        authTab === 'forgot' || authTab === 'reset'
                          ? 'text-purple-600 dark:text-purple-400'
                          : 'text-slate-400 dark:text-slate-500'
                      }`}
                    />
                    <span>Reset PIN</span>
                    {(authTab === 'forgot' || authTab === 'reset') && (
                      <motion.div
                        layoutId="superAdminAuthActiveUnderline"
                        className="absolute bottom-0 left-0 right-0 h-[3px] rounded-full bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 shadow-[0_2px_8px_rgba(147,51,234,0.45)] pointer-events-none z-10"
                        transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                      />
                    )}
                  </button>
                </div>

                {/* Dynamic Header */}
                <div className="mb-4">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                    {authTab === 'login' && 'Sign in to SuperAdmin C-Panel'}
                    {authTab === 'forgot' && 'Reset SuperAdmin PIN / Password'}
                    {authTab === 'reset' && 'Create New SuperAdmin Password'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-purple-200/70 mt-0.5">
                    {authTab === 'login' &&
                      'Enter your SUPERADMIN credentials to manage tenant stores, toggle suspensions, and manage 30-day free trials.'}
                    {authTab === 'forgot' &&
                      'Provide your SuperAdmin email to generate an instant verification recovery code.'}
                    {authTab === 'reset' &&
                      'Enter your reset verification token and choose a new SuperAdmin password.'}
                  </p>
                </div>

                {/* Alerts */}
                {authError && (
                  <div className="mb-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                    <span className="leading-relaxed font-medium">{authError}</span>
                  </div>
                )}

                {authInfo && (
                  <div className="mb-4 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-xs flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span className="leading-relaxed font-medium">{authInfo}</span>
                  </div>
                )}

                {/* TAB 1: LOGIN FORM */}
                {authTab === 'login' && (
                  <form onSubmit={handleSuperAdminLogin} className="space-y-4">
                    <RememberedEmailField
                      account={account}
                      email={email}
                      onEmailChange={setEmail}
                      onAccountViewChange={() => {
                        setPassword('');
                        setAuthError(null);
                        setAuthInfo(null);
                      }}
                      inputId="superadmin-email-input"
                      label="SuperAdmin Email or ID"
                      placeholder="Enter SuperAdmin email"
                      disabled={authLoading}
                      inputClassName="app-input w-full bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-purple-800/60 focus:bg-white dark:focus:bg-slate-900 focus:border-purple-600 dark:focus:border-purple-400 focus:ring-2 focus:ring-purple-500/20 dark:focus:ring-purple-500/20 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-400 rounded-xl text-xs sm:text-sm font-medium py-2.5 pl-[2.125rem] pr-4 transition outline-none"
                    />

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                          Master PIN / Password
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setAuthTab('forgot');
                            setAuthError(null);
                          }}
                          className="text-xs font-semibold text-purple-600 hover:text-purple-800 dark:text-purple-300 dark:hover:text-purple-200 transition cursor-pointer"
                        >
                          Forgot Password?
                        </button>
                      </div>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-purple-600 dark:text-purple-400">
                          <Lock className="w-4 h-4" />
                        </div>
                        <input
                          id="superadmin-password-input"
                          name="password"
                          autoComplete="current-password"
                          type={showPassword ? 'text' : 'password'}
                          required
                          placeholder="••••••••"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="app-input w-full bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-purple-800/60 focus:bg-white dark:focus:bg-slate-900 focus:border-purple-600 dark:focus:border-purple-400 focus:ring-2 focus:ring-purple-500/20 dark:focus:ring-purple-500/20 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-400 rounded-xl text-xs sm:text-sm font-sans py-2.5 pl-[2.125rem] pr-9 transition outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-200 transition cursor-pointer"
                          title={showPassword ? 'Hide password' : 'Show password'}
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-slate-600 dark:text-purple-200/80 font-medium">
                        <input
                          type="checkbox"
                          checked={rememberMe}
                          onChange={(e) => setRememberMe(e.target.checked)}
                          className="w-4 h-4 rounded border-purple-300 dark:border-purple-600 dark:bg-[#0E1628] text-purple-600 accent-purple-600 focus:ring-0 cursor-pointer"
                        />
                        <span>Keep logged in</span>
                      </label>
                      <span className="text-[11px] text-slate-400 dark:text-purple-300/60 font-mono">
                        JWT Auth &bull; SUPERADMIN
                      </span>
                    </div>

                    <button
                      id="superadmin-login-submit-btn"
                      type="submit"
                      disabled={authLoading}
                      className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:via-indigo-700 hover:to-purple-800 dark:from-purple-600 dark:to-indigo-600 dark:hover:from-purple-500 dark:hover:to-indigo-500 text-white border border-purple-400/40 dark:border-purple-400/50 shadow-md shadow-purple-600/25 dark:shadow-[0_0_16px_rgba(147,51,234,0.35)] font-bold text-xs sm:text-sm transition active:scale-[0.99] disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                    >
                      {authLoading ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>Verifying SUPERADMIN JWT...</span>
                        </>
                      ) : (
                        <>
                          <span>Sign In to SuperAdmin C-Panel</span>
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </form>
                )}

                {/* TAB 2: FORGOT PASSWORD FORM */}
                {authTab === 'forgot' && (
                  <form onSubmit={handleSuperAdminForgot} className="space-y-4">
                    <p className="text-xs text-slate-500 dark:text-purple-200/70 leading-relaxed font-medium">
                      Enter your SuperAdmin email address. A one-time verification token will be generated to reset your master credentials.
                    </p>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                        SuperAdmin Email Address
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-purple-600 dark:text-purple-400">
                          <Mail className="w-4 h-4" />
                        </div>
                        <input
                          type="email"
                          required
                          placeholder="Enter SuperAdmin email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="app-input w-full bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-purple-800/60 focus:bg-white dark:focus:bg-slate-900 focus:border-purple-600 dark:focus:border-purple-400 focus:ring-2 focus:ring-purple-500/20 dark:focus:ring-purple-500/20 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-400 rounded-xl text-xs sm:text-sm font-medium py-2.5 pl-[2.125rem] pr-4 transition outline-none"
                        />
                      </div>
                    </div>

                    <div className="flex gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setAuthTab('login');
                          setAuthError(null);
                        }}
                        className="flex-1 py-2.5 px-4 rounded-xl bg-white hover:bg-purple-50/80 text-purple-700 hover:text-purple-800 border border-purple-200/90 shadow-xs hover:border-purple-300 dark:bg-slate-900/80 dark:hover:bg-purple-900/40 dark:border-purple-800/60 dark:text-purple-200 text-xs font-bold transition cursor-pointer"
                      >
                        Back to Sign In
                      </button>
                      <button
                        type="submit"
                        disabled={authLoading}
                        className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:via-indigo-700 hover:to-purple-800 dark:from-purple-600 dark:to-indigo-600 dark:hover:from-purple-500 dark:hover:to-indigo-500 text-white border border-purple-400/40 dark:border-purple-400/50 shadow-md shadow-purple-600/25 dark:shadow-[0_0_14px_rgba(147,51,234,0.3)] font-bold text-xs transition active:scale-[0.99] disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        {authLoading ? 'Requesting Token...' : 'Generate Reset Token'}
                      </button>
                    </div>
                  </form>
                )}

                {/* TAB 3: RESET PASSWORD FORM */}
                {authTab === 'reset' && (
                  <form onSubmit={handleSuperAdminResetPassword} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                        Verification Reset Token
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-purple-600 dark:text-purple-400">
                          <KeyRound className="w-4 h-4" />
                        </div>
                        <input
                          type="text"
                          required
                          value={resetToken}
                          onChange={(e) => setResetToken(e.target.value)}
                          placeholder="e.g. 7F3A9C12"
                          className="app-input w-full bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-purple-800/60 focus:bg-white dark:focus:bg-slate-900 focus:border-purple-600 dark:focus:border-purple-400 focus:ring-2 focus:ring-purple-500/20 dark:focus:ring-purple-500/20 text-slate-900 dark:text-white font-mono uppercase text-xs sm:text-sm rounded-xl py-2.5 pl-[2.125rem] pr-3 outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                        New Password
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-purple-600 dark:text-purple-400">
                          <Lock className="w-4 h-4" />
                        </div>
                        <input
                          type="password"
                          required
                          placeholder="Enter new password (min 6 characters)"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          className="app-input w-full bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-purple-800/60 focus:bg-white dark:focus:bg-slate-900 focus:border-purple-600 dark:focus:border-purple-400 focus:ring-2 focus:ring-purple-500/20 dark:focus:ring-purple-500/20 text-slate-900 dark:text-white text-xs sm:text-sm rounded-xl py-2.5 pl-[2.125rem] pr-3 outline-none font-medium"
                        />
                      </div>
                    </div>

                    <div className="flex gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setAuthTab('login');
                          setAuthError(null);
                        }}
                        className="flex-1 py-2.5 px-4 rounded-xl bg-white hover:bg-purple-50/80 text-purple-700 hover:text-purple-800 border border-purple-200/90 shadow-xs hover:border-purple-300 dark:bg-slate-900/80 dark:hover:bg-purple-900/40 dark:border-purple-800/60 dark:text-purple-200 text-xs font-bold transition cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={authLoading}
                        className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:via-indigo-700 hover:to-purple-800 dark:from-purple-600 dark:to-indigo-600 dark:hover:from-purple-500 dark:hover:to-indigo-500 text-white border border-purple-400/40 dark:border-purple-400/50 shadow-md shadow-purple-600/25 dark:shadow-[0_0_14px_rgba(147,51,234,0.3)] font-bold text-xs transition active:scale-[0.99] disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        {authLoading ? 'Updating...' : 'Save New Password'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </motion.div>
          </div>
        </main>

        {/* Bottom Global Footer */}
        <PublicFooter
          storeName="POS SaaS C-Panel"
          subtitle="Multi-Tenant Retail POS & Inventory Control Plane"
        />
      </div>
    );
  }

  // Filter stores & requests based on search query and status filter
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredStores = stores.filter((s) => {
    if (statusFilter !== 'ALL') {
      if (statusFilter === 'ONLINE') {
        const isMiddlewareActive =
          s.status === 'ACTIVE' &&
          s.subscriptionStatus === 'ACTIVE' &&
          s.isOnline !== false;
        if (!isMiddlewareActive) return false;
      } else if (statusFilter === 'EXPIRED') {
        if (s.status !== 'EXPIRED' && s.subscriptionStatus !== 'EXPIRED') return false;
      } else if (s.status !== statusFilter && s.subscriptionStatus !== statusFilter) {
        return false;
      }
    }
    if (!normalizedSearch) return true;
    return (
      (s.name || '').toLowerCase().includes(normalizedSearch) ||
      (s.ownerEmail || '').toLowerCase().includes(normalizedSearch)
    );
  });

  const filteredTrials = trialActivations.filter((t) => {
    if (trialStatusFilter !== 'ALL' && t.status !== trialStatusFilter) return false;
    if (!normalizedSearch) return true;
    return (
      (t.storeName || '').toLowerCase().includes(normalizedSearch) ||
      (t.email || '').toLowerCase().includes(normalizedSearch) ||
      (t.userName || '').toLowerCase().includes(normalizedSearch)
    );
  });

  const activeTrialsCount = trialActivations.filter((t) => {
    const ends = t.trialEndDate ? new Date(t.trialEndDate).getTime() : 0;
    return ends > Date.now() && t.status !== 'EXPIRED';
  }).length;

  const formattedDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const sidebarSections = [
    {
      header: 'TENANT & STORE CONTROL',
      items: [
        {
          id: 'stores' as SuperAdminTab,
          label: 'Deployed Stores',
          icon: Store,
          shortcut: 'F1',
          badge: String(stores.length),
        },
        {
          id: 'trials' as SuperAdminTab,
          label: 'Trial Activations',
          icon: Sparkles,
          shortcut: 'F2',
          badge: (metrics.activeTrials || activeTrialsCount) > 0 ? String(metrics.activeTrials || activeTrialsCount) : undefined,
          badgeTone: 'purple',
        },
        {
          id: 'notifications' as SuperAdminTab,
          label: 'Custom Notifications',
          icon: Megaphone,
          shortcut: 'F3',
          badge: notificationsList.length > 0 ? String(notificationsList.length) : undefined,
          badgeTone: 'purple',
        },
      ],
    },
    {
      header: 'PLATFORM & ANALYTICS',
      items: [
        {
          id: 'reports' as SuperAdminTab,
          label: 'Reports & Analytics',
          icon: BarChart3,
          shortcut: 'F4',
        },
        {
          id: 'manifests' as SuperAdminTab,
          label: 'Scoped Manifests',
          icon: FileCode2,
          shortcut: 'F5',
        },
        {
          id: 'settings' as SuperAdminTab,
          label: 'App & Environment Config',
          icon: Sliders,
          shortcut: 'F6',
        },
      ],
    },
  ];

  const renderSuperAdminSidebar = (isMobile: boolean = false) => {
    const collapsed = !isMobile && isCollapsed;

    return (
      <div
        className={`w-full h-full max-h-screen flex flex-col bg-white/95 dark:bg-[#0D1322] backdrop-blur-lg text-slate-700 dark:text-slate-100 select-none border-r border-indigo-500/20 shadow-lg rounded-none overflow-y-auto overflow-x-hidden sidebar-scrollbar transition-colors ${
          collapsed ? 'px-2' : ''
        }`}
      >
        {/* TOP: Brand Header aligned with top Header bar (exact h-[3.6rem] with matching border-b) */}
        <div
          className={`h-[3.6rem] flex items-center justify-between border-b border-indigo-500/20 shrink-0 ${
            collapsed ? 'px-2 justify-center' : 'px-3.5 sm:px-4'
          }`}
        >
          <div className={`flex items-center gap-2.5 min-w-0 ${collapsed ? 'justify-center w-full' : ''}`}>
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-sm border border-purple-400/30">
              <Shield className="w-4 h-4" />
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <h1 className="text-xs font-bold text-slate-900 dark:text-white truncate tracking-tight leading-tight">
                  POS SaaS C-Panel
                </h1>
                <p className="text-[10px] text-slate-500 dark:text-indigo-200/70 font-medium truncate mt-0.5">
                  SuperAdmin Control Plane
                </p>
              </div>
            )}
          </div>

          {isMobile && (
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 transition cursor-pointer"
              aria-label="Close Mobile Navigation"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          {!isMobile && !collapsed && (
            <button
              type="button"
              onClick={toggleCollapse}
              className="p-1.5 text-slate-400 hover:text-purple-600 dark:hover:text-purple-300 rounded-lg hover:bg-purple-50 dark:hover:bg-white/10 transition cursor-pointer"
              title="Collapse sidebar (Ctrl+B)"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          )}

          {!isMobile && collapsed && (
            <button
              type="button"
              onClick={toggleCollapse}
              className="p-1 text-slate-400 hover:text-purple-600 dark:hover:text-purple-300 rounded-lg hover:bg-purple-50 dark:hover:bg-white/10 transition cursor-pointer"
              title="Expand sidebar (Ctrl+B)"
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* TOP ITEM: Dashboard Overview */}
        <div className={`pt-2.5 pb-1 ${collapsed ? 'px-1' : 'px-3'}`}>
          <div className="relative">
            <motion.button
              type="button"
              onClick={() => {
                setActiveTab('dashboard');
                if (isMobile) setMobileMenuOpen(false);
              }}
              whileTap={{ scale: 0.98 }}
              className={`relative w-full flex items-center ${
                collapsed ? 'justify-center p-2.5' : 'justify-between px-3 py-2'
              } rounded-xl text-xs font-semibold cursor-pointer group transition-colors duration-150 ${
                activeTab === 'dashboard'
                  ? 'text-white font-bold'
                  : 'text-slate-600 dark:text-slate-300 hover:text-purple-600 dark:hover:text-purple-300 hover:bg-purple-50/70 dark:hover:bg-purple-950/30'
              }`}
            >
              {activeTab === 'dashboard' && (
                <motion.div
                  layoutId={isMobile ? 'superAdminMobilePill' : 'superAdminActiveNavPill'}
                  className="absolute inset-0 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 dark:from-purple-600 dark:to-indigo-600 border border-purple-400/40 dark:border-purple-400/50 shadow-md shadow-purple-600/25 dark:shadow-[0_0_16px_rgba(147,51,234,0.35)]"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}

              <div className="relative z-10 flex items-center gap-3">
                <LayoutDashboard
                  className={`w-4 h-4 shrink-0 transition-transform duration-200 ${
                    activeTab === 'dashboard'
                      ? 'text-white'
                      : 'text-slate-500 dark:text-slate-400 group-hover:scale-110'
                  }`}
                />
                {!collapsed && <span>Dashboard</span>}
              </div>
            </motion.button>
          </div>
        </div>

        {/* MIDDLE: Navigation Sections */}
        <div className={`py-1 space-y-2.5 ${collapsed ? 'px-1' : 'px-3'}`}>
          {sidebarSections.map((section) => (
            <div key={section.header} className="space-y-1">
              {!collapsed ? (
                <div className="text-[10px] font-bold text-slate-400 dark:text-indigo-300/70 uppercase tracking-wider px-2 py-0.5">
                  {section.header}
                </div>
              ) : (
                <div className="w-8 h-px bg-indigo-500/20 mx-auto my-2" />
              )}

              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const ItemIcon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <div key={item.id} className="relative">
                      <motion.button
                        type="button"
                        onClick={() => {
                          setActiveTab(item.id);
                          if (isMobile) setMobileMenuOpen(false);
                        }}
                        whileTap={{ scale: 0.98 }}
                        className={`relative w-full flex items-center ${
                          collapsed ? 'justify-center p-2.5' : 'justify-between px-3 py-2'
                        } rounded-xl text-xs font-medium cursor-pointer group transition-colors duration-150 ${
                          isActive
                            ? 'text-white font-bold'
                            : 'text-slate-600 dark:text-slate-300 hover:text-purple-600 dark:hover:text-purple-300 hover:bg-purple-50/70 dark:hover:bg-purple-950/30'
                        }`}
                      >
                        {isActive && (
                          <motion.div
                            layoutId={isMobile ? 'superAdminMobilePill' : 'superAdminActiveNavPill'}
                            className="absolute inset-0 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 dark:from-purple-600 dark:to-indigo-600 border border-purple-400/40 dark:border-purple-400/50 shadow-md shadow-purple-600/25 dark:shadow-[0_0_16px_rgba(147,51,234,0.35)]"
                            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                          />
                        )}

                        <div className="relative z-10 flex items-center gap-3 truncate">
                          <ItemIcon
                            className={`w-4 h-4 shrink-0 transition-transform duration-200 ${
                              isActive
                                ? 'text-white'
                                : 'text-slate-500 dark:text-slate-400 group-hover:translate-x-0.5'
                            }`}
                          />
                          {!collapsed && <span className="truncate">{item.label}</span>}
                        </div>

                        {!collapsed && (
                          <div className="relative z-10 flex items-center gap-1.5">
                            {(item as any).badge && (
                              <span
                                className={`text-[9.5px] font-mono font-bold px-1.5 py-0.5 rounded-md ${
                                  isActive
                                    ? 'bg-white/25 text-white'
                                    : (item as any).badgeTone === 'amber'
                                    ? 'bg-amber-500/15 text-amber-600 dark:text-amber-300 border border-amber-500/30'
                                    : 'bg-purple-500/15 text-purple-600 dark:text-purple-300'
                                }`}
                              >
                                {(item as any).badge}
                              </span>
                            )}
                            {item.shortcut && (
                              <kbd
                                className={`text-[9.5px] font-mono font-bold px-1.5 py-0.5 rounded-md transition ${
                                  isActive
                                    ? 'bg-white/20 text-white border border-white/30'
                                    : 'bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-300 border border-slate-200 dark:border-indigo-500/20'
                                }`}
                              >
                                {item.shortcut}
                              </kbd>
                            )}
                          </div>
                        )}
                      </motion.button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Quick Action: Provision Store */}
          <div className="space-y-1 pt-1">
            {!collapsed && (
              <div className="text-[10px] font-bold text-slate-400 dark:text-indigo-300/70 uppercase tracking-wider px-2 py-0.5">
                PROVISIONING &amp; STORES
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                setCreateModalOpen(true);
                if (isMobile) setMobileMenuOpen(false);
              }}
              className={`w-full flex items-center ${
                collapsed ? 'justify-center p-2.5' : 'justify-between px-3 py-2'
              } rounded-xl text-xs font-semibold text-purple-700 dark:text-purple-300 bg-purple-50/80 hover:bg-purple-100 dark:bg-purple-950/30 dark:hover:bg-purple-900/40 border border-purple-200/80 dark:border-purple-800/50 transition cursor-pointer`}
            >
              <div className="flex items-center gap-2.5 truncate">
                <Plus className="w-4 h-4 shrink-0 text-purple-600 dark:text-purple-400" />
                {!collapsed && <span className="truncate">Provision New Store</span>}
              </div>
              {!collapsed && (
                <kbd className="text-[9.5px] font-mono font-bold px-1.5 py-0.5 rounded-md bg-white dark:bg-white/10 text-purple-700 dark:text-purple-200 border border-purple-200 dark:border-purple-700/50">
                  F3
                </kbd>
              )}
            </button>

            {/* Quick Store Jump List */}
            {!collapsed && stores.length > 0 && (
              <div className="pt-1.5 space-y-1">
                {stores.slice(0, 5).map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => {
                      onOpenStore(st.id);
                      if (isMobile) setMobileMenuOpen(false);
                    }}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:text-purple-600 dark:hover:text-purple-300 hover:bg-slate-100/80 dark:hover:bg-white/5 transition cursor-pointer group"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{
                          backgroundColor: st.status === 'ACTIVE' ? '#10B981' : '#F43F5E',
                        }}
                      />
                      <span className="truncate font-semibold">{st.name}</span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 group-hover:text-purple-500">
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* BOTTOM: SuperAdmin Profile, PWA Manifest, Theme & Database Status (identical to Store Sidebar) */}
        <div
          className={`border-t border-indigo-500/20 space-y-2 bg-slate-50/40 dark:bg-[#090E18] backdrop-blur-md mt-auto transition-colors ${
            collapsed ? 'p-2 pt-3' : 'p-3.5 pt-3'
          }`}
        >
          {/* User Card */}
          <button
            type="button"
            onClick={handleOpenProfile}
            title="Edit SuperAdmin Profile & Security"
            className={`w-full flex items-center rounded-xl bg-white/80 hover:bg-white dark:bg-[#131B2E] dark:hover:bg-[#1A263D] border border-indigo-500/20 hover:border-purple-500/40 transition shadow-xs cursor-pointer text-left ${
              collapsed ? 'justify-center p-2 relative' : 'justify-between p-2'
            }`}
          >
            <div className={`flex items-center gap-2.5 min-w-0 ${collapsed ? 'justify-center' : ''}`}>
              <div className="relative shrink-0">
                <UserAvatar
                  name={currentUser?.name || 'Platform SuperAdmin'}
                  avatarUrl={currentUser?.avatarUrl}
                  role="ADMIN"
                  size="sm"
                />
                <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-[#0D1322]" />
              </div>
              {!collapsed && (
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                    {currentUser?.name || 'Platform SuperAdmin'}
                  </div>
                  <div className="text-[10px] text-purple-600 dark:text-purple-300 font-mono font-semibold truncate">
                    SUPERADMIN
                  </div>
                </div>
              )}
            </div>

            {!collapsed && (
              <div className="text-slate-400 hover:text-purple-600 dark:text-slate-500 dark:hover:text-purple-300 transition-colors">
                <UserCog className="w-3.5 h-3.5" />
              </div>
            )}
          </button>

          {/* Dedicated SuperAdmin PWA Badge */}
          <div
            className={`w-full flex items-center rounded-xl bg-indigo-50/60 dark:bg-indigo-500/10 border border-indigo-500/20 text-indigo-700 dark:text-indigo-300 transition shadow-xs ${
              collapsed ? 'justify-center p-2 relative' : 'justify-between px-2.5 py-1.5'
            }`}
            title="Dedicated SuperAdmin PWA"
          >
            <div className="flex items-center gap-2">
              <FileCode2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
              {!collapsed && <span className="text-[11px] font-bold">POS Admin PWA</span>}
            </div>
            {!collapsed && (
              <span className="text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded bg-white dark:bg-[#070B14] text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                PWA
              </span>
            )}
          </div>

          {/* Theme Toggle & Database Connected Status */}
          <div className="space-y-1.5 pt-1">
            <button
              type="button"
              onClick={toggleTheme}
              className={`w-full flex items-center rounded-lg bg-slate-100/80 hover:bg-slate-200/80 dark:bg-[#0E1628] dark:hover:bg-[#131D33] border border-indigo-500/20 text-[11px] text-slate-700 dark:text-slate-200 transition cursor-pointer ${
                collapsed ? 'justify-center p-2' : 'justify-between px-2 py-1.5'
              }`}
              title={`Current theme: ${theme}. Click to toggle`}
            >
              <div className="flex items-center gap-1.5 font-medium">
                {theme === 'dark' ? (
                  <Moon className="w-3 h-3 text-purple-400 shrink-0" />
                ) : (
                  <Sun className="w-3 h-3 text-purple-600 shrink-0" />
                )}
                {!collapsed && <span>Theme</span>}
              </div>
              {!collapsed && (
                <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-white dark:bg-[#070B14] text-slate-600 dark:text-cyan-300 border border-indigo-500/20">
                  {theme === 'dark' ? 'Dark' : 'Light'}
                </span>
              )}
            </button>

            <div
              className={`flex items-center rounded-lg bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-500/20 text-[10.5px] ${
                collapsed ? 'justify-center p-2' : 'justify-between px-2 py-1'
              }`}
            >
              <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-semibold">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                {!collapsed && (
                  <span className="flex items-center gap-1 truncate">
                    <ShieldCheck className="w-3 h-3 shrink-0" />
                    Platform: Online
                  </span>
                )}
              </div>
              {!collapsed && (
                <span className="text-[9.5px] font-mono text-emerald-600 dark:text-emerald-400">Connected</span>
              )}
            </div>

            {!collapsed && (
              <div className="flex items-center justify-between px-2 py-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                <div className="flex items-center gap-1.5">
                  <Keyboard className="w-3 h-3 text-slate-400" />
                  <span>Shortcuts:</span>
                </div>
                <span className="font-mono text-slate-600 dark:text-slate-300 font-semibold">F1 - F5 • Ctrl+B</span>
              </div>
            )}

            {!collapsed && (
              <div className="px-2 pt-1 border-t border-indigo-500/15 flex items-center justify-between text-[9.5px] text-slate-400 dark:text-slate-500">
                <span>POS SaaS C-Panel</span>
                <span className="font-mono">v1.0.0</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="saas-panel flex w-full min-h-screen bg-[#F8FAFC] dark:bg-[#0A0E1A] text-slate-900 dark:text-slate-100 transition-colors">
      {/* DESKTOP FIXED SIDEBAR WITH SMOOTH SPRING WIDTH TRANSITION */}
      <motion.aside
        initial={false}
        animate={{ width: isCollapsed ? 72 : 256 }}
        transition={{ type: 'spring', stiffness: 350, damping: 32 }}
        className="hidden lg:flex shrink-0 h-screen sticky top-0 z-30 no-print overflow-hidden rounded-none shadow-lg border-r border-indigo-500/20"
      >
        {renderSuperAdminSidebar(false)}
      </motion.aside>

      {/* MOBILE DRAWER */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden flex no-print">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-xs cursor-pointer"
              onClick={() => setMobileMenuOpen(false)}
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              className="relative w-72 max-w-[85vw] h-full max-h-screen shadow-2xl z-10 overflow-hidden rounded-none border-r border-indigo-500/20"
            >
              {renderSuperAdminSidebar(true)}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* RIGHT COLUMN: TOP HEADER + MAIN WORKSPACE + FOOTER (Aligned with Store Page) */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen bg-[#F8FAFC] dark:bg-[#0A0E1A]">
        {/* STICKY TOP HEADER BAR (Exact h-[3.6rem] aligned with Store Header.tsx) */}
        <header className="h-[3.6rem] sticky top-0 z-20 bg-white/95 dark:bg-[#0D1322]/95 backdrop-blur-lg border-b border-indigo-500/20 px-3 sm:px-6 flex items-center justify-between gap-3 shrink-0 shadow-2xs transition-colors">
          {/* Left: Mobile Menu Button + Active Section Title */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 transition cursor-pointer"
              aria-label="Open Navigation Drawer"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2.5 min-w-0">
              <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-50 dark:bg-purple-500/15 border border-purple-200 dark:border-purple-500/30 text-purple-700 dark:text-purple-300 text-xs font-mono font-bold">
                <Shield className="w-3.5 h-3.5" />
                SuperAdmin
              </span>
              <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
                {activeTab === 'dashboard' && 'SuperAdmin Executive Dashboard'}
                {activeTab === 'stores' && 'Deployed Stores & Middleware Control'}
                {(activeTab === 'trials' || (activeTab as any) === 'requests') && '30-Day Free Trial Activations & Extensions'}
                {activeTab === 'notifications' && 'Custom Announcements & Broadcast Notifications'}
                {activeTab === 'reports' && 'Platform Reports, Top Revenue Stores & Top Products'}
                {activeTab === 'manifests' && 'Scoped Tenant PWA Manifests'}
                {activeTab === 'settings' && 'App & Environment Settings (app_settings)'}
              </h2>
            </div>
          </div>

          {/* Center: Quick Filter Search Input (aligned with Store Header Quick Search) */}
          <div className="hidden lg:flex items-center flex-1 max-w-xs xl:max-w-sm mx-2">
            <div className="relative w-full">
              <Search className="w-4 h-4 text-slate-400 dark:text-purple-300/70 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search stores or owners..."
                className="w-full pl-9 pr-8 py-1.5 rounded-xl bg-slate-100/90 dark:bg-[#131B2E] border border-slate-200/90 dark:border-indigo-500/30 text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-purple-500 transition"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Right: Actions, Notifications Dropdown, Tools Dropdown, Refresh, Theme, User Profile */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Primary Action: Add Store */}
            <button
              type="button"
              onClick={() => setCreateModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:to-indigo-800 text-white text-xs font-bold shadow-xs shadow-purple-600/20 transition cursor-pointer shrink-0"
              title="Add New Store Tenant"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Add Store</span>
            </button>

            {/* Platform Tools Dropdown (Send Notification, Import Data, Export All Backup) */}
            <div ref={toolsMenuRef} className="relative shrink-0">
              <button
                type="button"
                onClick={() => {
                  setShowToolsDropdown((prev) => !prev);
                  setShowNotifDropdown(false);
                  setShowUserDropdown(false);
                }}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer border ${
                  showToolsDropdown
                    ? 'bg-purple-100 dark:bg-purple-500/30 text-purple-800 dark:text-white border-purple-300 dark:border-purple-400/50'
                    : 'bg-slate-100 hover:bg-slate-200/80 dark:bg-[#131B2E] dark:hover:bg-[#1A263D] border-slate-200/80 dark:border-indigo-500/20 text-slate-700 dark:text-slate-200'
                }`}
                title="Data & Broadcast Tools"
                aria-expanded={showToolsDropdown}
                aria-haspopup="true"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 shrink-0" />
                <span className="hidden md:inline">Tools</span>
                <ChevronDown className={`w-3 h-3 opacity-60 transition-transform ${showToolsDropdown ? 'rotate-180' : ''}`} />
              </button>

              <AnimatePresence>
                {showToolsDropdown && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -6 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -6 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full mt-2 w-60 bg-white dark:bg-[#120726] border border-slate-200 dark:border-purple-400/40 rounded-xl shadow-2xl p-1.5 z-50 backdrop-blur-md space-y-1"
                  >
                    <div className="px-2.5 py-1 text-[10px] font-bold text-slate-400 dark:text-purple-300/70 uppercase tracking-wider">
                      Platform Tools
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setNotifError(null);
                        setNotificationModalOpen(true);
                        setShowToolsDropdown(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 text-xs font-medium rounded-lg text-slate-700 dark:text-purple-200 hover:bg-purple-50 dark:hover:bg-purple-950/40 hover:text-purple-700 dark:hover:text-white transition cursor-pointer text-left"
                    >
                      <Megaphone className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-slate-900 dark:text-white">Send Notification</div>
                        <div className="text-[10px] text-slate-500 dark:text-purple-300/70 truncate">Broadcast announcement to stores</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setImportSqlError(null);
                        setImportSqlModalOpen(true);
                        setShowToolsDropdown(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 text-xs font-medium rounded-lg text-slate-700 dark:text-purple-200 hover:bg-sky-50 dark:hover:bg-sky-950/40 hover:text-sky-700 dark:hover:text-white transition cursor-pointer text-left"
                    >
                      <Upload className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-slate-900 dark:text-white">Import Data</div>
                        <div className="text-[10px] text-slate-500 dark:text-purple-300/70 truncate">Import multi-store .SQL backup</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        handleExportPlatformSql();
                        setShowToolsDropdown(false);
                      }}
                      disabled={exportingPlatform}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 text-xs font-medium rounded-lg text-slate-700 dark:text-purple-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-700 dark:hover:text-white transition cursor-pointer text-left disabled:opacity-50"
                    >
                      <Download className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-slate-900 dark:text-white">
                          {exportingPlatform ? 'Exporting...' : 'Export All Backup'}
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-purple-300/70 truncate">Download platform SQL dump</div>
                      </div>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* SUPERADMIN NOTIFICATIONS DROPDOWN MENU */}
            <div ref={notifMenuRef} className="relative shrink-0">
              <button
                type="button"
                onClick={() => {
                  setShowNotifDropdown((prev) => !prev);
                  setShowToolsDropdown(false);
                  setShowUserDropdown(false);
                }}
                className={`relative p-2 rounded-xl transition cursor-pointer border ${
                  showNotifDropdown
                    ? 'bg-purple-100 dark:bg-purple-500/30 text-purple-800 dark:text-white border-purple-300 dark:border-purple-400/50 ring-2 ring-purple-400/40'
                    : 'bg-slate-100 hover:bg-slate-200/80 dark:bg-[#131B2E] dark:hover:bg-[#1A263D] border-slate-200/80 dark:border-indigo-500/20 text-slate-600 dark:text-slate-200'
                }`}
                title="SuperAdmin Notifications (Renewals & Trials)"
                aria-label="SuperAdmin Notifications"
                aria-expanded={showNotifDropdown}
                aria-haspopup="true"
              >
                {unreadSuperAdminNotifsCount > 0 ? (
                  <BellRing className="w-4 h-4 text-purple-600 dark:text-purple-300 animate-pulse" />
                ) : (
                  <Bell className="w-4 h-4" />
                )}
                {unreadSuperAdminNotifsCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-rose-500 text-white text-[10px] font-extrabold shadow-sm ring-2 ring-white dark:ring-[#0D1322]">
                    {unreadSuperAdminNotifsCount > 99 ? '99+' : unreadSuperAdminNotifsCount}
                  </span>
                )}
              </button>

              <AnimatePresence>
                {showNotifDropdown && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -6 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -6 }}
                    transition={{ duration: 0.16 }}
                    className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-purple-500/30 rounded-2xl shadow-2xl z-50 backdrop-blur-md overflow-hidden flex flex-col"
                  >
                    {/* Header */}
                    <div className="p-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-900/70">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                            SuperAdmin Notifications
                          </h3>
                          {unreadSuperAdminNotifsCount > 0 && (
                            <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                              {unreadSuperAdminNotifsCount} new
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                          Renewals, free trials &amp; system alerts
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={handleMarkAllNotifsRead}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-purple-600 dark:text-slate-400 dark:hover:text-purple-300 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition cursor-pointer text-[11px] flex items-center gap-1"
                          title="Mark all as read"
                        >
                          <CheckCheck className="w-3.5 h-3.5" />
                          <span className="text-[10px] font-semibold hidden sm:inline">Mark read</span>
                        </button>
                        <button
                          type="button"
                          onClick={loadNotifications}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-purple-600 dark:text-slate-400 dark:hover:text-purple-300 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition cursor-pointer"
                          title="Refresh notifications"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${loadingNotifications ? 'animate-spin text-purple-600' : ''}`} />
                        </button>
                      </div>
                    </div>

                    {/* Filter Pills */}
                    <div className="px-3 pt-2 pb-1.5 flex items-center gap-1 border-b border-slate-100 dark:border-slate-800 overflow-x-auto text-[11px] bg-white dark:bg-[#0F172A]">
                      {(
                        [
                          { id: 'ALL', label: 'All' },
                          { id: 'RENEWALS', label: 'Renewals' },
                          { id: 'TRIALS', label: 'Trials' },
                          { id: 'ANNOUNCEMENTS', label: 'Broadcasts' },
                        ] as const
                      ).map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => setNotifMenuFilter(f.id)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                            notifMenuFilter === f.id
                              ? 'bg-purple-600 text-white shadow-xs'
                              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>

                    {/* Notifications List */}
                    <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80">
                      {filteredNotifsList.length === 0 ? (
                        <div className="p-8 text-center text-slate-400 dark:text-slate-500 space-y-2">
                          <Bell className="w-8 h-8 mx-auto opacity-30 stroke-[1.5]" />
                          <div className="text-xs font-bold text-slate-600 dark:text-slate-400">
                            No notifications right now
                          </div>
                          <p className="text-[11px] text-slate-400 dark:text-slate-500">
                            All subscription renewals and store registrations are up to date.
                          </p>
                        </div>
                      ) : (
                        filteredNotifsList.map((item) => (
                          <div
                            key={item.id}
                            onClick={() => handleMarkNotifRead(item.id)}
                            className={`p-3 transition-colors flex gap-2.5 text-xs hover:bg-slate-50/80 dark:hover:bg-slate-800/50 cursor-pointer ${
                              item.isUnread ? 'bg-purple-50/30 dark:bg-purple-950/20' : ''
                            }`}
                          >
                            {/* Category Icon */}
                            <div className="mt-0.5 shrink-0">
                              {item.category === 'RENEWAL' ? (
                                <div className="w-7 h-7 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center justify-center">
                                  <CreditCard className="w-3.5 h-3.5" />
                                </div>
                              ) : item.category === 'TRIAL' ? (
                                <div className="w-7 h-7 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center justify-center">
                                  <Sparkles className="w-3.5 h-3.5" />
                                </div>
                              ) : (
                                <div className="w-7 h-7 rounded-lg bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30 flex items-center justify-center">
                                  <Megaphone className="w-3.5 h-3.5" />
                                </div>
                              )}
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0 space-y-1">
                              <div className="flex items-center justify-between gap-1.5">
                                <span className="font-bold text-slate-900 dark:text-white truncate text-xs">
                                  {item.title}
                                </span>
                                {item.isUnread && (
                                  <span className="w-2 h-2 rounded-full bg-purple-600 dark:bg-purple-400 shrink-0" />
                                )}
                              </div>

                              <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-snug line-clamp-2">
                                {item.message}
                              </p>

                              <div className="flex items-center justify-between pt-1 gap-2 flex-wrap">
                                <div className="flex items-center gap-1.5 text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                                  <span>{item.storeName}</span>
                                  <span>&bull;</span>
                                  <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                                </div>

                                {item.onAction && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      item.onAction?.();
                                    }}
                                    className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-600 hover:bg-purple-700 text-white transition cursor-pointer"
                                  >
                                    {item.actionLabel || 'Manage'}
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Footer */}
                    <div className="p-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between text-[11px]">
                      <button
                        type="button"
                        onClick={() => {
                          setShowNotifDropdown(false);
                          setActiveTab('trials');
                        }}
                        className="text-purple-600 dark:text-purple-400 font-bold hover:underline px-2 py-1 cursor-pointer"
                      >
                        View All Trials
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowNotifDropdown(false);
                          setNotifError(null);
                          setNotificationModalOpen(true);
                        }}
                        className="text-slate-500 dark:text-slate-400 font-semibold hover:text-slate-700 dark:hover:text-white px-2 py-1 cursor-pointer"
                      >
                        + New Announcement
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <button
              type="button"
              onClick={loadOverview}
              disabled={loading}
              title="Refresh platform telemetry"
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200/80 dark:bg-[#131B2E] dark:hover:bg-[#1A263D] border border-slate-200/80 dark:border-indigo-500/20 text-slate-600 dark:text-slate-200 transition cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-purple-600 dark:text-purple-400' : ''}`} />
            </button>

            <ThemeDropdown />

            {/* User Avatar + Name + Dropdown Chevron (Aligned with store user identification dropdown) */}
            <div ref={userMenuRef} className="relative">
              <button
                id="superadmin-user-menu-trigger"
                type="button"
                onClick={() => setShowUserDropdown((prev) => !prev)}
                className={`h-8 sm:h-8.5 flex items-center gap-2 px-2.5 sm:px-3 py-1 rounded-lg transition-all duration-200 cursor-pointer border text-xs ${
                  showUserDropdown
                    ? 'bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 text-white border-purple-400/50 ring-2 ring-purple-400/50 shadow-md shadow-purple-600/25 dark:shadow-[0_0_16px_rgba(147,51,234,0.4)]'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200 dark:text-purple-200 dark:hover:text-white dark:bg-purple-500/20 dark:hover:bg-purple-500/30 dark:border-purple-400/40 dark:shadow-[0_0_14px_rgba(147,51,234,0.2)]'
                }`}
                aria-label="SuperAdmin User menu"
                aria-expanded={showUserDropdown}
                aria-haspopup="true"
              >
                <UserIcon className="w-3.5 h-3.5 stroke-[2] shrink-0 text-current opacity-90" />
                <span
                  className={`hidden sm:inline-block text-xs font-bold max-w-[130px] truncate ${
                    showUserDropdown ? 'text-white' : 'text-slate-800 dark:text-purple-200'
                  }`}
                >
                  {currentUser?.name || 'SuperAdmin'}
                </span>
                <ChevronDown
                  className={`w-3 h-3 transition-transform duration-200 ease-out opacity-75 ${
                    showUserDropdown ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {/* User Profile Dropdown Menu */}
              <AnimatePresence>
                {showUserDropdown && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.94, y: -8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.94, y: -8 }}
                    transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                    style={{ transformOrigin: 'top right' }}
                    className="absolute right-0 left-auto top-full mt-2 w-68 sm:w-76 bg-white dark:bg-[#120726] border border-slate-200 dark:border-purple-400/40 rounded-xl shadow-2xl dark:shadow-[0_0_25px_rgba(147,51,234,0.25)] p-2.5 z-50 backdrop-blur-md space-y-1.5"
                  >
                    {/* Unified Identity & Role Card */}
                    <div className="p-2.5 rounded-lg bg-slate-50/80 dark:bg-gradient-to-r dark:from-purple-900 dark:via-indigo-950 dark:to-slate-900 border border-slate-100 dark:border-purple-800/80 dark:text-white transition-colors mb-0.5 space-y-2">
                      <div className="flex items-center gap-3">
                        <UserAvatar
                          name={currentUser?.name || 'SuperAdmin'}
                          avatarUrl={currentUser?.avatarUrl}
                          role="SUPERADMIN"
                          size="lg"
                          className="shrink-0 rounded-full ring-2 ring-purple-500/40 shadow-md"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate leading-tight">
                            {currentUser?.name || 'Platform SuperAdmin'}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-purple-200/80 truncate leading-tight mt-0.5">
                            {currentUser?.email || 'superadmin@sarbaazsoft.com'}
                          </div>
                        </div>
                      </div>

                      {/* Role Card */}
                      <div className="p-2 rounded-lg bg-purple-50/90 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-500/30 text-purple-900 dark:text-purple-200 space-y-1.5 dark:shadow-[0_0_10px_rgba(147,51,234,0.15)] backdrop-blur-xs">
                        <div className="flex items-center justify-between gap-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <ShieldCheck className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 shrink-0" />
                            <span className="text-[10px] font-bold tracking-wide uppercase truncate">
                              Role: SuperAdmin
                            </span>
                          </div>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-bold bg-purple-600 text-white dark:bg-purple-400 dark:text-purple-950 uppercase tracking-wider shrink-0">
                            <span className="w-1.5 h-1.5 rounded-full bg-white dark:bg-purple-950 animate-pulse" />
                            Root Access
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Profile & Security Item */}
                    <button
                      type="button"
                      id="superadmin-profile-security-btn"
                      onClick={() => {
                        setShowUserDropdown(false);
                        handleOpenProfile();
                      }}
                      className="w-full flex items-center gap-2.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition cursor-pointer text-slate-700 dark:text-purple-200 hover:bg-gradient-to-r hover:from-purple-600 hover:via-indigo-600 hover:to-purple-700 hover:text-white dark:hover:text-white dark:hover:bg-purple-500/25 group border border-transparent"
                    >
                      <UserCog className="w-3.5 h-3.5 stroke-[2] transition-colors shrink-0 text-current opacity-80 group-hover:opacity-100" />
                      <span className="truncate text-xs font-semibold">Profile &amp; Security</span>
                    </button>

                    {/* App & Environment Config Item */}
                    <button
                      type="button"
                      id="superadmin-app-settings-btn"
                      onClick={() => {
                        setShowUserDropdown(false);
                        setActiveTab('settings');
                      }}
                      className="w-full flex items-center gap-2.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition cursor-pointer text-slate-700 dark:text-purple-200 hover:bg-gradient-to-r hover:from-purple-600 hover:via-indigo-600 hover:to-purple-700 hover:text-white dark:hover:text-white dark:hover:bg-purple-500/25 group border border-transparent"
                    >
                      <Sliders className="w-3.5 h-3.5 stroke-[2] transition-colors shrink-0 text-current opacity-80 group-hover:opacity-100" />
                      <span className="truncate text-xs font-semibold">App &amp; Environment Config</span>
                    </button>

                    {/* Sign Out Item */}
                    <div className="pt-1 mt-1 border-t border-slate-100 dark:border-purple-800/60">
                      <button
                        type="button"
                        onClick={() => {
                          setShowUserDropdown(false);
                          onLogout();
                        }}
                        className="w-full flex items-center gap-2.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition cursor-pointer text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 group border border-transparent"
                      >
                        <LogOut className="w-3.5 h-3.5 stroke-[2] shrink-0 text-current" />
                        <span className="truncate text-xs font-semibold">Sign Out</span>
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        {/* MAIN CONTENT AREA (Aligned with Store DashboardOverview.tsx) */}
        <main className="flex-1 min-w-0 overflow-x-hidden bg-[#F8FAFC] dark:bg-[#0A0E1A] transition-colors">
          <div
            ref={superAdminWorkspaceRef}
            className="p-4 sm:p-6 lg:p-7 space-y-6 max-w-7xl mx-auto select-none"
          >
            {/* DASHBOARD HEADER ROW (Shown on Dashboard & Manifests tabs; Stores, Requests & Reports use Product-route Top Banner Card) */}
            {(activeTab === 'dashboard' || activeTab === 'manifests') && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                    {activeTab === 'dashboard' && 'Dashboard'}
                    {activeTab === 'manifests' && 'Scoped Store & Admin PWA Manifests'}
                  </h1>
                  <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                    Welcome back, {currentUser?.name || 'Platform SuperAdmin'}! Manage tenant isolation, real-time store suspension, and store provisioning.
                  </p>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-white dark:bg-[#0E1628] border border-slate-200/90 dark:border-[#1A263D] text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-2xs">
                    <Calendar className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                    <span>{formattedDate}</span>
                  </div>
                  <button
                    type="button"
                    onClick={loadOverview}
                    disabled={loading}
                    title="Refresh metrics & recount stats"
                    className="btn-outline-landing p-1.5 rounded-xl bg-white hover:text-purple-600 border border-slate-200/90 shadow-2xs dark:bg-purple-500/20 dark:hover:bg-purple-500/30 dark:text-purple-200 dark:hover:text-white dark:border-purple-400/40 text-slate-500 cursor-pointer transition active:scale-95 disabled:opacity-50"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${
                        loading ? 'animate-spin text-purple-600 dark:text-purple-300' : 'text-slate-500 dark:text-purple-300'
                      }`}
                    />
                  </button>
                </div>
              </div>
            )}

            {/* Error Alert Banner */}
            {error && (
              <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs flex items-center justify-between shadow-xs">
                <div className="flex items-center gap-2.5 font-medium">
                  <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                  <span>{error}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setError(null)}
                  className="px-2.5 py-1 rounded-lg bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-200 font-mono font-bold cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Success Notification Banner */}
            {successMessage && (
              <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-200 text-xs flex items-center justify-between shadow-xs">
                <div className="flex items-center gap-2.5 font-medium">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>{successMessage}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSuccessMessage(null)}
                  className="px-2.5 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200 font-mono font-bold cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Newly Provisioned Store Credentials Banner */}
            {provisionedBanner && (
              <div className="app-card bg-emerald-50/90 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-500/40 rounded-2xl p-5 sm:p-6 shadow-lg">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-bold text-base">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                      <span>
                        Store Provisioned: {provisionedBanner.storeName}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      Isolated tenant schema initialized and initial Store Owner credentials generated:
                    </p>
                    <div className="flex flex-wrap items-center gap-3 pt-1 font-mono text-xs">
                      <span className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-slate-800 text-slate-800 dark:text-white shadow-2xs">
                        <KeyRound className="w-3.5 h-3.5 inline mr-1.5 text-emerald-600 dark:text-emerald-400" />
                        Admin Email: <strong>{provisionedBanner.adminEmail}</strong>
                      </span>
                      <span className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-slate-800 text-slate-800 dark:text-white shadow-2xs">
                        Initial Password: <strong>{provisionedBanner.initialPassword}</strong>
                      </span>
                      {provisionedBanner.subscriptionEndDate && (
                        <span className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 shadow-2xs">
                          Plan: <strong>{provisionedBanner.subscriptionPlan === 'free_tier' ? '30-Day Free Tier' : provisionedBanner.subscriptionPlan === '6_MONTHS' ? '6 Months' : 'Yearly'}</strong> • Expires:{' '}
                          <strong>
                            {new Date(provisionedBanner.subscriptionEndDate).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </strong>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => onOpenOnboarding(provisionedBanner.tenantId)}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-sm transition cursor-pointer"
                    >
                      <Wand2 className="w-4 h-4" />
                      <span>Launch Store Onboarding</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenStore(provisionedBanner.tenantId)}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-white border border-slate-200 dark:border-slate-700 text-xs font-bold transition cursor-pointer"
                    >
                      <Store className="w-4 h-4" />
                      <span>Open Store POS</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* EXECUTIVE DASHBOARD VIEW: 5 KPI CARDS + GRAPHICAL STATISTICS (MATCHING STORE DASHBOARD) */}
            {activeTab === 'dashboard' && (() => {
              // Dual-spline Sales & Transactions SVG chart geometry (aligned with Store DashboardOverview.tsx)
              const chartWidth = 560;
              const chartHeight = 200;
              const paddingLeft = 36;
              const paddingRight = 20;
              const paddingTop = 20;
              const paddingBottom = 30;
              const innerWidth = chartWidth - paddingLeft - paddingRight;
              const innerHeight = chartHeight - paddingTop - paddingBottom;

              const rawChartSeries =
                sevenDaySales.length > 0
                  ? sevenDaySales
                  : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((lbl) => ({
                      date: '',
                      label: lbl,
                      amount: 0,
                      txCount: 0,
                    }));

              const maxChartVal = Math.max(
                100,
                ...rawChartSeries.map((s) => Math.max(s.amount || 0, s.txCount || 0))
              );

              const chartPoints = rawChartSeries.map((d, index) => {
                const denom = Math.max(1, rawChartSeries.length - 1);
                const x = paddingLeft + (index / denom) * innerWidth;
                const ySales = paddingTop + innerHeight - ((d.amount || 0) / maxChartVal) * innerHeight;
                const yTx = paddingTop + innerHeight - ((d.txCount || 0) / maxChartVal) * innerHeight;
                return { x, ySales, yTx, ...d };
              });

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

              const salesLinePath = buildSplinePath(chartPoints.map((p) => ({ x: p.x, y: p.ySales })));
              const txLinePath = buildSplinePath(chartPoints.map((p) => ({ x: p.x, y: p.yTx })));
              const baselineY = paddingTop + innerHeight;
              const lastX = chartPoints.length > 0 ? chartPoints[chartPoints.length - 1].x : innerWidth;
              const firstX = chartPoints.length > 0 ? chartPoints[0].x : paddingLeft;

              const salesAreaPath =
                chartPoints.length > 0 && salesLinePath
                  ? `${salesLinePath} L ${lastX},${baselineY} L ${firstX},${baselineY} Z`
                  : '';
              const txAreaPath =
                chartPoints.length > 0 && txLinePath
                  ? `${txLinePath} L ${lastX},${baselineY} L ${firstX},${baselineY} Z`
                  : '';

              // Top Revenue Stores sorted for Donut Gauges & Graphical Bar Comparison
              const topStoresByRevenue = [...stores].sort((a, b) => {
                if (b.totalSales !== a.totalSales) return b.totalSales - a.totalSales;
                if (b.productCount !== a.productCount) return b.productCount - a.productCount;
                return b.totalStockUnits - a.totalStockUnits;
              });

              const totalRevenueAll = stores.reduce((sum, s) => sum + (s.totalSales || 0), 0);
              const totalStockValAll = stores.reduce((sum, s) => sum + (s.inventoryValue || 0), 0);
              const maxStoreRevenue = Math.max(
                1,
                ...topStoresByRevenue.map((s) => (totalRevenueAll > 0 ? s.totalSales : s.inventoryValue || s.productCount || 1))
              );

              // Donut Ring Items (Top 2 Stores by Revenue or Inventory Value)
              const donutStores = topStoresByRevenue.slice(0, 2).map((st) => {
                const pct =
                  totalRevenueAll > 0
                    ? Math.min(100, Math.max(8, Math.round((st.totalSales / totalRevenueAll) * 100)))
                    : totalStockValAll > 0
                    ? Math.min(100, Math.max(8, Math.round(((st.inventoryValue || 0) / totalStockValAll) * 100)))
                    : stores.length > 0
                    ? Math.round(100 / stores.length)
                    : 0;
                return {
                  id: st.id,
                  name: st.name,
                  pct,
                  subtitle:
                    st.totalSales > 0
                      ? `${st.currency} ${Math.round(st.totalSales).toLocaleString()}`
                      : `${st.productCount} Products • ${st.totalStockUnits} units`,
                };
              });

              // Compute Dynamic Platform Retail Shoe Metrics (Sales Target, Category Breakdown, Inventory Clearance)
              const platformSevenDayTotal = rawChartSeries.reduce(
                (sum, d) => sum + (Number(d.amount) || 0),
                0
              );
              const platformTodaySales =
                rawChartSeries.length > 0
                  ? Number(rawChartSeries[rawChartSeries.length - 1]?.amount || 0)
                  : Math.round(totalRevenueAll * 0.14);
              const totalStockUnitsAll = stores.reduce(
                (sum, s) => sum + (s.totalStockUnits || 0),
                0
              );
              const totalUnitsSoldAll = stores.reduce(
                (sum, s) => sum + (s.unitsSold || 0),
                0
              );
              const totalInvoicesAll = stores.reduce(
                (sum, s) => sum + (s.salesCount || 0),
                0
              );
              const onboardedStoresCount = stores.filter((s) => s.onboardingCompleted).length;

              const dailyPlatformTarget = Math.max(
                50000,
                Math.ceil((Math.max(platformTodaySales, platformSevenDayTotal / 7) * 1.25) / 10000) * 10000
              );
              const weeklyPlatformTarget = Math.max(
                350000,
                Math.ceil((Math.max(platformSevenDayTotal, dailyPlatformTarget * 6) * 1.2) / 25000) * 25000
              );
              const cumulativePlatformTarget = Math.max(
                1000000,
                Math.ceil((Math.max(totalRevenueAll, weeklyPlatformTarget * 3) * 1.18) / 50000) * 50000
              );

              const maxCatUnits = Math.max(
                1,
                ...reportCategories.map((c) => Math.max(c.unitsSold || 0, c.totalStock || 1))
              );

              const platformRetailMetrics: RetailShoeMetricsData = {
                salesTargets: [
                  {
                    id: 'sa-daily-target',
                    label: 'Platform Daily POS Sales Target',
                    currentValue: platformTodaySales,
                    targetValue: dailyPlatformTarget,
                    percentage:
                      platformTodaySales > 0
                        ? Math.min(100, Math.max(18, Math.round((platformTodaySales / dailyPlatformTarget) * 100)))
                        : 74,
                    unit: 'currency',
                    subtitle: `Across ${metrics.activeStores} active retail shoe stores today`,
                    status: 'Live Sync',
                  },
                  {
                    id: 'sa-weekly-quota',
                    label: '7-Day Multi-Store Revenue Quota',
                    currentValue: platformSevenDayTotal,
                    targetValue: weeklyPlatformTarget,
                    percentage:
                      platformSevenDayTotal > 0
                        ? Math.min(100, Math.max(24, Math.round((platformSevenDayTotal / weeklyPlatformTarget) * 100)))
                        : 79,
                    unit: 'currency',
                    subtitle: `${totalInvoicesAll.toLocaleString()} POS invoices processed`,
                    status: 'Strong Pace',
                  },
                  {
                    id: 'sa-cumulative-goal',
                    label: 'Platform Gross Footwear Billing Goal',
                    currentValue: Math.round(totalRevenueAll),
                    targetValue: cumulativePlatformTarget,
                    percentage:
                      totalRevenueAll > 0
                        ? Math.min(100, Math.max(28, Math.round((totalRevenueAll / cumulativePlatformTarget) * 100)))
                        : 85,
                    unit: 'currency',
                    subtitle: `${stores.length} deployed tenant stores combined`,
                    status: 'Exceeding',
                  },
                  {
                    id: 'sa-store-activation-target',
                    label: 'Active Store Subscription & POS Readiness',
                    currentValue: Math.round(totalStockValAll * 0.34),
                    targetValue: Math.max(100000, Math.round(totalStockValAll * 0.4)),
                    percentage:
                      metrics.totalStores > 0
                        ? Math.min(100, Math.max(35, Math.round((metrics.activeStores / metrics.totalStores) * 100)))
                        : 92,
                    unit: 'currency',
                    subtitle: `${onboardedStoresCount}/${Math.max(1, stores.length)} stores onboarded & active`,
                    status: 'Healthy',
                  },
                ],
                categoryBreakdown:
                  reportCategories.length > 0
                    ? reportCategories.slice(0, 4).map((cat, idx) => ({
                        id: `sa-cat-${idx}`,
                        name: cat.name || `Footwear Category #${idx + 1}`,
                        unitsSold: cat.unitsSold || 0,
                        stockUnits: cat.totalStock || 0,
                        productCount: cat.productCount || 0,
                        revenue: cat.totalRevenue || 0,
                        percentage: Math.min(
                          100,
                          Math.max(
                            22,
                            Math.round(
                              (Math.max(cat.unitsSold || 0, (cat.totalStock || 0) * 0.65) / maxCatUnits) * 100
                            )
                          )
                        ),
                        subtitle: `${cat.productCount || 0} Products • Rs. ${Math.round(cat.totalRevenue || 0).toLocaleString()} revenue`,
                      }))
                    : undefined,
                inventoryClearance: [
                  {
                    id: 'sa-sell-through',
                    label: 'Platform Footwear Sell-Through Velocity',
                    percentage:
                      totalUnitsSoldAll + totalStockUnitsAll > 0
                        ? Math.min(
                            100,
                            Math.max(
                              26,
                              Math.round(
                                (totalUnitsSoldAll /
                                  Math.max(1, totalUnitsSoldAll + totalStockUnitsAll * 0.35)) *
                                  100
                              )
                            )
                          )
                        : 71,
                    currentUnits: totalUnitsSoldAll,
                    totalUnits: Math.max(1, totalUnitsSoldAll + totalStockUnitsAll),
                    subtitle: 'Total pairs sold vs platform shelf inventory',
                    badge: 'Fast Moving',
                  },
                  {
                    id: 'sa-active-stores-coverage',
                    label: 'Active Tenant Store Uptime & Compliance',
                    percentage:
                      metrics.totalStores > 0
                        ? Math.min(100, Math.max(25, Math.round((metrics.activeStores / metrics.totalStores) * 100)))
                        : 95,
                    currentUnits: metrics.activeStores,
                    totalUnits: Math.max(1, metrics.totalStores),
                    subtitle: `${metrics.activeStores} of ${metrics.totalStores} stores active on middleware`,
                    badge: 'Online',
                  },
                  {
                    id: 'sa-top-products-velocity',
                    label: 'Top-Performing Footwear Articles Turnover',
                    percentage:
                      reportProducts.length > 0
                        ? Math.min(100, Math.max(42, Math.round((reportProducts.filter((k) => k.unitsSold > 0).length / reportProducts.length) * 100)))
                        : 78,
                    currentUnits: reportProducts.reduce((s, k) => s + (k.unitsSold || 0), 0),
                    totalUnits: Math.max(
                      1,
                      reportProducts.reduce((s, k) => s + (k.unitsSold || 0) + (k.totalStock || 0), 0)
                    ),
                    subtitle: `${reportProducts.length} high-velocity Products tracked across tenants`,
                    badge: 'High Demand',
                  },
                  {
                    id: 'sa-catalog-availability',
                    label: 'Multi-Store Catalog Stock Readiness',
                    percentage:
                      metrics.totalPlatformProducts > 0
                        ? Math.min(
                            100,
                            Math.max(
                              64,
                              Math.round(
                                (stores.filter((s) => s.totalStockUnits > 0).length /
                                  Math.max(1, stores.length)) *
                                  100
                              )
                            )
                          )
                        : 90,
                    currentUnits: totalStockUnitsAll,
                    totalUnits: Math.max(1, totalStockUnitsAll + totalUnitsSoldAll),
                    subtitle: `${metrics.totalPlatformProducts.toLocaleString()} total Products in tenant catalogs`,
                    badge: 'Well Stocked',
                  },
                ],
              };

              return (
                <div className="space-y-6">
                  {/* ROW 1: 5 KPI METRIC CARDS WITH ANIMATED COUNTER */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                    <StatCard
                      id="superadmin-stat-total-stores"
                      title="Deployed Stores"
                      value={metrics.totalStores}
                      icon={Store}
                      iconColor="blue"
                      sparkline="blue"
                      trendIndicator={{
                        value: `${metrics.activeStores} Active`,
                        direction: 'up',
                        label: 'tenants',
                      }}
                      loading={loading}
                      delay={0}
                      duration={1200}
                    />

                    <StatCard
                      id="superadmin-stat-active-stores"
                      title="Active Tenants"
                      value={metrics.activeStores}
                      icon={CheckCircle2}
                      iconColor="emerald"
                      sparkline="emerald"
                      trendIndicator={{
                        value: 'Online',
                        direction: 'up',
                        label: 'middleware',
                      }}
                      loading={loading}
                      delay={0}
                      duration={1200}
                    />

                    <StatCard
                      id="superadmin-stat-suspended-stores"
                      title="Suspended Stores"
                      value={metrics.suspendedStores}
                      icon={AlertCircle}
                      iconColor="rose"
                      sparkline="rose"
                      valueClassName={metrics.suspendedStores > 0 ? 'text-rose-600 dark:text-rose-400' : undefined}
                      trendIndicator={
                        metrics.suspendedStores > 0
                          ? { value: `${metrics.suspendedStores}`, direction: 'down', label: 'revoked' }
                          : { value: '0', direction: 'neutral', label: 'none suspended' }
                      }
                      loading={loading}
                      delay={0}
                      duration={1200}
                    />

                    <StatCard
                      id="superadmin-stat-active-trials"
                      title="30-Day Free Trials"
                      value={metrics.activeTrials || activeTrialsCount}
                      icon={Sparkles}
                      iconColor="purple"
                      sparkline="purple"
                      trendIndicator={{
                        value: '30-Day',
                        direction: 'up',
                        label: 'free trial model',
                      }}
                      loading={loading}
                      delay={0}
                      duration={1200}
                    />

                    <StatCard
                      id="superadmin-stat-platform-revenue"
                      title="Platform Sales"
                      value={Math.round(metrics.totalPlatformRevenue)}
                      prefix="Rs. "
                      icon={TrendingUp}
                      iconColor="sky"
                      sparkline="sky"
                      trendIndicator={{
                        value: `${metrics.totalPlatformProducts.toLocaleString()} Products`,
                        direction: 'up',
                        label: 'catalog',
                      }}
                      loading={loading}
                      delay={0}
                      duration={1200}
                    />
                  </div>

                  {/* DYNAMIC RETAIL SHOE METRICS (Sales Target, Category Breakdown, Inventory Clearance) WITH INTERSECTION OBSERVER ANIMATION */}
                  <RetailShoeMetrics
                    metrics={platformRetailMetrics}
                    todaySales={platformTodaySales}
                    totalProducts={metrics.totalPlatformProducts}
                    lowStockCount={0}
                    allTimeRevenue={metrics.totalPlatformRevenue}
                    sevenDaySalesTotal={platformSevenDayTotal}
                    topSelling={reportProducts}
                    currency="Rs."
                    loading={loading}
                    onNavigate={(tab) => setActiveTab(tab as SuperAdminTab)}
                    variant="superadmin-dashboard"
                  />

                  {/* ROW 2: 3 GRAPHICAL CARDS (Platform Sales Overview + Top Revenue Stores Donut Gauges + Best Selling Products) */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-5">
                    {/* Card 1: Platform Sales Overview Dual-Spline Area Chart (Span 5 on xl) */}
                    <div className="md:col-span-2 lg:col-span-12 xl:col-span-5 app-card bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-indigo-500/20 rounded-2xl p-5 flex flex-col justify-between shadow-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                        <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                          Platform Sales Overview
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
                              value={chartTimeframe}
                              onChange={(e) => setChartTimeframe(e.target.value as '7days' | 'month' | 'year')}
                              className="appearance-none bg-slate-50 dark:bg-purple-500/20 border border-slate-200 dark:border-purple-400/40 text-[11px] font-medium text-slate-700 dark:text-purple-200 py-1 pl-2.5 pr-6 rounded-lg outline-none cursor-pointer hover:border-purple-400 transition"
                            >
                              <option value="7days" className="dark:bg-[#120726] dark:text-purple-100">
                                Last 7 Days
                              </option>
                              <option value="month" className="dark:bg-[#120726] dark:text-purple-100">
                                This Month
                              </option>
                              <option value="year" className="dark:bg-[#120726] dark:text-purple-100">
                                This Year
                              </option>
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
                            <linearGradient id="superAdminSalesGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.4" />
                              <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.0" />
                            </linearGradient>
                            <linearGradient id="superAdminTxGrad" x1="0" y1="0" x2="0" y2="1">
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

                          {/* Area Fills */}
                          <path d={salesAreaPath} fill="url(#superAdminSalesGrad)" />
                          <path d={txAreaPath} fill="url(#superAdminTxGrad)" />

                          {/* Spline Curves */}
                          <path
                            d={salesLinePath}
                            fill="none"
                            stroke="#3B82F6"
                            strokeWidth="2.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="neon-glow-blue"
                          />
                          <path
                            d={txLinePath}
                            fill="none"
                            stroke="#06B6D4"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="neon-glow-cyan"
                          />

                          {/* Point Markers & Hover Tooltips */}
                          {chartPoints.map((p, i) => {
                            const isHovered = hoveredChartPoint === i;
                            return (
                              <g
                                key={`sa-point-${p.label}-${i}`}
                                className="cursor-pointer"
                                onMouseEnter={() => setHoveredChartPoint(i)}
                                onMouseLeave={() => setHoveredChartPoint(null)}
                              >
                                <circle
                                  cx={p.x}
                                  cy={p.ySales}
                                  r={isHovered ? 5.5 : 3.5}
                                  className="fill-white dark:fill-[#0A0E1A] stroke-[#3B82F6] transition-all"
                                  strokeWidth="2.5"
                                />
                                <circle
                                  cx={p.x}
                                  cy={p.yTx}
                                  r={isHovered ? 5 : 3}
                                  className="fill-white dark:fill-[#0A0E1A] stroke-[#06B6D4] transition-all"
                                  strokeWidth="2"
                                />
                                <text
                                  x={p.x}
                                  y={chartHeight - 8}
                                  textAnchor="middle"
                                  className="text-[10px] font-medium fill-slate-500 dark:fill-slate-400"
                                >
                                  {p.label}
                                </text>

                                {isHovered && (
                                  <g className="pointer-events-none">
                                    <rect
                                      x={Math.max(paddingLeft, Math.min(p.x - 60, chartWidth - 125))}
                                      y={Math.min(p.ySales, p.yTx) - 44}
                                      width="120"
                                      height="36"
                                      rx="8"
                                      className="fill-slate-900 dark:fill-[#131F37] stroke stroke-slate-700 dark:stroke-[#1E2D4A] shadow-xl"
                                    />
                                    <text
                                      x={Math.max(paddingLeft + 60, Math.min(p.x, chartWidth - 65))}
                                      y={Math.min(p.ySales, p.yTx) - 28}
                                      textAnchor="middle"
                                      className="text-[9.5px] font-bold fill-white font-mono"
                                    >
                                      Rs. {Math.round(p.amount).toLocaleString()}
                                    </text>
                                    <text
                                      x={Math.max(paddingLeft + 60, Math.min(p.x, chartWidth - 65))}
                                      y={Math.min(p.ySales, p.yTx) - 15}
                                      textAnchor="middle"
                                      className="text-[9px] font-medium fill-cyan-400 font-mono"
                                    >
                                      {p.txCount} Invoices
                                    </text>
                                  </g>
                                )}
                              </g>
                            );
                          })}
                        </svg>
                      </div>
                    </div>

                    {/* Card 2: Top Performing Stores Donut Gauges (Span 4 on xl, matching Store Best Selling Brands) */}
                    <div className="md:col-span-1 lg:col-span-6 xl:col-span-4 app-card bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-indigo-500/20 rounded-2xl p-5 flex flex-col justify-between min-w-0 shadow-xs">
                      <div className="flex items-center justify-between mb-2">
                        <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                          Top Performing Stores
                        </h2>
                        <button
                          type="button"
                          onClick={() => setActiveTab('reports')}
                          className="text-xs font-bold text-purple-600 dark:text-cyan-400 hover:underline cursor-pointer"
                        >
                          View Reports
                        </button>
                      </div>

                      {donutStores.length === 0 ? (
                        <div className="py-8 text-center text-slate-400 dark:text-slate-500 text-xs">
                          No store performance data yet.
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-3 sm:gap-4 py-2 my-auto min-w-0">
                          {donutStores.map((st, idx) => {
                            const pct = st.pct || 0;
                            const circumference = 238.76;
                            const strokeColor = idx === 0 ? '#3B82F6' : '#8B5CF6';

                            return (
                              <div
                                key={st.id}
                                onClick={() => onOpenStore(st.id)}
                                className="flex flex-col items-center text-center min-w-0 cursor-pointer group"
                              >
                                <div className="relative w-20 h-20 sm:w-24 sm:h-24 max-w-full flex items-center justify-center shrink-0">
                                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                                    <circle
                                      cx="50"
                                      cy="50"
                                      r="38"
                                      className="text-slate-100 dark:text-slate-800 stroke-current"
                                      strokeWidth="7"
                                      fill="none"
                                    />
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
                                  <div className="absolute inset-0 flex flex-col items-center justify-center p-2">
                                    <div
                                      className="w-8 h-8 rounded-xl flex items-center justify-center text-white font-bold text-xs shadow-xs group-hover:scale-105 transition bg-purple-600"
                                    >
                                      {(st.name || 'ST').slice(0, 2).toUpperCase()}
                                    </div>
                                    <span
                                      data-per={pct}
                                      data-per-role="counter"
                                      data-stagger-index={idx}
                                      className="text-[9.5px] font-mono font-bold text-slate-500 dark:text-slate-400 mt-0.5"
                                    >
                                      0%
                                    </span>
                                  </div>
                                </div>
                                <div className="mt-2.5 w-full min-w-0 px-1">
                                  <div className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-300 truncate transition">
                                    {st.name}
                                  </div>
                                  <div className="text-[11px] text-slate-400 font-mono mt-0.5 truncate">
                                    {st.subtitle}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Bottom Store Status Graphical Distribution Bar */}
                      <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] font-mono">
                          <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                            ● {metrics.activeStores} Active
                          </span>
                          <span className="text-purple-600 dark:text-purple-400 font-bold">
                            ● {metrics.activeTrials || activeTrialsCount} Active Trials
                          </span>
                          <span className="text-rose-600 dark:text-rose-400 font-bold">
                            ● {metrics.suspendedStores} Suspended
                          </span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex">
                          <div
                            data-per={
                              metrics.totalStores > 0
                                ? Math.max(10, Math.round((metrics.activeStores / metrics.totalStores) * 100))
                                : 100
                            }
                            data-per-role="bar"
                            data-stagger-index={0}
                            className="h-full bg-emerald-500"
                            style={{ width: '0%' }}
                          />
                          {metrics.suspendedStores > 0 && (
                            <div
                              data-per={Math.round((metrics.suspendedStores / Math.max(1, metrics.totalStores)) * 100)}
                              data-per-role="bar"
                              data-stagger-index={1}
                              className="h-full bg-rose-500"
                              style={{ width: '0%' }}
                            />
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Card 3: Best Selling Products across Stores (Span 3 on xl, matching Store Dashboard) */}
                    <div className="md:col-span-1 lg:col-span-6 xl:col-span-3 app-card bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-indigo-500/20 rounded-2xl p-5 flex flex-col justify-between min-w-0 shadow-xs">
                      <div className="flex items-center justify-between mb-2">
                        <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                          Best Selling Products
                        </h2>
                        <button
                          type="button"
                          onClick={() => setActiveTab('reports')}
                          className="text-xs font-bold text-purple-600 dark:text-cyan-400 hover:underline cursor-pointer"
                        >
                          View All
                        </button>
                      </div>

                      {reportProducts.length === 0 ? (
                        <div className="py-8 text-center text-slate-400 dark:text-slate-500 text-xs">
                          No product sales recorded yet.
                        </div>
                      ) : (
                        <div className="space-y-3 my-auto min-w-0">
                          {reportProducts.slice(0, 3).map((prod, idx) => (
                            <div
                              key={`${prod.tenantId}-${prod.id}-${idx}`}
                              onClick={() => onOpenStore(prod.tenantId)}
                              className="flex items-center justify-between gap-2 p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition min-w-0 cursor-pointer"
                            >
                              <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                                <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-slate-100 dark:bg-slate-950/60 overflow-hidden shrink-0 border border-slate-200/60 dark:border-slate-800">
                                  <img
                                    src={
                                      prod.imageUrl ||
                                      'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=150&auto=format&fit=crop&q=80'
                                    }
                                    alt={prod.productName}
                                    referrerPolicy="no-referrer"
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                    {prod.productName}
                                  </div>
                                  <div className="mt-0.5 sm:mt-1 flex items-center gap-1.5 flex-wrap">
                                    {prod.category && (
                                      <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-cyan-400 border border-purple-200/80 dark:border-cyan-500/30 whitespace-nowrap">
                                        {prod.category}
                                      </span>
                                    )}
                                    <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate max-w-[90px]">
                                      {prod.storeName}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div className="text-right shrink-0 ml-1">
                                <div className="text-xs font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                                  Stock: {prod.totalStock}
                                </div>
                                <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-mono mt-0.5 whitespace-nowrap">
                                  Sold: {prod.unitsSold}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ROW 3: STORE REVENUE GRAPHICAL BARS & LATEST TRANSACTIONS (Left Span 7) + QUICK ACTIONS (Right Span 5) */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                    {/* Left: Graphical Store Revenue Comparison + Latest Platform Transactions (Span 7) */}
                    <div className="lg:col-span-7 app-card bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-indigo-500/20 rounded-2xl p-5 flex flex-col justify-between gap-5 shadow-xs">
                      {/* Top Half: Store Revenue & Catalog Graphical Bars */}
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                              Store Revenue &amp; Catalog Graphical Comparison
                            </h2>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                              Visual comparison of deployed stores by POS revenue, product count, and stock units
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setActiveTab('reports')}
                            className="text-xs font-bold text-purple-600 dark:text-cyan-400 hover:underline cursor-pointer"
                          >
                            Full Leaderboard
                          </button>
                        </div>

                        <div className="space-y-3">
                          {topStoresByRevenue.slice(0, 4).map((st, idx) => {
                            const metricVal =
                              totalRevenueAll > 0
                                ? st.totalSales
                                : st.inventoryValue || st.productCount || 0;
                            const barWidthPct = Math.min(
                              100,
                              Math.max(8, Math.round((metricVal / maxStoreRevenue) * 100))
                            );
                            return (
                              <div
                                key={st.id}
                                onClick={() => onOpenStore(st.id)}
                                className="p-2.5 rounded-xl bg-slate-50/80 dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-800 hover:border-purple-300 dark:hover:border-purple-500/40 transition cursor-pointer"
                              >
                                <div className="flex items-center justify-between text-xs mb-1.5">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span
                                      className="w-2.5 h-2.5 rounded-full shrink-0 bg-purple-600"
                                    />
                                    <span className="font-bold text-slate-900 dark:text-white truncate">
                                      {st.name}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2.5 font-mono text-xs shrink-0">
                                    <span className="text-slate-500 dark:text-slate-400">
                                      {st.productCount} Products • {st.salesCount} inv
                                    </span>
                                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                                      {st.currency} {Math.round(st.totalSales).toLocaleString()}
                                    </span>
                                    <span
                                      data-per={barWidthPct}
                                      data-per-role="counter"
                                      data-stagger-index={idx}
                                      className="px-1.5 py-0.5 rounded bg-purple-50 dark:bg-purple-950/70 text-purple-700 dark:text-cyan-300 border border-purple-200/60 dark:border-purple-800/60 text-[10px] font-extrabold min-w-[2.4rem] text-right"
                                    >
                                      0%
                                    </span>
                                  </div>
                                </div>
                                <div className="w-full h-2 rounded-full bg-slate-200/80 dark:bg-slate-800 overflow-hidden">
                                  <div
                                    role="progressbar"
                                    aria-valuemin={0}
                                    aria-valuemax={100}
                                    aria-valuenow={0}
                                    aria-label={st.name}
                                    data-per={barWidthPct}
                                    data-per-role="bar"
                                    data-stagger-index={idx}
                                    className="h-full rounded-full bg-gradient-to-r from-purple-600 via-indigo-500 to-cyan-400"
                                    style={{ width: '0%' }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Bottom Half: Latest Platform Transactions (matching Store Dashboard) */}
                      <div className="pt-4 border-t border-slate-100 dark:border-slate-800/80">
                        <div className="flex items-center justify-between mb-3">
                          <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                            Latest Platform Transactions
                          </h2>
                          <button
                            type="button"
                            onClick={() => setActiveTab('reports')}
                            className="text-xs font-bold text-purple-600 dark:text-cyan-400 hover:underline cursor-pointer"
                          >
                            View All
                          </button>
                        </div>

                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs">
                            <thead className="dark:bg-gradient-to-r dark:from-purple-900 dark:via-indigo-950 dark:to-slate-900">
                              <tr className="border-b border-slate-100 dark:border-purple-800/80 text-slate-400 dark:text-white font-semibold">
                                <th className="py-2 px-2.5 font-semibold">Transaction #</th>
                                <th className="py-2 px-2.5 font-semibold">Store</th>
                                <th className="py-2 px-2.5 font-semibold">Customer / Party</th>
                                <th className="py-2 px-2.5 font-semibold">Status</th>
                                <th className="py-2 px-2.5 font-semibold text-right">Amount</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                              {recentTransactions.length === 0 ? (
                                <tr>
                                  <td colSpan={5} className="py-6 text-center text-slate-400 dark:text-slate-500">
                                    No platform transactions recorded yet.
                                  </td>
                                </tr>
                              ) : (
                                recentTransactions.slice(0, 5).map((tx, idx) => (
                                  <tr key={`${tx.reference}-${idx}`} className="table-row-hover">
                                    <td className="py-2.5 px-2.5 font-mono font-semibold text-purple-600 dark:text-cyan-400">
                                      {tx.reference}
                                    </td>
                                    <td className="py-2.5 px-2.5 font-bold text-slate-800 dark:text-slate-200">
                                      {tx.storeName}
                                    </td>
                                    <td className="py-2.5 px-2.5 text-slate-600 dark:text-slate-300">
                                      {tx.customerName}
                                    </td>
                                    <td className="py-2.5 px-2.5">
                                      <span
                                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                          tx.type === 'Return'
                                            ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60'
                                            : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60'
                                        }`}
                                      >
                                        {tx.status}
                                      </span>
                                    </td>
                                    <td className="py-2.5 px-2.5 text-right font-mono font-bold text-slate-900 dark:text-white">
                                      {tx.currency} {Math.round(tx.amount).toLocaleString()}
                                    </td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>

                    {/* Right: Quick Actions (Span 5, matching Store Dashboard Quick Actions) */}
                    <div className="lg:col-span-5 app-card bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-indigo-500/20 rounded-2xl p-5 flex flex-col justify-between shadow-xs">
                      <div className="flex items-center justify-between gap-2 mb-4">
                        <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                          Quick Actions
                        </h2>
                        <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
                          Shortcuts F1–F5
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-3 flex-1">
                        {/* Action 1: Deployed Stores (F1) */}
                        <button
                          type="button"
                          onClick={() => setActiveTab('stores')}
                          className="quick-action-btn p-3.5 rounded-xl border border-slate-200/90 dark:border-slate-800/90 bg-slate-50/70 dark:bg-slate-950/50 text-left transition-all duration-200 flex flex-col justify-between group cursor-pointer shadow-2xs overflow-hidden"
                        >
                          <div className="flex items-center justify-between">
                            <div className="w-9 h-9 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-purple-600 dark:text-purple-400 group-hover:scale-105 group-hover:border-purple-300 dark:group-hover:border-purple-500/50 transition shadow-2xs">
                              <Store className="w-4 h-4" />
                            </div>
                            <kbd className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 group-hover:border-purple-300 dark:group-hover:border-purple-500/50 group-hover:text-purple-700 dark:group-hover:text-purple-300 transition">
                              F1
                            </kbd>
                          </div>
                          <div className="mt-3">
                            <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-300 transition">
                              Deployed Stores
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 transition">
                              {stores.length} Tenants Directory
                            </div>
                          </div>
                        </button>

                        {/* Action 2: 30-Day Free Trials (F2) */}
                        <button
                          type="button"
                          onClick={() => setActiveTab('trials')}
                          className="quick-action-btn p-3.5 rounded-xl border border-slate-200/90 dark:border-slate-800/90 bg-slate-50/70 dark:bg-slate-950/50 text-left transition-all duration-200 flex flex-col justify-between group cursor-pointer shadow-2xs overflow-hidden"
                        >
                          <div className="flex items-center justify-between">
                            <div className="w-9 h-9 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-purple-600 dark:text-purple-400 group-hover:scale-105 group-hover:border-purple-300 dark:group-hover:border-purple-500/50 transition shadow-2xs">
                              <Sparkles className="w-4 h-4" />
                            </div>
                            <kbd className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 group-hover:border-purple-300 dark:group-hover:border-purple-500/50 group-hover:text-purple-700 dark:group-hover:text-purple-300 transition">
                              F2
                            </kbd>
                          </div>
                          <div className="mt-3">
                            <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-300 transition">
                              30-Day Free Trials
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 transition">
                              {metrics.activeTrials || activeTrialsCount} Active Trials
                            </div>
                          </div>
                        </button>

                        {/* Action 3: Provision New Store (F3) */}
                        <button
                          type="button"
                          onClick={() => setCreateModalOpen(true)}
                          className="quick-action-btn p-3.5 rounded-xl border border-slate-200/90 dark:border-slate-800/90 bg-slate-50/70 dark:bg-slate-950/50 text-left transition-all duration-200 flex flex-col justify-between group cursor-pointer shadow-2xs overflow-hidden"
                        >
                          <div className="flex items-center justify-between">
                            <div className="w-9 h-9 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-purple-600 dark:text-purple-400 group-hover:scale-105 group-hover:border-purple-300 dark:group-hover:border-purple-500/50 transition shadow-2xs">
                              <Plus className="w-4 h-4" />
                            </div>
                            <kbd className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 group-hover:border-purple-300 dark:group-hover:border-purple-500/50 group-hover:text-purple-700 dark:group-hover:text-purple-300 transition">
                              F3
                            </kbd>
                          </div>
                          <div className="mt-3">
                            <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-300 transition">
                              Provision Store
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 transition">
                              1-Click Tenant Setup
                            </div>
                          </div>
                        </button>

                        {/* Action 4: Platform Reports (F4) */}
                        <button
                          type="button"
                          onClick={() => setActiveTab('reports')}
                          className="quick-action-btn p-3.5 rounded-xl border border-slate-200/90 dark:border-slate-800/90 bg-slate-50/70 dark:bg-slate-950/50 text-left transition-all duration-200 flex flex-col justify-between group cursor-pointer shadow-2xs overflow-hidden"
                        >
                          <div className="flex items-center justify-between">
                            <div className="w-9 h-9 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-purple-600 dark:text-purple-400 group-hover:scale-105 group-hover:border-purple-300 dark:group-hover:border-purple-500/50 transition shadow-2xs">
                              <BarChart3 className="w-4 h-4" />
                            </div>
                            <kbd className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 group-hover:border-purple-300 dark:group-hover:border-purple-500/50 group-hover:text-purple-700 dark:group-hover:text-purple-300 transition">
                              F4
                            </kbd>
                          </div>
                          <div className="mt-3">
                            <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-300 transition">
                              Platform Reports
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 transition">
                              Top Stores &amp; Products
                            </div>
                          </div>
                        </button>

                        {/* Action 5: Scoped PWA Manifests (F5) */}
                        <button
                          type="button"
                          onClick={() => setActiveTab('manifests')}
                          className="quick-action-btn p-3.5 rounded-xl border border-slate-200/90 dark:border-slate-800/90 bg-slate-50/70 dark:bg-slate-950/50 text-left transition-all duration-200 flex flex-col justify-between group cursor-pointer shadow-2xs overflow-hidden"
                        >
                          <div className="flex items-center justify-between">
                            <div className="w-9 h-9 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-purple-600 dark:text-purple-400 group-hover:scale-105 group-hover:border-purple-300 dark:group-hover:border-purple-500/50 transition shadow-2xs">
                              <FileCode2 className="w-4 h-4" />
                            </div>
                            <kbd className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 group-hover:border-purple-300 dark:group-hover:border-purple-500/50 group-hover:text-purple-700 dark:group-hover:text-purple-300 transition">
                              F5
                            </kbd>
                          </div>
                          <div className="mt-3">
                            <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-300 transition">
                              PWA Manifests
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 transition">
                              Scoped Store Apps
                            </div>
                          </div>
                        </button>

                        {/* Action 6: Import & Export Platform SQL */}
                        <button
                          type="button"
                          onClick={() => {
                            setImportSqlError(null);
                            setImportSqlModalOpen(true);
                          }}
                          className="quick-action-btn p-3.5 rounded-xl border border-slate-200/90 dark:border-slate-800/90 bg-slate-50/70 dark:bg-slate-950/50 text-left transition-all duration-200 flex flex-col justify-between group cursor-pointer shadow-2xs overflow-hidden"
                        >
                          <div className="flex items-center justify-between">
                            <div className="w-9 h-9 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-purple-600 dark:text-purple-400 group-hover:scale-105 group-hover:border-purple-300 dark:group-hover:border-purple-500/50 transition shadow-2xs">
                              <Upload className="w-4 h-4" />
                            </div>
                            <kbd className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 group-hover:border-purple-300 dark:group-hover:border-purple-500/50 group-hover:text-purple-700 dark:group-hover:text-purple-300 transition">
                              .SQL
                            </kbd>
                          </div>
                          <div className="mt-3">
                            <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-300 transition">
                              Import SQL Script
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 transition">
                              24-Store Seed &amp; Restore
                            </div>
                          </div>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* SECTION 1: DEPLOYED STORES & REAL-TIME MIDDLEWARE ACCESS CONTROL (Aligned with Product Route Theme, Cards, Thead & Tbody) */}
            {activeTab === 'stores' && (
              <div className="space-y-4 max-w-7xl mx-auto text-xs select-none">
                {/* Top Banner & Action (Aligned with Product Route) */}
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-gradient-to-r dark:from-purple-900 dark:via-indigo-950 dark:to-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-purple-800/80 shadow-sm transition-colors dark:text-white"
                >
                  <div>
                    <h2 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                      Deployed Stores &amp; Middleware Control
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-500 dark:text-purple-200/80 font-medium mt-0.5">
                      1 Store = 1 Isolated Tenant = Real-Time JWT &amp; Middleware Access Control
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        setImportSqlError(null);
                        setImportSqlModalOpen(true);
                      }}
                      className="bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500/20 dark:hover:bg-indigo-500/30 text-white dark:text-indigo-200 border border-indigo-500 dark:border-indigo-400/40 shadow-sm font-bold px-4 py-2.5 rounded-xl text-xs flex items-center space-x-2 transition-all cursor-pointer"
                      title="Import Multi-Store Data File"
                    >
                      <Upload className="w-4 h-4" />
                      <span>Import Data</span>
                    </button>

                    <button
                      type="button"
                      disabled={exportingPlatform}
                      onClick={handleExportPlatformSql}
                      className="bg-[#0284C7] hover:bg-[#0369A1] dark:bg-purple-500/20 dark:hover:bg-purple-500/30 text-white dark:text-purple-200 border border-[#0284C7] dark:border-purple-400/40 shadow-sm dark:shadow-[0_0_14px_rgba(147,51,234,0.2)] font-bold px-4 py-2.5 rounded-xl text-xs flex items-center space-x-2 transition-all cursor-pointer disabled:opacity-50"
                      title="Export All Stores & Platform Backup"
                    >
                      <Download className="w-4 h-4" />
                      <span>{exportingPlatform ? 'Exporting...' : 'Export All Backup'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveTab('trials')}
                      className="bg-purple-600 hover:bg-purple-700 dark:bg-purple-500/20 dark:hover:bg-purple-500/30 text-white dark:text-purple-200 border border-purple-500 dark:border-purple-400/40 shadow-sm font-bold px-4 py-2.5 rounded-xl text-xs flex items-center space-x-1.5 transition-all cursor-pointer active:scale-95"
                      title="View 30-Day Free Trial Activations"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>Trial Activations ({metrics.activeTrials || activeTrialsCount})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setCreateModalOpen(true)}
                      className="bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:via-indigo-700 hover:to-purple-800 dark:from-purple-600 dark:to-indigo-600 text-white border border-purple-400/40 dark:border-purple-400/50 shadow-md shadow-purple-600/25 dark:shadow-[0_0_14px_rgba(147,51,234,0.3)] font-bold px-4 py-2.5 rounded-xl text-xs flex items-center space-x-1.5 transition-all cursor-pointer active:scale-95"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Add New Store</span>
                    </button>
                  </div>
                </motion.div>

                {/* Filter and Search Bar (Aligned with Product Route) */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.25 }}
                  className="app-card p-4 flex flex-wrap items-center gap-3 text-xs transition-colors dark:bg-gradient-to-r dark:from-purple-900 dark:via-indigo-950 dark:to-slate-900 dark:border-purple-800/80 dark:text-white"
                >
                  <div className="flex-1 min-w-[240px] relative">
                    <Search className="w-4 h-4 text-purple-600 dark:text-purple-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Search by store name, owner email, or phone..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="app-input w-full pl-[2.125rem] pr-8 py-2.5 text-xs font-medium dark:bg-slate-900/80 dark:border-purple-800/60 dark:text-white dark:placeholder-slate-400"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-200 p-1 text-xs cursor-pointer"
                        title="Clear search"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {(['ALL', 'ACTIVE', 'EXPIRED', 'SUSPENDED', 'ONLINE'] as const).map((statusOpt) => (
                      <button
                        key={statusOpt}
                        type="button"
                        onClick={() => setStatusFilter(statusOpt)}
                        className={`px-3.5 py-2.5 rounded-xl font-bold border transition cursor-pointer text-xs flex items-center gap-1.5 ${
                          statusFilter === statusOpt
                            ? 'bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 text-white border-purple-400/50 shadow-md shadow-purple-600/20 dark:shadow-[0_0_14px_rgba(147,51,234,0.3)]'
                            : 'bg-slate-50 dark:bg-purple-500/20 text-slate-700 dark:text-purple-200 border-slate-200 dark:border-purple-400/40 dark:shadow-[0_0_14px_rgba(147,51,234,0.2)] hover:bg-slate-100 dark:hover:bg-purple-500/30 dark:hover:text-white'
                        }`}
                      >
                        {statusOpt === 'ONLINE' && (
                          <span
                            className={`w-2 h-2 rounded-full ${
                              statusFilter === 'ONLINE'
                                ? 'bg-emerald-300 animate-pulse'
                                : 'bg-emerald-500'
                            }`}
                          />
                        )}
                        <span>{statusOpt}</span>
                      </button>
                    ))}
                  </div>

                  <span className="font-mono font-bold px-3.5 py-2.5 rounded-xl bg-purple-50 dark:bg-purple-500/20 text-purple-700 dark:text-purple-200 border border-purple-200 dark:border-purple-400/40 dark:shadow-[0_0_14px_rgba(147,51,234,0.2)]">
                    {filteredStores.length} Tenants
                  </span>

                  <button
                    type="button"
                    onClick={loadOverview}
                    disabled={loading}
                    className="btn-outline-landing flex items-center space-x-1.5 px-3.5 py-2.5 bg-slate-100 dark:bg-purple-500/20 hover:bg-slate-200 dark:hover:bg-purple-500/30 text-slate-700 dark:text-purple-200 dark:hover:text-white border border-slate-200 dark:border-purple-400/40 dark:shadow-[0_0_14px_rgba(147,51,234,0.2)] font-bold rounded-xl transition cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none"
                    title={loading ? 'Refreshing deployed stores...' : 'Refresh store stats & records'}
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${
                        loading ? 'animate-spin text-blue-600 dark:text-purple-300' : 'text-blue-600 dark:text-purple-300'
                      }`}
                    />
                    <span>Refresh</span>
                  </button>
                </motion.div>

                {/* Deployed Stores Table (Aligned with Product Route Table, Thead & Tbody) */}
                <motion.div
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: 0.3 }}
                  className="app-card overflow-hidden transition-colors dark:border-purple-800/60"
                >
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-50 dark:bg-gradient-to-r dark:from-purple-900 dark:via-indigo-950 dark:to-slate-900 text-slate-700 dark:text-white font-bold border-b border-slate-200 dark:border-purple-800/80 text-[11px] uppercase tracking-wider">
                        <tr>
                          <th className="py-3.5 px-4 w-14">Store</th>
                          <th className="py-3.5 px-4">Store Name &amp; ID</th>
                          <th className="py-3.5 px-3">Owner &amp; Setup Status</th>
                          <th className="py-3.5 px-4">Subscription &amp; Expiry</th>
                          <th className="py-3.5 px-3 text-right">Total Sales &amp; Invoices</th>
                          <th className="py-3.5 px-3 text-center">Catalog &amp; Stock</th>
                          <th className="py-3.5 px-3 text-center">Status</th>
                          <th className="py-3.5 px-4 text-center">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                        {loading ? (
                          <tr>
                            <td colSpan={8} className="py-12 text-center text-slate-400 dark:text-slate-500">
                              <div className="flex flex-col items-center justify-center space-y-2">
                                <RefreshCw className="w-6 h-6 animate-spin text-blue-600 dark:text-purple-400 mx-auto" />
                                <p className="font-medium text-xs">Loading deployed stores...</p>
                              </div>
                            </td>
                          </tr>
                        ) : filteredStores.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="py-12 text-center text-slate-400">
                              No stores match your current filter criteria.
                            </td>
                          </tr>
                        ) : (
                          filteredStores.map((store) => {
                            const effectiveStatus =
                              store.subscriptionStatus === 'EXPIRED' || store.status === 'EXPIRED'
                                ? 'EXPIRED'
                                : store.status === 'SUSPENDED' || store.subscriptionStatus === 'SUSPENDED'
                                ? 'SUSPENDED'
                                : 'ACTIVE';
                            const isActive = effectiveStatus === 'ACTIVE';
                            const isExpired = effectiveStatus === 'EXPIRED';

                            return (
                              <tr
                                key={store.id}
                                className="table-row-hover border-b border-slate-100 dark:border-slate-800/80"
                              >
                                {/* Store Avatar Box (Aligned with Product Image cell) */}
                                <td className="py-3.5 px-4">
                                  <div className="w-12 h-12 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-100 dark:bg-[#0A0E1A] overflow-hidden flex items-center justify-center shrink-0 p-1 shadow-2xs">
                                    <div
                                      className="w-full h-full rounded-lg flex items-center justify-center text-white font-black text-xs shadow-2xs bg-purple-600"
                                    >
                                      {(store.name || 'ST').slice(0, 2).toUpperCase()}
                                    </div>
                                  </div>
                                </td>

                                {/* Store Name & Tenant ID */}
                                <td className="py-3.5 px-4">
                                  <div className="font-bold text-slate-900 dark:text-white text-sm">
                                    {store.name}
                                  </div>
                                  <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide bg-indigo-50 dark:bg-[#312E81]/60 text-indigo-700 dark:text-[#A5B4FC] border border-indigo-200 dark:border-[#6366F1]/40 font-mono">
                                      ID #{store.id}
                                    </span>
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide bg-sky-50 dark:bg-[#0284C7]/20 text-sky-700 dark:text-[#38BDF8] border border-sky-200 dark:border-[#0284C7]/40 font-mono">
                                      {store.currency || 'Rs.'}
                                    </span>
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide border font-mono ${
                                      store.businessType === 'WHOLESALE'
                                        ? 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-500/40'
                                        : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/40'
                                    }`}>
                                      {store.businessType === 'WHOLESALE' ? 'Wholesale (B2B)' : 'Retail (B2C)'}
                                    </span>
                                    {store.businessType === 'WHOLESALE' && (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/40 font-mono">
                                        Min: {Number((store as any).minSellingQuantity ?? (store as any).min_selling_quantity ?? ((store as any).allowHalfCarton ? 0.5 : 1.0)) <= 0.5 ? '0.5 Carton' : '1 Carton'}
                                      </span>
                                    )}
                                  </div>
                                </td>

                                {/* Owner Contact & Onboarding Setup Capsules */}
                                <td className="py-3.5 px-3">
                                  <div className="font-mono text-[11px] font-bold text-slate-800 dark:text-white">
                                    {store.ownerEmail}
                                  </div>
                                  {store.ownerPhone && (
                                    <div className="text-[10.5px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                                      {store.ownerPhone}
                                    </div>
                                  )}
                                  <div className="mt-1">
                                    {store.onboardingCompleted ? (
                                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60">
                                        ● Setup Complete
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60">
                                        ● Pending Setup
                                      </span>
                                    )}
                                  </div>
                                </td>

                                {/* Subscription Plan & Expiry */}
                                <td className="py-3.5 px-4">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide bg-blue-50 dark:bg-[#1E3A8A]/50 text-blue-800 dark:text-[#93C5FD] border border-blue-200 dark:border-[#3B82F6]/40">
                                      {store.subscriptionPlan === 'free_tier' ? '30-Day Free Tier' : store.subscriptionPlan === '6_MONTHS' ? '6 Months Plan' : 'Yearly Plan'}
                                    </span>
                                  </div>
                                  <div
                                    className={`font-mono text-[11px] font-bold mt-1 ${
                                      isExpired
                                        ? 'text-amber-600 dark:text-amber-400'
                                        : 'text-slate-700 dark:text-slate-300'
                                    }`}
                                  >
                                    Exp:{' '}
                                    {store.subscriptionEndDate
                                      ? new Date(store.subscriptionEndDate).toLocaleDateString('en-US', {
                                          year: 'numeric',
                                          month: 'short',
                                          day: 'numeric',
                                        })
                                      : 'N/A'}
                                  </div>
                                </td>

                                {/* Total Sales & Invoices (Aligned with Pricing & Cost column) */}
                                <td className="py-3.5 px-3 text-right">
                                  <div className="font-mono font-bold text-slate-900 dark:text-white text-xs">
                                    {store.currency} {Math.round(store.totalSales).toLocaleString()}
                                  </div>
                                  <div className="flex items-center justify-end gap-1 mt-0.5">
                                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-purple-100 dark:bg-purple-950/70 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/60 uppercase">
                                      POS
                                    </span>
                                    <span className="text-[11px] font-mono font-bold text-purple-600 dark:text-purple-400">
                                      {store.salesCount} invoices
                                    </span>
                                  </div>
                                </td>

                                {/* Catalog & Stock (Aligned with Total Stock column) */}
                                <td className="py-3.5 px-3 text-center">
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60 font-mono">
                                    {store.productCount.toLocaleString()} Products
                                  </span>
                                  <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono font-semibold mt-0.5">
                                    {store.totalStockUnits.toLocaleString()} units
                                  </div>
                                </td>

                                {/* Status Pill */}
                                <td className="py-3.5 px-3 text-center">
                                  <div className="flex flex-col items-center gap-1">
                                    <span
                                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold font-mono ${
                                        isActive
                                          ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60'
                                          : isExpired
                                          ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60'
                                          : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60'
                                      }`}
                                    >
                                      <span
                                        className={`w-1.5 h-1.5 rounded-full ${
                                          isActive
                                            ? 'bg-emerald-500'
                                            : isExpired
                                            ? 'bg-amber-500'
                                            : 'bg-rose-500'
                                        }`}
                                      />
                                      {effectiveStatus}
                                    </span>
                                    {isActive && store.isOnline !== false && (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9.5px] font-extrabold uppercase tracking-wide bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800/60 font-mono">
                                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />
                                        ONLINE
                                      </span>
                                    )}
                                  </div>
                                </td>

                                {/* Actions (Aligned with Product Route Action Buttons) */}
                                <td className="py-3.5 px-4 text-center">
                                  <div className="flex items-center justify-center flex-wrap gap-1.5">
                                    {/* 1. Manage Subscription */}
                                    <button
                                      type="button"
                                      onClick={() => handleOpenEditSubscription(store)}
                                      className="px-2 py-1.5 rounded-xl border border-purple-200 dark:border-purple-500/30 bg-purple-50 dark:bg-[#0E1628] text-purple-700 dark:text-purple-400 hover:bg-purple-600 dark:hover:bg-purple-600 hover:text-white dark:hover:text-white transition-all shadow-2xs group relative cursor-pointer flex items-center gap-1 text-[11px] font-bold"
                                      title="Edit Subscription Plan & Expiry Date"
                                    >
                                      <Calendar className="w-3.5 h-3.5 transition-transform group-hover:scale-110" />
                                      <span className="hidden xl:inline">Plan</span>
                                    </button>

                                    {/* 2. Activate / Suspend Toggle */}
                                    <button
                                      type="button"
                                      disabled={togglingId === store.id}
                                      onClick={() => handleToggleStoreStatus(store)}
                                      className={`px-2 py-1.5 rounded-xl border transition-all shadow-2xs group relative cursor-pointer flex items-center gap-1 text-[11px] font-bold ${
                                        isActive
                                          ? 'border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-[#0E1628] text-amber-700 dark:text-amber-400 hover:bg-amber-600 dark:hover:bg-amber-600 hover:text-white dark:hover:text-white'
                                          : 'border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-[#0E1628] text-emerald-700 dark:text-emerald-400 hover:bg-emerald-600 dark:hover:bg-emerald-600 hover:text-white dark:hover:text-white'
                                      }`}
                                      title={
                                        isActive
                                          ? 'Suspend Store Immediately at Middleware Level'
                                          : 'Activate Store Access'
                                      }
                                    >
                                      <Power className="w-3.5 h-3.5 transition-transform group-hover:scale-110" />
                                      <span>
                                        {togglingId === store.id
                                          ? '...'
                                          : isActive
                                          ? 'Suspend'
                                          : 'Activate'}
                                      </span>
                                    </button>

                                    {/* 3. Export Store Data to SQL File */}
                                    <button
                                      type="button"
                                      disabled={exportingStoreId === store.id}
                                      onClick={() => handleExportStoreSql(store)}
                                      className="p-1.5 rounded-xl border border-purple-200 dark:border-purple-400/40 bg-purple-50 dark:bg-purple-500/20 hover:bg-purple-600 dark:hover:bg-purple-500/30 text-purple-600 dark:text-purple-200 hover:text-white dark:hover:text-white dark:shadow-[0_0_14px_rgba(147,51,234,0.2)] transition-all cursor-pointer disabled:opacity-50"
                                      title={`Export ${store.name} Store Backup File`}
                                    >
                                      <Download className="w-3.5 h-3.5" />
                                    </button>

                                    {/* 4. Initial Store Setup / Onboarding */}
                                    <button
                                      type="button"
                                      onClick={() => onOpenOnboarding(store.id)}
                                      className="p-1.5 rounded-xl border border-purple-200 dark:border-purple-500/30 bg-purple-50/80 dark:bg-[#0E1628] hover:bg-purple-600 dark:hover:bg-purple-600 text-purple-600 dark:text-purple-400 hover:text-white dark:hover:text-white transition-all shadow-2xs group relative cursor-pointer"
                                      title={
                                        store.onboardingCompleted
                                          ? 'Initial Store Setup & POS Defaults Locked'
                                          : 'Open Initial Store Setup'
                                      }
                                    >
                                      {store.onboardingCompleted ? (
                                        <Lock className="w-3.5 h-3.5" />
                                      ) : (
                                        <Wand2 className="w-3.5 h-3.5" />
                                      )}
                                    </button>

                                    {/* 5. Delete Store Button */}
                                    <button
                                      type="button"
                                      onClick={() => setStoreToDelete(store)}
                                      className="p-1.5 rounded-xl border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-[#0E1628] hover:bg-rose-600 dark:hover:bg-rose-600 text-rose-600 dark:text-rose-400 hover:text-white dark:hover:text-white transition-all cursor-pointer"
                                      title={`Delete Store '${store.name}' and all its isolated records`}
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>

                                    {/* 6. Open Store POS */}
                                    <button
                                      type="button"
                                      onClick={() => onOpenStore(store.id)}
                                      className="px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:via-indigo-700 hover:to-purple-800 text-white border border-purple-400/40 dark:border-purple-400/50 shadow-2xs dark:shadow-[0_0_12px_rgba(147,51,234,0.25)] text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer active:scale-95"
                                    >
                                      <span>Open POS</span>
                                      <ArrowRight className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </motion.div>
              </div>
            )}

            {/* SECTION 2: 30-DAY FREE TRIAL ACTIVATIONS & EXTENSIONS */}
            {(activeTab === 'trials' || (activeTab as any) === 'requests') && (
              <div className="space-y-4 max-w-7xl mx-auto text-xs select-none">
                {/* Top Banner & Action */}
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-gradient-to-r dark:from-purple-900 dark:via-indigo-950 dark:to-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-purple-800/80 shadow-sm transition-colors dark:text-white"
                >
                  <div>
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-500/40 font-mono mb-2">
                      <Sparkles className="w-3 h-3" />
                      30-Day Free Trial Model
                    </div>
                    <h2 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                      Trial Activations &amp; Extensions
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-500 dark:text-purple-200/80 font-medium mt-0.5">
                      Monitor auto-provisioned 30-day trials • Track days remaining • Grant 1-click subscription extensions
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => setActiveTab('stores')}
                      className="bg-[#0284C7] hover:bg-[#0369A1] dark:bg-purple-500/20 dark:hover:bg-purple-500/30 text-white dark:text-purple-200 border border-[#0284C7] dark:border-purple-400/40 shadow-sm dark:shadow-[0_0_14px_rgba(147,51,234,0.2)] font-bold px-4 py-2.5 rounded-xl text-xs flex items-center space-x-2 transition-all cursor-pointer"
                      title="View Deployed Stores Directory"
                    >
                      <Store className="w-4 h-4" />
                      <span>Deployed Stores ({stores.length})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setCreateModalOpen(true)}
                      className="bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:via-indigo-700 hover:to-purple-800 dark:from-purple-600 dark:to-indigo-600 text-white border border-purple-400/40 dark:border-purple-400/50 shadow-md shadow-purple-600/25 dark:shadow-[0_0_14px_rgba(147,51,234,0.3)] font-bold px-4 py-2.5 rounded-xl text-xs flex items-center space-x-1.5 transition-all cursor-pointer active:scale-95"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Add New Store</span>
                    </button>
                  </div>
                </motion.div>

                {/* Filter and Search Bar */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.25 }}
                  className="app-card p-4 flex flex-wrap items-center gap-3 text-xs transition-colors dark:bg-gradient-to-r dark:from-purple-900 dark:via-indigo-950 dark:to-slate-900 dark:border-purple-800/80 dark:text-white"
                >
                  <div className="flex-1 min-w-[240px] relative">
                    <Search className="w-4 h-4 text-purple-600 dark:text-purple-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Search trial stores by name, email, or owner..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="app-input w-full pl-[2.125rem] pr-8 py-2.5 text-xs font-medium dark:bg-slate-900/80 dark:border-purple-800/60 dark:text-white dark:placeholder-slate-400"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-200 p-1 text-xs cursor-pointer"
                        title="Clear search"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {(['ALL', 'ACTIVE', 'EXPIRED'] as const).map((filterOpt) => (
                      <button
                        key={filterOpt}
                        type="button"
                        onClick={() => setTrialStatusFilter(filterOpt)}
                        className={`px-3.5 py-2.5 rounded-xl font-bold border transition cursor-pointer text-xs ${
                          trialStatusFilter === filterOpt
                            ? 'bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 text-white border-purple-400/50 shadow-md shadow-purple-600/20 dark:shadow-[0_0_14px_rgba(147,51,234,0.3)]'
                            : 'bg-slate-50 dark:bg-purple-500/20 text-slate-700 dark:text-purple-200 border-slate-200 dark:border-purple-400/40 dark:shadow-[0_0_14px_rgba(147,51,234,0.2)] hover:bg-slate-100 dark:hover:bg-purple-500/30 dark:hover:text-white'
                        }`}
                      >
                        {filterOpt}
                      </button>
                    ))}
                  </div>

                  <span className="font-mono font-bold px-3.5 py-2.5 rounded-xl bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 border border-purple-300 dark:border-purple-500/40 shadow-xs flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{activeTrialsCount} Active Trials</span>
                  </span>

                  <button
                    type="button"
                    onClick={loadOverview}
                    disabled={loading}
                    className="btn-outline-landing flex items-center space-x-1.5 px-3.5 py-2.5 bg-slate-100 dark:bg-purple-500/20 hover:bg-slate-200 dark:hover:bg-purple-500/30 text-slate-700 dark:text-purple-200 dark:hover:text-white border border-slate-200 dark:border-purple-400/40 dark:shadow-[0_0_14px_rgba(147,51,234,0.2)] font-bold rounded-xl transition cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none"
                    title={loading ? 'Refreshing trial activations...' : 'Refresh trial activations'}
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${
                        loading ? 'animate-spin text-blue-600 dark:text-purple-300' : 'text-blue-600 dark:text-purple-300'
                      }`}
                    />
                    <span>Refresh</span>
                  </button>
                </motion.div>

                {/* 30-Day Free Trial Activations Table */}
                <motion.div
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: 0.3 }}
                  className="app-card overflow-hidden transition-colors dark:border-purple-800/60"
                >
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-50 dark:bg-gradient-to-r dark:from-purple-900 dark:via-indigo-950 dark:to-slate-900 text-slate-700 dark:text-white font-bold border-b border-slate-200 dark:border-purple-800/80 text-[11px] uppercase tracking-wider">
                        <tr>
                          <th className="py-3.5 px-4 w-14">Store</th>
                          <th className="py-3.5 px-4">Trial Store &amp; Mode</th>
                          <th className="py-3.5 px-3">Owner &amp; Contact</th>
                          <th className="py-3.5 px-4">Trial Duration &amp; Expiry</th>
                          <th className="py-3.5 px-3 text-center">Status</th>
                          <th className="py-3.5 px-4 text-center">Actions &amp; Extensions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                        {loading ? (
                          <tr>
                            <td colSpan={6} className="py-12 text-center text-slate-400 dark:text-slate-500">
                              <div className="flex flex-col items-center justify-center space-y-2">
                                <RefreshCw className="w-6 h-6 animate-spin text-blue-600 dark:text-purple-400 mx-auto" />
                                <p className="font-medium text-xs">Loading trial activations...</p>
                              </div>
                            </td>
                          </tr>
                        ) : filteredTrials.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-12 text-center text-slate-400">
                              No trial activations match the selected filter.
                            </td>
                          </tr>
                        ) : (
                          filteredTrials.map((trial) => {
                            const now = Date.now();
                            const trialEnd = trial.trialEndDate ? new Date(trial.trialEndDate).getTime() : 0;
                            const msDiff = trialEnd - now;
                            const computedDays = Math.ceil(msDiff / (1000 * 60 * 60 * 24));
                            const daysRemaining = trial.daysRemaining !== undefined ? trial.daysRemaining : computedDays;
                            const isExpired = trial.status === 'EXPIRED' || daysRemaining <= 0;
                            const isConverting = trial.status === 'CONVERTED';

                            return (
                              <tr
                                key={trial.id}
                                className="table-row-hover border-b border-slate-100 dark:border-slate-800/80"
                              >
                                {/* Store Avatar Box */}
                                <td className="py-3.5 px-4">
                                  <div className="w-12 h-12 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-100 dark:bg-[#0A0E1A] overflow-hidden flex items-center justify-center shrink-0 p-1 shadow-2xs">
                                    <div className="w-full h-full rounded-lg bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white font-black text-xs shadow-2xs">
                                      {(trial.storeName || 'TS').slice(0, 2).toUpperCase()}
                                    </div>
                                  </div>
                                </td>

                                {/* Trial Store & Mode */}
                                <td className="py-3.5 px-4">
                                  <div className="font-bold text-slate-900 dark:text-white text-sm">
                                    {trial.storeName}
                                  </div>
                                  <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide bg-indigo-50 dark:bg-[#312E81]/60 text-indigo-700 dark:text-[#A5B4FC] border border-indigo-200 dark:border-[#6366F1]/40 font-mono">
                                      TRIAL #{trial.id}
                                    </span>
                                    {trial.tenantId && (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide bg-sky-50 dark:bg-[#0284C7]/20 text-sky-700 dark:text-[#38BDF8] border border-sky-200 dark:border-[#0284C7]/40 font-mono">
                                        TENANT #{trial.tenantId}
                                      </span>
                                    )}
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-500/40 font-mono">
                                      {(trial.businessType || 'RETAIL').toUpperCase() === 'WHOLESALE' ? 'Wholesale (B2B)' : 'Retail (B2C)'}
                                    </span>
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 font-mono">
                                      {(trial.pricingMode || 'FIXED').toUpperCase() === 'NEGOTIABLE' ? 'Bargaining' : 'Fixed Price'}
                                    </span>
                                  </div>
                                </td>

                                {/* Owner & Contact */}
                                <td className="py-3.5 px-3">
                                  <div className="font-mono text-[11px] font-bold text-slate-800 dark:text-white">
                                    {trial.email}
                                  </div>
                                  {trial.userName && (
                                    <div className="text-[10.5px] font-medium text-slate-600 dark:text-slate-300 mt-0.5">
                                      {trial.userName}
                                    </div>
                                  )}
                                  {trial.phone && (
                                    <div className="text-[10.5px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                                      {trial.phone}
                                    </div>
                                  )}
                                  <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                                    Activated: {new Date(trial.activatedAt || trial.trialStartDate).toLocaleDateString('en-US', {
                                      month: 'short',
                                      day: 'numeric',
                                      year: 'numeric',
                                    })}
                                  </div>
                                </td>

                                {/* Trial Duration & Expiry */}
                                <td className="py-3.5 px-4">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide bg-purple-50 dark:bg-[#1E3A8A]/50 text-purple-800 dark:text-[#93C5FD] border border-purple-200 dark:border-[#3B82F6]/40 font-mono">
                                      {trial.plan || '30-Day Free Tier'}
                                    </span>
                                    <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                                      {trial.trialDurationDays || 30} Days
                                    </span>
                                  </div>
                                  <div className="text-[11px] font-mono text-slate-700 dark:text-slate-300">
                                    Expires: <strong>{new Date(trial.trialEndDate).toLocaleDateString('en-US', {
                                      month: 'short',
                                      day: 'numeric',
                                      year: 'numeric',
                                    })}</strong>
                                  </div>
                                  <div className="mt-1">
                                    {isExpired ? (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60 font-mono">
                                        Expired ({Math.abs(daysRemaining)}d ago)
                                      </span>
                                    ) : daysRemaining <= 5 ? (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60 font-mono">
                                        {daysRemaining} day{daysRemaining === 1 ? '' : 's'} left
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60 font-mono">
                                        {daysRemaining} days remaining
                                      </span>
                                    )}
                                  </div>
                                </td>

                                {/* Status Pill */}
                                <td className="py-3.5 px-3 text-center">
                                  <span
                                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold font-mono ${
                                      isExpired
                                        ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60'
                                        : isConverting
                                        ? 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-800/60'
                                        : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60'
                                    }`}
                                  >
                                    <span
                                      className={`w-1.5 h-1.5 rounded-full ${
                                        isExpired
                                          ? 'bg-rose-500'
                                          : isConverting
                                          ? 'bg-purple-500'
                                          : 'bg-emerald-500 animate-pulse'
                                      }`}
                                    />
                                    {isExpired ? 'EXPIRED' : isConverting ? 'CONVERTED' : 'ACTIVE'}
                                  </span>
                                </td>

                                {/* Actions & Extensions */}
                                <td className="py-3.5 px-4 text-center">
                                  <div className="flex items-center justify-center flex-wrap gap-1.5">
                                    <button
                                      type="button"
                                      disabled={extendingTrialId === trial.id}
                                      onClick={() => handleExtendTrial(trial.id, 30)}
                                      className="px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:via-indigo-700 hover:to-purple-800 disabled:opacity-50 text-white border border-purple-400/40 dark:border-purple-400/50 shadow-2xs dark:shadow-[0_0_12px_rgba(147,51,234,0.25)] text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer active:scale-95"
                                      title="Extend trial by +30 Days"
                                    >
                                      <Sparkles className="w-3.5 h-3.5" />
                                      <span>
                                        {extendingTrialId === trial.id ? 'Extending...' : '+30 Days'}
                                      </span>
                                    </button>

                                    <button
                                      type="button"
                                      disabled={extendingTrialId === trial.id}
                                      onClick={() => handleExtendTrial(trial.id, 15)}
                                      className="px-2.5 py-1.5 rounded-xl border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50 dark:bg-[#0E1628] text-indigo-700 dark:text-indigo-400 hover:bg-indigo-600 hover:text-white dark:hover:bg-indigo-600 dark:hover:text-white transition-all shadow-2xs cursor-pointer flex items-center gap-1 text-[11px] font-bold disabled:opacity-50"
                                      title="Extend trial by +15 Days"
                                    >
                                      <Plus className="w-3.5 h-3.5" />
                                      <span>+15 Days</span>
                                    </button>

                                    {trial.tenantId && (
                                      <button
                                        type="button"
                                        onClick={() => onOpenStore(trial.tenantId!)}
                                        className="px-2.5 py-1.5 rounded-xl border border-purple-200 dark:border-purple-500/30 bg-purple-50 dark:bg-[#0E1628] text-purple-700 dark:text-purple-400 hover:bg-purple-600 dark:hover:bg-purple-600 hover:text-white dark:hover:text-white transition-all shadow-2xs group relative cursor-pointer flex items-center gap-1 text-[11px] font-bold"
                                        title="Open Store POS Terminal"
                                      >
                                        <Store className="w-3.5 h-3.5" />
                                        <span>Open POS</span>
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </motion.div>
              </div>
            )}

            {/* SECTION 3: DEDICATED REPORTS & ANALYTICS VIEW (ALIGNED WITH STORE REPORTS DASHBOARD) */}
            {activeTab === 'reports' && (
              <SuperAdminReportsView
                stores={stores}
                totalTrials={metrics.totalTrials}
                reportProducts={reportProducts}
                reportCategories={reportCategories}
                reportBrands={reportBrands}
                recentTransactions={recentTransactions}
                loading={loading}
                onRefresh={loadOverview}
                onOpenStore={onOpenStore}
              />
            )}

            {/* SECTION 4: SCOPED PWA MANIFEST REGISTRY VIEW */}
            {activeTab === 'manifests' && (
              <div className="app-card bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-indigo-500/20 rounded-2xl p-6 space-y-4 shadow-xs">
                <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-indigo-500/20 pb-4">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <FileCode2 className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                      <span>Multi-PWA Scoped Manifest Registry</span>
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Each tenant store and the SuperAdmin Control Panel has an isolated Web App Manifest and scope.
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-50 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-500/30 text-xs font-mono font-bold">
                    <Globe className="w-3.5 h-3.5" />
                    <span>SuperAdmin PWA</span>
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {stores.map((st) => (
                    <div
                      key={st.id}
                      className="p-4 rounded-2xl bg-slate-50/80 dark:bg-[#131B2E] border border-slate-200/80 dark:border-indigo-500/20 flex flex-col justify-between gap-3"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-xs shrink-0 bg-purple-600"
                        >
                          {(st.name || 'ST').slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 dark:text-white truncate">
                            {st.name} — POS
                          </div>
                          <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-200/70 dark:border-indigo-500/15 text-xs font-mono">
                        <span className="text-slate-500 dark:text-slate-400">
                          tenant #{st.id}
                        </span>
                        <span className="text-purple-600 dark:text-purple-300 font-bold">
                          Active PWA
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SECTION 5: APP & ENVIRONMENT SETTINGS (app_settings) */}
            {activeTab === 'settings' && (
              <div className="space-y-6">
                <SettingsView
                  currentUser={currentUser}
                  companySettings={{
                    name: 'Platform SuperAdmin',
                    currency: 'PKR',
                    currency_symbol: 'Rs.',
                  }}
                  initialTab="app_settings"
                  onSettingsUpdated={() => {}}
                />
              </div>
            )}

            {/* SECTION 6: CUSTOM NOTIFICATIONS & BROADCAST SYSTEM */}
            {activeTab === 'notifications' && (
              <div className="space-y-6 animate-in fade-in duration-200">
                {/* Top Banner Card */}
                <div className="p-6 rounded-2xl bg-white dark:bg-[#131B2E] border border-slate-200/90 dark:border-indigo-500/25 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-start gap-3.5">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-purple-600/25 border border-purple-400/30">
                      <Megaphone className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                          Custom Notifications &amp; Store Broadcasts
                        </h3>
                        <span className="px-2 py-0.5 rounded-full bg-purple-50 dark:bg-purple-500/15 border border-purple-200 dark:border-purple-500/30 text-purple-700 dark:text-purple-300 text-[10px] font-mono font-bold">
                          Multi-Tenant Push &amp; In-App
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl leading-relaxed">
                        Broadcast custom announcements, scheduled maintenance advisories, feature updates, or urgent notices directly to all stores or to a targeted store POS terminal.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0 self-start md:self-center">
                    <button
                      type="button"
                      onClick={() => {
                        setNotifError(null);
                        setNotificationModalOpen(true);
                      }}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:to-indigo-800 text-white text-xs font-bold shadow-md shadow-purple-600/20 transition cursor-pointer active:scale-95"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Compose Notification</span>
                    </button>
                    <button
                      type="button"
                      onClick={loadNotifications}
                      disabled={loadingNotifications}
                      title="Refresh Dispatched Notifications"
                      className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200/80 dark:bg-[#0E1628] dark:hover:bg-[#1A263D] border border-slate-200 dark:border-indigo-500/20 text-slate-700 dark:text-slate-200 transition cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-4 h-4 ${loadingNotifications ? 'animate-spin text-purple-600 dark:text-purple-400' : ''}`} />
                    </button>
                  </div>
                </div>

                {/* 4 Metric Summary Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                  <div className="p-4 rounded-2xl bg-white dark:bg-[#131B2E] border border-slate-200/80 dark:border-indigo-500/20 shadow-xs">
                    <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider">Total Dispatched</span>
                      <div className="w-7 h-7 rounded-lg bg-purple-50 dark:bg-purple-500/15 text-purple-600 dark:text-purple-300 flex items-center justify-center">
                        <Send className="w-3.5 h-3.5" />
                      </div>
                    </div>
                    <div className="text-2xl font-black text-slate-900 dark:text-white font-mono">
                      {notificationsList.length}
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Platform notifications sent</p>
                  </div>

                  <div className="p-4 rounded-2xl bg-white dark:bg-[#131B2E] border border-slate-200/80 dark:border-indigo-500/20 shadow-xs">
                    <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider">All Stores Broadcast</span>
                      <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 flex items-center justify-center">
                        <Globe className="w-3.5 h-3.5" />
                      </div>
                    </div>
                    <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400 font-mono">
                      {notificationsList.filter((n) => !n.tenantId).length}
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Global platform broadcasts</p>
                  </div>

                  <div className="p-4 rounded-2xl bg-white dark:bg-[#131B2E] border border-slate-200/80 dark:border-indigo-500/20 shadow-xs">
                    <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider">Targeted Store Alerts</span>
                      <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-500/15 text-blue-600 dark:text-blue-300 flex items-center justify-center">
                        <Store className="w-3.5 h-3.5" />
                      </div>
                    </div>
                    <div className="text-2xl font-black text-blue-600 dark:text-blue-400 font-mono">
                      {notificationsList.filter((n) => Boolean(n.tenantId)).length}
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Targeted single store notices</p>
                  </div>

                  <div className="p-4 rounded-2xl bg-white dark:bg-[#131B2E] border border-slate-200/80 dark:border-indigo-500/20 shadow-xs">
                    <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider">Store Reads</span>
                      <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 flex items-center justify-center">
                        <Eye className="w-3.5 h-3.5" />
                      </div>
                    </div>
                    <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
                      {notificationsList.reduce((acc, curr) => acc + (curr.readCount || 0), 0)}
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Total views &amp; dismissals</p>
                  </div>
                </div>

                {/* Filters & Search Toolbar */}
                <div className="p-4 rounded-2xl bg-white dark:bg-[#131B2E] border border-slate-200/80 dark:border-indigo-500/20 shadow-xs flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Target Filter Tabs */}
                    <div className="inline-flex items-center p-1 rounded-xl bg-slate-100 dark:bg-[#070B14] border border-slate-200 dark:border-slate-800 text-xs font-semibold">
                      <button
                        type="button"
                        onClick={() => setNotifFilterTarget('ALL')}
                        className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                          notifFilterTarget === 'ALL'
                            ? 'bg-white dark:bg-[#131B2E] text-slate-900 dark:text-white shadow-2xs font-bold'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        All Recipients ({notificationsList.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setNotifFilterTarget('GLOBAL')}
                        className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                          notifFilterTarget === 'GLOBAL'
                            ? 'bg-white dark:bg-[#131B2E] text-slate-900 dark:text-white shadow-2xs font-bold'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        Global Broadcasts ({notificationsList.filter((n) => !n.tenantId).length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setNotifFilterTarget('TARGETED')}
                        className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                          notifFilterTarget === 'TARGETED'
                            ? 'bg-white dark:bg-[#131B2E] text-slate-900 dark:text-white shadow-2xs font-bold'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        Targeted Stores ({notificationsList.filter((n) => Boolean(n.tenantId)).length})
                      </button>
                    </div>

                    {/* Type / Severity Filter Dropdown */}
                    <select
                      value={notifFilterType}
                      onChange={(e) => setNotifFilterType(e.target.value)}
                      className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-[#070B14] border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 outline-none cursor-pointer"
                    >
                      <option value="ALL">All Priorities</option>
                      <option value="INFO">Info (Blue)</option>
                      <option value="SUCCESS">Success (Green)</option>
                      <option value="WARNING">Warning (Amber)</option>
                      <option value="URGENT">Urgent (Red)</option>
                    </select>
                  </div>

                  <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                    Showing {
                      notificationsList.filter((notif) => {
                        if (notifFilterTarget === 'GLOBAL' && notif.tenantId) return false;
                        if (notifFilterTarget === 'TARGETED' && !notif.tenantId) return false;
                        if (notifFilterType !== 'ALL' && notif.type !== notifFilterType) return false;
                        if (searchQuery.trim()) {
                          const q = searchQuery.toLowerCase();
                          const matchTitle = (notif.title || '').toLowerCase().includes(q);
                          const matchMsg = (notif.message || '').toLowerCase().includes(q);
                          const matchStore = (notif.storeName || '').toLowerCase().includes(q);
                          return matchTitle || matchMsg || matchStore;
                        }
                        return true;
                      }).length
                    } of {notificationsList.length} notifications
                  </div>
                </div>

                {/* Notifications Cards / Table */}
                {loadingNotifications ? (
                  <div className="p-12 text-center rounded-2xl bg-white dark:bg-[#131B2E] border border-slate-200/80 dark:border-indigo-500/20">
                    <RefreshCw className="w-8 h-8 animate-spin mx-auto text-purple-600 dark:text-purple-400 mb-3" />
                    <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                      Loading dispatched notifications...
                    </p>
                  </div>
                ) : (
                  (() => {
                    const filtered = notificationsList.filter((notif) => {
                      if (notifFilterTarget === 'GLOBAL' && notif.tenantId) return false;
                      if (notifFilterTarget === 'TARGETED' && !notif.tenantId) return false;
                      if (notifFilterType !== 'ALL' && notif.type !== notifFilterType) return false;
                      if (searchQuery.trim()) {
                        const q = searchQuery.toLowerCase();
                        const matchTitle = (notif.title || '').toLowerCase().includes(q);
                        const matchMsg = (notif.message || '').toLowerCase().includes(q);
                        const matchStore = (notif.storeName || '').toLowerCase().includes(q);
                        return matchTitle || matchMsg || matchStore;
                      }
                      return true;
                    });

                    if (filtered.length === 0) {
                      return (
                        <div className="p-12 text-center rounded-2xl bg-white dark:bg-[#131B2E] border border-slate-200/80 dark:border-indigo-500/20 shadow-xs">
                          <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-purple-50 dark:bg-purple-500/15 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                            <Megaphone className="w-7 h-7" />
                          </div>
                          <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-1">
                            No Notifications Found
                          </h4>
                          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mb-4">
                            {searchQuery || notifFilterTarget !== 'ALL' || notifFilterType !== 'ALL'
                              ? 'No dispatched notifications match your search or filter criteria.'
                              : 'No announcements have been dispatched yet. Compose and broadcast your first custom message to store POS terminals.'}
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              setNotifError(null);
                              setNotificationModalOpen(true);
                            }}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition shadow-sm cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Compose New Notification</span>
                          </button>
                        </div>
                      );
                    }

                    return (
                      <div className="space-y-3.5">
                        {filtered.map((notif) => {
                          const isUrgent = notif.type === 'URGENT';
                          const isWarning = notif.type === 'WARNING';
                          const isSuccess = notif.type === 'SUCCESS';
                          const isGlobal = !notif.tenantId;

                          return (
                            <div
                              key={notif.id}
                              className={`p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#131B2E] border transition shadow-xs hover:shadow-md ${
                                isUrgent
                                  ? 'border-rose-300 dark:border-rose-500/40 bg-rose-50/20 dark:bg-rose-950/10'
                                  : isWarning
                                  ? 'border-amber-300 dark:border-amber-500/40 bg-amber-50/20 dark:bg-amber-950/10'
                                  : isSuccess
                                  ? 'border-emerald-300 dark:border-emerald-500/40 bg-emerald-50/20 dark:bg-emerald-950/10'
                                  : 'border-slate-200/90 dark:border-indigo-500/25'
                              }`}
                            >
                              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-2.5">
                                <div className="flex flex-wrap items-center gap-2">
                                  {/* Target Store Badge */}
                                  {isGlobal ? (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30 text-[11px] font-bold">
                                      <Globe className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                                      <span>All Stores (Global Broadcast)</span>
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-500/30 text-[11px] font-bold">
                                      <Store className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                                      <span>Targeted: {notif.storeName || `Store #${notif.tenantId}`}</span>
                                    </span>
                                  )}

                                  {/* Priority / Severity Badge */}
                                  <span
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold uppercase tracking-wider ${
                                      isUrgent
                                        ? 'bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-700'
                                        : isWarning
                                        ? 'bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700'
                                        : isSuccess
                                        ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                                        : 'bg-sky-100 dark:bg-sky-950/70 text-sky-700 dark:text-sky-300 border border-sky-300 dark:border-sky-700'
                                    }`}
                                  >
                                    {isUrgent ? (
                                      <AlertTriangle className="w-3 h-3 text-rose-500 animate-pulse" />
                                    ) : isWarning ? (
                                      <AlertCircle className="w-3 h-3 text-amber-500" />
                                    ) : isSuccess ? (
                                      <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                    ) : (
                                      <Info className="w-3 h-3 text-sky-500" />
                                    )}
                                    <span>{notif.type}</span>
                                  </span>

                                  {/* Relative Time Badge */}
                                  <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    <span>
                                      {notif.createdAt ? new Date(notif.createdAt).toLocaleDateString('en-US', {
                                        month: 'short',
                                        day: 'numeric',
                                        year: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                      }) : 'Just now'}
                                    </span>
                                  </span>
                                </div>

                                {/* Read counter & Delete button */}
                                <div className="flex items-center gap-2 self-end sm:self-auto">
                                  <span
                                    title="Number of store terminals that have opened or acknowledged this announcement"
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-[#0E1628] border border-slate-200 dark:border-indigo-500/20 text-slate-700 dark:text-slate-300 text-[11px] font-mono font-semibold"
                                  >
                                    <Eye className="w-3 h-3 text-slate-500 dark:text-slate-400" />
                                    <span>{notif.readCount || 0} reads</span>
                                  </span>

                                  <button
                                    type="button"
                                    onClick={() => handleDeleteNotification(notif.id)}
                                    disabled={deletingNotifId === notif.id}
                                    title="Revoke and delete this announcement"
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 dark:bg-rose-500/15 dark:hover:bg-rose-500/25 text-rose-600 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30 text-xs font-bold transition cursor-pointer disabled:opacity-50"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                    <span>{deletingNotifId === notif.id ? 'Revoking...' : 'Revoke'}</span>
                                  </button>
                                </div>
                              </div>

                              {/* Title */}
                              <h4 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white tracking-tight mb-1.5">
                                {notif.title}
                              </h4>

                              {/* Message Body */}
                              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                                {notif.message}
                              </p>

                              {/* Optional Action URL */}
                              {notif.actionUrl && (
                                <div className="mt-3 flex items-center gap-2">
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-50 dark:bg-purple-500/15 border border-purple-200 dark:border-purple-500/30 text-purple-700 dark:text-purple-300 text-xs font-semibold">
                                    <ExternalLink className="w-3 h-3" />
                                    <span>{notif.actionLabel || 'Action Link'}:</span>
                                    <code className="font-mono text-[11px] underline ml-1">{notif.actionUrl}</code>
                                  </span>
                                </div>
                              )}

                              {/* Notification Footer Metadata */}
                              <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-indigo-500/15 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                                <span>
                                  Dispatched by: <strong className="text-slate-700 dark:text-slate-200">{notif.createdByName || 'Platform SuperAdmin'}</strong>
                                </span>
                                <span>
                                  {notif.expiresAt ? (
                                    <>Expires: <strong className="text-slate-700 dark:text-slate-200">{new Date(notif.expiresAt).toLocaleDateString()}</strong></>
                                  ) : (
                                    'Does not expire'
                                  )}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()
                )}
              </div>
            )}
          </div>
        </main>

        {/* FOOTER (Aligned with Store Page Footer) */}
        <footer className="px-4 py-2.5 border-t border-indigo-500/20 bg-white/95 dark:bg-white/5 backdrop-blur-lg shadow-lg transition-colors duration-500 text-center text-xs font-medium text-slate-800 dark:text-slate-100 tracking-wide shrink-0 no-print select-none">
          <span className="font-bold text-slate-900 dark:text-white">SarbaazSoft Shoe POS</span>
          <span className="mx-1.5 text-slate-400 dark:text-slate-500">&bull;</span>
          <span>Platform SuperAdmin Control Plane</span>
          <span className="mx-1.5 text-slate-400 dark:text-slate-500">&bull;</span>
          <span>
            &copy; 2026{' '}
            <a
              href="https://portpolio-eight-pi.vercel.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold text-slate-900 dark:text-white hover:text-indigo-500 dark:hover:text-indigo-300 hover:underline transition-colors"
            >
              SarbaazSoft
            </a>
            . All rights reserved.
          </span>
        </footer>
      </div>

      {/* Add New Store Modal (Aligned with ProductFormModal Header, Cards & Footer) */}
      {createModalOpen && (
        <div
          className="form-modal-theme fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto"
          onClick={() => setCreateModalOpen(false)}
        >
          <div
            className="relative w-full max-w-2xl bg-white dark:bg-[#131B2E] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[94vh] border border-slate-200 dark:border-purple-800/80 animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* MODAL HEADER ALIGNED WITH PRODUCT FORM MODAL */}
            <div className="bg-slate-50 dark:bg-gradient-to-r dark:from-purple-900 dark:via-indigo-950 dark:to-slate-900 border-b border-slate-200 dark:border-purple-800/80 text-slate-800 dark:text-white px-6 py-4 shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-600 dark:bg-purple-500/20 dark:text-purple-300 border border-blue-500/20 dark:border-purple-400/30 flex items-center justify-center font-bold shadow-2xs shrink-0">
                    <Store className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-slate-900 dark:text-white tracking-tight">
                      Add New Store
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-purple-200/80">
                      Provision a new Store Tenant entity &amp; primary Owner Administrator account
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCreateModalOpen(false)}
                    className="p-1.5 text-slate-400 hover:text-slate-700 dark:text-purple-300 dark:hover:text-white rounded-lg hover:bg-slate-200/60 dark:hover:bg-white/10 transition cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>

            {/* MODAL CARD BODY ALIGNED WITH PRODUCT FORM MODAL */}
            <form
              id="add-new-store-form"
              onSubmit={handleCreateStore}
              className="flex-1 overflow-y-auto p-6 space-y-5 text-xs bg-slate-50/50 dark:bg-[#070B14]"
            >
              {createStoreError && (
                <div
                  role="alert"
                  aria-live="assertive"
                  className="alert-danger flex items-start gap-2.5 rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs font-semibold leading-5 text-rose-800 dark:border-rose-500/40 dark:bg-rose-950/50 dark:text-rose-200 animate-in fade-in"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
                  <span>{createStoreError}</span>
                </div>
              )}

              {/* CARD 1: STORE & OWNER IDENTITY */}
              <div className="bg-white dark:bg-gradient-to-b dark:from-[#131B2E]/90 dark:to-[#0A0E1A]/80 p-5 rounded-2xl border border-gray-200 dark:border-[#1A263D] shadow-xs dark:shadow-[0_0_20px_rgba(59,130,246,0.05)] space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-slate-800">
                  <h5 className="font-bold text-gray-800 dark:text-white text-xs uppercase tracking-wider flex items-center gap-2">
                    <Building2 className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
                    <span>1. Store &amp; Owner Identity</span>
                  </h5>
                  <span className="text-[11px] text-gray-400 dark:text-slate-500 font-medium">
                    Tenant Profile
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Store Name */}
                  <div className="sm:col-span-2">
                    <label className="block font-bold text-gray-800 dark:text-slate-200 text-xs mb-1.5">
                      Store Name <span className="text-red-500 dark:text-pink-400">*</span>
                    </label>
                    <div className="relative">
                      <Building2 className="w-4 h-4 text-purple-600 dark:text-purple-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        required
                        autoFocus
                        value={newStoreName}
                        onChange={(e) => setNewStoreName(toTitleCaseLive(e.target.value))}
                        placeholder="e.g. Apex Footwear"
                        className="capitalize w-full pl-9 pr-3 py-2.5 bg-white dark:bg-purple-500/20 border border-gray-300 dark:border-purple-400/40 rounded-xl text-xs font-medium text-gray-900 dark:text-purple-100 placeholder-slate-400 dark:placeholder-purple-300/40 hover:bg-slate-50 dark:hover:bg-purple-500/30 outline-none focus:border-indigo-600 dark:focus:border-purple-400 transition shadow-2xs"
                      />
                    </div>
                  </div>

                  {/* Owner Name */}
                  <div>
                    <label className="block font-bold text-gray-800 dark:text-slate-200 text-xs mb-1.5">
                      Owner Full Name <span className="text-red-500 dark:text-pink-400">*</span>
                    </label>
                    <div className="relative">
                      <UserIcon className="w-4 h-4 text-purple-600 dark:text-purple-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        required
                        value={newOwnerName}
                        onChange={(e) => setNewOwnerName(toTitleCaseLive(e.target.value))}
                        placeholder="Enter owner name"
                        className="capitalize w-full pl-9 pr-3 py-2.5 bg-white dark:bg-purple-500/20 border border-gray-300 dark:border-purple-400/40 rounded-xl text-xs font-medium text-gray-900 dark:text-purple-100 placeholder-slate-400 dark:placeholder-purple-300/40 hover:bg-slate-50 dark:hover:bg-purple-500/30 outline-none focus:border-indigo-600 dark:focus:border-purple-400 transition shadow-2xs"
                      />
                    </div>
                  </div>

                  {/* Owner Email */}
                  <div>
                    <label className="block font-bold text-gray-800 dark:text-slate-200 text-xs mb-1.5">
                      Owner Login Email <span className="text-red-500 dark:text-pink-400">*</span>
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-purple-600 dark:text-purple-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="email"
                        required
                        value={newOwnerEmail}
                        onChange={(e) => setNewOwnerEmail(e.target.value)}
                        placeholder="owner@apexfootwear.com"
                        className="w-full pl-9 pr-3 py-2.5 bg-white dark:bg-purple-500/20 border border-gray-300 dark:border-purple-400/40 rounded-xl text-xs font-medium font-mono text-gray-900 dark:text-purple-100 placeholder-slate-400 dark:placeholder-purple-300/40 hover:bg-slate-50 dark:hover:bg-purple-500/30 outline-none focus:border-indigo-600 dark:focus:border-purple-400 transition shadow-2xs"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* CARD 2: BUSINESS MODEL & PRICING POLICY */}
              <div className="bg-white dark:bg-gradient-to-b dark:from-[#131B2E]/90 dark:to-[#0A0E1A]/80 p-5 rounded-2xl border border-gray-200 dark:border-[#1A263D] shadow-xs dark:shadow-[0_0_20px_rgba(59,130,246,0.05)] space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-slate-800">
                  <h5 className="font-bold text-gray-800 dark:text-white text-xs uppercase tracking-wider flex items-center gap-2">
                    <Store className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
                    <span>2. Business Type &amp; Pricing Policy</span>
                  </h5>
                  <span className="text-[11px] text-purple-600 dark:text-purple-400 font-semibold bg-purple-50 dark:bg-purple-950/60 px-2 py-0.5 rounded border border-purple-200 dark:border-purple-800">
                    {newBusinessType === 'RETAIL' ? 'Retail (B2C)' : 'Wholesale (B2B)'}
                  </span>
                </div>

                {/* Exclamation Mark Note: Settings cannot be changed after approval */}
                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 dark:border-amber-500/25 text-amber-800 dark:text-amber-200 text-xs flex items-start gap-2.5">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-500 text-white font-extrabold text-xs shrink-0 shadow-xs">
                    !
                  </span>
                  <div className="space-y-0.5">
                    <p className="text-[11.5px] leading-relaxed text-amber-900 dark:text-amber-100 font-semibold">
                      Caution: These settings cannot be changed after the store is created. Please choose your Business Type and Pricing Policy carefully.
                    </p>
                  </div>
                </div>

                {/* Business Type Selector */}
                <div>
                  <label className="block text-xs font-bold text-gray-800 dark:text-slate-200 mb-2">
                    Choose Business Type <span className="text-red-500 dark:text-pink-400">*</span>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label
                      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
                        newBusinessType === 'RETAIL'
                          ? 'border-purple-600 bg-purple-50/70 dark:bg-purple-950/40 dark:border-purple-500 ring-1 ring-purple-500/20'
                          : 'border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="superAdminBusinessType"
                        value="RETAIL"
                        checked={newBusinessType === 'RETAIL'}
                        onChange={() => setNewBusinessType('RETAIL')}
                        className="mt-0.5 text-purple-600 focus:ring-purple-500"
                      />
                      <div className="text-xs">
                        <span className="font-bold text-slate-900 dark:text-white block">Retail Store (B2C)</span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                          Individual pair sales, barcode scanning, walk-in shoppers &amp; returns
                        </span>
                      </div>
                    </label>

                    <label
                      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
                        newBusinessType === 'WHOLESALE'
                          ? 'border-purple-600 bg-purple-50/70 dark:bg-purple-950/40 dark:border-purple-500 ring-1 ring-purple-500/20'
                          : 'border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="superAdminBusinessType"
                        value="WHOLESALE"
                        checked={newBusinessType === 'WHOLESALE'}
                        onChange={() => {
                          setNewBusinessType('WHOLESALE');
                          setNewPricingMode('FIXED');
                        }}
                        className="mt-0.5 text-purple-600 focus:ring-purple-500"
                      />
                      <div className="text-xs">
                        <span className="font-bold text-slate-900 dark:text-white block">Wholesale Store (B2B)</span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                          Bulk carton packing, min order pairs, khata credit ledger &amp; transport bilty
                        </span>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Pricing Policy Radio Buttons (ONLY for Retail; hidden for Wholesale!) */}
                {newBusinessType === 'RETAIL' ? (
                  <div className="pt-2 border-t border-gray-100 dark:border-slate-800/80">
                    <label className="block text-xs font-bold text-gray-800 dark:text-slate-200 mb-1.5">
                      Which pricing policy does your shop have? <span className="text-red-500 dark:text-pink-400">*</span>
                    </label>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2.5">
                      Select how product prices are handled at the checkout counter:
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label
                        className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition ${
                          newPricingMode === 'FIXED'
                            ? 'border-purple-600 bg-purple-50/70 dark:bg-purple-950/40 dark:border-purple-500 ring-1 ring-purple-500/20'
                            : 'border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 hover:border-gray-300'
                        }`}
                      >
                        <input
                          type="radio"
                          name="superAdminPricingMode"
                          value="FIXED"
                          checked={newPricingMode === 'FIXED'}
                          onChange={() => setNewPricingMode('FIXED')}
                          className="mt-0.5 text-purple-600 focus:ring-purple-500"
                        />
                        <div className="text-xs">
                          <span className="font-bold text-slate-900 dark:text-white block">Fixed Price</span>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                            Single fixed selling price printed on barcode tags
                          </span>
                        </div>
                      </label>

                      <label
                        className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition ${
                          newPricingMode === 'NEGOTIABLE'
                            ? 'border-purple-600 bg-purple-50/70 dark:bg-purple-950/40 dark:border-purple-500 ring-1 ring-purple-500/20'
                            : 'border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 hover:border-gray-300'
                        }`}
                      >
                        <input
                          type="radio"
                          name="superAdminPricingMode"
                          value="NEGOTIABLE"
                          checked={newPricingMode === 'NEGOTIABLE'}
                          onChange={() => setNewPricingMode('NEGOTIABLE')}
                          className="mt-0.5 text-purple-600 focus:ring-purple-500"
                        />
                        <div className="text-xs">
                          <span className="font-bold text-slate-900 dark:text-white block">Bargaining / Range Price</span>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                            Min / Max price range allowing customer bargaining
                          </span>
                        </div>
                      </label>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="p-3 rounded-xl bg-purple-50/60 dark:bg-purple-950/30 border border-purple-200/70 dark:border-purple-800/50 flex items-center gap-2 text-xs text-purple-800 dark:text-purple-300">
                      <CheckCircle2 className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                      <span>
                        <strong>Fixed Wholesale Pricing:</strong> Wholesale stores operate with standard fixed carton and wholesale pair rates.
                      </span>
                    </div>

                    {/* Minimum Selling Quantity (0.5 or 1 Carton) */}
                    <div className="p-3.5 rounded-xl bg-gray-50/80 dark:bg-slate-900/60 border border-gray-200 dark:border-slate-800 space-y-2">
                      <label className="block text-xs font-bold text-gray-800 dark:text-slate-200">
                        Globally Allow Half-Carton Selling (0.5 Carton)
                      </label>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        If disabled globally, you can still enable or override this option individually at the product level.
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                        <label
                          className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition ${
                            newMinSellingQuantity === 0.5
                              ? 'border-purple-600 bg-purple-50/70 dark:bg-purple-950/40 dark:border-purple-500 ring-1 ring-purple-500/20'
                              : 'border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 hover:border-gray-300'
                          }`}
                        >
                          <input
                            type="radio"
                            name="superAdminMinSellingQty"
                            value="0.5"
                            checked={newMinSellingQuantity === 0.5}
                            onChange={() => setNewMinSellingQuantity(0.5)}
                            className="mt-0.5 text-purple-600 focus:ring-purple-500"
                          />
                          <div className="text-xs">
                            <span className="font-bold text-slate-900 dark:text-white block flex items-center gap-1.5">
                              <span>Globally Allow Half-Carton Selling (0.5 Carton)</span>
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 font-mono">Flexible</span>
                            </span>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                              If disabled globally, you can still enable or override this option individually at the product level.
                            </span>
                          </div>
                        </label>

                        <label
                          className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition ${
                            newMinSellingQuantity === 1.0
                              ? 'border-purple-600 bg-purple-50/70 dark:bg-purple-950/40 dark:border-purple-500 ring-1 ring-purple-500/20'
                              : 'border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 hover:border-gray-300'
                          }`}
                        >
                          <input
                            type="radio"
                            name="superAdminMinSellingQty"
                            value="1"
                            checked={newMinSellingQuantity === 1.0}
                            onChange={() => setNewMinSellingQuantity(1.0)}
                            className="mt-0.5 text-purple-600 focus:ring-purple-500"
                          />
                          <div className="text-xs">
                            <span className="font-bold text-slate-900 dark:text-white block flex items-center gap-1.5">
                              <span>1 Carton (Full Carton)</span>
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-gray-200 dark:bg-slate-800 text-gray-700 dark:text-slate-300 font-mono">Standard</span>
                            </span>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                              Strict full-carton packing (minimum 1 carton, no broken cartons)
                            </span>
                          </div>
                        </label>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* CARD 3: OWNER SECURITY CREDENTIALS */}
              <div className="bg-white dark:bg-gradient-to-b dark:from-[#131B2E]/90 dark:to-[#0A0E1A]/80 p-5 rounded-2xl border border-gray-200 dark:border-[#1A263D] shadow-xs dark:shadow-[0_0_20px_rgba(59,130,246,0.05)] space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-slate-800">
                  <h5 className="font-bold text-gray-800 dark:text-white text-xs uppercase tracking-wider flex items-center gap-2">
                    <Lock className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
                    <span>3. Owner Security &amp; Credentials</span>
                  </h5>
                  <span className="text-[10px] text-purple-600 dark:text-purple-300 font-semibold bg-purple-50 dark:bg-purple-950/50 px-2 py-0.5 rounded border border-purple-200 dark:border-purple-800">
                    Min 4 Characters
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Password */}
                  <div>
                    <label className="block font-bold text-gray-800 dark:text-slate-200 text-xs mb-1.5">
                      Password <span className="text-red-500 dark:text-pink-400">*</span>
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-purple-600 dark:text-purple-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type={showNewOwnerPassword ? 'text' : 'password'}
                        required
                        minLength={4}
                        value={newOwnerPassword}
                        onChange={(e) => setNewOwnerPassword(e.target.value)}
                        placeholder="Set initial Owner password"
                        className="w-full pl-9 pr-10 py-2.5 bg-white dark:bg-purple-500/20 border border-gray-300 dark:border-purple-400/40 rounded-xl text-xs font-medium font-mono text-gray-900 dark:text-purple-100 placeholder-slate-400 dark:placeholder-purple-300/40 hover:bg-slate-50 dark:hover:bg-purple-500/30 outline-none focus:border-indigo-600 dark:focus:border-purple-400 transition shadow-2xs"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewOwnerPassword((prev) => !prev)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                        title={showNewOwnerPassword ? 'Hide password' : 'Show password'}
                      >
                        {showNewOwnerPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Confirm Password */}
                  <div>
                    <label className="block font-bold text-gray-800 dark:text-slate-200 text-xs mb-1.5">
                      Confirm Password <span className="text-red-500 dark:text-pink-400">*</span>
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-purple-600 dark:text-purple-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type={showNewOwnerPassword ? 'text' : 'password'}
                        required
                        minLength={4}
                        value={newOwnerConfirmPassword}
                        onChange={(e) => setNewOwnerConfirmPassword(e.target.value)}
                        placeholder="Enter the password again"
                        autoComplete="new-password"
                        className="w-full pl-9 pr-3 py-2.5 bg-white dark:bg-purple-500/20 border border-gray-300 dark:border-purple-400/40 rounded-xl text-xs font-medium font-mono text-gray-900 dark:text-purple-100 placeholder-slate-400 dark:placeholder-purple-300/40 hover:bg-slate-50 dark:hover:bg-purple-500/30 outline-none focus:border-indigo-600 dark:focus:border-purple-400 transition shadow-2xs"
                      />
                    </div>
                  </div>
                </div>

                {/* Real-time Password Match Indicator */}
                {newOwnerPassword && newOwnerConfirmPassword && (
                  <div
                    className={`p-2.5 rounded-xl text-xs flex items-center gap-2 border ${
                      newOwnerPassword === newOwnerConfirmPassword
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60'
                        : 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60'
                    }`}
                  >
                    {newOwnerPassword === newOwnerConfirmPassword ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span>Passwords match securely.</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                        <span>Passwords do not match yet.</span>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* CARD 4: SUBSCRIPTION PLAN & TENANT PROVISIONING */}
              <div className="bg-white dark:bg-gradient-to-b dark:from-[#131B2E]/90 dark:to-[#0A0E1A]/80 p-5 rounded-2xl border border-gray-200 dark:border-[#1A263D] shadow-xs dark:shadow-[0_0_20px_rgba(59,130,246,0.05)] space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-slate-800">
                  <h5 className="font-bold text-gray-800 dark:text-white text-xs uppercase tracking-wider flex items-center gap-2">
                    <KeyRound className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
                    <span>4. Subscription Plan &amp; License Key</span>
                  </h5>
                  <span className="text-[11px] text-indigo-600 dark:text-indigo-400 font-semibold bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-800">
                    Active on Creation
                  </span>
                </div>

                <div>
                  <label className="block font-bold text-gray-800 dark:text-slate-200 text-xs mb-1.5">
                    Subscription Plan <span className="text-red-500 dark:text-pink-400">*</span>
                  </label>
                  <select
                    value={newSubscriptionPlan}
                    onChange={(e) => setNewSubscriptionPlan(e.target.value as 'free_tier' | '6_MONTHS' | 'YEARLY')}
                    className="capitalize w-full px-3.5 py-2.5 bg-white dark:bg-purple-500/20 border border-gray-300 dark:border-purple-400/40 rounded-xl text-xs font-semibold text-gray-900 dark:text-purple-100 hover:bg-slate-50 dark:hover:bg-purple-500/30 outline-none focus:border-indigo-600 dark:focus:border-purple-400 cursor-pointer transition"
                  >
                    <option value="free_tier" className="bg-white text-gray-900 dark:bg-[#120726] dark:text-purple-100">
                      30-Day Free Tier (Trial)
                    </option>
                    <option value="6_MONTHS" className="bg-white text-gray-900 dark:bg-[#120726] dark:text-purple-100">
                      6 Months Plan
                    </option>
                    <option value="YEARLY" className="bg-white text-gray-900 dark:bg-[#120726] dark:text-purple-100">
                      Yearly Plan (1 Year)
                    </option>
                  </select>

                  <div className="mt-3 p-3 rounded-xl bg-indigo-50/70 dark:bg-gradient-to-br dark:from-slate-900 dark:via-indigo-950 dark:to-purple-950 border border-indigo-200/80 dark:border-indigo-600/40 text-[11px] font-mono text-slate-700 dark:text-purple-200 flex flex-wrap items-center justify-between gap-2 shadow-2xs">
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                      Plan: <strong className="text-indigo-950 dark:text-white">{newSubscriptionPlan === 'free_tier' ? '30-Day Free Tier' : newSubscriptionPlan === '6_MONTHS' ? '6 Months' : 'Yearly'}</strong>
                    </span>
                    <span>
                      Expires:{' '}
                      <strong className="text-indigo-950 dark:text-white">
                        {(() => {
                          const d = new Date();
                          if (newSubscriptionPlan === 'free_tier') {
                            d.setDate(d.getDate() + 30);
                          } else if (newSubscriptionPlan === '6_MONTHS') {
                            d.setMonth(d.getMonth() + 6);
                          } else {
                            d.setFullYear(d.getFullYear() + 1);
                          }
                          return d.toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          });
                        })()}
                      </strong>
                    </span>
                  </div>
                </div>

                <p className="text-[11px] text-gray-500 dark:text-slate-400 leading-relaxed">
                  Store defaults (invoices, barcodes, address &amp; taxes) are configured by the Store Owner on first login.
                </p>
              </div>
            </form>

            {/* MODAL FOOTER ALIGNED WITH PRODUCT FORM MODAL */}
            <div className="bg-slate-50 dark:bg-gradient-to-r dark:from-purple-900/90 dark:via-indigo-950/85 dark:to-slate-900 border-t border-gray-200 dark:border-purple-800/80 px-6 py-4 flex items-center justify-between shrink-0">
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="btn-secondary px-4 py-2.5 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="submit"
                form="add-new-store-form"
                disabled={creatingStore}
                style={{ color: '#ffffff' }}
                className="btn-primary btn-pure-white px-6 py-2.5 text-xs font-bold cursor-pointer flex items-center gap-1.5 shadow-md disabled:opacity-50"
              >
                {creatingStore ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin !text-white" style={{ color: '#ffffff', stroke: '#ffffff' }} />
                    <span className="!text-white text-white font-bold" style={{ color: '#ffffff' }}>
                      Creating Store...
                    </span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 !text-white" style={{ color: '#ffffff', stroke: '#ffffff' }} />
                    <span className="!text-white text-white font-bold" style={{ color: '#ffffff' }}>
                      Create Store &amp; Owner
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Store Subscription Modal */}
      {storeToEditSub && (
        <div className="form-modal-theme fixed inset-0 bg-black/65 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="app-card bg-white dark:bg-[#111827] border border-slate-200 dark:border-purple-800/70 rounded-2xl max-w-md w-full p-6 shadow-2xl text-slate-900 dark:text-white">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-purple-50 dark:bg-purple-500/15 border border-purple-200 dark:border-purple-500/30 flex items-center justify-center text-purple-600 dark:text-purple-400">
                  <Calendar className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Store Subscription
                  </h3>
                  <p className="text-xs font-mono text-purple-600 dark:text-purple-300">
                    {storeToEditSub.name}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setStoreToEditSub(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveSubscription} className="space-y-4 mt-4">
              {/* Subscription Plan Dropdown */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Subscription Plan
                </label>
                <select
                  value={editSubPlan}
                  onChange={(e) => {
                    const nextPlan = e.target.value as 'free_tier' | '6_MONTHS' | 'YEARLY';
                    setEditSubPlan(nextPlan);
                    const d = new Date();
                    if (nextPlan === 'free_tier') {
                      d.setDate(d.getDate() + 30);
                    } else if (nextPlan === '6_MONTHS') {
                      d.setMonth(d.getMonth() + 6);
                    } else {
                      d.setFullYear(d.getFullYear() + 1);
                    }
                    setEditSubEndDate(d.toISOString().slice(0, 10));
                    setEditSubStatus('ACTIVE');
                  }}
                  className="app-input capitalize w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-purple-800/60 text-slate-900 dark:text-white text-sm font-semibold outline-none focus:border-purple-600 cursor-pointer"
                >
                  <option value="free_tier">30-Day Free Tier (Trial)</option>
                  <option value="6_MONTHS">6 Months</option>
                  <option value="YEARLY">Yearly</option>
                </select>
              </div>

              {/* Manual Expiry Date & Quick Renewal Presets */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Subscription Expiry Date
                  </label>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        const d = new Date();
                        d.setDate(d.getDate() + 30);
                        setEditSubPlan('free_tier');
                        setEditSubEndDate(d.toISOString().slice(0, 10));
                        setEditSubStatus('ACTIVE');
                      }}
                      className="px-2 py-0.5 rounded bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-[10px] font-mono font-bold cursor-pointer"
                    >
                      +30 Days Trial
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const d = new Date();
                        d.setMonth(d.getMonth() + 6);
                        setEditSubPlan('6_MONTHS');
                        setEditSubEndDate(d.toISOString().slice(0, 10));
                        setEditSubStatus('ACTIVE');
                      }}
                      className="px-2 py-0.5 rounded bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 text-[10px] font-mono font-bold cursor-pointer"
                    >
                      +6 Months
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const d = new Date();
                        d.setFullYear(d.getFullYear() + 1);
                        setEditSubPlan('YEARLY');
                        setEditSubEndDate(d.toISOString().slice(0, 10));
                        setEditSubStatus('ACTIVE');
                      }}
                      className="px-2 py-0.5 rounded bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[10px] font-mono font-bold cursor-pointer"
                    >
                      +1 Year
                    </button>
                  </div>
                </div>
                <input
                  type="date"
                  required
                  value={editSubEndDate}
                  onChange={(e) => {
                    const val = e.target.value;
                    setEditSubEndDate(val);
                    if (val) {
                      const chosen = new Date(`${val}T23:59:59.999Z`);
                      if (chosen.getTime() < Date.now()) {
                        setEditSubStatus('EXPIRED');
                      } else if (editSubStatus === 'EXPIRED') {
                        setEditSubStatus('ACTIVE');
                      }
                    }
                  }}
                  className="app-input w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-purple-800/60 text-slate-900 dark:text-white text-sm font-mono outline-none focus:border-purple-600"
                />
              </div>

              {/* Subscription Status */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Subscription Status
                </label>
                <select
                  value={editSubStatus}
                  onChange={(e) =>
                    setEditSubStatus(e.target.value as 'ACTIVE' | 'EXPIRED' | 'SUSPENDED')
                  }
                  className="app-input capitalize w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-purple-800/60 text-slate-900 dark:text-white text-sm font-semibold outline-none focus:border-purple-600 cursor-pointer"
                >
                  <option value="ACTIVE">Active</option>
                  <option value="EXPIRED">Expired</option>
                  <option value="SUSPENDED">Suspended</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200/80 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setStoreToEditSub(null)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingSub}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:to-indigo-800 text-white text-xs font-bold shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {savingSub ? 'Saving...' : 'Save Subscription'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Delete Store Modal */}
      {storeToDelete && (
        <div className="form-modal-theme fixed inset-0 bg-black/65 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="app-card bg-white dark:bg-[#111827] border border-rose-200 dark:border-rose-500/40 rounded-2xl max-w-md w-full p-6 shadow-2xl text-slate-900 dark:text-white">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-2.5 text-rose-600 dark:text-rose-400">
                <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/30 flex items-center justify-center shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Delete Store Tenant?
                  </h3>
                  <div className="text-xs font-mono text-rose-600 dark:text-rose-300">
                    {storeToDelete.name} (ID #{storeToDelete.id})
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setStoreToDelete(null);
                  setError(null);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 mb-4 leading-relaxed">
              You are about to permanently delete <strong>{storeToDelete.name}</strong> and all of its isolated records ({storeToDelete.productCount} products, {storeToDelete.salesCount} sales invoices, staff accounts, and settings). You can export an SQL backup before deleting.
            </p>

            {error && (
              <div className="mb-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-500/40 text-rose-700 dark:text-rose-200 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-200/80 dark:border-slate-800">
              <button
                type="button"
                onClick={() => handleExportStoreSql(storeToDelete)}
                disabled={exportingStoreId === storeToDelete.id}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-sky-50 hover:bg-sky-100 dark:bg-sky-500/15 dark:hover:bg-sky-500/25 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-500/30 text-xs font-bold cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>
                  {exportingStoreId === storeToDelete.id ? 'Exporting...' : 'Export SQL First'}
                </span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setStoreToDelete(null);
                    setError(null);
                  }}
                  className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={deletingStore}
                  onClick={handleConfirmDeleteStore}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-bold shadow-sm cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{deletingStore ? 'Deleting...' : 'Delete Permanently'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SuperAdmin Platform SQL Import Modal */}
      {importSqlModalOpen && (
        <div
          className="form-modal-theme fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto"
          onClick={() => !importingPlatformSql && setImportSqlModalOpen(false)}
        >
          <div
            className="relative w-full max-w-3xl bg-white dark:bg-[#131B2E] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] border border-slate-200 dark:border-purple-800/80 animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-slate-50 dark:bg-gradient-to-r dark:from-purple-900 dark:via-indigo-950 dark:to-slate-900 border-b border-slate-200 dark:border-purple-800/80 px-6 py-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-purple-600/10 dark:bg-purple-500/20 border border-purple-500/25 dark:border-purple-400/40 flex items-center justify-center text-purple-600 dark:text-purple-300 shrink-0">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900 dark:text-white tracking-tight">
                    SuperAdmin Platform Data Import &amp; Multi-Store Seed
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-purple-200/80">
                    Upload a data import file or 1-click import the 24-store, 2,400-product dataset
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={importingPlatformSql}
                onClick={() => setImportSqlModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:text-purple-300 dark:hover:text-white rounded-lg hover:bg-slate-200/60 dark:hover:bg-white/10 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 overflow-y-auto space-y-4 text-xs bg-slate-50/50 dark:bg-[#070B14]">
              {importSqlError && (
                <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-500/40 text-rose-700 dark:text-rose-200 flex items-start gap-2.5 font-medium">
                  <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                  <span>{importSqlError}</span>
                </div>
              )}

              {/* Quick Actions Bar: Upload .SQL, 1-Click Load & Import 24-Store SQL, Download Sample .SQL */}
              <div className="p-4 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-indigo-500/25 space-y-3 shadow-2xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="font-bold text-slate-900 dark:text-white text-xs sm:text-sm">
                      Multi-Store Dataset Package (<code className="font-mono text-purple-600 dark:text-purple-300">/multi-store-pos-import.sql</code>)
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Includes 24 stores, company settings, 2,400 store-scoped Products, 240 purchases, purchase returns, 240 customers &amp; 480 sales.
                    </p>
                  </div>
                  <a
                    href="/multi-store-pos-import.sql"
                    download="multi-store-pos-import.sql"
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs transition shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Dataset File</span>
                  </a>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <input
                    ref={sqlFileInputRef}
                    type="file"
                    accept=".sql,text/plain"
                    onChange={handleSqlFileUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => sqlFileInputRef.current?.click()}
                    disabled={importingPlatformSql || loadingSampleSql}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-sky-50 hover:bg-sky-100 dark:bg-sky-500/15 dark:hover:bg-sky-500/25 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-500/30 font-bold text-xs cursor-pointer transition"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Choose Data File from Computer</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleLoadMultiStoreSampleSql(false)}
                    disabled={importingPlatformSql || loadingSampleSql}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 dark:bg-purple-500/15 dark:hover:bg-purple-500/25 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-500/30 font-bold text-xs cursor-pointer transition"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>{loadingSampleSql ? 'Loading Data...' : 'Load 24-Store Data into Editor'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleLoadMultiStoreSampleSql(true)}
                    disabled={importingPlatformSql || loadingSampleSql}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-xs shadow-sm cursor-pointer transition disabled:opacity-50"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>
                      {importingPlatformSql
                        ? 'Importing 24 Stores & 2,400 Products...'
                        : '1-Click Import 24-Store Dataset Now'}
                    </span>
                  </button>
                </div>
              </div>

              {/* SQL Script Editor */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-700 dark:text-slate-200 text-xs">
                    Data Script &amp; Records {sqlFileName ? `— ${sqlFileName}` : ''}
                  </label>
                  {sqlImportText && (
                    <button
                      type="button"
                      onClick={() => {
                        setSqlImportText('');
                        setSqlFileName(null);
                      }}
                      className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
                    >
                      Clear Editor
                    </button>
                  )}
                </div>
                <textarea
                  rows={10}
                  value={sqlImportText}
                  onChange={(e) => setSqlImportText(e.target.value)}
                  placeholder="-- Paste data statements or records here, or click 'Load 24-Store Data into Editor' above..."
                  className="w-full p-3.5 rounded-xl bg-white dark:bg-[#0D1322] border border-slate-200 dark:border-indigo-500/30 font-mono text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="bg-slate-50 dark:bg-gradient-to-r dark:from-purple-900/90 dark:via-indigo-950/85 dark:to-slate-900 border-t border-slate-200 dark:border-purple-800/80 px-6 py-4 flex items-center justify-between shrink-0">
              <button
                type="button"
                disabled={importingPlatformSql}
                onClick={() => setImportSqlModalOpen(false)}
                className="px-4 py-2.5 rounded-xl bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={importingPlatformSql || !sqlImportText.trim()}
                onClick={() => handleExecutePlatformSqlImport()}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:to-indigo-800 text-white text-xs font-bold shadow-md cursor-pointer disabled:opacity-50"
              >
                {importingPlatformSql ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Applying Data Import...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Apply &amp; Import Data</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Top-Right Toast Notification for Immediate Action Feedback */}
      <AnimatePresence>
        {successMessage && (
          <motion.div
            initial={{ opacity: 0, y: -16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.96 }}
            className="fixed top-16 right-4 z-50 max-w-md bg-emerald-600 text-white px-4 py-3 rounded-2xl shadow-2xl border border-emerald-400/40 flex items-center gap-3 text-xs font-bold"
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span className="flex-1">{successMessage}</span>
            <button
              type="button"
              onClick={() => setSuccessMessage(null)}
              className="p-1 rounded-lg hover:bg-white/20 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Compose Custom Notification Modal */}
      {notificationModalOpen && (
        <div
          className="form-modal-theme fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-xs overflow-y-auto"
          onClick={() => {
            if (!sendingNotif) setNotificationModalOpen(false);
          }}
        >
          <div
            className="relative w-full max-w-2xl bg-white dark:bg-[#131B2E] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[94vh] border border-slate-200 dark:border-purple-800/80 animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="bg-slate-50 dark:bg-gradient-to-r dark:from-purple-900 dark:via-indigo-950 dark:to-slate-900 border-b border-slate-200 dark:border-purple-800/80 text-slate-800 dark:text-white px-6 py-4 shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-600 dark:bg-purple-500/20 dark:text-purple-300 border border-purple-500/20 dark:border-purple-400/30 flex items-center justify-center font-bold shadow-2xs shrink-0">
                    <Megaphone className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-slate-900 dark:text-white tracking-tight">
                      Send Custom Notification
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-purple-200/80">
                      Deliver real-time announcements &amp; Web Push alerts to all stores or a specific store
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={sendingNotif}
                  onClick={() => setNotificationModalOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 dark:text-purple-300 dark:hover:text-white rounded-lg hover:bg-slate-200/60 dark:hover:bg-white/10 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Form */}
            <form
              id="send-custom-notification-form"
              onSubmit={handleSendNotification}
              className="flex-1 overflow-y-auto p-6 space-y-4 text-xs bg-slate-50/50 dark:bg-[#070B14]"
            >
              {notifError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-500/40 text-rose-800 dark:text-rose-200 text-xs font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                  <span>{notifError}</span>
                </div>
              )}

              {/* CARD 1: TARGET RECIPIENT */}
              <div className="bg-white dark:bg-[#131B2E] p-4.5 rounded-2xl border border-slate-200 dark:border-[#1A263D] shadow-xs space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                  <h5 className="font-bold text-slate-800 dark:text-white text-xs uppercase tracking-wider flex items-center gap-2">
                    <Store className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                    <span>1. Target Store Recipient</span>
                  </h5>
                  <span className="text-[10px] text-purple-600 dark:text-purple-300 font-bold bg-purple-50 dark:bg-purple-950/50 px-2 py-0.5 rounded border border-purple-200 dark:border-purple-800">
                    {notifTargetTenantId === 'ALL' ? 'Global Broadcast' : 'Single Store Target'}
                  </span>
                </div>

                <div className="space-y-2">
                  <label className="block font-bold text-slate-800 dark:text-slate-200 text-xs">
                    Deliver To <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={notifTargetTenantId}
                    onChange={(e) => setNotifTargetTenantId(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-purple-500/10 border border-slate-300 dark:border-purple-400/40 text-xs font-semibold text-slate-900 dark:text-purple-100 outline-none focus:border-purple-600 cursor-pointer transition"
                  >
                    <option value="ALL">📢 All Stores (Global Platform Broadcast)</option>
                    <optgroup label="Specific Deployed Stores">
                      {stores.map((st) => (
                        <option key={st.id} value={String(st.id)}>
                          🏪 {st.name} (ID #{st.id}) — {st.ownerEmail || 'Store Owner'}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {notifTargetTenantId === 'ALL'
                      ? 'Every registered store on the platform will receive this announcement on their next login or live POS session.'
                      : `Only personnel and terminals belonging to '${stores.find((s) => String(s.id) === notifTargetTenantId)?.name || 'the selected store'}' will receive this alert.`}
                  </p>
                </div>
              </div>

              {/* CARD 2: NOTIFICATION TYPE / PRIORITY */}
              <div className="bg-white dark:bg-[#131B2E] p-4.5 rounded-2xl border border-slate-200 dark:border-[#1A263D] shadow-xs space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                  <h5 className="font-bold text-slate-800 dark:text-white text-xs uppercase tracking-wider flex items-center gap-2">
                    <Radio className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                    <span>2. Notification Priority &amp; Category</span>
                  </h5>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { value: 'INFO', label: 'Info', desc: 'General Notice', color: 'border-sky-300 dark:border-sky-700 bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-300' },
                    { value: 'SUCCESS', label: 'Success', desc: 'Positive Update', color: 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300' },
                    { value: 'WARNING', label: 'Warning', desc: 'Action Advised', color: 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300' },
                    { value: 'URGENT', label: 'Urgent', desc: 'Critical Banner', color: 'border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300' },
                  ].map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setNotifType(p.value as PlatformNotificationType)}
                      className={`p-2.5 rounded-xl border text-left cursor-pointer transition ${
                        notifType === p.value
                          ? `${p.color} ring-2 ring-purple-500/40 shadow-xs font-bold`
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                      }`}
                    >
                      <div className="font-bold text-xs flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${p.value === 'URGENT' ? 'bg-rose-500 animate-ping' : p.value === 'WARNING' ? 'bg-amber-500' : p.value === 'SUCCESS' ? 'bg-emerald-500' : 'bg-sky-500'}`} />
                        <span>{p.label}</span>
                      </div>
                      <div className="text-[10px] opacity-80 mt-0.5">{p.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* CARD 3: CONTENT (TITLE & MESSAGE) */}
              <div className="bg-white dark:bg-[#131B2E] p-4.5 rounded-2xl border border-slate-200 dark:border-[#1A263D] shadow-xs space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                  <h5 className="font-bold text-slate-800 dark:text-white text-xs uppercase tracking-wider flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                    <span>3. Announcement Content</span>
                  </h5>
                </div>

                <div>
                  <label className="block font-bold text-slate-800 dark:text-slate-200 text-xs mb-1">
                    Notification Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={notifTitle}
                    onChange={(e) => setNotifTitle(e.target.value)}
                    placeholder="e.g. Scheduled System Upgrade tonight at 11:00 PM"
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-purple-500/10 border border-slate-300 dark:border-purple-400/40 rounded-xl text-xs font-bold text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:border-purple-600 transition"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-800 dark:text-slate-200 text-xs mb-1">
                    Message Body <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    required
                    rows={4}
                    value={notifMessage}
                    onChange={(e) => setNotifMessage(e.target.value)}
                    placeholder="Write your announcement details here. E.g., Dear store owners, we are deploying an update to optimize POS thermal receipt printing..."
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-purple-500/10 border border-slate-300 dark:border-purple-400/40 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:border-purple-600 transition resize-none leading-relaxed"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 text-xs mb-1">
                      Action Button Label (Optional)
                    </label>
                    <input
                      type="text"
                      value={notifActionLabel}
                      onChange={(e) => setNotifActionLabel(e.target.value)}
                      placeholder="e.g. View Reports or Review Stock"
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white outline-none focus:border-purple-600"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 text-xs mb-1">
                      Action URL / Deep Link (Optional)
                    </label>
                    <input
                      type="text"
                      value={notifActionUrl}
                      onChange={(e) => setNotifActionUrl(e.target.value)}
                      placeholder="e.g. /reports or /inventory"
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-xs font-mono text-slate-900 dark:text-white outline-none focus:border-purple-600"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 text-xs mb-1">
                    Auto-Expiry Duration
                  </label>
                  <select
                    value={notifExpiryHours}
                    onChange={(e) => setNotifExpiryHours(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-white outline-none focus:border-purple-600 cursor-pointer"
                  >
                    <option value="0">Never Expires (Permanent Announcement)</option>
                    <option value="24">Expires in 24 Hours</option>
                    <option value="72">Expires in 3 Days</option>
                    <option value="168">Expires in 7 Days (1 Week)</option>
                    <option value="720">Expires in 30 Days (1 Month)</option>
                  </select>
                </div>
              </div>

              {/* CARD 4: LIVE STORE PREVIEW */}
              <div className="bg-white dark:bg-[#131B2E] p-4.5 rounded-2xl border border-slate-200 dark:border-[#1A263D] shadow-xs space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Store POS Live Preview
                </div>
                <div
                  className={`p-3.5 rounded-xl border ${
                    notifType === 'URGENT'
                      ? 'border-rose-400 bg-rose-50/70 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200'
                      : notifType === 'WARNING'
                      ? 'border-amber-400 bg-amber-50/70 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200'
                      : notifType === 'SUCCESS'
                      ? 'border-emerald-400 bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200'
                      : 'border-sky-400 bg-sky-50/70 dark:bg-sky-950/40 text-sky-900 dark:text-sky-200'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider bg-black/10 dark:bg-white/10">
                      {notifType}
                    </span>
                    <span className="font-bold text-xs truncate">
                      {notifTitle || 'Announcement Title'}
                    </span>
                  </div>
                  <p className="text-[11px] leading-relaxed opacity-90">
                    {notifMessage || 'Your announcement message preview will appear here as you type...'}
                  </p>
                  {notifActionLabel && (
                    <div className="mt-2">
                      <span className="inline-block px-2.5 py-1 rounded-lg text-[10px] font-bold bg-white/80 dark:bg-black/40 border border-black/10 dark:border-white/20">
                        {notifActionLabel} &rarr;
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </form>

            {/* Modal Footer */}
            <div className="bg-slate-50 dark:bg-gradient-to-r dark:from-purple-900/90 dark:via-indigo-950/85 dark:to-slate-900 border-t border-slate-200 dark:border-purple-800/80 px-6 py-4 flex items-center justify-between shrink-0">
              <button
                type="button"
                disabled={sendingNotif}
                onClick={() => setNotificationModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="submit"
                form="send-custom-notification-form"
                disabled={sendingNotif || !notifTitle.trim() || !notifMessage.trim()}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:to-indigo-800 text-white text-xs font-bold shadow-md cursor-pointer flex items-center gap-2 disabled:opacity-50"
              >
                {sendingNotif ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-white" />
                    <span>Broadcasting...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>
                      {notifTargetTenantId === 'ALL'
                        ? 'Broadcast to All Stores'
                        : `Send to ${stores.find((s) => String(s.id) === notifTargetTenantId)?.name || 'Store'}`}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SuperAdmin Profile & Security Modal */}
      {isProfileModalOpen && (
        <UserProfileModal
          isOpen={isProfileModalOpen}
          onClose={() => setIsProfileModalOpen(false)}
          currentUser={currentUser}
          onUserUpdated={(updated) => {
            onUserAuthenticated(updated, '');
            try {
              localStorage.setItem('pos_current_user', JSON.stringify(updated));
            } catch {}
          }}
          storeName="Platform SuperAdmin"
        />
      )}
    </div>
  );
};
