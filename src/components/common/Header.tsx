import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, Settings, ChevronDown, Menu, Sun, Moon, Monitor, UserCog, LogOut, AlertTriangle, AlertCircle, CheckCircle2, ShoppingBag, ArrowLeftRight, Truck, RefreshCw, CheckCheck, Check, Boxes, X, ShieldCheck, User, ShoppingCart, Copy, Coins, Loader2, ImageIcon, Edit3, PackagePlus, Printer, BellRing, Radio, ExternalLink, Globe, Store, Info, Flame } from 'lucide-react';
import { UserAvatar } from './UserAvatar.tsx';
import { ThemeDropdown } from './ThemeDropdown.tsx';
import { useTheme } from '../../context/ThemeContext.tsx';
import { api } from '../../services/api.ts';
import { PlatformNotification, PlatformNotificationType } from '../../types.ts';
import { getProductRetailPrice, getProductMinFloorPrice } from '../../utils/priceFormat.ts';
import { lookupCachedProductOffline, searchCachedProductsOffline } from '../../utils/offlineDb.ts';
import { isWebPushSupported, getNotificationPermissionState, isDeviceSubscribedToPush, subscribeDeviceToWebPush, resyncPushSubscriptionIfEnabled, unsubscribeDeviceFromWebPush, connectRealtimeNotificationStream } from '../../services/pushNotificationClient.ts';

interface HeaderProps {
  currentTab: string;
  onTabChange?: (tab: string) => void;
  currentUser: any;
  companySettings: any;
  onLogout: () => void;
  onToggleMobileMenu: () => void;
  onOpenProfile?: () => void;
  onSwitchRole?: (role: 'ADMIN' | 'CASHIER') => void;
}

/**
 * Component to display a product thumbnail in quick price search suggestions.
 * If an image exists and loads successfully, displays the image.
 * If no image exists or fails to load, displays an animated skeleton placeholder.
 */
interface QuickSearchProductImageProps {
  prod: {
    primaryImageUrl?: string | null;
    primary_image_url?: string | null;
    imageUrl?: string | null;
    image?: string | null;
    article?: string;
    name?: string;
  };
}

const QuickSearchProductImage: React.FC<QuickSearchProductImageProps> = ({ prod }) => {
  const imageUrl = (prod.primaryImageUrl || prod.primary_image_url || prod.imageUrl || prod.image || '').trim();
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  // If no image exists or image URL fails to load, show skeleton placeholder
  if (!imageUrl || imageError) {
    return (
      <div
        className="w-13 h-13 sm:w-14 sm:h-14 shrink-0 rounded-xl border border-slate-200/90 dark:border-slate-800/90 bg-slate-200/70 dark:bg-slate-800/60 animate-pulse flex flex-col items-center justify-center p-1.5 relative overflow-hidden shadow-2xs select-none"
        title="No image - placeholder skeleton"
        aria-label="Product image skeleton"
      >
        <div className="w-6 h-6 rounded-lg bg-slate-300/80 dark:bg-slate-700/80 flex items-center justify-center shadow-2xs">
          <ImageIcon className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
        </div>
        <div className="w-7 h-1 bg-slate-300/60 dark:bg-slate-700/60 rounded-full mt-1.5" />
      </div>
    );
  }

  return (
    <div className="relative w-13 h-13 sm:w-14 sm:h-14 shrink-0 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-100 dark:bg-[#0A0E1A] overflow-hidden p-0.5 shadow-2xs flex items-center justify-center select-none">
      {!imageLoaded && (
        <div className="absolute inset-0 w-full h-full bg-slate-200/70 dark:bg-slate-800/60 animate-pulse flex flex-col items-center justify-center">
          <div className="w-6 h-6 rounded-lg bg-slate-300/80 dark:bg-slate-700/80 flex items-center justify-center">
            <ImageIcon className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
          </div>
          <div className="w-7 h-1 bg-slate-300/60 dark:bg-slate-700/60 rounded-full mt-1.5" />
        </div>
      )}
      <img
        src={imageUrl}
        alt={prod.article || prod.name || 'Shoe product'}
        className={`w-full h-full object-cover rounded-lg transition-opacity duration-200 ${
          imageLoaded ? 'opacity-100' : 'opacity-0'
        }`}
        onLoad={() => setImageLoaded(true)}
        onError={() => setImageError(true)}
        loading="lazy"
      />
    </div>
  );
};

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  onTabChange,
  currentUser,
  companySettings,
  onLogout,
  onToggleMobileMenu,
  onOpenProfile,
  onSwitchRole,
}) => {
  const headerUserName = String(currentUser?.name || '').trim() || String(currentUser?.email || '').split('@')[0] || 'User';
  const { themeMode } = useTheme();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [showThemeDropdown, setShowThemeDropdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [priceSearchResults, setPriceSearchResults] = useState<any[]>([]);
  const [isLoadingSearch, setIsLoadingSearch] = useState(false);
  const [copiedNotification, setCopiedNotification] = useState<string | null>(null);

  const notifRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  const currency = companySettings?.currency_symbol || companySettings?.currencySymbol || 'Rs.';

  const formatPrice = (val: number | string | undefined | null) => {
    const n = Number(val);
    if (isNaN(n)) return `${currency} 0`;
    return `${currency} ${n.toLocaleString()}`;
  };

  const copyPriceValue = (e: React.MouseEvent, priceValue: number | string | undefined, label: string) => {
    e.stopPropagation();
    try {
      const textToCopy = String(priceValue ?? 0);
      navigator.clipboard.writeText(textToCopy);
      setCopiedNotification(label);
      setTimeout(() => setCopiedNotification(null), 1800);
    } catch {}
  };

  // Quick Action Handlers for retrieved product in Quick Price check
  const handleAddToCart = (e: React.MouseEvent, prod: any) => {
    e.stopPropagation();
    setIsSearching(false);
    sessionStorage.setItem('pending_pos_product', JSON.stringify(prod));
    window.dispatchEvent(new CustomEvent('pos:add-to-cart', { detail: { product: prod } }));
    onTabChange?.('pos');
  };

  const handleEditProduct = (e: React.MouseEvent, prod: any) => {
    e.stopPropagation();
    setIsSearching(false);
    sessionStorage.setItem('pending_edit_product', JSON.stringify(prod));
    window.dispatchEvent(new CustomEvent('product:edit', { detail: { product: prod } }));
    onTabChange?.('inventory');
  };

  const handleAddPurchase = (e: React.MouseEvent, prod: any) => {
    e.stopPropagation();
    setIsSearching(false);
    sessionStorage.setItem('pending_purchase_product', JSON.stringify(prod));
    window.dispatchEvent(new CustomEvent('purchase:new-entry', { detail: { product: prod } }));
    onTabChange?.('purchases');
  };

  const handlePrintBarcode = (e: React.MouseEvent, prod: any) => {
    e.stopPropagation();
    setIsSearching(false);
    sessionStorage.setItem('pending_barcode_product', JSON.stringify(prod));
    window.dispatchEvent(new CustomEvent('inventory:print-barcode', { detail: { product: prod } }));
    onTabChange?.('inventory');
  };

  // Close dropdowns on outside click or touch
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
      if (userRef.current && !userRef.current.contains(e.target as Node)) {
        setShowUserDropdown(false);
      }
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setIsSearching(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  // Quick price search - does NOT change routes, directly retrieves single product price suggestions
  const searchTimeoutRef = useRef<any>(null);

  const executeSingleProductPriceSearch = async (queryText: string) => {
    const q = queryText.trim();
    if (!q) {
      setPriceSearchResults([]);
      setIsLoadingSearch(false);
      return;
    }

    setIsLoadingSearch(true);
    try {
      let singleProduct: any = null;
      const lowerQ = q.toLowerCase();

      // 1. Fetch matching products from API
      const prodRes = await api.products.list({ search: q, limit: 30 }).catch(() => ({ products: [] }));
      const list = prodRes?.products || [];

      if (list.length > 0) {
        // TOP PRIORITY: Exact match on product article (case-insensitive)
        const exactArticle = list.find(
          (p: any) => p.article && p.article.trim().toLowerCase() === lowerQ
        );

        // SECOND PRIORITY: Exact match on Barcode
        const exactBarcode = list.find(
          (p: any) => p.barcode && p.barcode.trim().toLowerCase() === lowerQ
        );

        // THIRD PRIORITY: Article starts with search query
        const startsArticle = list.find(
          (p: any) => p.article && p.article.trim().toLowerCase().startsWith(lowerQ)
        );

        singleProduct = exactArticle || exactBarcode || startsArticle || list[0];
      }

      // 2. If not found in product list, try direct scanner lookup endpoint as fallback
      if (!singleProduct) {
        try {
          const directLookup = await api.products.lookupBarcode(q);
          if (directLookup?.product) {
            singleProduct = directLookup.product;
          }
        } catch {
          // not found via network lookup
        }
      }

      // 3. OFFLINE FALLBACK: If network failed or server unreachable, lookup from browser IndexedDB cached catalog
      if (!singleProduct) {
        try {
          const cachedProduct = await lookupCachedProductOffline(q).catch(() => null);
          if (cachedProduct) {
            singleProduct = {
              ...cachedProduct,
              totalStock: cachedProduct.totalStock ?? cachedProduct.total_stock ?? 0,
              costPrice: parseFloat(cachedProduct.costPrice || cachedProduct.cost_price || 0),
              minSalePrice: parseFloat(cachedProduct.minSalePrice || cachedProduct.min_sale_price || 0),
              maxSalePrice: parseFloat(cachedProduct.maxSalePrice || cachedProduct.max_sale_price || 0),
              sellingPrice: parseFloat(
                cachedProduct.sellingPrice ||
                  cachedProduct.selling_price ||
                  cachedProduct.salePrice ||
                  cachedProduct.sale_price ||
                  0
              ),
              isOfflineCached: true,
            };
          } else {
            const cachedList = await searchCachedProductsOffline(q).catch(() => []);
            if (cachedList && cachedList.length > 0) {
              const exactArticle = cachedList.find(
                (p: any) => p.article && p.article.trim().toLowerCase() === lowerQ
              );
              const exactBarcode = cachedList.find(
                (p: any) => p.barcode && p.barcode.trim().toLowerCase() === lowerQ
              );
              const startsArticle = cachedList.find(
                (p: any) => p.article && p.article.trim().toLowerCase().startsWith(lowerQ)
              );
              const found = exactArticle || exactBarcode || startsArticle || cachedList[0];
              if (found) {
                singleProduct = {
                  ...found,
                  totalStock: found.totalStock ?? found.total_stock ?? 0,
                  costPrice: parseFloat(found.costPrice || found.cost_price || 0),
                  minSalePrice: parseFloat(found.minSalePrice || found.min_sale_price || 0),
                  maxSalePrice: parseFloat(found.maxSalePrice || found.max_sale_price || 0),
                  sellingPrice: parseFloat(
                    found.sellingPrice ||
                      found.selling_price ||
                      found.salePrice ||
                      found.sale_price ||
                      0
                  ),
                  isOfflineCached: true,
                };
              }
            }
          }
        } catch {
          // offline lookup failed
        }
      }

      // Always return ONLY the single matching product
      setPriceSearchResults(singleProduct ? [singleProduct] : []);
    } catch {
      setPriceSearchResults([]);
    } finally {
      setIsLoadingSearch(false);
    }
  };

  useEffect(() => {
    if (!searchQuery.trim()) {
      setPriceSearchResults([]);
      setIsLoadingSearch(false);
      return;
    }

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    setIsLoadingSearch(true);
    searchTimeoutRef.current = setTimeout(() => {
      executeSingleProductPriceSearch(searchQuery);
    }, 180);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery]);

  // Real-time system notifications
  const [notifications, setNotifications] = useState<any[]>([]);
  const [readNotifIds, setReadNotifIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('pos_read_notifications');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [isLoadingNotifs, setIsLoadingNotifs] = useState(false);
  const isFetchingNotifsRef = useRef(false);

  // Platform Announcements from SuperAdmin
  const [platformAnnouncements, setPlatformAnnouncements] = useState<PlatformNotification[]>([]);
  const [isDismissingAnnouncement, setIsDismissingAnnouncement] = useState<number | null>(null);

  // Web Push API & Live POS Push Notification State
  const [isPushSubscribed, setIsPushSubscribed] = useState(false);
  const [isTogglingPush, setIsTogglingPush] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission>(() => getNotificationPermissionState());
  const [testPushStatus, setTestPushStatus] = useState<string | null>(null);
  const [livePushToast, setLivePushToast] = useState<{
    id: string;
    type: 'SALE' | 'RETURN' | 'EXCHANGE' | 'PLATFORM_ANNOUNCEMENT' | 'ANNOUNCEMENT' | string;
    title: string;
    message: string;
    invoiceNumber?: string;
    returnNumber?: string;
    totalAmount?: number;
    deepLinkUrl?: string;
    actionUrl?: string;
    actionLabel?: string;
  } | null>(null);

  const currentRole = String(currentUser?.role || '').trim().toUpperCase();
  const isSuperAdminUser = currentRole === 'SUPERADMIN';
  const isAdminUser = currentRole === 'ADMIN';
  const isCashierUser = currentRole === 'CASHIER';

  const currentRoleRef = useRef(currentRole);
  useEffect(() => {
    currentRoleRef.current = currentRole;
  }, [currentRole]);

  // Check push subscription on mount and setup real-time SSE stream
  useEffect(() => {
    if (isWebPushSupported()) {
      resyncPushSubscriptionIfEnabled()
        .catch(() => {})
        .then(() => isDeviceSubscribedToPush())
        .then((subbed) => {
          setIsPushSubscribed(subbed);
          setPushPermission(getNotificationPermissionState());
        });
    }

    // Connect to real-time event stream for active sessions with strict role isolation
    const cleanupStream = connectRealtimeNotificationStream((payload) => {
      const userRole = currentRoleRef.current;
      const targetRole = payload.targetRole ? String(payload.targetRole).toUpperCase() : undefined;
      const targetRoles = Array.isArray(payload.targetRoles) ? payload.targetRoles.map((r: string) => r.toUpperCase()) : undefined;

      // 1. Role isolation guards:
      const titleLower = (payload.title || '').toLowerCase();
      const msgLower = (payload.message || '').toLowerCase();
      const actionUrlLower = (payload.actionUrl || '').toLowerCase();
      const isSuperAdminOnlyNotice =
        targetRole === 'SUPERADMIN' ||
        titleLower.includes('new free trial') ||
        titleLower.includes('renewal request') ||
        msgLower.includes('free tier store registered') ||
        msgLower.includes('subscription renewal') ||
        actionUrlLower.includes('/superadmin');

      if (userRole !== 'SUPERADMIN' && isSuperAdminOnlyNotice) {
        return;
      }

      if (userRole === 'SUPERADMIN') {
        // SuperAdmin NEVER receives store POS events (SALE, RETURN, EXCHANGE, PURCHASE, STOCK)
        if (['SALE', 'RETURN', 'EXCHANGE', 'PURCHASE', 'STOCK'].includes(payload.type)) {
          return;
        }
        if (targetRole && !['ALL', 'SUPERADMIN'].includes(targetRole)) {
          return;
        }
        if (titleLower.includes('welcome') || msgLower.includes('welcome to sarbaazsoft')) {
          return;
        }
      } else if (userRole === 'CASHIER') {
        // Cashiers never receive store owner management alerts (PURCHASE, STOCK, SUPPLIER) or welcome messages
        if (['PURCHASE', 'STOCK', 'SUPPLIER'].includes(payload.type)) {
          return;
        }
        if (targetRole && !['ALL', 'CASHIER'].includes(targetRole)) {
          return;
        }
        if (targetRoles && !targetRoles.includes('CASHIER')) {
          return;
        }
        if (titleLower.includes('welcome') || msgLower.includes('welcome to sarbaazsoft')) {
          return;
        }
      } else if (userRole === 'ADMIN') {
        // Store Owners never receive CASHIER-only or SUPERADMIN-only alerts
        if (targetRole && !['ALL', 'ADMIN'].includes(targetRole)) {
          return;
        }
        if (targetRoles && !targetRoles.includes('ADMIN')) {
          return;
        }
      }

      fetchLiveNotifications();
      // Display instant floating notification toast
      setLivePushToast({
        id: `toast-${Date.now()}`,
        type: payload.type || 'SALE',
        title: payload.title || 'POS Alert',
        message: payload.message || 'Transaction confirmed.',
        invoiceNumber: payload.invoiceNumber,
        returnNumber: payload.returnNumber,
        totalAmount: payload.totalAmount,
        deepLinkUrl: payload.deepLinkUrl,
        actionUrl: payload.actionUrl,
        actionLabel: payload.actionLabel,
      });

      // Automatically dismiss after 9 seconds
      setTimeout(() => {
        setLivePushToast((prev) => (prev?.invoiceNumber === payload.invoiceNumber ? null : prev));
      }, 9000);
    });

    return () => {
      cleanupStream();
    };
  }, []);

  const handleTogglePushNotifications = async () => {
    if (isTogglingPush) return;
    setIsTogglingPush(true);
    try {
      if (isPushSubscribed) {
        await unsubscribeDeviceFromWebPush();
        setIsPushSubscribed(false);
      } else {
        const res = await subscribeDeviceToWebPush();
        if (res.success) {
          setIsPushSubscribed(true);
          setPushPermission('granted');
        } else if (res.error) {
          alert(res.error);
        }
      }
    } catch (err: any) {
      alert('Error updating push notification settings: ' + err.message);
    } finally {
      setIsTogglingPush(false);
      setPushPermission(getNotificationPermissionState());
    }
  };

  const handleSendTestPush = async () => {
    try {
      setTestPushStatus('sending');
      const res = await api.notifications.testPush();
      setTestPushStatus(res.success ? 'success' : 'error');
      setTimeout(() => setTestPushStatus(null), 3500);
    } catch (err: any) {
      alert('Test notification failed: ' + err.message);
      setTestPushStatus(null);
    }
  };

  const handleToastClick = () => {
    if (!livePushToast) return;
    const { type, invoiceNumber, returnNumber, deepLinkUrl, actionUrl } = livePushToast;
    setLivePushToast(null);

    if (actionUrl) {
      try {
        window.open(actionUrl, '_blank');
      } catch {
        window.location.href = actionUrl;
      }
      return;
    }

    if (type === 'RETURN') {
      onTabChange?.('returns');
      if (invoiceNumber) {
        setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent('returns:inspect-invoice', { detail: { invoice: invoiceNumber, returnNumber } })
          );
        }, 150);
      }
    } else if (invoiceNumber) {
      onTabChange?.('reports');
      setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent('pos:open-receipt', { detail: { invoiceNumber } })
        );
      }, 150);
    } else if (deepLinkUrl) {
      window.location.href = deepLinkUrl;
    } else {
      setShowNotifications(true);
    }
  };

  const fetchLiveNotifications = async () => {
    if (isFetchingNotifsRef.current || !currentUser) return;
    isFetchingNotifsRef.current = true;
    try {
      setIsLoadingNotifs(true);
      const res = (await api.notifications.list()) as any;
      if (res) {
        if (Array.isArray(res.notifications)) {
          setNotifications(res.notifications);
        }
        if (Array.isArray(res.announcements)) {
          setPlatformAnnouncements(res.announcements);
        }
      }
    } catch {
      // Ignore transient polling errors during server restarts
    } finally {
      isFetchingNotifsRef.current = false;
      setIsLoadingNotifs(false);
    }
  };

  useEffect(() => {
    fetchLiveNotifications();

    // Periodic live sync every 30 seconds
    const interval = setInterval(fetchLiveNotifications, 30000);

    // Event listeners for POS sales, returns, purchases, inventory adjustments, and SuperAdmin announcements
    const handleLiveEvent = () => {
      fetchLiveNotifications();
    };

    window.addEventListener('pos:sale-completed', handleLiveEvent);
    window.addEventListener('inventory:updated', handleLiveEvent);
    window.addEventListener('pos:return-completed', handleLiveEvent);
    window.addEventListener('pos:purchase-completed', handleLiveEvent);
    window.addEventListener('platform:announcement', handleLiveEvent);

    return () => {
      clearInterval(interval);
      window.removeEventListener('pos:sale-completed', handleLiveEvent);
      window.removeEventListener('inventory:updated', handleLiveEvent);
      window.removeEventListener('pos:return-completed', handleLiveEvent);
      window.removeEventListener('pos:purchase-completed', handleLiveEvent);
      window.removeEventListener('platform:announcement', handleLiveEvent);
    };
  }, []);

  const markAsRead = (id: string) => {
    setReadNotifIds((prev) => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      try {
        localStorage.setItem('pos_read_notifications', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const markAllAsRead = () => {
    const allIds = notifications.map((n) => n.id);
    setReadNotifIds((prev) => {
      const merged = Array.from(new Set([...prev, ...allIds]));
      try {
        localStorage.setItem('pos_read_notifications', JSON.stringify(merged));
      } catch {}
      return merged;
    });
  };

  const handleDismissAnnouncement = async (id: number) => {
    try {
      setIsDismissingAnnouncement(id);
      setPlatformAnnouncements((prev) =>
        prev.map((a) => (a.id === id ? { ...a, isRead: true } : a))
      );
      await api.notifications.dismissAnnouncement(id);
    } catch (err) {
      console.error('Failed to dismiss announcement:', err);
    } finally {
      setIsDismissingAnnouncement(null);
    }
  };

  const handleDismissAllAnnouncements = async () => {
    try {
      setPlatformAnnouncements((prev) =>
        prev.map((a) => ({ ...a, isRead: true }))
      );
      await api.notifications.dismissAllAnnouncements();
    } catch (err) {
      console.error('Failed to dismiss all announcements:', err);
    }
  };

  const formatAnnouncementTime = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      const diffMs = Date.now() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString();
    } catch {
      return '';
    }
  };

  const visibleAnnouncements = useMemo(() => {
    return platformAnnouncements.filter((a) => {
      const aTargetRole = (a.targetRole || 'ALL').toUpperCase();
      const titleLower = (a.title || '').toLowerCase();
      const msgLower = (a.message || '').toLowerCase();
      const actionUrlLower = (a.actionUrl || '').toLowerCase();
      const isWelcome =
        titleLower.includes('welcome') ||
        msgLower.includes('welcome to sarbaazsoft') ||
        msgLower.includes('thank you for choosing sarbaazsoft');

      const isSuperAdminOnlyNotice =
        aTargetRole === 'SUPERADMIN' ||
        titleLower.includes('new free trial') ||
        titleLower.includes('renewal request') ||
        msgLower.includes('free tier store registered') ||
        msgLower.includes('subscription renewal') ||
        msgLower.includes('renewal request') ||
        actionUrlLower.includes('/superadmin') ||
        actionUrlLower.includes('/admin');

      if (isSuperAdminUser) {
        // SuperAdmin should never see store-targeted notices or store owner welcome messages
        if (isWelcome) return false;
        if (a.tenantId !== null && a.tenantId !== undefined && a.tenantId > 0 && aTargetRole !== 'SUPERADMIN') return false;
        if (aTargetRole !== 'ALL' && aTargetRole !== 'SUPERADMIN') return false;
        return true;
      }

      // Non-SuperAdmin users (Store Owners, Cashiers, etc.) must NEVER see SuperAdmin notifications
      if (isSuperAdminOnlyNotice) {
        return false;
      }

      if (isCashierUser) {
        // Cashiers never receive store owner welcome messages or ADMIN-targeted notices
        if (isWelcome) return false;
        if (aTargetRole !== 'ALL' && aTargetRole !== 'CASHIER') return false;
      } else if (isAdminUser) {
        // Store Owners never receive CASHIER-only or SUPERADMIN-only notices
        if (aTargetRole !== 'ALL' && aTargetRole !== 'ADMIN') return false;
      } else {
        if (aTargetRole !== 'ALL') return false;
      }
      return true;
    });
  }, [platformAnnouncements, isSuperAdminUser, isCashierUser, isAdminUser]);

  const unreadPosCount = notifications.filter((n) => !readNotifIds.includes(n.id)).length;
  const unreadAnnouncementsCount = visibleAnnouncements.filter((a) => !a.isRead).length;
  const unreadCount = unreadPosCount + unreadAnnouncementsCount;
  const activeUrgentNotice = visibleAnnouncements.find((a) => !a.isRead && a.type === 'URGENT');

  // Unified Notifications list combining Notices and Store Activity in a single column with strict role isolation
  const unifiedNotifications = useMemo(() => {
    const parseTime = (val: any) => {
      if (!val) return 0;
      const t = new Date(val).getTime();
      return isNaN(t) ? 0 : t;
    };

    const announcementItems = visibleAnnouncements.map((a) => ({
      kind: 'ANNOUNCEMENT' as const,
      id: `notice-${a.id}`,
      rawId: a.id,
      title: a.title,
      message: a.message,
      type: a.type,
      actionUrl: a.actionUrl,
      actionLabel: a.actionLabel,
      tenantId: a.tenantId,
      createdAt: a.createdAt,
      isRead: Boolean(a.isRead),
      timestamp: parseTime(a.createdAt),
      raw: a,
    }));

    // Strict role isolation for activity feed
    let filteredNotifications = notifications;
    if (isSuperAdminUser) {
      filteredNotifications = [];
    } else if (isCashierUser) {
      // Cashiers only receive their counter POS checkout activities, never store owner administrative alerts
      filteredNotifications = notifications.filter((n) => {
        const typeUpper = (n.type || '').toUpperCase();
        return !['PURCHASE', 'STOCK', 'LOW_STOCK', 'SUPPLIER'].includes(typeUpper);
      });
    }

    const activityItems = filteredNotifications.map((n) => {
      const isRead = readNotifIds.includes(n.id);
      const ts = n.timestamp || n.created_at || n.sale_date;
      return {
        kind: 'ACTIVITY' as const,
        id: `activity-${n.id}`,
        rawId: n.id,
        title: n.title,
        message: n.message,
        type: (n.type || 'ACTIVITY').toUpperCase(),
        icon: n.icon,
        color: n.color,
        actionTab: n.actionTab,
        deepLinkUrl: n.deepLinkUrl,
        createdAt: ts || new Date().toISOString(),
        isRead,
        timestamp: parseTime(ts),
        raw: n,
      };
    });

    return [...announcementItems, ...activityItems].sort((a, b) => {
      const aUrgent = a.kind === 'ANNOUNCEMENT' && a.type === 'URGENT' && !a.isRead ? 1 : 0;
      const bUrgent = b.kind === 'ANNOUNCEMENT' && b.type === 'URGENT' && !b.isRead ? 1 : 0;
      if (aUrgent !== bUrgent) return bUrgent - aUrgent;
      return b.timestamp - a.timestamp;
    });
  }, [visibleAnnouncements, notifications, readNotifIds, isSuperAdminUser, isCashierUser]);

  const handleActivityClick = (item: any) => {
    const raw = item.raw || item;
    markAsRead(raw.id);
    setShowNotifications(false);
    const invoiceMatch = raw.message?.match(/#([A-Z0-9-]+)/i) || raw.title?.match(/#([A-Z0-9-]+)/i);
    const invNumber = invoiceMatch ? invoiceMatch[1] : null;

    if (
      invNumber &&
      (raw.title.toLowerCase().includes('invoice') ||
        raw.title.toLowerCase().includes('sale') ||
        raw.title.toLowerCase().includes('exchange') ||
        raw.actionTab === 'pos' ||
        raw.actionTab === 'reports')
    ) {
      window.dispatchEvent(new CustomEvent('pos:open-receipt', { detail: { invoiceNumber: invNumber } }));
    } else if (invNumber && (raw.title.toLowerCase().includes('return') || raw.actionTab === 'returns')) {
      onTabChange?.('returns');
      window.dispatchEvent(new CustomEvent('returns:inspect-invoice', { detail: { invoice: invNumber } }));
    } else if (raw.actionTab) {
      onTabChange?.(raw.actionTab);
    }
  };

  const handleMarkAllNotificationsRead = async () => {
    markAllAsRead();
    if (unreadAnnouncementsCount > 0) {
      await handleDismissAllAnnouncements();
    }
  };

  const getActivityTypeDetails = (type: string, title: string) => {
    const t = (type || '').toUpperCase();
    const titleLower = (title || '').toLowerCase();

    if (t === 'SALE' || titleLower.includes('sale') || titleLower.includes('invoice')) {
      return {
        label: 'Sale',
        badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700',
        icon: <ShoppingBag className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-300" />,
        actionText: 'View Receipt',
      };
    }
    if (t === 'RETURN' || titleLower.includes('return')) {
      return {
        label: 'Return',
        badgeClass: 'bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-300 border border-rose-300 dark:border-rose-700',
        icon: <ArrowLeftRight className="w-2.5 h-2.5 text-rose-600 dark:text-rose-300" />,
        actionText: 'Inspect Return',
      };
    }
    if (t === 'EXCHANGE' || titleLower.includes('exchange')) {
      return {
        label: 'Exchange',
        badgeClass: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-700',
        icon: <ArrowLeftRight className="w-2.5 h-2.5 text-indigo-600 dark:text-indigo-300" />,
        actionText: 'View Exchange',
      };
    }
    if (t === 'STOCK' || t === 'LOW_STOCK' || titleLower.includes('stock') || titleLower.includes('inventory')) {
      return {
        label: 'Stock Alert',
        badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300 border border-amber-300 dark:border-amber-700',
        icon: <Boxes className="w-2.5 h-2.5 text-amber-600 dark:text-amber-300" />,
        actionText: 'Check Inventory',
      };
    }
    if (t === 'PURCHASE' || titleLower.includes('purchase')) {
      return {
        label: 'Purchase',
        badgeClass: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/60 dark:text-cyan-300 border border-cyan-300 dark:border-cyan-700',
        icon: <Truck className="w-2.5 h-2.5 text-cyan-600 dark:text-cyan-300" />,
        actionText: 'View Purchase',
      };
    }
    return {
      label: 'Store Event',
      badgeClass: 'bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-300 border border-purple-300 dark:border-purple-700',
      icon: <Bell className="w-2.5 h-2.5 text-purple-600 dark:text-purple-300" />,
      actionText: 'View Details',
    };
  };

  const getNoticeTypeDetails = (type: PlatformNotificationType) => {
    switch (type) {
      case 'URGENT':
        return {
          label: 'Notice • Urgent',
          cardBorderClass: 'bg-rose-50/80 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 ring-1 ring-rose-400/30',
          badgeClass: 'bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-300 border border-rose-300 dark:border-rose-700',
          icon: <Flame className="w-2.5 h-2.5 text-rose-600 dark:text-rose-300" />,
        };
      case 'WARNING':
        return {
          label: 'Notice • Warning',
          cardBorderClass: 'bg-amber-50/80 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800',
          badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300 border border-amber-300 dark:border-amber-700',
          icon: <AlertTriangle className="w-2.5 h-2.5 text-amber-600 dark:text-amber-300" />,
        };
      case 'SUCCESS':
        return {
          label: 'Notice • Update',
          cardBorderClass: 'bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800',
          badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700',
          icon: <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-300" />,
        };
      case 'INFO':
      default:
        return {
          label: 'Notice • Info',
          cardBorderClass: 'bg-indigo-50/70 dark:bg-purple-950/30 border-indigo-200 dark:border-purple-800/60',
          badgeClass: 'bg-indigo-100 text-indigo-800 dark:bg-purple-900/60 dark:text-purple-300 border border-indigo-300 dark:border-purple-700',
          icon: <Info className="w-2.5 h-2.5 text-indigo-600 dark:text-purple-300" />,
        };
    }
  };

  const renderNotificationIcon = (iconName: string) => {
    switch (iconName) {
      case 'boxes':
        return <Boxes className="w-3 h-3 text-purple-600 dark:text-purple-300 stroke-[2]" />;
      case 'alert-circle':
        return <AlertCircle className="w-3 h-3 text-rose-500 stroke-[2]" />;
      case 'alert-triangle':
        return <AlertTriangle className="w-3 h-3 text-amber-500 stroke-[2]" />;
      case 'shopping-bag':
        return <ShoppingBag className="w-3 h-3 text-purple-600 dark:text-purple-300 stroke-[2]" />;
      case 'check-circle':
        return <CheckCircle2 className="w-3 h-3 text-emerald-500 stroke-[2]" />;
      case 'arrow-left-right':
        return <ArrowLeftRight className="w-3 h-3 text-indigo-500 stroke-[2]" />;
      case 'truck':
        return <Truck className="w-3 h-3 text-cyan-500 stroke-[2]" />;
      case 'shield':
        return <ShieldCheck className="w-3 h-3 text-purple-600 dark:text-purple-300 stroke-[2]" />;
      case 'database':
        return <ShieldCheck className="w-3 h-3 text-purple-600 dark:text-purple-300 stroke-[2]" />;
      default:
        return <Bell className="w-3 h-3 text-purple-600 dark:text-purple-300 stroke-[2]" />;
    }
  };

  return (
    <>
      {/* Urgent Announcement Banner dispatched by SuperAdmin */}
      {activeUrgentNotice && (
        <div className="bg-gradient-to-r from-rose-700 via-red-600 to-amber-600 text-white px-3 sm:px-4 py-2 text-xs font-medium flex items-center justify-between gap-3 shadow-md z-40 relative no-print animate-in fade-in duration-200">
          <div className="flex items-center gap-2 min-w-0">
            <span className="flex h-2.5 w-2.5 relative shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white"></span>
            </span>
            <span className="font-extrabold uppercase tracking-wider text-[9px] bg-black/30 px-2 py-0.5 rounded-full border border-white/30 shrink-0 flex items-center gap-1">
              <Flame className="w-3 h-3 text-amber-300" />
              <span>URGENT NOTICE</span>
            </span>
            <span className="font-bold truncate">{activeUrgentNotice.title}:</span>
            <span className="text-white/90 truncate hidden md:inline">{activeUrgentNotice.message}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {activeUrgentNotice.actionUrl && (
              <a
                href={activeUrgentNotice.actionUrl}
                target="_blank"
                rel="noreferrer"
                className="bg-white text-rose-700 hover:bg-rose-50 px-2.5 py-1 rounded text-[11px] font-bold flex items-center gap-1 transition shadow-xs"
              >
                <span>{activeUrgentNotice.actionLabel || 'View Link'}</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
            <button
              type="button"
              onClick={() => handleDismissAnnouncement(activeUrgentNotice.id)}
              disabled={isDismissingAnnouncement === activeUrgentNotice.id}
              className="p-1 hover:bg-black/20 rounded transition text-white/90 hover:text-white cursor-pointer"
              title="Acknowledge and dismiss this urgent announcement"
              aria-label="Dismiss urgent notice"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <header className="px-4 border border-indigo-500/20 bg-white/95 dark:bg-white/10 backdrop-blur-lg shadow-lg transition-colors duration-500 sticky top-0 z-30 select-none text-slate-800 dark:text-slate-100 flex items-center justify-between gap-2.5 sm:gap-4 min-h-[3.6rem] py-1.5 no-print">
      {/* LEFT: Mobile Menu Toggle Button & Global Search Bar (No dynamic route title displayed when logged in as SuperAdmin or store user) */}
      <div className="flex items-center gap-2 sm:gap-2.5 pl-0.5 sm:pl-1 min-w-0">
        {/* Mobile Menu Toggle Button (< lg) */}
        <button
          type="button"
          onClick={onToggleMobileMenu}
          className="btn-outline-landing lg:hidden h-8.5 w-8.5 flex items-center justify-center p-1.5 rounded-lg border border-slate-200 dark:border-purple-400/40 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-purple-500/20 dark:text-purple-200 dark:hover:bg-purple-500/30 dark:hover:text-white cursor-pointer shrink-0 shadow-2xs transition"
          aria-label="Toggle navigation menu"
        >
          <Menu className="w-4 h-4 stroke-[2.2]" />
        </button>

        {/* Quick Price Retrieval Search Bar */}
        <div ref={searchRef} className="relative w-44 sm:w-56 md:w-68 lg:w-80 min-w-0">
          <div className="relative flex items-center">
            <Coins className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400 absolute left-2.5 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setIsSearching(true);
              }}
              onFocus={() => {
                setIsSearching(true);
                setShowNotifications(false);
                setShowUserDropdown(false);
                setShowThemeDropdown(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
                  executeSingleProductPriceSearch(searchQuery);
                }
              }}
              placeholder="Quick price check (Article, Barcode)..."
              className="h-8 sm:h-8.5 uppercase w-full bg-slate-50/90 dark:bg-slate-900/60 border border-slate-200/90 dark:border-indigo-500/20 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 pl-8 pr-7 py-1 rounded-lg outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 transition-all font-medium"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setIsSearching(false);
                }}
                className="absolute right-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Quick Price Retrieval Suggestions Dropdown (Single Product Price Display) */}
          <AnimatePresence>
            {isSearching && searchQuery.trim().length > 0 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.97, y: -6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97, y: -6 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                style={{ transformOrigin: 'top left' }}
                className="fixed left-2 right-2 top-[3.8rem] sm:absolute sm:left-0 sm:right-auto sm:top-full sm:mt-2 sm:w-96 md:w-[440px] max-w-[calc(100vw-1rem)] sm:max-w-[calc(100vw-2rem)] bg-white dark:bg-[#0D1322] border border-slate-200 dark:border-indigo-500/30 rounded-2xl shadow-2xl p-3 z-50 max-h-[calc(100dvh-4.6rem)] sm:max-h-[30rem] overflow-y-auto space-y-2 backdrop-blur-md"
              >
                {copiedNotification && (
                  <div className="px-2.5 py-1 text-center text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 rounded-lg border border-emerald-200 dark:border-emerald-800/50">
                    ✓ {copiedNotification} copied to clipboard
                  </div>
                )}

                {/* Loading state with skeleton cards */}
                {isLoadingSearch && (
                  <div className="space-y-2 py-1">
                    <div className="py-2 text-center text-xs text-slate-400 dark:text-slate-500 flex items-center justify-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500" />
                      <span>Searching price details...</span>
                    </div>
                    {[1, 2].map((idx) => (
                      <div
                        key={idx}
                        className="p-2.5 rounded-xl border border-slate-200/70 dark:border-slate-800/70 bg-slate-50/50 dark:bg-[#121A2F]/50 animate-pulse space-y-2.5"
                      >
                        <div className="flex items-start gap-2.5">
                          <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-xl bg-slate-200 dark:bg-slate-800 shrink-0" />
                          <div className="min-w-0 flex-1 space-y-1.5 pt-0.5">
                            <div className="h-3.5 bg-slate-200 dark:bg-slate-800 rounded w-3/5" />
                            <div className="h-2.5 bg-slate-200 dark:bg-slate-800 rounded w-2/5" />
                          </div>
                          <div className="w-16 h-4 bg-slate-200 dark:bg-slate-800 rounded-full shrink-0" />
                        </div>
                        <div className="grid grid-cols-3 gap-1.5 pt-2 border-t border-slate-200/60 dark:border-slate-800/60">
                          <div className="h-8 bg-slate-200/70 dark:bg-slate-800/60 rounded-lg" />
                          <div className="h-8 bg-slate-200/70 dark:bg-slate-800/60 rounded-lg" />
                          <div className="h-8 bg-slate-200/70 dark:bg-slate-800/60 rounded-lg" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Suggestions list (First Layout) */}
                {!isLoadingSearch && priceSearchResults.length > 0 && (
                  <div className="space-y-2">
                    {priceSearchResults.slice(0, 10).map((prod) => (
                      <div
                        key={prod.id}
                        className="p-2.5 rounded-xl border border-slate-200/90 dark:border-slate-800/80 bg-slate-50/70 dark:bg-[#121A2F] hover:border-indigo-400 dark:hover:border-indigo-500/50 transition-all select-text cursor-default"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {/* Title, Product Image (or Skeleton) & Metadata */}
                        <div className="flex items-start gap-2.5">
                          {/* Product Image if exists, else Skeleton */}
                          <QuickSearchProductImage prod={prod} />

                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-1.5">
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-bold text-xs text-slate-900 dark:text-white truncate">
                                    {prod.article || prod.name}
                                  </span>
                                  {prod.brandName && prod.brandName !== 'Unbranded' && (
                                    <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/50">
                                      {prod.brandName}
                                    </span>
                                  )}
                                  {prod.categoryName && prod.categoryName !== 'Uncategorized' && (
                                    <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
                                      • {prod.categoryName}
                                    </span>
                                  )}
                                </div>
                                {prod.barcode && (
                                  <div className="flex items-center gap-2 mt-0.5 text-[10.5px] text-slate-500 dark:text-slate-400 font-mono">
                                    <span>Barcode: {prod.barcode}</span>
                                  </div>
                                )}
                              </div>

                              <div className="shrink-0 text-right flex flex-col items-end gap-1">
                                <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                  (prod.totalStock ?? prod.total_stock ?? 0) > 0 
                                    ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40'
                                    : 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/40'
                                }`}>
                                  {prod.totalStock ?? prod.total_stock ?? 0} in stock
                                </span>
                                {(prod.isOfflineCached || !navigator.onLine) && (
                                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50 inline-flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                    Offline Cache
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Pricing Grid: Respects Fixed vs Negotiable Policy and Admin vs Cashier Authority */}
                        {(() => {
                          const rawPricingMode = String(
                            companySettings?.pricingMode ||
                            'FIXED'
                          ).toUpperCase();
                          const isFixedPolicy = rawPricingMode === 'FIXED';
                          const isOwnerOrAdmin = String(currentUser?.role || '').toUpperCase() === 'ADMIN';

                          const fixedSalePrice = getProductRetailPrice(prod, companySettings) || prod.sellingPrice || prod.maxSalePrice || prod.costPrice || 0;
                          const minSalePrice = getProductMinFloorPrice(prod, companySettings) || prod.minPrice || prod.minSalePrice || 0;
                          const maxSalePrice = getProductRetailPrice(prod, companySettings) || prod.maxPrice || prod.maxSalePrice || 0;
                          const costPrice = prod.costPrice ?? prod.cost_price ?? 0;

                          if (isFixedPolicy) {
                            // FIXED PRICING MODE: Single Fixed Sale Price (no min/max negotiation)
                            return (
                              <div className="mt-2.5 pt-2 border-t border-slate-200/70 dark:border-slate-800/80">
                                {isOwnerOrAdmin ? (
                                  <div className="grid grid-cols-2 gap-1.5">
                                    {/* Cost Price - Visible ONLY to Owner/Admin */}
                                    <div className="p-2 rounded-lg bg-white dark:bg-[#090D18] border border-slate-200 dark:border-slate-800 text-center">
                                      <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                                        Cost Price (Admin)
                                      </div>
                                      <div className="text-sm font-mono font-bold text-slate-700 dark:text-slate-200 mt-0.5">
                                        {formatPrice(costPrice)}
                                      </div>
                                    </div>

                                    {/* Fixed Sale Price */}
                                    <div
                                      onClick={(e) => copyPriceValue(e, fixedSalePrice, `Fixed price (${formatPrice(fixedSalePrice)})`)}
                                      className="p-2 rounded-lg bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-700/60 text-center cursor-pointer hover:bg-emerald-100/80 dark:hover:bg-emerald-900/40 transition group/fixed"
                                      title="Click to copy Fixed Sale Price"
                                    >
                                      <div className="text-[9px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center justify-center gap-1">
                                        <span>Fixed Sale Price</span>
                                        <Copy className="w-2.5 h-2.5 opacity-60 group-hover/fixed:opacity-100" />
                                      </div>
                                      <div className="text-sm font-mono font-extrabold text-emerald-800 dark:text-emerald-200 mt-0.5">
                                        {formatPrice(fixedSalePrice)}
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  /* Cashier View in Fixed Mode: Solely the Fixed Sale Price (Cost Price is hidden) */
                                  <div
                                    onClick={(e) => copyPriceValue(e, fixedSalePrice, `Fixed price (${formatPrice(fixedSalePrice)})`)}
                                    className="p-2.5 rounded-xl bg-emerald-50/90 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-700/60 text-center cursor-pointer hover:bg-emerald-100/80 transition group/cashierfixed"
                                    title="Click to copy Fixed Sale Price"
                                  >
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center justify-center gap-1.5">
                                      <span>Fixed Sale Price</span>
                                      <span className="text-[9px] font-normal normal-case opacity-75">(Fixed Policy • No Bargaining)</span>
                                      <Copy className="w-3 h-3 opacity-60 group-hover/cashierfixed:opacity-100" />
                                    </div>
                                    <div className="text-lg font-mono font-black text-emerald-900 dark:text-emerald-100 mt-0.5">
                                      {formatPrice(fixedSalePrice)}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          }

                          // NEGOTIABLE PRICING MODE:
                          return (
                            <div className="mt-2.5 pt-2 border-t border-slate-200/70 dark:border-slate-800/80">
                              {isOwnerOrAdmin ? (
                                /* Owner/Admin View in Negotiable Mode: Cost Price, Min Sale Price, Max Sale Price */
                                <div className="grid grid-cols-3 gap-1.5">
                                  {/* Cost Price - Visible ONLY to Owner/Admin */}
                                  <div className="p-1.5 rounded-lg bg-white dark:bg-[#090D18] border border-slate-200 dark:border-slate-800 text-center">
                                    <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                                      Cost Price (Admin)
                                    </div>
                                    <div className="text-xs font-mono font-bold text-slate-700 dark:text-slate-200 mt-0.5">
                                      {formatPrice(costPrice)}
                                    </div>
                                  </div>

                                  {/* Min Sale Price (Floor) */}
                                  <div
                                    onClick={(e) => copyPriceValue(e, minSalePrice, `Min price (${formatPrice(minSalePrice)})`)}
                                    className="p-1.5 rounded-lg bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-700/50 text-center cursor-pointer hover:bg-amber-100/80 dark:hover:bg-amber-900/40 transition group/min"
                                    title="Click to copy Minimum Sale Price"
                                  >
                                    <div className="text-[9px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 flex items-center justify-center gap-1">
                                      <span>Min Sale</span>
                                      <Copy className="w-2.5 h-2.5 opacity-60 group-hover/min:opacity-100" />
                                    </div>
                                    <div className="text-xs font-mono font-extrabold text-amber-800 dark:text-amber-200 mt-0.5">
                                      {formatPrice(minSalePrice)}
                                    </div>
                                  </div>

                                  {/* Max Sale Price (Retail) */}
                                  <div
                                    onClick={(e) => copyPriceValue(e, maxSalePrice, `Max price (${formatPrice(maxSalePrice)})`)}
                                    className="p-1.5 rounded-lg bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-700/50 text-center cursor-pointer hover:bg-emerald-100/80 dark:hover:bg-emerald-900/40 transition group/max"
                                    title="Click to copy Maximum Sale Price"
                                  >
                                    <div className="text-[9px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center justify-center gap-1">
                                      <span>Max Sale</span>
                                      <Copy className="w-2.5 h-2.5 opacity-60 group-hover/max:opacity-100" />
                                    </div>
                                    <div className="text-xs font-mono font-extrabold text-emerald-800 dark:text-emerald-200 mt-0.5">
                                      {formatPrice(maxSalePrice)}
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                /* Cashier View in Negotiable Mode: Min Sale & Max Sale ONLY (Cost is hidden) */
                                <div className="grid grid-cols-2 gap-1.5">
                                  {/* Min Sale Price (Floor) */}
                                  <div
                                    onClick={(e) => copyPriceValue(e, minSalePrice, `Min price (${formatPrice(minSalePrice)})`)}
                                    className="p-2 rounded-lg bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-700/50 text-center cursor-pointer hover:bg-amber-100/80 dark:hover:bg-amber-900/40 transition group/min"
                                    title="Click to copy Minimum Sale Price"
                                  >
                                    <div className="text-[9px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 flex items-center justify-center gap-1">
                                      <span>Min Sale (Floor)</span>
                                      <Copy className="w-2.5 h-2.5 opacity-60 group-hover/min:opacity-100" />
                                    </div>
                                    <div className="text-sm font-mono font-extrabold text-amber-800 dark:text-amber-200 mt-0.5">
                                      {formatPrice(minSalePrice)}
                                    </div>
                                  </div>

                                  {/* Max Sale Price (Retail) */}
                                  <div
                                    onClick={(e) => copyPriceValue(e, maxSalePrice, `Max price (${formatPrice(maxSalePrice)})`)}
                                    className="p-2 rounded-lg bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-700/50 text-center cursor-pointer hover:bg-emerald-100/80 dark:hover:bg-emerald-900/40 transition group/max"
                                    title="Click to copy Maximum Sale Price"
                                  >
                                    <div className="text-[9px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center justify-center gap-1">
                                      <span>Max Sale (Retail)</span>
                                      <Copy className="w-2.5 h-2.5 opacity-60 group-hover/max:opacity-100" />
                                    </div>
                                    <div className="text-sm font-mono font-extrabold text-emerald-800 dark:text-emerald-200 mt-0.5">
                                      {formatPrice(maxSalePrice)}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        {/* Quick Action Buttons: Tailored to Respective Authority (Admin vs Cashier) */}
                        <div className="mt-2.5 pt-2 border-t border-slate-200/80 dark:border-slate-800/80">
                          <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5 flex items-center justify-between">
                            <span>Quick Actions</span>
                            <span className="text-[9px] font-medium text-slate-400 dark:text-slate-500">
                              {(currentUser?.role || '').toUpperCase() === 'ADMIN' ? 'Owner / Admin Authority' : 'Cashier Authority'}
                            </span>
                          </div>

                          {(currentUser?.role || '').toUpperCase() === 'ADMIN' ? (
                            /* Owner / Admin Authority Actions: 4 buttons divided into 2 rows (2x2 grid) for clean, readable labels */
                            <div className="grid grid-cols-2 gap-1.5">
                              {/* Row 1, Col 1: Add to POS Cart */}
                              <button
                                type="button"
                                onClick={(e) => handleAddToCart(e, prod)}
                                className="py-2 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition shadow-2xs cursor-pointer group/btn whitespace-nowrap"
                                title="Add product directly to POS sale"
                              >
                                <ShoppingCart className="w-3.5 h-3.5 group-hover/btn:scale-110 transition-transform" />
                                <span>Add to Cart</span>
                              </button>

                              {/* Row 1, Col 2: Edit Product */}
                              <button
                                type="button"
                                onClick={(e) => handleEditProduct(e, prod)}
                                className="py-2 px-2.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/60 font-semibold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer group/btn whitespace-nowrap"
                                title="Edit product details, pricing, and stock limits"
                              >
                                <Edit3 className="w-3.5 h-3.5 group-hover/btn:scale-110 transition-transform" />
                                <span>Edit Product</span>
                              </button>

                              {/* Row 2, Col 1: Add Purchase */}
                              <button
                                type="button"
                                onClick={(e) => handleAddPurchase(e, prod)}
                                className="py-2 px-2.5 rounded-lg bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/60 dark:hover:bg-amber-900/60 text-amber-700 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/60 font-semibold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer group/btn whitespace-nowrap"
                                title="Create new inward purchase entry for this shoe"
                              >
                                <PackagePlus className="w-3.5 h-3.5 group-hover/btn:scale-110 transition-transform" />
                                <span>Add Purchase</span>
                              </button>

                              {/* Row 2, Col 2: Print Barcode Label */}
                              <button
                                type="button"
                                onClick={(e) => handlePrintBarcode(e, prod)}
                                className="py-2 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 font-semibold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer group/btn whitespace-nowrap"
                                title="Generate and print barcode label for this shoe"
                              >
                                <Printer className="w-3.5 h-3.5 group-hover/btn:scale-110 transition-transform" />
                                <span>Barcode</span>
                              </button>
                            </div>
                          ) : (
                            /* Cashier Authority Actions: Add to Cart and Barcode only */
                            <div className="grid grid-cols-2 gap-1.5">
                              {/* Add to POS Cart */}
                              <button
                                type="button"
                                onClick={(e) => handleAddToCart(e, prod)}
                                className="py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition shadow-2xs cursor-pointer group/btn"
                                title="Add product directly to POS sale"
                              >
                                <ShoppingCart className="w-3.5 h-3.5 group-hover/btn:scale-110 transition-transform" />
                                <span>Add to Cart</span>
                              </button>

                              {/* Print Barcode Label */}
                              <button
                                type="button"
                                onClick={(e) => handlePrintBarcode(e, prod)}
                                className="py-2 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 font-semibold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer group/btn"
                                title="Generate and print barcode label for this shoe"
                              >
                                <Printer className="w-3.5 h-3.5 group-hover/btn:scale-110 transition-transform" />
                                <span>Barcode</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Empty State */}
                {!isLoadingSearch && priceSearchResults.length === 0 && (
                  <div className="py-6 text-center text-xs text-slate-400 dark:text-slate-500">
                    No footwear product found for "{searchQuery}"
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* RIGHT: Notifications, Theme Dropdown, and User Profile */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 ml-auto pl-1">

        {/* Real-time Notifications Menu */}
        <div ref={notifRef} className="relative">
          <button
            id="header-notifications-trigger"
            type="button"
            onClick={() => {
              setShowNotifications((prev) => !prev);
              setShowUserDropdown(false);
              setShowThemeDropdown(false);
              setIsSearching(false);
              if (!showNotifications) {
                fetchLiveNotifications();
              }
            }}
            className={`h-8 sm:h-8.5 flex items-center gap-2 px-2.5 sm:px-3 py-1 rounded-lg transition-all duration-200 cursor-pointer border text-xs ${
              showNotifications
                ? 'bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 text-white border-purple-400/50 ring-2 ring-purple-400/50 shadow-md shadow-purple-600/25 dark:shadow-[0_0_16px_rgba(147,51,234,0.4)]'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200 dark:text-purple-200 dark:hover:text-white dark:bg-purple-500/20 dark:hover:bg-purple-500/30 dark:border-purple-400/40 dark:shadow-[0_0_14px_rgba(147,51,234,0.2)]'
            }`}
            title="System Notifications"
            aria-label="View system notifications"
            aria-expanded={showNotifications}
            aria-haspopup="true"
          >
            <div className="relative shrink-0 flex items-center justify-center">
              <Bell className="w-3.5 h-3.5 stroke-[2]" />
              {unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-3 px-0.5 rounded-full bg-rose-500 text-white font-bold text-[8px] flex items-center justify-center ring-1 ring-white dark:ring-[#120726]">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </div>
            <span
              className={`hidden sm:inline-block text-xs font-semibold ${
                showNotifications ? 'text-white' : 'text-slate-700 dark:text-purple-200'
              }`}
            >
              Alerts
            </span>
            <ChevronDown
              className={`w-3 h-3 transition-transform duration-200 ease-out hidden sm:inline-block opacity-75 ${
                showNotifications ? 'rotate-180' : ''
              }`}
            />
          </button>

          {/* Notifications Dropdown Menu */}
          <AnimatePresence>
            {showNotifications && (
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: -6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: -6 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                className="fixed left-2 right-2 top-[3.8rem] sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80 md:w-96 max-w-[calc(100vw-1rem)] sm:max-w-[calc(100vw-2rem)] bg-white dark:bg-[#120726] border border-slate-200 dark:border-purple-400/40 rounded-xl shadow-2xl dark:shadow-[0_0_25px_rgba(147,51,234,0.25)] p-2 z-50 backdrop-blur-md origin-top sm:origin-top-right max-h-[calc(100dvh-4.6rem)] overflow-y-auto"
              >
                {/* Header */}
                <div className="px-2.5 py-1.5 border-b border-slate-100 dark:border-purple-800/40 mb-1 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-slate-900 dark:text-purple-100">Live System Alerts</span>
                    <span className="flex h-2 w-2 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {unreadCount > 0 ? (
                      <span className="text-[9px] font-semibold text-purple-600 dark:text-purple-200 bg-purple-50 dark:bg-purple-500/20 px-1.5 py-0.5 rounded-full border border-purple-200 dark:border-purple-400/40">
                        {unreadCount} New
                      </span>
                    ) : (
                      <span className="text-[9px] font-medium text-slate-400 dark:text-purple-300/70 bg-slate-100 dark:bg-purple-500/10 px-1.5 py-0.5 rounded-full">
                        All Caught Up
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        fetchLiveNotifications();
                      }}
                      disabled={isLoadingNotifs}
                      className="p-1 rounded-md text-slate-400 hover:text-purple-600 dark:text-purple-200 dark:hover:text-white hover:bg-purple-50/40 dark:bg-purple-500/20 dark:hover:bg-purple-500/30 dark:border dark:border-purple-400/40 dark:shadow-[0_0_10px_rgba(147,51,234,0.2)] transition cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none"
                      title="Refresh notifications"
                      aria-label="Refresh notifications"
                    >
                      <RefreshCw className={`w-2.5 h-2.5 ${isLoadingNotifs ? 'animate-spin text-purple-600 dark:text-purple-200' : ''}`} />
                    </button>
                  </div>
                </div>

                {/* Real-Time Push Notification Device Activation Card */}
                <div className="p-2 mb-2 rounded-lg bg-purple-50/80 dark:bg-purple-950/40 border border-purple-200/80 dark:border-purple-800/50">
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Radio className={`w-3.5 h-3.5 shrink-0 ${isPushSubscribed ? 'text-emerald-500 animate-pulse' : 'text-purple-600 dark:text-purple-300'}`} />
                      <span className="text-[11px] font-bold text-slate-800 dark:text-purple-100 truncate">
                        POS Push Alerts (Web & Mobile)
                      </span>
                    </div>
                    <span className={`text-[8.5px] font-extrabold px-1.5 py-0.5 rounded-full uppercase tracking-wider shrink-0 ${
                      isPushSubscribed
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                        : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                    }`}>
                      {isPushSubscribed ? 'Active' : pushPermission === 'denied' ? 'Blocked' : 'Off'}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-600 dark:text-purple-200/80 leading-snug mb-1.5">
                    Real-time alerts for Sales, Returns & Exchanges sent to your phone and browser.
                  </p>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTogglePushNotifications();
                      }}
                      disabled={isTogglingPush}
                      className={`flex-1 py-1 px-2 rounded-md font-semibold text-[10.5px] transition cursor-pointer flex items-center justify-center gap-1 ${
                        isPushSubscribed
                          ? 'bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700'
                          : 'bg-purple-600 hover:bg-purple-700 text-white shadow-xs'
                      }`}
                    >
                      {isTogglingPush ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : isPushSubscribed ? (
                        'Disable Push'
                      ) : (
                        'Enable Push'
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSendTestPush();
                      }}
                      disabled={testPushStatus === 'sending'}
                      className="py-1 px-2 rounded-md bg-white dark:bg-purple-900/40 hover:bg-slate-100 dark:hover:bg-purple-800/40 text-purple-700 dark:text-purple-200 border border-purple-200 dark:border-purple-700 font-semibold text-[10.5px] transition cursor-pointer flex items-center gap-1 shrink-0"
                      title="Test push notification delivery on this device"
                    >
                      <BellRing className={`w-3 h-3 ${testPushStatus === 'sending' ? 'animate-bounce' : ''}`} />
                      <span>{testPushStatus === 'success' ? 'Sent!' : 'Test Alert'}</span>
                    </button>
                  </div>
                </div>

                {/* Unified Notifications Column (Notices & Store Activity) */}
                <div className="max-h-[320px] overflow-y-auto space-y-1.5 pr-0.5 custom-scrollbar">
                  {unifiedNotifications.length === 0 ? (
                    <div className="py-8 text-center text-slate-400 dark:text-purple-300/60">
                      <Bell className="w-5 h-5 mx-auto mb-1.5 opacity-40 stroke-[1.8] text-purple-500 dark:text-purple-300" />
                      <p className="text-xs font-semibold dark:text-purple-200">No notifications</p>
                      <p className="text-[10px] mt-0.5 dark:text-purple-300/60">All store registers and platform notices are up to date</p>
                    </div>
                  ) : (
                    unifiedNotifications.map((item) => {
                      if (item.kind === 'ANNOUNCEMENT') {
                        const a = item.raw;
                        const isUnread = !item.isRead;
                        const details = getNoticeTypeDetails(a.type);

                        return (
                          <div
                            key={item.id}
                            className={`p-2.5 rounded-xl border transition ${
                              isUnread
                                ? details.cardBorderClass
                                : 'bg-white/60 dark:bg-[#120726]/50 border-slate-200/80 dark:border-purple-900/30 opacity-75'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1 mb-1.5">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {/* Clear Label & Type Badge */}
                                <span className={`text-[8.5px] font-extrabold px-1.5 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1 ${details.badgeClass}`}>
                                  {details.icon}
                                  <span>{details.label}</span>
                                </span>

                                {/* Scope badge */}
                                <span className="text-[8.5px] font-medium text-slate-500 dark:text-purple-300/70 flex items-center gap-0.5">
                                  {!a.tenantId ? (
                                    <>
                                      <Globe className="w-2.5 h-2.5 text-slate-400 dark:text-purple-400" />
                                      <span>All Stores</span>
                                    </>
                                  ) : (
                                    <>
                                      <Store className="w-2.5 h-2.5 text-indigo-500" />
                                      <span>Direct Store Alert</span>
                                    </>
                                  )}
                                </span>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="text-[9px] text-slate-400 dark:text-purple-300/70">
                                  {formatAnnouncementTime(item.createdAt)}
                                </span>
                                {isUnread && (
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 ring-2 ring-rose-200 dark:ring-rose-900/50" />
                                )}
                              </div>
                            </div>

                            <div className="font-bold text-xs text-slate-900 dark:text-purple-100 leading-snug">
                              {item.title}
                            </div>

                            <div className="text-[11px] text-slate-600 dark:text-purple-200/90 mt-1 whitespace-pre-line leading-relaxed">
                              {String(item.message || '').replace(new RegExp('^' + String(item.title || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*', 'i'), '').trim() || item.message}
                            </div>

                            {/* Action Link & Dismissal */}
                            <div className="mt-2.5 pt-1.5 border-t border-slate-200/60 dark:border-purple-800/40 flex items-center justify-between gap-2">
                              {a.actionUrl ? (
                                <a
                                  href={a.actionUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                                >
                                  <span>{a.actionLabel || 'Visit Action Link'}</span>
                                  <ExternalLink className="w-2.5 h-2.5" />
                                </a>
                              ) : (
                                <span className="text-[9.5px] text-slate-400 dark:text-purple-300/60">
                                  From SuperAdmin
                                </span>
                              )}

                              {isUnread ? (
                                <button
                                  type="button"
                                  onClick={() => handleDismissAnnouncement(a.id)}
                                  disabled={isDismissingAnnouncement === a.id}
                                  className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-white dark:bg-purple-900/60 hover:bg-slate-100 dark:hover:bg-purple-800/60 text-slate-700 dark:text-purple-200 border border-slate-200 dark:border-purple-700/60 flex items-center gap-1 cursor-pointer transition active:scale-95 shadow-2xs"
                                  title="Acknowledge notice"
                                >
                                  <Check className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" />
                                  <span>{isDismissingAnnouncement === a.id ? 'Saving...' : 'Acknowledge'}</span>
                                </button>
                              ) : (
                                <span className="text-[9.5px] font-medium text-slate-400 dark:text-purple-300/60 flex items-center gap-1">
                                  <CheckCheck className="w-3 h-3 text-emerald-500" />
                                  <span>Read</span>
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      } else {
                        // Store Activity Item
                        const isRead = item.isRead;
                        const details = getActivityTypeDetails(item.type, item.title);

                        return (
                          <div
                            key={item.id}
                            onClick={() => handleActivityClick(item)}
                            className={`p-2.5 rounded-xl border transition cursor-pointer ${
                              !isRead
                                ? 'bg-purple-50/70 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800/60 hover:bg-purple-100/60 dark:hover:bg-purple-900/40'
                                : 'bg-white/60 dark:bg-[#120726]/50 border-slate-200/80 dark:border-purple-900/30 opacity-75 hover:opacity-100 hover:bg-slate-50 dark:hover:bg-purple-950/20'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1 mb-1.5">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {/* Clear Label & Type Badge */}
                                <span className={`text-[8.5px] font-extrabold px-1.5 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1 ${details.badgeClass}`}>
                                  {details.icon}
                                  <span>Activity • {details.label}</span>
                                </span>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="text-[9px] text-slate-400 dark:text-purple-300/70">
                                  {formatAnnouncementTime(item.createdAt)}
                                </span>
                                {!isRead && (
                                  <span className="w-1.5 h-1.5 rounded-full bg-purple-500 ring-2 ring-purple-200 dark:ring-purple-900/50" />
                                )}
                              </div>
                            </div>

                            <div className="font-bold text-xs text-slate-900 dark:text-purple-100 leading-snug">
                              {item.title}
                            </div>

                            <div className="text-[11px] text-slate-600 dark:text-purple-200/90 mt-1 whitespace-pre-line leading-relaxed">
                              {String(item.message || '').replace(new RegExp('^' + String(item.title || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*', 'i'), '').trim() || item.message}
                            </div>

                            <div className="mt-2 pt-1.5 border-t border-slate-200/60 dark:border-purple-800/40 flex items-center justify-between text-[10px]">
                              <span className="font-medium text-purple-600 dark:text-purple-300 flex items-center gap-1">
                                <span>{details.actionText}</span>
                                <span>&rarr;</span>
                              </span>
                              <span className="text-[9px] text-slate-400 dark:text-purple-300/60">
                                {isRead ? 'Acknowledged' : 'Click to inspect'}
                              </span>
                            </div>
                          </div>
                        );
                      }
                    })
                  )}
                </div>

                {/* Unified Notifications Footer */}
                <div className="px-2.5 py-1.5 border-t border-slate-100 dark:border-purple-800/40 mt-1.5 flex items-center justify-between text-[11px]">
                  {unreadCount > 0 ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMarkAllNotificationsRead();
                      }}
                      className="text-purple-600 dark:text-purple-200 hover:text-purple-700 dark:hover:text-white hover:bg-purple-50/40 dark:hover:bg-purple-500/25 px-1.5 py-0.5 rounded-md flex items-center gap-1 cursor-pointer font-medium transition-colors text-[10px]"
                    >
                      <CheckCheck className="w-2.5 h-2.5" />
                      Mark all as read
                    </button>
                  ) : (
                    <span className="text-slate-400 dark:text-purple-300/70 text-[9px]">All caught up</span>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="text-[9.5px] font-semibold text-slate-400 dark:text-purple-300/60">
                      {unifiedNotifications.length} {unifiedNotifications.length === 1 ? 'Alert' : 'Alerts'}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        onTabChange?.('inventory');
                        setShowNotifications(false);
                      }}
                      className="text-slate-500 dark:text-purple-300 hover:text-slate-800 dark:hover:text-purple-100 cursor-pointer font-medium text-[10px]"
                    >
                      View Stock &rarr;
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
          {/* Three-Way Theme Dropdown Sub-Component */}
          <ThemeDropdown
            id="header-theme-dropdown-trigger"
            isOpen={showThemeDropdown}
            onOpenChange={(open) => {
              setShowThemeDropdown(open);
              if (open) {
                setShowUserDropdown(false);
                setShowNotifications(false);
              }
            }}
          />

          {/* User Avatar + Name + Dropdown Chevron */}
          <div ref={userRef} className="relative">
            <button
              id="header-user-menu-trigger"
              type="button"
              onClick={() => {
                setShowUserDropdown((prev) => !prev);
                setShowThemeDropdown(false);
                setShowNotifications(false);
              }}
              className={`h-8 sm:h-8.5 flex items-center gap-2 px-2.5 sm:px-3 py-1 rounded-lg transition-all duration-200 cursor-pointer border text-xs ${
                showUserDropdown
                  ? 'bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 text-white border-purple-400/50 ring-2 ring-purple-400/50 shadow-md shadow-purple-600/25 dark:shadow-[0_0_16px_rgba(147,51,234,0.4)]'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200 dark:text-purple-200 dark:hover:text-white dark:bg-purple-500/20 dark:hover:bg-purple-500/30 dark:border-purple-400/40 dark:shadow-[0_0_14px_rgba(147,51,234,0.2)]'
              }`}
              aria-label="User menu"
              aria-expanded={showUserDropdown}
              aria-haspopup="true"
            >
              <User className="w-3.5 h-3.5 stroke-[2] shrink-0 text-current opacity-90" />
              <span
                className={`hidden sm:inline-block text-xs font-bold max-w-[120px] truncate ${
                  showUserDropdown ? 'text-white' : 'text-slate-800 dark:text-purple-200'
                }`}
              >
                {headerUserName}
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
                  {/* Unified Identity & Role Card: User info DP + Role card wrapped in one card with dark mode gradient */}
                  <div className="p-2.5 rounded-lg bg-slate-50/80 dark:bg-gradient-to-r dark:from-purple-900 dark:via-indigo-950 dark:to-slate-900 border border-slate-100 dark:border-purple-800/80 dark:text-white transition-colors mb-0.5 space-y-2">
                    {/* Row 1: Enlarged circular DP on Left, Name and Email on Right */}
                    <div className="flex items-center gap-3">
                      <UserAvatar
                        name={currentUser?.name}
                        avatarUrl={currentUser?.avatarUrl || currentUser?.avatar_url}
                        role={currentUser?.role}
                        size="lg"
                        className="shrink-0 rounded-full ring-2 ring-purple-500/40 shadow-md"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate leading-tight">
                          {headerUserName}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-purple-200/80 truncate leading-tight mt-0.5">
                          {currentUser?.email || 'admin@store.com'}
                        </div>
                      </div>
                    </div>

                    {/* Row 2: Role Card with Login as Cashier / Return to Admin Button */}
                    {(() => {
                      const isRealAdmin =
                        (currentUser?.originalRole || '').toUpperCase() === 'ADMIN' ||
                        ((currentUser?.role || '').toUpperCase() === 'ADMIN' &&
                          (currentUser?.originalRole || '').toUpperCase() !== 'CASHIER');
                      const isAdminMode = (currentUser?.role || 'ADMIN').toUpperCase() === 'ADMIN';

                      if (isAdminMode) {
                        return (
                          <div className="p-2 rounded-lg bg-emerald-50/90 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-300 space-y-1.5 dark:shadow-[0_0_10px_rgba(16,185,129,0.15)] backdrop-blur-xs">
                            <div className="flex items-center justify-between gap-1">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                <span className="text-[10px] font-bold tracking-wide uppercase truncate">
                                  Role: Admin
                                </span>
                              </div>
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-bold bg-emerald-600 text-white dark:bg-emerald-400 dark:text-emerald-950 uppercase tracking-wider shrink-0">
                                <span className="w-1.5 h-1.5 rounded-full bg-white dark:bg-emerald-950 animate-pulse" />
                                Verified
                              </span>
                            </div>

                            {/* Action button in role admin badge: Browse as Cashier */}
                            <button
                              type="button"
                              id="header-browse-as-cashier-btn"
                              onClick={() => {
                                setShowUserDropdown(false);
                                if (onSwitchRole) {
                                  onSwitchRole('CASHIER');
                                } else {
                                  try {
                                    const cached = localStorage.getItem('pos_current_user');
                                    if (cached) {
                                      const u = JSON.parse(cached);
                                      if ((u.originalRole || u.role || '').toUpperCase() === 'ADMIN') {
                                        u.role = 'CASHIER';
                                        u.originalRole = 'ADMIN';
                                        u.isSimulatedCashier = true;
                                        localStorage.setItem('pos_current_user', JSON.stringify(u));
                                      }
                                    }
                                  } catch {}
                                }
                                onTabChange?.('pos');
                              }}
                              className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white text-xs font-semibold transition shadow-2xs cursor-pointer"
                              title="Browse as cashier to operate POS terminal"
                            >
                              <ShoppingCart className="w-3.5 h-3.5 stroke-[2] shrink-0" />
                              <span>Browse as Cashier</span>
                            </button>
                          </div>
                        );
                      }

                      // User is in Cashier mode (currentUser.role === 'CASHIER')
                      return (
                        <div
                          className={`p-2 rounded-lg bg-blue-50/90 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-500/30 text-blue-800 dark:text-blue-300 dark:shadow-[0_0_10px_rgba(59,130,246,0.15)] backdrop-blur-xs ${
                            isRealAdmin ? 'space-y-1.5' : ''
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <ShoppingCart className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                              <span className="text-[10px] font-bold tracking-wide uppercase truncate">
                                Role: Cashier Mode
                              </span>
                            </div>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-bold bg-blue-600 text-white dark:bg-blue-400 dark:text-blue-950 uppercase tracking-wider shrink-0">
                              POS Terminal
                            </span>
                          </div>

                          {/* Action button in role cashier badge: Browse as Admin (ONLY for Admins browsing as Cashier) */}
                          {isRealAdmin && (
                            <button
                              type="button"
                              id="header-browse-as-admin-btn"
                              onClick={() => {
                                setShowUserDropdown(false);
                                if (onSwitchRole) {
                                  onSwitchRole('ADMIN');
                                } else {
                                  try {
                                    const cached = localStorage.getItem('pos_current_user');
                                    if (cached) {
                                      const u = JSON.parse(cached);
                                      if ((u.originalRole || '').toUpperCase() === 'ADMIN') {
                                        u.role = 'ADMIN';
                                        u.isSimulatedCashier = false;
                                        localStorage.setItem('pos_current_user', JSON.stringify(u));
                                      }
                                    }
                                  } catch {}
                                }
                              }}
                              className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white text-xs font-semibold transition shadow-2xs cursor-pointer"
                              title="Browse as full Store Administrator"
                            >
                              <ShieldCheck className="w-3.5 h-3.5 stroke-[2] shrink-0" />
                              <span>Browse as Admin</span>
                            </button>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Profile & Security Item */}
                  <button
                    type="button"
                    onClick={() => {
                      setShowUserDropdown(false);
                      onOpenProfile?.();
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition cursor-pointer text-slate-700 dark:text-purple-200 hover:bg-gradient-to-r hover:from-purple-600 hover:via-indigo-600 hover:to-purple-700 hover:text-white dark:hover:text-white dark:hover:bg-purple-500/25 group border border-transparent"
                  >
                    <UserCog className="w-3.5 h-3.5 stroke-[2] transition-colors shrink-0 text-current opacity-80 group-hover:opacity-100" />
                    <span className="truncate text-xs">Profile & Security</span>
                  </button>

                  {/* Theme Switcher Quick Row */}
                  <button
                    type="button"
                    onClick={() => {
                      setShowUserDropdown(false);
                      setShowThemeDropdown(true);
                    }}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs font-medium rounded-lg transition cursor-pointer text-slate-700 dark:text-purple-200 hover:bg-gradient-to-r hover:from-purple-600 hover:via-indigo-600 hover:to-purple-700 hover:text-white dark:hover:text-white dark:hover:bg-purple-500/25 group border border-transparent"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {themeMode === 'dark' ? (
                        <Moon className="w-3.5 h-3.5 stroke-[2] transition-colors shrink-0 text-current opacity-80 group-hover:opacity-100" />
                      ) : themeMode === 'light' ? (
                        <Sun className="w-3.5 h-3.5 stroke-[2] transition-colors shrink-0 text-current opacity-80 group-hover:opacity-100" />
                      ) : (
                        <Monitor className="w-3.5 h-3.5 stroke-[2] transition-colors shrink-0 text-current opacity-80 group-hover:opacity-100" />
                      )}
                      <span className="capitalize truncate text-xs">Theme: {themeMode}</span>
                    </div>
                    <span className="text-[10px] font-semibold text-purple-600 dark:text-purple-200 group-hover:text-white group-hover:bg-white/20 group-hover:border-white/30 bg-purple-50 dark:bg-purple-500/20 px-2 py-0.5 rounded-full border border-purple-200 dark:border-purple-400/40 transition-colors shrink-0">
                      Change
                    </span>
                  </button>

                  {/* Settings Item - Available for Store Owner (ADMIN) and Platform Owner (SUPERADMIN) */}
                  {((currentUser?.role || '').toUpperCase() === 'ADMIN' || (currentUser?.role || '').toUpperCase() === 'SUPERADMIN' || (currentUser?.role || '').toUpperCase() === 'CASHIER') && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowUserDropdown(false);
                        onTabChange?.('settings');
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 text-xs transition cursor-pointer rounded-lg ${
                        currentTab === 'settings'
                          ? 'bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 text-white font-semibold shadow-md shadow-purple-600/25 border border-purple-400/40 dark:shadow-[0_0_14px_rgba(147,51,234,0.3)]'
                          : 'text-slate-700 dark:text-purple-200 font-medium hover:bg-gradient-to-r hover:from-purple-600 hover:via-indigo-600 hover:to-purple-700 hover:text-white dark:hover:text-white dark:hover:bg-purple-500/25 group border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {(currentUser?.role || '').toUpperCase() === 'CASHIER' ? (
                          <Printer
                            className={`w-3.5 h-3.5 stroke-[2] transition-colors shrink-0 ${
                              currentTab === 'settings'
                                ? 'text-white'
                                : 'text-current opacity-80 group-hover:opacity-100'
                            }`}
                          />
                        ) : (
                          <Settings
                            className={`w-3.5 h-3.5 stroke-[2] transition-colors shrink-0 ${
                              currentTab === 'settings'
                                ? 'text-white'
                                : 'text-current opacity-80 group-hover:opacity-100'
                            }`}
                          />
                        )}
                        <span className="truncate text-xs">
                          {(currentUser?.role || '').toUpperCase() === 'SUPERADMIN'
                            ? 'Root System Settings'
                            : (currentUser?.role || '').toUpperCase() === 'CASHIER'
                            ? 'Printer Settings'
                            : 'Store Settings'}
                        </span>
                      </div>
                      {currentTab === 'settings' && (
                        <Check className="w-3.5 h-3.5 text-white stroke-[2.5] shrink-0" />
                      )}
                    </button>
                  )}

                  {/* Log Out Option */}
                  <div className="pt-1 border-t border-slate-100 dark:border-purple-800/40">
                    <button
                      type="button"
                      onClick={() => {
                        setShowUserDropdown(false);
                        onLogout();
                      }}
                      className="w-full flex items-center gap-2.5 px-2.5 py-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5 stroke-[2.2] shrink-0" />
                      <span className="truncate text-xs">Log Out / Switch</span>
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      {/* Real-time Floating POS Action Notification Toast with Direct Deep-Link */}
      <AnimatePresence>
        {livePushToast && (
          <motion.div
            initial={{ opacity: 0, y: -24, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -24, scale: 0.94 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            className="fixed top-16 right-4 z-50 max-w-sm sm:max-w-md w-full bg-white dark:bg-[#120726] border-2 border-purple-500/80 rounded-2xl shadow-2xl p-3.5 backdrop-blur-xl ring-4 ring-purple-500/10 no-print"
          >
            <div className="flex items-start gap-3">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                  livePushToast.type === 'SALE'
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                    : livePushToast.type === 'RETURN'
                    ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                    : 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30'
                }`}
              >
                {livePushToast.type === 'SALE' ? (
                  <ShoppingBag className="w-5 h-5" />
                ) : livePushToast.type === 'RETURN' ? (
                  <RefreshCw className="w-5 h-5" />
                ) : (
                  <ArrowLeftRight className="w-5 h-5" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <h4 className="text-xs font-bold text-slate-900 dark:text-purple-100 truncate">
                    {livePushToast.title}
                  </h4>
                  <button
                    type="button"
                    onClick={() => setLivePushToast(null)}
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-0.5 rounded cursor-pointer transition"
                    title="Dismiss alert"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-purple-200/85 mt-1 line-clamp-2 leading-snug">
                  {livePushToast.message}
                </p>
                <div className="mt-2.5 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleToastClick}
                    className="py-1 px-3 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-semibold text-[11px] flex items-center gap-1.5 shadow-xs cursor-pointer transition active:scale-95"
                  >
                    <span>View Receipt / Details</span>
                    <span aria-hidden="true">&rarr;</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setLivePushToast(null)}
                    className="py-1 px-2.5 rounded-lg text-slate-500 hover:text-slate-700 dark:text-purple-300 dark:hover:text-white text-[11px] font-medium cursor-pointer transition"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
