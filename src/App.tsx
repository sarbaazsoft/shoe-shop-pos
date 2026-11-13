import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { api, getAuthToken, setAuthSession, removeAuthToken, clearAllSessionState, revokeSessionOnServer, setActiveTenantId, getActiveTenantId } from './services/api.ts';
import { Header } from './components/common/Header.tsx';
import { Sidebar } from './components/common/Sidebar.tsx';
import { AuthModal } from './components/auth/AuthModal.tsx';
import { OfflineToastNotification } from './components/common/OfflineToastNotification.tsx';
import { PushNotificationSoftPrompt } from './components/notifications/PushNotificationSoftPrompt.tsx';
import { PublicLayout } from './components/common/PublicLayout.tsx';
import { TenantWorkspaceSkeleton } from './components/common/TenantWorkspaceSkeleton.tsx';
import { LoadingWindow } from './components/common/LoadingWindow.tsx';
import { SaasLandingPage } from './components/saas/SaasLandingPage.tsx';

const PosTerminal = lazy(() => import('./components/pos/PosTerminal.tsx').then((m) => ({ default: m.PosTerminal })));
const ProductManagement = lazy(() => import('./components/inventory/ProductManagement.tsx').then((m) => ({ default: m.ProductManagement })));
const StockLedgerView = lazy(() => import('./components/inventory/StockLedgerView.tsx').then((m) => ({ default: m.StockLedgerView })));
const PurchaseManagement = lazy(() => import('./components/purchases/PurchaseManagement.tsx').then((m) => ({ default: m.PurchaseManagement })));
const SalesReturnView = lazy(() => import('./components/returns/SalesReturnView.tsx').then((m) => ({ default: m.SalesReturnView })));
const CustomerManagement = lazy(() => import('./components/customers/CustomerManagement.tsx').then((m) => ({ default: m.CustomerManagement })));
const ReportsDashboard = lazy(() => import('./components/reports/ReportsDashboard.tsx').then((m) => ({ default: m.ReportsDashboard })));
const SettingsView = lazy(() => import('./components/settings/SettingsView.tsx').then((m) => ({ default: m.SettingsView })));
const SupplierManagement = lazy(() => import('./components/suppliers/SupplierManagement.tsx').then((m) => ({ default: m.SupplierManagement })));
const DashboardOverview = lazy(() => import('./components/dashboard/DashboardOverview.tsx').then((m) => ({ default: m.DashboardOverview })));
const UserProfileModal = lazy(() => import('./components/auth/UserProfileModal.tsx').then((m) => ({ default: m.UserProfileModal })));
const SammiAssistantView = lazy(() => import('./components/chat/SammiAssistantView.tsx').then((m) => ({ default: m.SammiAssistantView })));
const UnknownStore404View = lazy(() => import('./components/saas/UnknownStore404View.tsx').then((m) => ({ default: m.UnknownStore404View })));
const SuspendedStoreView = lazy(() => import('./components/saas/SuspendedStoreView.tsx').then((m) => ({ default: m.SuspendedStoreView })));
const SuperAdminControlPanel = lazy(() => import('./components/saas/SuperAdminControlPanel.tsx').then((m) => ({ default: m.SuperAdminControlPanel })));
const TenantOnboardingWizard = lazy(() => import('./components/saas/TenantOnboardingWizard.tsx').then((m) => ({ default: m.TenantOnboardingWizard })));
const InstallationWizard = lazy(() => import('./components/saas/InstallationWizard.tsx').then((m) => ({ default: m.InstallationWizard })));
const NotificationsView = lazy(() => import('./components/notifications/NotificationsView.tsx').then((m) => ({ default: m.NotificationsView })));
const VerifyEmailNoticeView = lazy(() => import('./components/auth/VerifyEmailNoticeView.tsx').then((m) => ({ default: m.VerifyEmailNoticeView })));
import { ShieldAlert } from 'lucide-react';
import { initNativeNotificationPrompt } from './services/pushNotificationClient.ts';
import { usePwaManifest } from './hooks/usePwaManifest.ts';
import { useDocumentTitle } from './hooks/useDocumentTitle.ts';
import { getStandardDocumentTitle, PLATFORM_DOCUMENT_NAME } from './utils/documentTitle.ts';
import { APP_VERSION } from './version.ts';
import type { ActiveExchange, TenantInfo, CompanySettings } from './types.ts';

type SaasRouteMode =
  | 'INSTALLER'
  | 'LANDING'
  | 'AUTH'
  | 'SUPERADMIN'
  | 'TENANT_ACTIVE'
  | 'TENANT_SUSPENDED'
  | 'TENANT_EXPIRED'
  | 'TENANT_NOT_FOUND'
  | 'TENANT_ONBOARDING'
  | 'VERIFY_EMAIL';

const APP_TAB_ROUTES = new Set([
  'dashboard', 'pos', 'inventory', 'ledger', 'purchases', 'suppliers',
  'returns', 'customers', 'reports', 'settings', 'assistant', 'notifications',
]);

function appPathForTab(tab: string): string {
  return `/${tab || 'dashboard'}`;
}

function resolveTargetTab(requestedTab: string | undefined | null, user: any, companySettings?: any): string {
  const role = (user?.role || '').toLowerCase();
  const isCashier = role === 'cashier';
  const isAdmin = role === 'admin' || role === 'superadmin';
  const clean = (requestedTab || '').toLowerCase().trim();
  const isWholesale = String(companySettings?.businessType || companySettings?.business_type || '').toUpperCase() === 'WHOLESALE';

  // Wholesale stores process returns directly on POS invoice; redirect any direct /returns access to POS
  if (isWholesale && (clean === 'returns' || clean === 'exchange')) {
    return 'pos';
  }

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

const UNAUTH_TENANT_STORAGE_KEY = 'pos_unauth_scoped_tenant_id';

export function getStoredUnauthTenantId(): string {
  try {
    return sessionStorage.getItem(UNAUTH_TENANT_STORAGE_KEY) || localStorage.getItem(UNAUTH_TENANT_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function setStoredUnauthTenantId(tenantId: string | number | null | undefined) {
  try {
    const val = String(tenantId ?? '').trim();
    if (val && val !== '0' && val !== 'null' && val !== 'undefined') {
      sessionStorage.setItem(UNAUTH_TENANT_STORAGE_KEY, val);
      localStorage.setItem(UNAUTH_TENANT_STORAGE_KEY, val);
    }
  } catch {}
}

export function clearStoredUnauthTenantId() {
  try {
    sessionStorage.removeItem(UNAUTH_TENANT_STORAGE_KEY);
    localStorage.removeItem(UNAUTH_TENANT_STORAGE_KEY);
  } catch {}
}

/**
 * Builds an unauthenticated-scoped URL preserving the current tenantId if present
 */
export function buildUnauthScopedUrl(targetUrl: string, currentTenantId?: string | number | null): string {
  const tid = currentTenantId || getStoredUnauthTenantId();
  if (!tid) return targetUrl;

  const [baseAndQuery, hash] = targetUrl.split('#');
  const [base, rawQuery] = baseAndQuery.split('?');
  const sp = new URLSearchParams(rawQuery || '');
  if (!sp.has('tenantId')) {
    sp.set('tenantId', String(tid));
  }
  const queryString = sp.toString() ? `?${sp.toString()}` : '';
  const hashString = hash ? `#${hash}` : '';
  return `${base || '/'}${queryString}${hashString}`;
}

function detectInitialRouteFromLocation(): {
  mode: SaasRouteMode;
  tenantIdParam: string;
} {
  const pathname = window.location.pathname;
  const searchParams = new URLSearchParams(window.location.search);

  // 1. Path segment extraction (e.g. /store/:id, /stores/:id, /tenant/:id, /t/:id, /directory/:id)
  const pathMatch = pathname.match(/^\/(?:store|stores|tenant|t|directory)\/([a-zA-Z0-9_-]+)/i);
  const pathTenantId = pathMatch ? pathMatch[1] : '';

  // 2. Query param extraction
  const queryTenantId =
    searchParams.get('tenantId') ||
    searchParams.get('storeId') ||
    searchParams.get('tenant_id') ||
    searchParams.get('store_id') ||
    '';

  let hasAuthToken = false;
  try {
    const token = localStorage.getItem('pos_auth_token') || localStorage.getItem('shoe_pos_jwt_token');
    hasAuthToken = Boolean(token && token !== 'null' && token !== 'undefined');
  } catch {}

  // 3. Unauthenticated tenant scope retention (only auto-applied on /auth or explicit URL tenant params)
  const explicitTenantId = queryTenantId || pathTenantId;
  const isExplicitAuthRoute =
    pathname === '/auth' ||
    pathname.startsWith('/auth/') ||
    pathname === '/login' ||
    pathname.startsWith('/login/') ||
    searchParams.get('mode') === 'login';
  let tenantIdParam = explicitTenantId;
  if (!hasAuthToken) {
    if (explicitTenantId) {
      setStoredUnauthTenantId(explicitTenantId);
    } else if (isExplicitAuthRoute) {
      tenantIdParam = getStoredUnauthTenantId();
    }
  }

  // If path was a tenant path segment (e.g. /store/1 or /store/1/login), normalize URL with preserved tenantId
  if (pathMatch) {
    const subRoute = pathname.replace(/^\/(?:store|stores|tenant|t|directory)\/[a-zA-Z0-9_-]+/i, '') || '/';
    const canonicalBase = subRoute === '/' || !subRoute ? '/' : subRoute;
    const cleanUrl = `${canonicalBase}?tenantId=${encodeURIComponent(tenantIdParam)}${window.location.hash || ''}`;
    try {
      window.history.replaceState({}, '', cleanUrl);
    } catch {}
  }

  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    return { mode: 'SUPERADMIN', tenantIdParam };
  }
  if (pathname === '/install' || pathname.startsWith('/install/')) {
    return { mode: 'INSTALLER', tenantIdParam };
  }
  if (pathname === '/onboarding' || pathname.startsWith('/onboarding') || searchParams.get('mode') === 'onboarding') {
    return { mode: 'TENANT_ONBOARDING', tenantIdParam };
  }
  if (pathname === '/verify-email' || pathname.startsWith('/verify-email') || searchParams.get('mode') === 'verify-email') {
    return { mode: 'VERIFY_EMAIL', tenantIdParam };
  }
  if (
    pathname === '/auth' ||
    pathname.startsWith('/auth/') ||
    pathname === '/login' ||
    pathname.startsWith('/login/') ||
    searchParams.get('mode') === 'login'
  ) {
    return { mode: 'AUTH', tenantIdParam };
  }

  let pathTab = pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
  if (pathTab === 'dashboard/notifications') {
    pathTab = 'notifications';
  }
  const queryTab = searchParams.get('tab')?.toLowerCase() || '';
  const requestedTab = APP_TAB_ROUTES.has(pathTab) ? pathTab : queryTab;
  if (requestedTab && APP_TAB_ROUTES.has(requestedTab)) {
    // Upgrade older query-based tab links to clean root paths.
    if (pathname === '/' || queryTab) {
      const tenantQuery = tenantIdParam ? `?tenantId=${encodeURIComponent(tenantIdParam)}` : '';
      window.history.replaceState({}, '', `${appPathForTab(requestedTab)}${tenantQuery}`);
    }
  } else if (pathname !== '/') {
    const tenantQuery = tenantIdParam ? `?tenantId=${encodeURIComponent(tenantIdParam)}` : window.location.search;
    window.history.replaceState({}, '', `/${tenantQuery}`);
  }
  return { mode: 'LANDING', tenantIdParam };
}

export default function App() {
  const initialRoute = detectInitialRouteFromLocation();
  const [saasMode, setSaasMode] = useState<SaasRouteMode>(initialRoute.mode);
  const [activeTenant, setActiveTenant] = useState<TenantInfo | null>(null);
  const [availableTenants, setAvailableTenants] = useState<TenantInfo[]>([]);
  const [storeLoginTarget, setStoreLoginTarget] = useState<TenantInfo | null>(null);
  const [tenantIdNotice, setTenantIdNotice] = useState('');
  const [tenantIdParam, setTenantIdParam] = useState<string>(initialRoute.tenantIdParam);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return Boolean(initialRoute.tenantIdParam || initialRoute.mode === 'AUTH');
    const sp = new URLSearchParams(window.location.search);
    return Boolean(
      initialRoute.mode === 'AUTH' ||
      initialRoute.tenantIdParam ||
      sp.get('mode') === 'login' ||
      sp.get('resetToken') ||
      sp.get('email')
    );
  });

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

  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(() => {
    try {
      const token = localStorage.getItem('pos_auth_token') || localStorage.getItem('shoe_pos_jwt_token');
      if (!token || token === 'null' || token === 'undefined') return null;
      const storedUserRaw = localStorage.getItem('pos_current_user') || localStorage.getItem('shoe_pos_user');
      const storedUser = storedUserRaw ? JSON.parse(storedUserRaw) : null;
      const stored = localStorage.getItem('cached_company_settings');
      if (!stored) return null;
      const parsed = JSON.parse(stored);
      if (storedUser?.tenantId && parsed?.tenantId && Number(parsed.tenantId) !== Number(storedUser.tenantId)) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  });

  const [cachedStoreName, setCachedStoreName] = useState<string>(() => {
    try {
      const token = localStorage.getItem('pos_auth_token') || localStorage.getItem('shoe_pos_jwt_token');
      if (!token || token === 'null' || token === 'undefined') return '';
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
  const hasStoredAuthToken = Boolean(getAuthToken());
  const isRequestedTenantVerified = !tenantIdParam || Boolean(
    storeLoginTarget && Number(storeLoginTarget.id) === Number(tenantIdParam)
  );
  const shouldShowTenantLoading =
    (isInitializing && (hasStoredAuthToken || Boolean(tenantIdParam))) ||
    (Boolean(tenantIdParam) && !isRequestedTenantVerified && !tenantIdNotice);

  const currentTargetTenantId = Number(
    activeTenant?.id ||
    currentUser?.tenantId ||
    (tenantIdParam ? Number(tenantIdParam) : null) ||
    getActiveTenantId() ||
    0
  );

  const effectiveStoreName = (() => {
    if (saasMode === 'SUPERADMIN') return 'POS Admin';
    if ((saasMode === 'LANDING' || saasMode === 'AUTH') && !tenantIdParam) return 'SarbaazSoft Shoe POS';

    if (
      saasMode === 'TENANT_ACTIVE' ||
      saasMode === 'TENANT_ONBOARDING' ||
      saasMode === 'TENANT_SUSPENDED' ||
      saasMode === 'TENANT_EXPIRED'
    ) {
      if (
        companySettings &&
        (!currentTargetTenantId ||
          !Number(companySettings.tenantId || companySettings.tenant_id) ||
          Number(companySettings.tenantId || companySettings.tenant_id) === currentTargetTenantId)
      ) {
        const csName = companySettings.name || companySettings.company_name || companySettings.companyName;
        if (csName) return csName;
      }
      if (activeTenant?.name && (!currentTargetTenantId || Number(activeTenant.id) === currentTargetTenantId)) {
        return activeTenant.name;
      }
      if (currentUser?.tenantName || currentUser?.storeName) {
        if (!currentTargetTenantId || Number(currentUser.tenantId) === currentTargetTenantId) {
          return currentUser.tenantName || currentUser.storeName;
        }
      }
      if (currentTargetTenantId) {
        const found = availableTenants.find((t) => Number(t.id) === currentTargetTenantId);
        if (found?.name) return found.name;
      }
      if (cachedStoreName && currentTargetTenantId && Number(getActiveTenantId()) === currentTargetTenantId) {
        return cachedStoreName;
      }
      return currentTargetTenantId ? `Store #${currentTargetTenantId}` : '';
    }

    if (tenantIdParam && !isRequestedTenantVerified) {
      return '';
    }
    if (storeLoginTarget?.name) {
      return storeLoginTarget.name;
    }
    if (activeTenant?.name) {
      return activeTenant.name;
    }
    return '';
  })();

  // Keep browser document.title route- and store-aware independently of PWA installation shortcut branding
  useDocumentTitle(
    () =>
      getStandardDocumentTitle({
        saasMode,
        role: currentUser?.role,
        isSuperAdmin: saasMode === 'SUPERADMIN',
        platformName: PLATFORM_DOCUMENT_NAME,
        storeName: effectiveStoreName,
        currentTab,
        isAuthModalOpen: isLoginModalOpen,
      }),
    [saasMode, currentUser?.role, effectiveStoreName, currentTab, isLoginModalOpen]
  );

  // Synchronize PWA manifest link and installation shortcut meta tags strictly by active role & view state
  usePwaManifest({
    role: currentUser?.role,
    saasMode,
    pathname: typeof window !== 'undefined' ? window.location.pathname : '/',
  });

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
        if (window.location.pathname !== '/install') window.history.replaceState({}, '', '/install');
        return;
      }

      // Clean section URLs no longer carry tenantId, so recover the last tenant
      // from the cached identity while bootstrapping an authenticated session.
      const existingToken = getAuthToken();
      const hasExistingToken = Boolean(existingToken && existingToken !== 'null' && existingToken !== 'undefined');
      let cachedTenantId: number | null = null;
      let cachedRole = '';
      if (hasExistingToken) {
        try {
          const cachedUser = JSON.parse(localStorage.getItem('pos_current_user') || 'null');
          cachedTenantId = Number(cachedUser?.tenantId) > 0 ? Number(cachedUser.tenantId) : null;
          cachedRole = String(cachedUser?.originalRole || cachedUser?.role || '').toUpperCase();
        } catch {}
      }
      const queryTenantId = Number(tenantIdParam) > 0 ? Number(tenantIdParam) : null;
      const tenantIdForInit = overrideTenantId !== undefined
        ? overrideTenantId
        : (hasExistingToken
            ? (queryTenantId || (cachedRole === 'SUPERADMIN' ? null : cachedTenantId || getActiveTenantId() || null))
            : queryTenantId);
      const modeForInit =
        overrideMode ||
        (hasExistingToken && tenantIdForInit && saasMode !== 'SUPERADMIN' && saasMode !== 'TENANT_ONBOARDING'
          ? 'TENANT_ACTIVE'
          : saasMode);
      const isPublicOrAdminPortal =
        modeForInit === 'LANDING' || modeForInit === 'AUTH' || modeForInit === 'SUPERADMIN';
      await refreshTenantDirectory(modeForInit);

      // The shared portal and auth screen only need the public tenant directory until a session is authenticated.
      if (modeForInit === 'SUPERADMIN' || (isPublicOrAdminPortal && (!hasExistingToken || !tenantIdForInit))) {
        if (!hasExistingToken) {
          setCurrentUser(null);
        }
        return;
      }

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
        const incomingTenantId = Number(settingsRes.settings.tenantId || settingsRes.settings.tenant_id);
        if (!tenantIdForInit || !incomingTenantId || incomingTenantId === Number(tenantIdForInit)) {
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

  // Directly trigger platform's official native notification permission dialog (no custom HTML banners/popups)
  useEffect(() => {
    if (currentUser?.role) {
      const cleanup = initNativeNotificationPrompt(currentUser.role);
      return cleanup;
    }
  }, [currentUser?.role]);

  // PWA launch URLs use /?tenantId=<tenant id>. Resolve the id against the
  // public tenant directory before presenting a tenant-scoped sign-in.
  useEffect(() => {
    if (!tenantIdParam || isInitializing || (saasMode !== 'LANDING' && saasMode !== 'AUTH')) return;
    const requestedId = Number(tenantIdParam);
    const target = Number.isSafeInteger(requestedId) && requestedId > 0
      ? availableTenants.find((tenant) => Number(tenant.id) === requestedId)
      : undefined;

    if (!target) {
      if (availableTenants.length > 0) {
        setStoreLoginTarget(null);
        setTenantIdNotice(`Store / Tenant ID “${tenantIdParam}” was not found. Check the store link or contact your administrator.`);
      }
      return;
    }

    setStoreLoginTarget(target);
    setTenantIdNotice('');
  }, [tenantIdParam, availableTenants, isInitializing, saasMode]);

  // Keep tenantId on the shared root only while a store sign-in is required.
  useEffect(() => {
    if (saasMode !== 'TENANT_ACTIVE' || isInitializing || currentUser || !activeTenant) return;
    setStoreLoginTarget(activeTenant);
    setTenantIdNotice('');
    setTenantIdParam(String(activeTenant.id));
    setIsLoginModalOpen(true);
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
    window.history.replaceState({}, '', '/');
    setSaasMode('LANDING');
  }, [saasMode, isInitializing, currentUser]);

  // An already-authenticated SuperAdmin opening the shared root (including
  // their PWA start URL) goes straight to the admin destination.
  useEffect(() => {
    const role = String(currentUser?.originalRole || currentUser?.role || '').toUpperCase();
    if (saasMode !== 'LANDING' || isInitializing || tenantIdParam || role !== 'SUPERADMIN') return;
    window.history.replaceState({}, '', '/admin');
    setSaasMode('SUPERADMIN');
  }, [saasMode, isInitializing, tenantIdParam, currentUser]);

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

  // Listen for registration or sign-in requiring email verification
  useEffect(() => {
    const handleRequireVerification = (event: Event) => {
      const customEvent = event as CustomEvent;
      const detail = customEvent.detail;
      setSaasMode('VERIFY_EMAIL');
      const queryParams = new URLSearchParams();
      if (detail?.email) queryParams.set('email', detail.email);
      if (detail?.tenantId) queryParams.set('tenantId', String(detail.tenantId));
      const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
      window.history.pushState({}, '', `/verify-email${queryString}`);
    };
    window.addEventListener('auth:require-email-verification', handleRequireVerification);
    return () => window.removeEventListener('auth:require-email-verification', handleRequireVerification);
  }, []);

  // Handle popstate so browser back/forward stays in sync with login modal / tenantId
  useEffect(() => {
    const handlePopState = () => {
      const sp = new URLSearchParams(window.location.search);
      const pathname = window.location.pathname;
      const pathMatch = pathname.match(/^\/(?:store|stores|tenant|t|directory)\/([a-zA-Z0-9_-]+)/i);
      const explicitTid =
        sp.get('tenantId') ||
        sp.get('storeId') ||
        sp.get('tenant_id') ||
        sp.get('store_id') ||
        (pathMatch ? pathMatch[1] : '') ||
        '';
      const mode = sp.get('mode');
      const reset = sp.get('resetToken');
      const isAuthPath =
        pathname === '/auth' ||
        pathname.startsWith('/auth/') ||
        pathname === '/login' ||
        pathname.startsWith('/login/');
      const tid = explicitTid || (isAuthPath && !currentUser ? getStoredUnauthTenantId() : '');

      if (explicitTid && !currentUser) {
        setStoredUnauthTenantId(explicitTid);
      }

      if (isAuthPath) {
        setSaasMode('AUTH');
        setIsLoginModalOpen(true);
      } else if (pathname === '/' && !explicitTid && mode !== 'login') {
        setSaasMode('LANDING');
        setIsLoginModalOpen(false);
      }
      setTenantIdParam(tid);
      setIsLoginModalOpen(Boolean(explicitTid || mode === 'login' || reset || isAuthPath));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [currentUser]);

  // Explicit clearance of unauthenticated tenant scope
  const handleClearTenantScope = useCallback(() => {
    clearStoredUnauthTenantId();
    setTenantIdParam('');
    setActiveTenant(null);
    setActiveTenantId(null);
    setStoreLoginTarget(null);
    setTenantIdNotice('');
    setSaasMode('LANDING');
    setIsLoginModalOpen(false);
    window.history.pushState({}, '', '/');
  }, []);

  // Clear tenant scope while remaining on the /auth sign-in route
  const handleClearAuthTenantScope = useCallback(() => {
    clearStoredUnauthTenantId();
    setTenantIdParam('');
    setActiveTenant(null);
    setActiveTenantId(null);
    setStoreLoginTarget(null);
    setTenantIdNotice('');
    setSaasMode('AUTH');
    setIsLoginModalOpen(true);
    window.history.pushState({}, '', '/auth');
  }, []);

  // When clicking Store Directory, unauthenticated users retain their tenantId scope
  const handleBackToStoreDirectory = useCallback(() => {
    const activeUnauthId = !currentUser ? (tenantIdParam || getStoredUnauthTenantId()) : null;
    setIsLoginModalOpen(false);
    setTenantIdNotice('');
    setSaasMode('LANDING');

    if (activeUnauthId) {
      // Retain and pass along tenantId rather than stripping it out
      setTenantIdParam(String(activeUnauthId));
      setStoredUnauthTenantId(String(activeUnauthId));
      const match = availableTenants.find((t) => Number(t.id) === Number(activeUnauthId));
      if (match) {
        setActiveTenant(match);
        setStoreLoginTarget(match);
      }
      try {
        window.history.pushState({}, '', `/?tenantId=${encodeURIComponent(activeUnauthId)}#shops`);
      } catch {}
    } else {
      setStoreLoginTarget(null);
      setTenantIdParam('');
      setActiveTenant(null);
      setActiveTenantId(null);
      clearStoredUnauthTenantId();
      try {
        window.history.pushState({}, '', '/#shops');
      } catch {}
    }

    setTimeout(() => {
      const el = document.getElementById('shops') || document.getElementById('stores');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
      }
    }, 60);
  }, [tenantIdParam, currentUser, availableTenants]);

  // Navigate between the shared portal and tenant paths.
  const handleNavigateDomain = async (target: {
    mode: 'LANDING' | 'SUPERADMIN' | 'TENANT' | 'NOT_FOUND' | 'ONBOARDING' | 'AUTH';
    tenantId?: number;
    authenticated?: boolean;
  }) => {
    const isSuperAdmin = String(currentUser?.originalRole || currentUser?.role || '').toUpperCase() === 'SUPERADMIN';
    if (target.mode === 'LANDING') {
      const activeUnauthId = !currentUser ? (target.tenantId || tenantIdParam || getStoredUnauthTenantId()) : null;
      setSaasMode('LANDING');
      setIsLoginModalOpen(false);
      setTenantIdNotice('');

      if (activeUnauthId) {
        // Retain and pass along tenantId rather than stripping it out
        setTenantIdParam(String(activeUnauthId));
        setStoredUnauthTenantId(String(activeUnauthId));
        const match = availableTenants.find((t) => Number(t.id) === Number(activeUnauthId));
        if (match) {
          setActiveTenant(match);
          setStoreLoginTarget(match);
        }
        window.history.pushState({}, '', `/?tenantId=${encodeURIComponent(activeUnauthId)}`);
        return;
      }

      setActiveTenant(null);
      setActiveTenantId(null);
      setTenantIdParam('');
      setStoreLoginTarget(null);
      clearStoredUnauthTenantId();
      window.history.pushState({}, '', '/');
      return;
    }

    if (target.mode === 'AUTH') {
      const targetId = target.tenantId || (availableTenants[0]?.id ? Number(availableTenants[0].id) : null);
      setSaasMode('AUTH');
      setIsLoginModalOpen(true);
      if (targetId) {
        setTenantIdParam(String(targetId));
        setActiveTenantId(targetId);
        const match = availableTenants.find((t) => Number(t.id) === targetId);
        if (match) {
          setActiveTenant(match);
          setStoreLoginTarget(match);
        }
        window.history.pushState({}, '', `/auth?tenantId=${encodeURIComponent(targetId)}`);
      } else {
        setTenantIdParam('');
        window.history.pushState({}, '', '/auth');
      }
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
      const targetId = Number(target.tenantId);
      if (!targetId) return;

      const matchingTenant = availableTenants.find((tenant) => Number(tenant.id) === targetId);
      const isSameTenant = Number(activeTenant?.id) === targetId;
      const selected = matchingTenant || (isSameTenant ? activeTenant : null);

      // Clear any stale login target
      setStoreLoginTarget(null);

      // Reset stale store settings immediately when switching stores
      if (companySettings && Number(companySettings.tenantId || companySettings.tenant_id) !== targetId) {
        setCompanySettings(null);
        try {
          localStorage.removeItem('cached_company_settings');
        } catch {}
      }

      if (selected) {
        setActiveTenant(selected);
        if (selected.name) {
          setCachedStoreName(selected.name);
          try {
            localStorage.setItem('cached_store_name', selected.name);
          } catch {}
        }
      } else {
        const fallbackName = currentUser?.tenantName || currentUser?.storeName || `Store #${targetId}`;
        const minimalTenant: TenantInfo = {
          id: targetId,
          name: fallbackName,
          status: 'ACTIVE',
          subscriptionStatus: 'ACTIVE',
          subscriptionPlan: 'free_tier',
          businessType: 'RETAIL',
          pricingMode: 'FIXED',
          logoUrl: '/pwa-512x512.png',
          currency: 'PKR',
          onboardingCompleted: true,
          appPath: '/dashboard',
        };
        setActiveTenant(minimalTenant);
        setCachedStoreName(fallbackName);
      }

      setActiveTenantId(targetId);
      setSaasMode('TENANT_ACTIVE');
      window.history.pushState({}, '', target.authenticated || isSuperAdmin ? appPathForTab(currentTab) : `/?tenantId=${encodeURIComponent(targetId)}`);
      await initializeApp(targetId, 'TENANT_ACTIVE');
    }
  };

  const handleTabChange = (targetTab: string) => {
    const valid = resolveTargetTab(targetTab, currentUser, companySettings);
    setCurrentTab(valid);
    window.history.replaceState({}, '', appPathForTab(valid));
  };

  useEffect(() => {
    const role = (currentUser?.role || '').toLowerCase();
    const isCashier = role === 'cashier';
    const isAdmin = role === 'admin' || role === 'superadmin';
    const isWholesale = String(companySettings?.businessType || companySettings?.business_type || '').toUpperCase() === 'WHOLESALE';

    // Wholesale stores process returns directly on POS invoice; redirect any direct /returns access to POS
    if (isWholesale && (currentTab === 'returns' || currentTab === 'exchange')) {
      setCurrentTab('pos');
      window.history.replaceState({}, '', appPathForTab('pos'));
      return;
    }

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
  }, [currentUser, currentTab, companySettings]);

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

  const handleAuthSuccess = useCallback((user: any) => {
    clearStoredUnauthTenantId();
    setStoreLoginTarget(null);
    setTenantIdParam('');
    setIsLoginModalOpen(false);
    const userTenantId = Number(user?.tenantId);

    // If switching stores, purge previous company settings immediately
    if (companySettings && Number(companySettings.tenantId || companySettings.tenant_id) !== userTenantId) {
      setCompanySettings(null);
      setCachedStoreName('');
      try {
        localStorage.removeItem('cached_company_settings');
        localStorage.removeItem('cached_store_name');
      } catch {}
    }

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
      setActiveTenant(null);
      setActiveTenantId(null);
      handleNavigateDomain({ mode: 'SUPERADMIN' });
      return;
    }
    if (userTenantId) {
      const matchingTenant = availableTenants.find((t) => Number(t.id) === userTenantId);
      const storeName = matchingTenant?.name || user?.tenantName || user?.storeName || `Store #${userTenantId}`;
      const newTenant: TenantInfo = matchingTenant || {
        id: userTenantId,
        name: storeName,
        status: user?.status || 'ACTIVE',
        subscriptionStatus: user?.subscriptionStatus || 'ACTIVE',
        subscriptionPlan: user?.subscriptionPlan || 'free_tier',
        businessType: user?.businessType || 'RETAIL',
        pricingMode: user?.pricingMode || 'FIXED',
        logoUrl: '/pwa-512x512.png',
        currency: user?.currency || 'PKR',
        onboardingCompleted: user?.onboardingCompleted ?? false,
        appPath: '/dashboard',
      };
      setActiveTenant(newTenant);
      setActiveTenantId(userTenantId);
      setCachedStoreName(storeName);
      try {
        localStorage.setItem('cached_store_name', storeName);
      } catch {}

      if (user?.onboardingCompleted === false && role === 'ADMIN') {
        handleNavigateDomain({ mode: 'ONBOARDING', tenantId: userTenantId, authenticated: true });
        return;
      }
      handleNavigateDomain({ mode: 'TENANT', tenantId: userTenantId, authenticated: true });
      return;
    }
  }, [availableTenants, companySettings, handleNavigateDomain]);

  const handleLogout = () => {
    // Immediate logout, no prompt. The remembered login email is stored under its own key
    // (see utils/rememberedAccount.ts) and is intentionally NOT cleared here; only the
    // "Forget this account" action on the sign-in screen removes it.
    // Capture the tenant id BEFORE the session/tenant state is cleared.
    const rawLogoutId =
      activeTenant?.id ||
      currentUser?.tenantId ||
      getActiveTenantId() ||
      companySettings?.tenantId ||
      companySettings?.tenant_id ||
      (tenantIdParam ? Number(tenantIdParam) : null) ||
      (availableTenants.length > 0 ? Number(availableTenants[0].id) : null) ||
      1;
    const currentLogoutID = Number(rawLogoutId) > 0 ? Number(rawLogoutId) : 1;

    revokeSessionOnServer();
    clearAllSessionState();
    setActiveTenantId(null);
    setCurrentUser(null);
    setCompanySettings(null);
    setCachedStoreName('');
    setActiveExchangeForPos(null);
    setSelectedSupplierForPurchase(null);
    setTenantIdNotice('');
    setCurrentTab('dashboard');

    // On logging out, don't redirect user to saaslandingpage; redirect user to auth route with tenantId instead.
    const tenant =
      availableTenants.find((t) => Number(t.id) === currentLogoutID) ||
      (activeTenant && Number(activeTenant.id) === currentLogoutID ? activeTenant : null);
    if (tenant) {
      setActiveTenant(tenant);
      setStoreLoginTarget(tenant);
    } else {
      setActiveTenant(null);
      setStoreLoginTarget(null);
    }
    setActiveTenantId(currentLogoutID);
    setTenantIdNotice('');
    setTenantIdParam(String(currentLogoutID));
    setIsLoginModalOpen(true);
    setSaasMode('AUTH');
    const authUrl = `/auth?tenantId=${encodeURIComponent(currentLogoutID)}`;
    window.history.replaceState({}, '', authUrl);
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
      const isAdmin = role === 'admin' || role === 'superadmin';
      const isPosActive = currentTab === 'pos' || (isCashier && currentTab === 'dashboard');

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
          if (isAdmin || isCashier) {
            handleTabChange('settings');
          }
          break;
        case 'F8':
          if (!isPosActive) {
            handleTabChange('pos');
          }
          break;
        case 'F9':
          if (!isPosActive && currentUser) {
            handleTabChange('pos');
          }
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleGlobalKeys);
    return () => window.removeEventListener('keydown', handleGlobalKeys);
  }, [currentUser, saasMode, currentTab]);

  return (
    <Suspense
      fallback={
        <LoadingWindow
          isAdmin={saasMode === 'SUPERADMIN'}
          storeName={effectiveStoreName || 'SarbaazSoft Shoe POS'}
          statusMessage="Loading module..."
        />
      }
    >
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
            window.history.replaceState({}, '', '/admin');
          }}
        />
      )}

      {/* 0. AUTH ROUTE (/auth?tenantId=...) */}
      {saasMode === 'AUTH' && (
        shouldShowTenantLoading ? (
          <LoadingWindow
            isAdmin={false}
            storeName={
              isRequestedTenantVerified
                ? storeLoginTarget?.name || effectiveStoreName
                : (tenantIdParam ? `Store #${tenantIdParam}` : 'Store Workspace')
            }
            statusMessage={
              isRequestedTenantVerified
                ? `Loading ${storeLoginTarget?.name || 'Store'}...`
                : (tenantIdParam ? `Connecting to store #${tenantIdParam}...` : 'Loading sign in...')
            }
            logoSrc={
              storeLoginTarget
                ? ((storeLoginTarget as any).logo || (storeLoginTarget as any).logo_url || storeLoginTarget.logoUrl)
                : null
            }
          />
        ) : (
          <>
            {tenantIdNotice && (
              <div role="alert" className="mx-auto mt-6 w-[min(92%,40rem)] rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
                {tenantIdNotice}
              </div>
            )}
            <AuthModal
              companySettings={storeLoginTarget
                ? { ...storeLoginTarget, tenant_id: storeLoginTarget.id, name: storeLoginTarget.name, logo: (storeLoginTarget as any).logo || (storeLoginTarget as any).logo_url || storeLoginTarget.logoUrl || '/pwa-192x192.png' }
                : (activeTenant
                    ? { ...activeTenant, tenant_id: activeTenant.id, name: activeTenant.name, logo: (activeTenant as any).logo || (activeTenant as any).logo_url || activeTenant.logoUrl || '/pwa-192x192.png' }
                    : (tenantIdParam
                        ? { tenant_id: Number(tenantIdParam), name: effectiveStoreName || '', logo: '/pwa-192x192.png' }
                        : { name: 'SarbaazSoft Shoe POS', logo: '/pwa-192x192.png' }))}
              onBack={handleBackToStoreDirectory}
              onClearTenantScope={handleClearAuthTenantScope}
              onSuccess={handleAuthSuccess}
            />
          </>
        )
      )}

      {/* 1. ROOT DOMAIN SAAS LANDING PAGE */}
      {saasMode === 'LANDING' && (
        shouldShowTenantLoading ? (
          Boolean(tenantIdParam) ? (
            <LoadingWindow
              isAdmin={false}
              storeName={
                isRequestedTenantVerified
                  ? storeLoginTarget?.name || effectiveStoreName
                  : (tenantIdParam ? `Store #${tenantIdParam}` : 'Store Workspace')
              }
              statusMessage={
                isRequestedTenantVerified
                  ? `Loading ${storeLoginTarget?.name || 'Store'}...`
                  : `Connecting to store #${tenantIdParam}...`
              }
              logoSrc={
                storeLoginTarget
                  ? ((storeLoginTarget as any).logo || (storeLoginTarget as any).logo_url || storeLoginTarget.logoUrl)
                  : null
              }
            />
          ) : (
            <LoadingWindow
              isAdmin={false}
              storeName="SarbaazSoft Shoe POS"
              statusMessage="Loading SarbaazSoft Shoe POS..."
              subtitle="Dual-engine wholesale shoe shop POS"
            />
          )
        ) : isLoginModalOpen ? (
          <>
            {tenantIdNotice && (
              <div role="alert" className="mx-auto mt-6 w-[min(92%,40rem)] rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
                {tenantIdNotice}
              </div>
            )}
            <AuthModal
              companySettings={storeLoginTarget
                ? { ...storeLoginTarget, tenant_id: storeLoginTarget.id, name: storeLoginTarget.name, logo: (storeLoginTarget as any).logo || (storeLoginTarget as any).logo_url || storeLoginTarget.logoUrl || '/pwa-192x192.png' }
                : (activeTenant
                    ? { ...activeTenant, tenant_id: activeTenant.id, name: activeTenant.name, logo: (activeTenant as any).logo || (activeTenant as any).logo_url || activeTenant.logoUrl || '/pwa-192x192.png' }
                    : (tenantIdParam
                        ? { tenant_id: Number(tenantIdParam), name: effectiveStoreName || '', logo: '/pwa-192x192.png' }
                        : { name: 'SarbaazSoft Shoe POS', logo: '/pwa-192x192.png' }))}
              onBack={handleBackToStoreDirectory}
              onClearTenantScope={handleClearAuthTenantScope}
              onSuccess={handleAuthSuccess}
            />
          </>
        ) : (
          <SaasLandingPage
            availableTenants={availableTenants}
            unauthTenantId={tenantIdParam || getStoredUnauthTenantId()}
            onClearTenantScope={handleClearTenantScope}
            onGlobalLogin={() => {
              const activeScopeId = tenantIdParam || getStoredUnauthTenantId();
              if (activeScopeId) {
                const targetStore = availableTenants.find((t) => Number(t.id) === Number(activeScopeId)) || null;
                setStoreLoginTarget(targetStore);
                setTenantIdParam(String(activeScopeId));
                setStoredUnauthTenantId(String(activeScopeId));
                setIsLoginModalOpen(true);
                setSaasMode('AUTH');
                window.history.pushState({}, '', `/auth?tenantId=${encodeURIComponent(activeScopeId)}`);
              } else {
                setTenantIdParam('');
                setStoreLoginTarget(null);
                setIsLoginModalOpen(true);
                setSaasMode('AUTH');
                window.history.pushState({}, '', '/auth');
              }
            }}
            onSelectStore={(selectedStore) => {
              setStoredUnauthTenantId(String(selectedStore.id));
              setStoreLoginTarget(selectedStore);
              setTenantIdParam(String(selectedStore.id));
              setIsLoginModalOpen(true);
              setSaasMode('AUTH');
              window.history.pushState({}, '', `/auth?tenantId=${encodeURIComponent(selectedStore.id)}`);
            }}
            onOpenSuperAdmin={() => handleNavigateDomain({ mode: 'SUPERADMIN' })}
            onStoreCreated={(tenantId, _loginUrl, user, token) => {
              refreshTenantDirectory('LANDING');
              if (token && user) {
                setAuthSession(token, user);
                setCurrentUser(user);
                if (user.onboardingCompleted === false) {
                  handleNavigateDomain({ mode: 'ONBOARDING', tenantId });
                } else {
                  handleNavigateDomain({ mode: 'TENANT', tenantId });
                }
              } else {
                setStoredUnauthTenantId(String(tenantId));
                setTenantIdParam(String(tenantId));
                setIsLoginModalOpen(true);
                setSaasMode('AUTH');
                window.history.pushState({}, '', `/auth?tenantId=${encodeURIComponent(tenantId)}`);
              }
            }}
          />
        )
      )}

      {/* EMAIL VERIFICATION REQUIRED NOTICE VIEW */}
      {saasMode === 'VERIFY_EMAIL' && (
        <VerifyEmailNoticeView
          storeName={effectiveStoreName || 'SarbaazSoft Shoe POS'}
          onNavigateLogin={(verifiedEmail, sessionData) => {
            if (sessionData?.token && sessionData?.user) {
              setAuthSession(sessionData.token, sessionData.user);
              setCurrentUser(sessionData.user);
              const targetTenantId = Number(
                sessionData.user.tenantId ||
                sessionData.tenantId ||
                activeTenant?.id ||
                0
              );
              if (sessionData.user.onboardingCompleted === false) {
                handleNavigateDomain({ mode: 'ONBOARDING', tenantId: targetTenantId });
                return;
              }
              handleNavigateDomain({ mode: 'TENANT', tenantId: targetTenantId });
              return;
            }
            setSaasMode('LANDING');
            if (verifiedEmail) {
              window.history.pushState({}, '', `/?mode=login&email=${encodeURIComponent(verifiedEmail)}`);
            } else {
              window.history.pushState({}, '', '/?mode=login');
            }
          }}
          onNavigateHome={() => {
            setSaasMode('LANDING');
            window.history.pushState({}, '', '/');
          }}
        />
      )}

      {/* 2. SUPERADMIN CONTROL PANEL (`/admin`) */}
      {saasMode === 'SUPERADMIN' && (
        isInitializing ? (
          <LoadingWindow
            isAdmin={true}
            storeName="POS SaaS C-Panel"
            statusMessage="Loading SuperAdmin Control Plane..."
            subtitle="Loading platform telemetry, tenant directory, and security controls..."
          />
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
          {(isInitializing || !isRequestedTenantVerified) ? (
            <LoadingWindow
              isAdmin={false}
              storeName={effectiveStoreName || (activeTenant?.name ? activeTenant.name : 'Store Workspace')}
              statusMessage={effectiveStoreName ? `Loading ${effectiveStoreName} Workspace...` : 'Synchronizing Store Workspace...'}
              logoSrc={(activeTenant as any)?.logo || (activeTenant as any)?.logo_url || activeTenant?.logoUrl}
            />
          ) : !currentUser ? (
            <LoadingWindow
              isAdmin={false}
              storeName={effectiveStoreName || 'Store Workspace'}
              statusMessage="Redirecting to the shared sign-in page…"
              subtitle="Powered by SarbaazSoft Shoe POS"
              logoSrc={(activeTenant as any)?.logo || (activeTenant as any)?.logo_url || activeTenant?.logoUrl}
            />
          ) : (
            <div
              key={`tenant-app-${activeTenant?.id || currentUser?.tenantId || 'none'}-${currentUser?.id || 'anon'}`}
              className="saas-panel flex w-full min-h-screen bg-[#F8FAFC] dark:bg-[#0A0E1A] text-slate-900 dark:text-slate-100 transition-colors"
            >
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
                      key={`view-${activeTenant?.id || currentUser?.tenantId || 'default'}-${currentUser?.id || 'anon'}-${currentTab}`}
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
                            onNavigateTab={(tab) => handleTabChange(tab)}
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
                          onNavigateTab={(tab) => handleTabChange(tab)}
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
                            onNavigateTab={(tab) => handleTabChange(tab)}
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

                      {currentTab === 'notifications' && (
                        <NotificationsView
                          currentUser={currentUser}
                          companySettings={companySettings}
                          onNavigateTab={(tab) => handleTabChange(tab)}
                        />
                      )}
                    </motion.div>
                  </AnimatePresence>
                </main>

                <footer className="px-4 py-2.5 border border-indigo-500/20 bg-white/95 dark:bg-white/10 backdrop-blur-lg shadow-lg transition-colors duration-500 text-xs font-medium text-slate-800 dark:text-slate-100 tracking-wide shrink-0 no-print select-none">
                  <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-1 sm:gap-4 text-center sm:text-left">
                    <div className="flex items-center gap-2 justify-center sm:justify-start">
                      <strong className="font-bold text-slate-900 dark:text-white">
                        SarbaazSoft Shoe POS
                      </strong>
                      <span className="inline-block px-1.5 py-0.5 text-[10px] font-mono font-medium rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200/50 dark:border-indigo-800/50">
                        {APP_VERSION}
                      </span>
                    </div>
                    <span className="text-slate-500 dark:text-slate-400 text-[11px] sm:text-xs">
                      &copy; {new Date().getFullYear()} SarbaazSoft Shoe POS. All rights reserved.
                    </span>
                  </div>
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

      {currentUser && (
        <PushNotificationSoftPrompt currentUser={currentUser} />
      )}
    </div>
    </Suspense>
  );
}
