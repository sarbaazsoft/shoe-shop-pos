import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { api, getAuthToken, setAuthSession, removeAuthToken, revokeSessionOnServer, setActiveTenantId, getActiveTenantId } from './services/api.ts';
import { Header } from './components/common/Header.tsx';
import { Sidebar } from './components/common/Sidebar.tsx';
import { PosTerminal } from './components/pos/PosTerminal.tsx';
import { ProductManagement } from './components/inventory/ProductManagement.tsx';
import { StockLedgerView } from './components/inventory/StockLedgerView.tsx';
import { PurchaseManagement } from './components/purchases/PurchaseManagement.tsx';
import { SalesReturnView } from './components/returns/SalesReturnView.tsx';
import { CustomerManagement } from './components/customers/CustomerManagement.tsx';
import { ReportsDashboard } from './components/reports/ReportsDashboard.tsx';
import { SettingsView } from './components/settings/SettingsView.tsx';
import { SupplierManagement } from './components/suppliers/SupplierManagement.tsx';
import { DashboardOverview } from './components/dashboard/DashboardOverview.tsx';
import { AuthModal } from './components/auth/AuthModal.tsx';
import { UserProfileModal } from './components/auth/UserProfileModal.tsx';
import { OfflineToastNotification } from './components/common/OfflineToastNotification.tsx';
import { PublicLayout } from './components/common/PublicLayout.tsx';
import { SammiAssistantView } from './components/chat/SammiAssistantView.tsx';
import { SaasLandingPage } from './components/saas/SaasLandingPage.tsx';
import { UnknownStore404View } from './components/saas/UnknownStore404View.tsx';
import { SuspendedStoreView } from './components/saas/SuspendedStoreView.tsx';
import { SuperAdminControlPanel } from './components/saas/SuperAdminControlPanel.tsx';
import { TenantOnboardingWizard } from './components/saas/TenantOnboardingWizard.tsx';
import { InstallationWizard } from './components/saas/InstallationWizard.tsx';
import { ShieldAlert } from 'lucide-react';
import type { ActiveExchange, TenantInfo } from './types.ts';

type SaasRouteMode =
  | 'INSTALLER'
  | 'LANDING'
  | 'SUPERADMIN'
  | 'TENANT_ACTIVE'
  | 'TENANT_SUSPENDED'
  | 'TENANT_EXPIRED'
  | 'TENANT_NOT_FOUND'
  | 'TENANT_ONBOARDING';

const APP_TAB_ROUTES = new Set([
  'dashboard', 'pos', 'inventory', 'ledger', 'purchases', 'suppliers',
  'returns', 'customers', 'reports', 'settings', 'assistant',
]);

function appPathForTab(tab: string): string {
  return `/${tab || 'dashboard'}`;
}

function resolveTargetTab(requestedTab: string | undefined | null, user: any): string {
  const role = (user?.role || '').toLowerCase();
  const isCashier = role === 'cashier';
  const isAdmin = role === 'admin' || role === 'superadmin';
  const clean = (requestedTab || '').toLowerCase().trim();

  // Route Guard: Settings are accessible to:
  // - Store Owners / Admins (store settings, staff/users, printer settings)
  // - Cashiers (hardware and printer settings only)
  // - Platform Owner / SuperAdmin (system settings, store settings, etc.)
  // Cashiers can access 'settings' directly to configure printers.
  // Other non-authorized roles are redirected to dashboard.
  if (clean === 'settings' && !isAdmin && !isCashier) {
    return 'dashboard';
  }

  if (isCashier) {
    if (!clean || clean === 'dashboard' || clean === 'purchases') {
      return 'pos';
    }
    return clean;
  }

  if (!clean || clean === 'dashboard') {
    return 'dashboard';
  }
  return clean;
}

function detectInitialRouteFromLocation(): {
  mode: SaasRouteMode;
  tenantIdParam: string;
  isAuthRoute: boolean;
} {
  const pathname = window.location.pathname;
  const searchParams = new URLSearchParams(window.location.search);
  const tenantIdParam =
    searchParams.get('tenantId') ||
    searchParams.get('storeId') ||
    searchParams.get('tenant_id') ||
    searchParams.get('store_id') ||
    '';
  const isAuthRoute =
    pathname === '/auth' ||
    pathname === '/login' ||
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/login/') ||
    searchParams.get('mode') === 'auth' ||
    searchParams.get('mode') === 'login';

  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    return { mode: 'SUPERADMIN', tenantIdParam, isAuthRoute };
  }
  if (pathname === '/install' || pathname.startsWith('/install/')) {
    return { mode: 'INSTALLER', tenantIdParam, isAuthRoute };
  }
  if (pathname === '/onboarding' || pathname.startsWith('/onboarding') || searchParams.get('mode') === 'onboarding') {
    return { mode: 'TENANT_ONBOARDING', tenantIdParam, isAuthRoute };
  }

  const pathTab = pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
  const queryTab = searchParams.get('tab')?.toLowerCase() || '';
  const requestedTab = APP_TAB_ROUTES.has(pathTab) ? pathTab : queryTab;
  if (requestedTab && APP_TAB_ROUTES.has(requestedTab)) {
    // Upgrade older query-based tab links to clean root paths.
    if (pathname === '/' || queryTab) {
      const tenantQuery = tenantIdParam ? `?tenantId=${encodeURIComponent(tenantIdParam)}` : '';
      window.history.replaceState({}, '', `${appPathForTab(requestedTab)}${tenantQuery}`);
    }
  } else if (pathname !== '/' && pathname !== '/landing') {
    window.history.replaceState({}, '', `/${window.location.search}`);
  }
  return { mode: 'LANDING', tenantIdParam, isAuthRoute };
}

export default function App() {
  const initialRoute = detectInitialRouteFromLocation();
  const initialSectionPath = APP_TAB_ROUTES.has(window.location.pathname.replace(/^\/+|\/+$/g, '').toLowerCase());
  const hasResetTokenParam = new URLSearchParams(window.location.search).has('resetToken');
  const [saasMode, setSaasMode] = useState<SaasRouteMode>(initialRoute.mode);
  const [activeTenant, setActiveTenant] = useState<TenantInfo | null>(null);
  const [availableTenants, setAvailableTenants] = useState<TenantInfo[]>([]);
  const [globalLoginOpen, setGlobalLoginOpen] = useState(
    hasResetTokenParam || initialRoute.isAuthRoute || Boolean(initialRoute.tenantIdParam)
  );
  const [storeLoginTarget, setStoreLoginTarget] = useState<TenantInfo | null>(null);
  const [tenantIdNotice, setTenantIdNotice] = useState('');
  const tenantIdParam = initialRoute.tenantIdParam;

  const [currentUser, setCurrentUser] = useState<any | null>(() => {
    try {
      const token = localStorage.getItem('pos_auth_token');
      if (!token || token === 'null' || token === 'undefined') {
        localStorage.removeItem('pos_current_user');
        localStorage.removeItem('pos_auth_token');
        return null;
      }
      const stored = localStorage.getItem('pos_current_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const [companySettings, setCompanySettings] = useState<any | null>(() => {
    try {
      const stored = localStorage.getItem('cached_company_settings');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const [cachedStoreName, setCachedStoreName] = useState<string>(() => {
    try {
      return localStorage.getItem('cached_store_name') || '';
    } catch {
      return '';
    }
  });

  const [currentTab, setCurrentTab] = useState<string>(() => {
    try {
      const stored = localStorage.getItem('pos_current_user');
      const user = stored ? JSON.parse(stored) : null;
      const pathTab = window.location.pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
      const searchTab = new URLSearchParams(window.location.search).get('tab');
      const requestedTab = APP_TAB_ROUTES.has(pathTab) ? pathTab : searchTab;
      return resolveTargetTab(requestedTab, user);
    } catch {
      return 'dashboard';
    }
  });

  const [activeExchangeForPos, setActiveExchangeForPos] = useState<ActiveExchange | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [selectedSupplierForPurchase, setSelectedSupplierForPurchase] = useState<{ id?: number; name?: string } | null>(null);

  // A tenantId/storeId URL is an explicit store switch. Until its ID has been
  // resolved against the current tenant directory, cached settings belong to an
  // unknown (possibly previous) store and must not be used by the login UI.
  const isRequestedTenantVerified = !tenantIdParam || Boolean(
    storeLoginTarget && Number(storeLoginTarget.id) === Number(tenantIdParam)
  );
  const shouldShowTenantLoading = isInitializing || (
    Boolean(tenantIdParam) && !isRequestedTenantVerified && !tenantIdNotice
  );

  // Auth routes must never inherit a previous session's cached store branding.
  // For an explicit store URL, only the tenant-directory-verified target is trusted;
  // for generic /auth or /login routes, use neutral branding until a store is selected.
  const suppressCachedTenantBranding = initialRoute.isAuthRoute || Boolean(tenantIdParam);
  const effectiveStoreName = tenantIdParam && !isRequestedTenantVerified
    ? ''
    : storeLoginTarget?.name ||
      activeTenant?.name ||
      (!suppressCachedTenantBranding
        ? companySettings?.name ||
          companySettings?.company_name ||
          companySettings?.companyName ||
          cachedStoreName ||
          ''
        : '');

  // Name shown for the app: the store name for tenants (same as the PWA name), with
  // fixed names for the landing page and the SuperAdmin panel.
  const pwaAppName =
    saasMode === 'SUPERADMIN'
      ? 'POS SaaS C-Panel'
      : saasMode === 'LANDING'
      ? 'SarbaazSoft Shoe POS'
      : effectiveStoreName || 'SarbaazSoft Shoe POS';
  // Installed PWA windows / status bars already show the app name (the store name) next to the
  // page title, so the title must not repeat any name there. Normal browser tabs keep the
  // "Store | SarbaazSoft Shoe POS" credit.
  const isInstalledPwa =
    typeof window !== 'undefined' &&
    ((typeof window.matchMedia === 'function' &&
      ['standalone', 'minimal-ui', 'window-controls-overlay', 'fullscreen'].some(
        (mode) => window.matchMedia(`(display-mode: ${mode})`).matches
      )) ||
      (window.navigator as any).standalone === true);
  const pageTitle =
    saasMode === 'SUPERADMIN' || saasMode === 'LANDING' || !effectiveStoreName
      ? pwaAppName
      : isInstalledPwa
      ? effectiveStoreName
      : `${effectiveStoreName} | SarbaazSoft Shoe POS`;

  // Dynamically update <link rel="manifest"> and <meta name="theme-color"> for the tenant or SuperAdmin PWA
  useEffect(() => {
    document.title = pageTitle;

    const appleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (appleTitle) {
      appleTitle.setAttribute('content', pwaAppName);
    }
    const appNameMeta = document.querySelector('meta[name="application-name"]');
    if (appNameMeta) {
      appNameMeta.setAttribute('content', pwaAppName);
    }

    const manifestLink = document.querySelector('link[rel="manifest"]') as HTMLLinkElement;
    const themeMeta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement;
    const isSuperAdminMode = saasMode === 'SUPERADMIN';
    const iconPrefix = isSuperAdminMode ? '/admin' : '';

    // Dynamically update apple-touch-icon and standard icon links so store icons apply only to stores, not SuperAdmin PWA
    document.querySelectorAll<HTMLLinkElement>('link[rel="apple-touch-icon"]').forEach((link) => {
      const sizes = link.getAttribute('sizes');
      if (sizes === '192x192') {
        link.setAttribute('href', `${iconPrefix}/pwa-192x192.png`);
      } else if (sizes === '512x512') {
        link.setAttribute('href', `${iconPrefix}/pwa-512x512.png`);
      } else {
        link.setAttribute('href', `${iconPrefix}/apple-touch-icon.png`);
      }
    });

    document.querySelectorAll<HTMLLinkElement>('link[rel="icon"], link[rel="shortcut icon"]').forEach((link) => {
      const sizes = link.getAttribute('sizes');
      const type = link.getAttribute('type');
      if (sizes === '192x192') {
        link.setAttribute('href', `${iconPrefix}/pwa-192x192.png`);
      } else if (sizes === '512x512') {
        link.setAttribute('href', `${iconPrefix}/pwa-512x512.png`);
      } else if (sizes === '32x32') {
        link.setAttribute('href', `${iconPrefix}/favicon-32x32.png`);
      } else if (type === 'image/svg+xml') {
        link.setAttribute('href', `${iconPrefix}/icon.svg`);
      } else {
        link.setAttribute('href', `${iconPrefix}/favicon.ico`);
      }
    });

    if (isSuperAdminMode) {
      if (manifestLink) manifestLink.setAttribute('href', '/admin/manifest.webmanifest');
      if (themeMeta) themeMeta.setAttribute('content', '#0F172A');
    } else if (activeTenant && activeTenant.id) {
      if (manifestLink) {
        manifestLink.setAttribute('href', `/api/tenants/manifest?tenantId=${encodeURIComponent(String(activeTenant.id))}`);
      }
      if (themeMeta) {
        themeMeta.setAttribute('content', '#2563EB');
      }
    } else {
      if (manifestLink) {
        manifestLink.setAttribute('href', `/manifest.webmanifest?store=${encodeURIComponent(effectiveStoreName)}`);
      }
    }
  }, [pwaAppName, pageTitle, effectiveStoreName, saasMode, activeTenant]);

  // Resolve the shared tenant directory and selected store status.
  const refreshTenantDirectory = useCallback(async (targetMode?: SaasRouteMode) => {
    try {
      const res = await api.saas.resolve();

      if (Array.isArray(res?.availableTenants)) {
        setAvailableTenants(res.availableTenants);
      }

      const resolution = res?.resolution;
      const effectiveMode = targetMode || saasMode;

      if (effectiveMode === 'LANDING' || effectiveMode === 'SUPERADMIN') {
        return;
      }

      if (effectiveMode === 'TENANT_ONBOARDING') {
        if (resolution?.tenant) {
          setActiveTenant(resolution.tenant);
          setActiveTenantId(resolution.tenant.id);
        }
        return;
      }

      if (resolution?.mode === 'TENANT_NOT_FOUND') {
        setActiveTenant(null);
        setSaasMode('TENANT_NOT_FOUND');
      } else if (resolution?.mode === 'TENANT_SUSPENDED') {
        setActiveTenant(resolution.tenant);
        if (resolution.tenant) {
          setActiveTenantId(resolution.tenant.id);
        }
        setSaasMode('TENANT_SUSPENDED');
      } else if (
        resolution?.mode === 'TENANT_EXPIRED' ||
        resolution?.tenant?.status === 'EXPIRED' ||
        resolution?.tenant?.subscriptionStatus === 'EXPIRED'
      ) {
        setActiveTenant(resolution.tenant);
        if (resolution.tenant) {
          setActiveTenantId(resolution.tenant.id);
        }
        const storedUserRole = (() => {
          try {
            const raw = localStorage.getItem('pos_current_user');
            if (!raw) return '';
            const parsed = JSON.parse(raw);
            return String(parsed?.originalRole || parsed?.role || '').toUpperCase();
          } catch {
            return '';
          }
        })();
        const isPlatformOwner = storedUserRole === 'SUPERADMIN';
        if (isPlatformOwner) {
          setSaasMode('TENANT_ACTIVE');
          setCurrentTab('settings');
        } else {
          setSaasMode('TENANT_EXPIRED');
        }
      } else if (resolution?.tenant) {
        setActiveTenant(resolution.tenant);
        setActiveTenantId(resolution.tenant.id);
        setSaasMode('TENANT_ACTIVE');
      }
    } catch (err) {
      console.warn('Tenant resolution warning:', err);
    }
  }, [saasMode]);

  const initializeApp = useCallback(async (overrideTenantId?: number | null, overrideMode?: SaasRouteMode) => {
    setIsInitializing(true);
    try {
      const installStatus = await api.install.status().catch(() => null);
      if (
        !installStatus?.installed ||
        window.location.pathname === '/install' ||
        window.location.pathname.startsWith('/install/') ||
        overrideMode === 'INSTALLER'
      ) {
        setSaasMode('INSTALLER');
        setGlobalLoginOpen(false);
        if (window.location.pathname !== '/install') window.history.replaceState({}, '', '/install');
        return;
      }

      // Clean section URLs no longer carry tenantId, so recover the last tenant
      // from the cached identity while bootstrapping a refresh. The session is
      // still verified with /auth/me below before protected content is shown.
      let cachedTenantId: number | null = null;
      let cachedRole = '';
      try {
        const cachedUser = JSON.parse(localStorage.getItem('pos_current_user') || 'null');
        cachedTenantId = Number(cachedUser?.tenantId) > 0 ? Number(cachedUser.tenantId) : null;
        cachedRole = String(cachedUser?.originalRole || cachedUser?.role || '').toUpperCase();
      } catch {}
      const queryTenantId = Number(tenantIdParam) > 0 ? Number(tenantIdParam) : null;
      const tenantIdForInit = overrideTenantId !== undefined
        ? overrideTenantId
        : (queryTenantId || (cachedRole === 'SUPERADMIN' ? null : cachedTenantId || getActiveTenantId() || null));
      const modeForInit = overrideMode || (tenantIdForInit ? 'TENANT_ACTIVE' : saasMode);
      const isLanding = modeForInit === 'LANDING' || modeForInit === 'SUPERADMIN';
      await refreshTenantDirectory(modeForInit);

      // The shared portal only needs the public tenant directory until a tenant is selected.
      if (modeForInit === 'SUPERADMIN' || (isLanding && !tenantIdForInit)) return;

      const [statusRes, settingsRes] = await Promise.all([
        api.install.status().catch(() => null),
        api.settings.get().catch(() => null),
      ]);

      if (statusRes !== null && statusRes.isInstalled !== undefined) {
        const installed = Boolean(statusRes.isInstalled);
        try {
          localStorage.setItem('pos_is_installed', String(installed));
        } catch {}
      }

      if (settingsRes?.settings) {
        setCompanySettings(settingsRes.settings);
        try {
          localStorage.setItem('cached_company_settings', JSON.stringify(settingsRes.settings));
        } catch {}
        const resolvedName =
          settingsRes.settings.name ||
          settingsRes.settings.company_name ||
          settingsRes.settings.companyName;
        if (resolvedName) {
          setCachedStoreName(resolvedName);
          try {
            localStorage.setItem('cached_store_name', resolvedName);
          } catch {}
        }
      }

      // Verify existing JWT token & check if user belongs to the active tenant
      const token = getAuthToken();
      if (!token || token === 'null' || token === 'undefined') {
        setCurrentUser(null);
      } else {
        const userRes = await api.auth.me().catch(() => null);
        if (userRes?.user) {
          const dbRole = (userRes.user.role || '').toUpperCase();
          // If switching to a different tenant store than the user's JWT tenant, prompt login for that store (unless SUPERADMIN)
          if (
            tenantIdForInit &&
            userRes.user.tenantId &&
            Number(userRes.user.tenantId) !== Number(tenantIdForInit) &&
            dbRole !== 'SUPERADMIN'
          ) {
            setCurrentUser(null);
          } else if (dbRole === 'CASHIER') {
            const cashierUser = {
              ...userRes.user,
              role: 'CASHIER',
              originalRole: 'CASHIER',
              isSimulatedCashier: false,
            };
            setCurrentUser(cashierUser);
            try {
              localStorage.setItem('pos_current_user', JSON.stringify(cashierUser));
            } catch {}
          } else {
            const adminUser = {
              ...userRes.user,
              role: dbRole === 'SUPERADMIN' ? 'SUPERADMIN' : 'ADMIN',
              originalRole: dbRole === 'SUPERADMIN' ? 'SUPERADMIN' : 'ADMIN',
              isSimulatedCashier: false,
            };
            setCurrentUser(adminUser);
            try {
              localStorage.setItem('pos_current_user', JSON.stringify(adminUser));
            } catch {}
          }
        } else if (navigator.onLine) {
          removeAuthToken();
          setCurrentUser(null);
        }
      }
    } catch (err) {
      console.error('Initialization error:', err);
    } finally {
      setIsInitializing(false);
    }
  }, [tenantIdParam, refreshTenantDirectory, saasMode]);

  useEffect(() => {
    initializeApp();
  }, []);

  useEffect(() => {
    if (initialSectionPath && !isInitializing && !currentUser && saasMode === 'LANDING') {
      setGlobalLoginOpen(true);
    }
  }, [initialSectionPath, isInitializing, currentUser, saasMode]);

  // PWA launch URLs use /?tenantId=<tenant id>. Resolve the id against the
  // public tenant directory before presenting a tenant-scoped sign-in.
  useEffect(() => {
    if (!tenantIdParam || isInitializing || saasMode !== 'LANDING') return;
    const requestedId = Number(tenantIdParam);
    const target = Number.isSafeInteger(requestedId) && requestedId > 0
      ? availableTenants.find((tenant) => Number(tenant.id) === requestedId)
      : undefined;

    if (!target) {
      if (availableTenants.length > 0) {
        setStoreLoginTarget(null);
        setTenantIdNotice(`Store / Tenant ID “${tenantIdParam}” was not found. Check the store link or contact your administrator.`);
        setGlobalLoginOpen(false);
      }
      return;
    }

    setStoreLoginTarget(target);
    setTenantIdNotice('');
    setGlobalLoginOpen(true);
  }, [tenantIdParam, availableTenants, isInitializing, saasMode]);

  // Keep tenantId on the shared root only while a store sign-in is required.
  useEffect(() => {
    if (saasMode !== 'TENANT_ACTIVE' || isInitializing || currentUser || !activeTenant) return;
    setStoreLoginTarget(activeTenant);
    setTenantIdNotice('');
    setGlobalLoginOpen(true);
    setSaasMode('LANDING');
    window.history.replaceState({}, '', `/?tenantId=${encodeURIComponent(activeTenant.id)}`);
  }, [saasMode, isInitializing, currentUser, activeTenant]);

  // tenantId is only a pre-authentication selector. Authenticated pages use clean section paths.
  useEffect(() => {
    if (saasMode !== 'TENANT_ACTIVE' || isInitializing || !currentUser) return;
    const canonicalPath = appPathForTab(currentTab);
    if (window.location.pathname !== canonicalPath || window.location.search) {
      window.history.replaceState({}, '', canonicalPath);
    }
  }, [saasMode, isInitializing, currentUser, currentTab]);

  // /admin is a protected destination, not a second sign-in page. Route
  // unauthenticated users through the same shared root sign-in form.
  useEffect(() => {
    const role = String(currentUser?.originalRole || currentUser?.role || '').toUpperCase();
    if (saasMode !== 'SUPERADMIN' || isInitializing || role === 'SUPERADMIN') return;
    setGlobalLoginOpen(true);
    window.history.replaceState({}, '', '/');
    setSaasMode('LANDING');
  }, [saasMode, isInitializing, currentUser]);

  // An already-authenticated SuperAdmin opening the shared root (including
  // their PWA start URL) goes straight to the admin destination.
  useEffect(() => {
    const role = String(currentUser?.originalRole || currentUser?.role || '').toUpperCase();
    if (saasMode !== 'LANDING' || isInitializing || globalLoginOpen || tenantIdParam || role !== 'SUPERADMIN') return;
    window.history.replaceState({}, '', '/admin');
    setSaasMode('SUPERADMIN');
  }, [saasMode, isInitializing, globalLoginOpen, tenantIdParam, currentUser]);

  // Automatically restrict access to POS/Dashboard if any API request reports SUBSCRIPTION_EXPIRED
  useEffect(() => {
    const handleSubscriptionExpired = (event: Event) => {
      const customEvent = event as CustomEvent;
      const detail = customEvent.detail;
      setActiveTenant((prev) =>
        prev
          ? {
              ...prev,
              status: 'EXPIRED',
              subscriptionStatus: 'EXPIRED',
              ...(detail?.subscriptionEndDate ? { subscriptionEndDate: detail.subscriptionEndDate } : {}),
            }
          : prev
      );
      if (saasMode !== 'SUPERADMIN' && saasMode !== 'LANDING') {
        setSaasMode('TENANT_SUSPENDED');
      }
    };
    window.addEventListener('tenant:subscription-expired', handleSubscriptionExpired);
    return () => window.removeEventListener('tenant:subscription-expired', handleSubscriptionExpired);
  }, [saasMode]);

  // Listen for real-time subscription expiry or suspension events from API middleware
  useEffect(() => {
    const handleSubExpired = () => {
      if (saasMode !== 'SUPERADMIN' && saasMode !== 'LANDING') {
        setSaasMode('TENANT_EXPIRED');
        refreshTenantDirectory('TENANT_EXPIRED');
      }
    };
    window.addEventListener('pos:subscription-expired', handleSubExpired);
    return () => window.removeEventListener('pos:subscription-expired', handleSubExpired);
  }, [saasMode, activeTenant?.id, refreshTenantDirectory]);

  // Navigate between the shared portal and tenant paths.
  const handleNavigateDomain = async (target: {
    mode: 'LANDING' | 'SUPERADMIN' | 'TENANT' | 'NOT_FOUND' | 'ONBOARDING';
    tenantId?: number;
    authenticated?: boolean;
  }) => {
    const isSuperAdmin = String(currentUser?.originalRole || currentUser?.role || '').toUpperCase() === 'SUPERADMIN';
    if (target.mode === 'LANDING') {
      setSaasMode('LANDING');
      setActiveTenant(null);
      setActiveTenantId(null);
      window.history.pushState({}, '', '/');
      return;
    }

    if (target.mode === 'SUPERADMIN') {
      setSaasMode('SUPERADMIN');
      setActiveTenant(null);
      setActiveTenantId(null);
      window.history.pushState({}, '', '/admin');
      return;
    }

    if (target.mode === 'NOT_FOUND') {
      setActiveTenant(null);
      setSaasMode('TENANT_NOT_FOUND');
      window.history.pushState({}, '', '/');
      return;
    }

    if (target.mode === 'ONBOARDING') {
      const selected = availableTenants.find((tenant) => Number(tenant.id) === Number(target.tenantId)) || activeTenant;
      const targetId = selected?.id || target.tenantId;
      if (!targetId) return;
      if (selected) setActiveTenant(selected);
      setActiveTenantId(targetId);
      setSaasMode('TENANT_ONBOARDING');
      window.history.pushState({}, '', `/onboarding?tenantId=${encodeURIComponent(targetId)}`);
      return;
    }

    if (target.mode === 'TENANT') {
      const selected = availableTenants.find((tenant) => Number(tenant.id) === Number(target.tenantId)) || activeTenant;
      const targetId = selected?.id || target.tenantId;
      if (!targetId) return;
      if (selected) setActiveTenant(selected);
      setActiveTenantId(targetId);
      setSaasMode('TENANT_ACTIVE');
      window.history.pushState({}, '', target.authenticated || isSuperAdmin ? appPathForTab(currentTab) : `/?tenantId=${encodeURIComponent(targetId)}`);
      await initializeApp(targetId, 'TENANT_ACTIVE');
    }
  };

  const handleTabChange = (targetTab: string) => {
    const valid = resolveTargetTab(targetTab, currentUser);
    setCurrentTab(valid);
    window.history.replaceState({}, '', appPathForTab(valid));
  };

  // Global F9 keyboard shortcut: Instantly launch POS Terminal from anywhere in the store app
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F9') {
        e.preventDefault();
        if (currentUser && saasMode === 'TENANT_ACTIVE') {
          handleTabChange('pos');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentUser, saasMode]);

  useEffect(() => {
    const role = (currentUser?.role || '').toLowerCase();
    const isCashier = role === 'cashier';
    const isAdmin = role === 'admin' || role === 'superadmin';

    // Route Protection: Non-permitted roles are redirected away from settings
    if (currentTab === 'settings' && !isAdmin && !isCashier) {
      setCurrentTab('dashboard');
      window.history.replaceState({}, '', appPathForTab('dashboard'));
      return;
    }

    if (isCashier) {
      if (currentTab === 'purchases' || currentTab === 'dashboard') {
        setCurrentTab('pos');
      }
    }
  }, [currentUser, currentTab]);

  // Deep-link event listener from Web Push notifications & Service Worker
  useEffect(() => {
    const handleDeepLink = (detail: any) => {
      if (!detail) return;
      const type = (detail.type || '').toUpperCase();
      const invoice = detail.invoiceNumber || detail.invoice;
      const returnNum = detail.returnNumber;

      if (type === 'RETURN') {
        handleTabChange('returns');
        if (invoice) {
          setTimeout(() => {
            window.dispatchEvent(
              new CustomEvent('returns:inspect-invoice', { detail: { invoice, returnNumber: returnNum } })
            );
          }, 150);
        }
      } else if (invoice) {
        handleTabChange('reports');
        setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent('pos:open-receipt', { detail: { invoiceNumber: invoice } })
          );
        }, 150);
      } else if (detail.actionTab) {
        handleTabChange(detail.actionTab);
      }
    };

    const onCustomDeepLink = (e: any) => {
      handleDeepLink(e.detail);
    };

    const onSwMessage = (e: MessageEvent) => {
      if (e.data?.type === 'POS_DEEP_LINK_NOTIFICATION') {
        handleDeepLink(e.data.payload);
      }
    };

    window.addEventListener('pos:navigate-deep-link', onCustomDeepLink);
    window.addEventListener('message', onSwMessage);

    const params = new URLSearchParams(window.location.search);
    const viewInv = params.get('viewInvoice');
    if (viewInv) {
      handleTabChange('reports');
      setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent('pos:open-receipt', { detail: { invoiceNumber: viewInv } })
        );
      }, 300);
    }

    return () => {
      window.removeEventListener('pos:navigate-deep-link', onCustomDeepLink);
      window.removeEventListener('message', onSwMessage);
    };
  }, []);

  const handleStoreCreated = async (tenantId: number, _loginUrl: string, user?: any, token?: string) => {
    const isCompleted = user?.onboardingCompleted === true;
    if (token && user) {
      setAuthSession(token, user);
      const role = String(user?.role || 'ADMIN').toUpperCase();
      const authUser = {
        ...user,
        role,
        originalRole: role,
        onboardingCompleted: isCompleted,
        isSimulatedCashier: false,
      };
      setCurrentUser(authUser);
      try {
        localStorage.setItem('pos_current_user', JSON.stringify(authUser));
      } catch {}
    }
    const storeName = user?.storeName || 'New Shoe Store';
    const initialTenant: TenantInfo = {
      id: tenantId,
      name: storeName,
      status: 'ACTIVE',
      subscriptionStatus: 'ACTIVE',
      subscriptionPlan: 'free_tier',
      businessType: user?.businessType || 'RETAIL',
      pricingMode: user?.pricingMode || 'FIXED',
      logoUrl: '/pwa-512x512.png',
      currency: user?.currency || 'PKR',
      onboardingCompleted: isCompleted,
      appPath: '/dashboard',
    };
    setActiveTenant(initialTenant);
    setCachedStoreName(storeName);
    try {
      localStorage.setItem('cached_store_name', storeName);
    } catch {}
    setAvailableTenants((prev) => [initialTenant, ...prev.filter((t) => t.id !== tenantId)]);
    setActiveTenantId(tenantId);
    setStoreLoginTarget(null);
    setTenantIdNotice('');
    setGlobalLoginOpen(false);

    if (!isCompleted) {
      setSaasMode('TENANT_ONBOARDING');
      window.history.pushState({}, '', `/onboarding?tenantId=${encodeURIComponent(tenantId)}`);
      return;
    }

    setSaasMode('TENANT_ACTIVE');
    setCurrentTab('dashboard');
    window.history.pushState({}, '', '/dashboard');
    await initializeApp(tenantId, 'TENANT_ACTIVE');
  };

  const handleLogout = () => {
    // Immediate logout, no prompt. The remembered login email is stored under its own key
    // (see utils/rememberedAccount.ts) and is intentionally NOT cleared here; only the
    // "Forget this account" action on the sign-in screen removes it.
    // Capture the tenant id BEFORE the session/tenant state is cleared.
    const rawLogoutId = activeTenant?.id || currentUser?.tenantId || getActiveTenantId() || null;
    const currentLogoutID = Number(rawLogoutId) > 0 ? Number(rawLogoutId) : null;
    const isSuperAdminLogout =
      String(currentUser?.originalRole || currentUser?.role || '').toUpperCase() === 'SUPERADMIN';

    revokeSessionOnServer();
    removeAuthToken();
    setActiveTenantId(null);
    try {
      localStorage.removeItem('pos_current_user');
    } catch {}
    try {
      // Drop any per-session hand-off data so the next person on a shared device does not inherit it.
      ['pending_pos_product', 'pending_edit_product', 'pending_purchase_product', 'pending_barcode_product'].forEach(
        (key) => sessionStorage.removeItem(key)
      );
    } catch {}
    setCurrentUser(null);
    setCurrentTab('dashboard');

    // Go straight to the login screen: /?tenantId=<currentLogoutID>
    if (currentLogoutID && !isSuperAdminLogout) {
      const tenant =
        availableTenants.find((t) => Number(t.id) === currentLogoutID) ||
        (activeTenant && Number(activeTenant.id) === currentLogoutID ? activeTenant : null);
      if (tenant) {
        setActiveTenant(tenant);
        setStoreLoginTarget(tenant);
      }
      setActiveTenantId(currentLogoutID);
      setTenantIdNotice('');
      setGlobalLoginOpen(true);
      setSaasMode('LANDING');
      window.history.replaceState({}, '', `/?tenantId=${encodeURIComponent(currentLogoutID)}`);
    } else {
      setActiveTenant(null);
      setStoreLoginTarget(null);
      setTenantIdNotice('');
      setGlobalLoginOpen(true);
      setSaasMode('LANDING');
      window.history.replaceState({}, '', '/');
    }
  };

  const handleSwitchRole = (newRole: 'ADMIN' | 'CASHIER') => {
    setCurrentUser((prev: any) => {
      if (!prev) return prev;
      const trueRole = (prev.originalRole || prev.role || '').toUpperCase();
      if (trueRole !== 'ADMIN' && trueRole !== 'SUPERADMIN') {
        return prev;
      }
      const updated = {
        ...prev,
        role: newRole,
        originalRole: trueRole,
        isSimulatedCashier: newRole === 'CASHIER',
      };
      try {
        localStorage.setItem('pos_current_user', JSON.stringify(updated));
      } catch {}
      return updated;
    });
    if (newRole === 'CASHIER') {
      setCurrentTab('pos');
    } else {
      setCurrentTab('dashboard');
    }
  };

  const handleSettingsUpdated = async (updatedSettings?: any) => {
    try {
      if (updatedSettings) {
        setCompanySettings(updatedSettings);
        try {
          localStorage.setItem('cached_company_settings', JSON.stringify(updatedSettings));
        } catch {}
      }
      const settingsRes = await api.settings.get().catch(() => null);
      if (settingsRes?.settings) {
        setCompanySettings(settingsRes.settings);
      }
      await refreshTenantDirectory();
    } catch (err) {
      console.error(err);
    }
  };

  // Keyboard Shortcuts for Physical Counter Navigation & POS Operations
  useEffect(() => {
    const handleGlobalKeys = (e: KeyboardEvent) => {
      if (saasMode !== 'TENANT_ACTIVE') return;
      if (['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9'].includes(e.key)) {
        e.preventDefault();
      }

      const role = (currentUser?.role || '').toLowerCase();
      const isCashier = role === 'cashier';

      if (e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleTabChange('suppliers');
        return;
      }

      switch (e.key) {
        case 'F1':
          handleTabChange('pos');
          break;
        case 'F2':
          handleTabChange('inventory');
          break;
        case 'F3':
          if (!isCashier) handleTabChange('purchases');
          break;
        case 'F4':
          handleTabChange('returns');
          break;
        case 'F5':
          handleTabChange('customers');
          break;
        case 'F6':
          handleTabChange('reports');
          break;
        case 'F7':
          if ((currentUser?.role || '').toLowerCase() === 'superadmin') {
            handleTabChange('settings');
          }
          break;
        case 'F8':
          handleTabChange('pos');
          window.dispatchEvent(new CustomEvent('pos:delete-sale'));
          break;
        case 'F9':
          handleTabChange('pos');
          window.dispatchEvent(new CustomEvent('pos:print-receipt'));
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleGlobalKeys);
    return () => window.removeEventListener('keydown', handleGlobalKeys);
  }, [currentUser, saasMode]);

  return (
    <div className="min-h-screen w-full flex flex-col bg-slate-100 dark:bg-[#0A0E1A] text-slate-900 dark:text-slate-100 font-sans antialiased transition-colors duration-200">
      {saasMode === 'INSTALLER' && (
        <InstallationWizard
          onCompleted={(superAdminUser) => {
            if (superAdminUser) {
              const role = String(superAdminUser?.role || 'SUPERADMIN').toUpperCase();
              const authUser = {
                ...superAdminUser,
                role,
                originalRole: role,
                isSimulatedCashier: false,
              };
              setCurrentUser(authUser);
              try {
                localStorage.setItem('pos_current_user', JSON.stringify(authUser));
              } catch {}
            }
            setSaasMode('SUPERADMIN');
            setGlobalLoginOpen(false);
            window.history.replaceState({}, '', '/admin');
          }}
        />
      )}

      {/* 1. ROOT DOMAIN SAAS LANDING PAGE */}
      {saasMode === 'LANDING' && (
        shouldShowTenantLoading ? (
          <PublicLayout
            // Never display a cached store name while a requested tenant is unresolved.
            storeName={tenantIdParam && isRequestedTenantVerified ? storeLoginTarget?.name || 'SarbaazSoft Shoe POS' : 'SarbaazSoft Shoe POS'}
            badgeText="Connecting..."
            badgeVariant="connecting"
            subtitle={tenantIdParam ? 'Preparing your store workspace' : 'Multi-tenant retail shoe shop POS'}
            dbText="Secure tenant sign-in"
          >
            <div className="bg-white/95 dark:bg-[#131B2E]/95 rounded-3xl p-8 shadow-2xl border border-white/30 dark:border-purple-800/60 flex flex-col items-center max-w-sm w-full mx-4 text-center">
              <div className="w-8 h-8 border-3 border-purple-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-300 mt-4">
                {tenantIdParam ? 'Loading your store...' : 'Loading SarbaazSoft Shoe POS...'}
              </p>
            </div>
          </PublicLayout>
        ) : globalLoginOpen ? (
          <AuthModal
            companySettings={storeLoginTarget
              ? { ...storeLoginTarget, tenant_id: storeLoginTarget.id, name: storeLoginTarget.name }
              : (activeTenant
                  ? { ...activeTenant, tenant_id: activeTenant.id, name: activeTenant.name }
                  : (tenantIdParam
                      ? { tenant_id: Number(tenantIdParam), name: effectiveStoreName || '' }
                      : { name: 'SarbaazSoft Shoe POS' }))}
            onBack={() => {
              setGlobalLoginOpen(false);
              setStoreLoginTarget(null);
            }}
            onSuccess={(user) => {
              const role = String(user?.role || '').toUpperCase();
              const authUser = {
                ...user,
                role,
                originalRole: role,
                onboardingCompleted: user?.onboardingCompleted ?? true,
                isSimulatedCashier: false,
              };
              setCurrentUser(authUser);
              try {
                localStorage.setItem('pos_current_user', JSON.stringify(authUser));
              } catch {}
              if (role === 'CASHIER') {
                setCurrentTab('pos');
              } else {
                setCurrentTab('dashboard');
              }
              if (role === 'SUPERADMIN') {
                setGlobalLoginOpen(false);
                handleNavigateDomain({ mode: 'SUPERADMIN' });
                return;
              }
              if (user?.tenantId) {
                setGlobalLoginOpen(false);
                if (user?.onboardingCompleted === false && role === 'ADMIN') {
                  handleNavigateDomain({ mode: 'ONBOARDING', tenantId: Number(user.tenantId), authenticated: true });
                  return;
                }
                handleNavigateDomain({ mode: 'TENANT', tenantId: Number(user.tenantId), authenticated: true });
                return;
              }
              setGlobalLoginOpen(false);
            }}
          />
        ) : <>
          {tenantIdNotice && (
            <div role="alert" className="mx-auto mt-6 w-[min(92%,40rem)] rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
              {tenantIdNotice}
            </div>
          )}
          <SaasLandingPage
            availableTenants={availableTenants}
            onGlobalLogin={() => setGlobalLoginOpen(true)}
            onOpenSuperAdmin={() => handleNavigateDomain({ mode: 'SUPERADMIN' })}
            onStoreCreated={handleStoreCreated}
          />
        </>
      )}

      {/* 2. SUPERADMIN CONTROL PANEL (`/admin`) */}
      {saasMode === 'SUPERADMIN' && (
        isInitializing ? (
          <PublicLayout
            storeName="POS SaaS C-Panel"
            badgeText="Connecting..."
            badgeVariant="connecting"
            subtitle="Loading platform control plane"
            dbText="Platform Online"
          >
            <div className="bg-white/95 dark:bg-[#131B2E]/95 rounded-3xl p-8 shadow-2xl border border-white/30 dark:border-purple-800/60 flex flex-col items-center max-w-sm w-full mx-4 text-center">
              <div className="w-8 h-8 border-3 border-purple-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-300 mt-4">Loading platform...</p>
            </div>
          </PublicLayout>
        ) : (
          <SuperAdminControlPanel
            currentUser={currentUser}
            onUserAuthenticated={(user) => {
              setCurrentUser(user);
            }}
            onLogout={handleLogout}
            onOpenStore={(tenantId) => handleNavigateDomain({ mode: 'TENANT', tenantId })}
            onOpenOnboarding={(tenantId) => handleNavigateDomain({ mode: 'ONBOARDING', tenantId })}
            onTenantsUpdated={() => refreshTenantDirectory('SUPERADMIN')}
            onOpenProfile={() => setIsProfileModalOpen(true)}
          />
        )
      )}

      {/* 3. UNKNOWN STORE FALLBACK SCREEN (404 TENANT) */}
      {saasMode === 'TENANT_NOT_FOUND' && (
        <UnknownStore404View
          onBackHome={() => {
            setSaasMode('LANDING');
            window.history.pushState({}, '', '/');
          }}
          onGoToSuperAdmin={() => handleNavigateDomain({ mode: 'SUPERADMIN' })}
        />
      )}

      {/* 4. SUSPENDED OR EXPIRED STORE SCREEN (when status = SUSPENDED or EXPIRED) */}
      {(saasMode === 'TENANT_SUSPENDED' || saasMode === 'TENANT_EXPIRED') && (
        <SuspendedStoreView
          tenant={activeTenant}
          onGoToLanding={() => handleNavigateDomain({ mode: 'LANDING' })}
          onGoToSuperAdmin={() => handleNavigateDomain({ mode: 'SUPERADMIN' })}
          onOpenStoreSettings={
            (currentUser?.role || '').toUpperCase() === 'SUPERADMIN'
              ? () => {
                  setSaasMode('TENANT_ACTIVE');
                  setCurrentTab('settings');
                  window.history.replaceState({}, '', '/settings');
                }
              : undefined
          }
        />
      )}

      {/* 5. TENANT FIRST-TIME ONBOARDING WIZARD (shared root with tenantId) */}
      {saasMode === 'TENANT_ONBOARDING' && (
        <TenantOnboardingWizard
          tenantId={Number(activeTenant?.id || currentUser?.tenantId || 0)}
          isRequiredFirstLogin={
            Boolean(currentUser?.role === 'ADMIN' && (currentUser?.onboardingCompleted === false || activeTenant?.onboardingCompleted === false))
          }
          onCompleted={async (completedTenantId, user, _token, savedSettings) => {
            if (user) {
              const roleUpper = (user.role || 'ADMIN').toUpperCase();
              const updatedUser = {
                ...user,
                role: roleUpper,
                originalRole: roleUpper,
                onboardingCompleted: true,
                isSimulatedCashier: false,
              };
              setCurrentUser(updatedUser);
              try {
                localStorage.setItem('pos_current_user', JSON.stringify(updatedUser));
              } catch {}
            } else if (currentUser) {
              const updatedUser = { ...currentUser, onboardingCompleted: true };
              setCurrentUser(updatedUser);
              try {
                localStorage.setItem('pos_current_user', JSON.stringify(updatedUser));
              } catch {}
            }
            if (savedSettings) {
              setCompanySettings(savedSettings);
              try {
                localStorage.setItem('cached_company_settings', JSON.stringify(savedSettings));
              } catch {}
            }
            setActiveTenant((prev) => (prev ? { ...prev, onboardingCompleted: true } : prev));
            setCurrentTab('dashboard');
            await handleNavigateDomain({ mode: 'TENANT', tenantId: completedTenantId, authenticated: true });
          }}
          onCancel={() =>
            handleNavigateDomain({
              mode: 'TENANT',
              tenantId: activeTenant?.id,
            })
          }
        />
      )}

      {/* 6. ACTIVE TENANT POS & INVENTORY SUITE (shared root with tenantId) */}
      {saasMode === 'TENANT_ACTIVE' && (
        <>
          {isInitializing ? (
            <PublicLayout
              storeName={effectiveStoreName}
              badgeText="Connecting..."
              badgeVariant="connecting"
              subtitle="Powered by SarbaazSoft Shoe POS"
              dbText="Cloud Synchronized"
            >
              <div
                id="app-initial-loading-card"
                className="bg-white/95 dark:bg-[#131B2E]/95 backdrop-blur-md rounded-3xl p-8 sm:p-10 shadow-2xl border border-white/30 dark:border-purple-800/60 flex flex-col items-center max-w-sm w-full mx-4 text-center animate-in fade-in zoom-in-95 duration-200"
              >
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white mb-4 shadow-lg shadow-purple-600/30 ring-2 ring-indigo-400/30">
                  <div className="w-7 h-7 border-3 border-white border-t-transparent rounded-full animate-spin" />
                </div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                  {effectiveStoreName}
                </h2>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-1">
                  Loading {effectiveStoreName} Workspace...
                </p>
              </div>
            </PublicLayout>
          ) : !currentUser ? (
            <PublicLayout
              storeName={effectiveStoreName}
              badgeText="Store sign-in"
              badgeVariant="connecting"
              subtitle="Powered by SarbaazSoft Shoe POS"
              dbText="Tenant Scoped"
            >
              <div className="bg-white/95 dark:bg-[#131B2E]/95 rounded-3xl p-8 shadow-2xl border border-white/30 dark:border-purple-800/60 flex flex-col items-center max-w-sm w-full mx-4 text-center">
                <div className="w-8 h-8 border-3 border-purple-600 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm font-semibold text-slate-600 dark:text-slate-300 mt-4">Redirecting to the shared sign-in page…</p>
              </div>
            </PublicLayout>
          ) : (
            <div className="saas-panel flex w-full min-h-screen bg-[#F8FAFC] dark:bg-[#0A0E1A] text-slate-900 dark:text-slate-100 transition-colors">
              <Sidebar
                currentTab={currentTab}
                onTabChange={(tab) => handleTabChange(tab)}
                currentUser={currentUser}
                companySettings={{
                  ...companySettings,
                  name: effectiveStoreName,
                }}
                onLogout={handleLogout}
                mobileOpen={mobileMenuOpen}
                onCloseMobile={() => setMobileMenuOpen(false)}
                onOpenProfile={() => setIsProfileModalOpen(true)}
              />

              <div className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto bg-[#F8FAFC] dark:bg-[#0A0E1A]">
                <Header
                  currentTab={currentTab}
                  onTabChange={(tab) => handleTabChange(tab)}
                  currentUser={currentUser}
                  companySettings={{
                    ...companySettings,
                    name: effectiveStoreName,
                  }}
                  onLogout={handleLogout}
                  onToggleMobileMenu={() => setMobileMenuOpen(true)}
                  onOpenProfile={() => setIsProfileModalOpen(true)}
                  onSwitchRole={handleSwitchRole}
                />

                <main className="flex-1 min-w-0 overflow-x-hidden bg-[#F8FAFC] dark:bg-[#0A0E1A] transition-colors">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={`${activeTenant?.id || 'default'}-${currentTab}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.18, ease: 'easeOut' }}
                      className="w-full h-full"
                    >
                      {currentTab === 'dashboard' &&
                        ((currentUser?.role || '').toLowerCase() === 'cashier' ? (
                          <PosTerminal
                            currentUser={currentUser}
                            companySettings={companySettings}
                            initialExchange={activeExchangeForPos}
                            onClearInitialExchange={() => setActiveExchangeForPos(null)}
                          />
                        ) : (
                          <DashboardOverview
                            currentUser={currentUser}
                            companySettings={companySettings}
                            onNavigate={(tab) => handleTabChange(tab)}
                          />
                        ))}

                      {currentTab === 'pos' && (
                        <PosTerminal
                          currentUser={currentUser}
                          companySettings={companySettings}
                          initialExchange={activeExchangeForPos}
                          onClearInitialExchange={() => setActiveExchangeForPos(null)}
                        />
                      )}

                      {currentTab === 'inventory' && (
                        <ProductManagement
                          currentUser={currentUser}
                          companySettings={companySettings}
                        />
                      )}

                      {currentTab === 'ledger' && <StockLedgerView />}

                      {currentTab === 'purchases' &&
                        ((currentUser?.role || '').toLowerCase() === 'cashier' ? (
                          <PosTerminal
                            currentUser={currentUser}
                            companySettings={companySettings}
                            initialExchange={activeExchangeForPos}
                            onClearInitialExchange={() => setActiveExchangeForPos(null)}
                          />
                        ) : (
                          <PurchaseManagement
                            currentUser={currentUser}
                            companySettings={companySettings}
                            initialSupplierId={selectedSupplierForPurchase?.id}
                            initialSupplierName={selectedSupplierForPurchase?.name}
                            onNavigateToSuppliers={() => handleTabChange('suppliers')}
                          />
                        ))}

                      {currentTab === 'suppliers' && (
                        <SupplierManagement
                          currentUser={currentUser}
                          companySettings={companySettings}
                          onNavigateToPurchase={(supId, supName) => {
                            if ((currentUser?.role || '').toLowerCase() !== 'cashier') {
                              setSelectedSupplierForPurchase(
                                supId || supName ? { id: supId, name: supName } : null
                              );
                              handleTabChange('purchases');
                            }
                          }}
                        />
                      )}

                      {currentTab === 'returns' && (
                        <SalesReturnView
                          currentUser={currentUser}
                          companySettings={companySettings}
                          onStartExchange={(exchange) => {
                            setActiveExchangeForPos(exchange);
                            handleTabChange('pos');
                          }}
                        />
                      )}

                      {currentTab === 'customers' && (
                        <CustomerManagement companySettings={companySettings} />
                      )}

                      {currentTab === 'reports' && (
                        <ReportsDashboard
                          currentUser={currentUser}
                          companySettings={companySettings}
                        />
                      )}

                      {currentTab === 'settings' && (
                        (currentUser && (
                          (currentUser.role || '').toUpperCase() === 'ADMIN' ||
                          (currentUser.role || '').toUpperCase() === 'SUPERADMIN' ||
                          (currentUser.role || '').toUpperCase() === 'CASHIER'
                        )) ? (
                          <SettingsView
                            currentUser={currentUser}
                            companySettings={{
                              ...companySettings,
                              subscriptionPlan: companySettings?.subscriptionPlan || activeTenant?.subscriptionPlan,
                              subscriptionStartDate: companySettings?.subscriptionStartDate || activeTenant?.subscriptionStartDate,
                              subscriptionEndDate: companySettings?.subscriptionEndDate || activeTenant?.subscriptionEndDate,
                              subscriptionStatus: companySettings?.subscriptionStatus || activeTenant?.subscriptionStatus,
                            }}
                            initialTab={(currentUser.role || '').toUpperCase() === 'CASHIER' ? 'printers' : undefined}
                            onSettingsUpdated={handleSettingsUpdated}
                            onOpenInstallWizard={() => {
                              handleNavigateDomain({
                                mode: 'ONBOARDING',
                                tenantId: activeTenant?.id,
                              });
                            }}
                          />
                        ) : (
                          <div className="p-8 text-center bg-white dark:bg-[#131B2E] rounded-2xl border border-rose-200 dark:border-rose-900/60 shadow-sm max-w-2xl mx-auto my-12">
                            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 flex items-center justify-center text-rose-600 dark:text-rose-400 shadow-sm">
                              <ShieldAlert className="w-7 h-7" />
                            </div>
                            <h3 className="text-xl font-extrabold text-slate-900 dark:text-white">
                              403 Forbidden · Settings Access Restricted
                            </h3>
                            <p className="text-sm text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
                              Settings access is restricted to authenticated store personnel. Please log in with an authorized account.
                            </p>
                            <div className="mt-6">
                              <button
                                onClick={() => handleTabChange('pos')}
                                className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-sm font-bold shadow-md shadow-purple-600/20 hover:from-purple-700 hover:to-indigo-700 transition cursor-pointer"
                              >
                                Return to POS Terminal
                              </button>
                            </div>
                          </div>
                        )
                      )}

                      {currentTab === 'assistant' && (
                        <SammiAssistantView
                          storeName={effectiveStoreName}
                          currentUser={currentUser}
                          companySettings={companySettings}
                          onNavigateTab={(tab) => handleTabChange(tab)}
                        />
                      )}
                    </motion.div>
                  </AnimatePresence>
                </main>

                <footer className="px-4 py-2.5 border border-indigo-500/20 bg-white/95 dark:bg-white/10 backdrop-blur-lg shadow-lg transition-colors duration-500 text-center text-xs font-medium text-slate-800 dark:text-slate-100 tracking-wide shrink-0 no-print select-none">
                  <span className="font-bold text-slate-900 dark:text-white">{effectiveStoreName}</span>
                  <span className="mx-1.5 text-slate-400 dark:text-slate-500">&bull;</span>
                  <span>
                    Powered by{' '}
                    <a
                      href="https://portpolio-eight-pi.vercel.app/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-slate-900 dark:text-white hover:text-indigo-500 dark:hover:text-indigo-300 hover:underline transition-colors"
                    >
                      SarbaazSoft Shoe POS
                    </a>
                  </span>
                  <span className="mx-1.5 text-slate-400 dark:text-slate-500">&bull;</span>
                  <span>&copy; 2026 All rights reserved.</span>
                </footer>
              </div>
            </div>
          )}
        </>
      )}

      {currentUser && (
        <UserProfileModal
          isOpen={isProfileModalOpen}
          onClose={() => setIsProfileModalOpen(false)}
          currentUser={currentUser}
          storeName={effectiveStoreName}
          onUserUpdated={(updatedUser) => {
            setCurrentUser(updatedUser);
          }}
        />
      )}

      <OfflineToastNotification
        currencySymbol={companySettings?.currency_symbol || companySettings?.currencySymbol || 'Rs.'}
      />
    </div>
  );
}
