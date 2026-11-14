import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { api, setAuthSession, removeAuthToken, clearAllSessionState, revokeSessionOnServer, setActiveTenantId, getActiveTenantId, isStoredTokenValid, getValidatedStoredSession } from './services/api.ts';
import { Header } from './components/common/Header.tsx';
import { Sidebar } from './components/common/Sidebar.tsx';
import { AuthModal } from './components/auth/AuthModal.tsx';
import { OfflineToastNotification } from './components/common/OfflineToastNotification.tsx';
import { PushNotificationSoftPrompt } from './components/notifications/PushNotificationSoftPrompt.tsx';
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
import { ShieldAlert, Loader2 } from 'lucide-react';
import { initNativeNotificationPrompt } from './services/pushNotificationClient.ts';
import { usePwaManifest } from './hooks/usePwaManifest.ts';
import { useDocumentTitle } from './hooks/useDocumentTitle.ts';
import { getStandardDocumentTitle, PLATFORM_DOCUMENT_NAME } from './utils/documentTitle.ts';
import { APP_VERSION } from './version.ts';
import { CashierIdleWarningModal } from './components/common/CashierIdleWarningModal.tsx';
import { useCashierIdleLogout } from './hooks/useCashierIdleLogout.ts';
import { CASHIER_IDLE_LOGOUT_NOTICE, isCashierIdleTimerEnabled } from './utils/cashierIdleTimer.ts';
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

function InlineTabLoader({ label = 'Loading view...' }: { label?: string }) {
  return (
    <div
      className="p-4 sm:p-6 lg:p-7 max-w-7xl mx-auto"
      role="status"
      aria-live="polite"
    >
      <div className="bg-white/90 dark:bg-[#131B2E]/90 border border-slate-200/80 dark:border-indigo-500/20 rounded-2xl p-6 sm:p-8 shadow-xs flex items-center gap-3.5">
        <Loader2 className="w-5 h-5 animate-spin text-purple-600 dark:text-purple-400 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{label}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Preparing workspace modules...
          </p>
        </div>
      </div>
    </div>
  );
}

function PortalRouteFallback({ label = 'Loading...' }: { label?: string }) {
  return (
    <div
      className="min-h-screen w-full flex items-center justify-center bg-[#F8FAFC] dark:bg-[#0A0E1A] text-slate-700 dark:text-slate-200 p-6"
      role="status"
      aria-live="polite"
    >
      <div className="inline-flex items-center gap-3 px-5 py-3.5 rounded-2xl bg-white dark:bg-[#131B2E] border border-slate-200/80 dark:border-indigo-500/20 shadow-sm">
        <Loader2 className="w-4 h-4 animate-spin text-purple-600 dark:text-purple-400 shrink-0" />
        <span className="text-xs sm:text-sm font-semibold">{label}</span>
      </div>
    </div>
  );
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

  const storedSession = getValidatedStoredSession();
  const hasAuthToken = Boolean(storedSession);
  const storedUser = storedSession?.user || null;
  const storedRole = String(storedUser?.originalRole || storedUser?.role || '').toUpperCase();
  const storedTenantId = Number(storedUser?.tenantId) > 0 ? Number(storedUser.tenantId) : 0;
  const isSuperAdminStored = hasAuthToken && storedRole === 'SUPERADMIN';
  const isStoreUserStored = hasAuthToken && Boolean(storedUser) && !isSuperAdminStored && storedTenantId > 0;

  // 3. Unauthenticated tenant scope retention (only auto-applied on /auth or explicit URL tenant params)
  const explicitTenantId = queryTenantId || pathTenantId;
  const isExplicitAuthRoute =
    pathname === '/auth' ||
    pathname.startsWith('/auth/') ||
    pathname === '/login' ||
    pathname.startsWith('/login/') ||
    searchParams.get('mode') === 'login' ||
    Boolean(searchParams.get('resetToken'));
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

  if (pathname === '/install' || pathname.startsWith('/install/')) {
    return { mode: 'INSTALLER', tenantIdParam };
  }
  if (pathname === '/verify-email' || pathname.startsWith('/verify-email') || searchParams.get('mode') === 'verify-email') {
    return { mode: 'VERIFY_EMAIL', tenantIdParam };
  }
  if (
    pathname === '/auth' ||
    pathname.startsWith('/auth/') ||
    pathname === '/login' ||
    pathname.startsWith('/login/') ||
    searchParams.get('mode') === 'login' ||
    Boolean(searchParams.get('resetToken'))
  ) {
    return { mode: 'AUTH', tenantIdParam };
  }

  // Protected /admin route: never flash SuperAdminControlPanel to unauthenticated or non-SUPERADMIN users
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    if (isSuperAdminStored) {
      return { mode: 'SUPERADMIN', tenantIdParam: '' };
    }
    if (isStoreUserStored) {
      if (storedUser?.onboardingCompleted === false && storedRole === 'ADMIN') {
        try { window.history.replaceState({}, '', `/onboarding?tenantId=${encodeURIComponent(storedTenantId)}`); } catch {}
        return { mode: 'TENANT_ONBOARDING', tenantIdParam: '' };
      }
      const fallbackTab = resolveTargetTab(undefined, storedUser);
      try { window.history.replaceState({}, '', appPathForTab(fallbackTab)); } catch {}
      return { mode: 'TENANT_ACTIVE', tenantIdParam: '' };
    }
    try { window.history.replaceState({}, '', '/'); } catch {}
    return { mode: 'LANDING', tenantIdParam };
  }

  // Protected /onboarding route: requires authenticated ADMIN or SUPERADMIN
  if (pathname === '/onboarding' || pathname.startsWith('/onboarding') || searchParams.get('mode') === 'onboarding') {
    if ((isStoreUserStored && storedRole === 'ADMIN') || isSuperAdminStored) {
      return { mode: 'TENANT_ONBOARDING', tenantIdParam };
    }
    if (isStoreUserStored) {
      const fallbackTab = resolveTargetTab(undefined, storedUser);
      try { window.history.replaceState({}, '', appPathForTab(fallbackTab)); } catch {}
      return { mode: 'TENANT_ACTIVE', tenantIdParam: '' };
    }
    const authUrl = tenantIdParam ? `/auth?tenantId=${encodeURIComponent(tenantIdParam)}` : '/auth';
    try { window.history.replaceState({}, '', authUrl); } catch {}
    return { mode: 'AUTH', tenantIdParam };
  }

  let pathTab = pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
  if (pathTab === 'dashboard/notifications') {
    pathTab = 'notifications';
  }
  const queryTab = searchParams.get('tab')?.toLowerCase() || '';
  const requestedTab = APP_TAB_ROUTES.has(pathTab) ? pathTab : queryTab;
  const isProtectedAppTab = Boolean(requestedTab && APP_TAB_ROUTES.has(requestedTab));

  if (!hasAuthToken || !storedUser) {
    if (isProtectedAppTab) {
      const redirectUrl = tenantIdParam ? `/auth?tenantId=${encodeURIComponent(tenantIdParam)}` : '/';
      try { window.history.replaceState({}, '', redirectUrl); } catch {}
      return { mode: tenantIdParam ? 'AUTH' : 'LANDING', tenantIdParam };
    }
    if (pathname !== '/') {
      const tenantQuery = tenantIdParam ? `?tenantId=${encodeURIComponent(tenantIdParam)}` : window.location.search;
      try { window.history.replaceState({}, '', `/${tenantQuery}`); } catch {}
    }
    return { mode: 'LANDING', tenantIdParam };
  }

  // Authenticated user handling
  if (isStoreUserStored && explicitTenantId && Number(explicitTenantId) !== storedTenantId) {
    // Explicit cross-tenant switch requires authenticating against the target store
    try { window.history.replaceState({}, '', `/auth?tenantId=${encodeURIComponent(explicitTenantId)}`); } catch {}
    return { mode: 'AUTH', tenantIdParam: explicitTenantId };
  }

  if (isSuperAdminStored) {
    const activeStoredTenant = getActiveTenantId();
    if (isProtectedAppTab && activeStoredTenant && activeStoredTenant > 0) {
      if (pathname === '/' || queryTab) {
        try { window.history.replaceState({}, '', appPathForTab(requestedTab)); } catch {}
      }
      return { mode: 'TENANT_ACTIVE', tenantIdParam: '' };
    }
    if (explicitTenantId && Number(explicitTenantId) > 0) {
      return { mode: 'TENANT_ACTIVE', tenantIdParam: explicitTenantId };
    }
    try { window.history.replaceState({}, '', '/admin'); } catch {}
    return { mode: 'SUPERADMIN', tenantIdParam: '' };
  }

  // Store user (ADMIN / CASHIER)
  if (storedUser?.onboardingCompleted === false && storedRole === 'ADMIN') {
    try { window.history.replaceState({}, '', `/onboarding?tenantId=${encodeURIComponent(storedTenantId)}`); } catch {}
    return { mode: 'TENANT_ONBOARDING', tenantIdParam: '' };
  }

  const targetTab = resolveTargetTab(isProtectedAppTab ? requestedTab : undefined, storedUser);
  if (pathname !== appPathForTab(targetTab) || queryTab) {
    try { window.history.replaceState({}, '', appPathForTab(targetTab)); } catch {}
  }
  return { mode: 'TENANT_ACTIVE', tenantIdParam: '' };
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
    const session = getValidatedStoredSession();
    return session?.user || null;
  });

  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(() => {
    try {
      const session = getValidatedStoredSession();
      if (!session) return null;
      const storedUser = session.user;
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
  const [authSessionNotice, setAuthSessionNotice] = useState<string | null>(null);

  // A tenantId/storeId URL is an explicit store switch. Until its ID has been
  // resolved against the current tenant directory, cached settings belong to an
  // unknown (possibly previous) store and must not be used by the login UI.
  const hasStoredAuthToken = isStoredTokenValid();
  const isRequestedTenantVerified = !tenantIdParam || Boolean(
    storeLoginTarget && Number(storeLoginTarget.id) === Number(tenantIdParam)
  );
  // Only show the blocking loading screen when bootstrapping an authenticated session on initial startup;
  // unauthenticated visitors on the landing page or sign-in screen render immediately.
  const shouldShowTenantLoading =
    isInitializing && hasStoredAuthToken && Boolean(currentUser);

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

  // Lightweight background tenant context sync for post-auth navigation (never shows full-screen LoadingWindow)
  const syncTenantContext = useCallback(async (targetTenantId: number) => {
    try {
      await refreshTenantDirectory('TENANT_ACTIVE');
      const settingsRes = await api.settings.get().catch(() => null);
      if (settingsRes?.settings) {
        const incomingTenantId = Number(settingsRes.settings.tenantId || settingsRes.settings.tenant_id);
        if (!targetTenantId || !incomingTenantId || incomingTenantId === Number(targetTenantId)) {
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
    } catch (err) {
      console.warn('Tenant context sync warning:', err);
    }
  }, [refreshTenantDirectory]);

  const initializeApp = useCallback(async (overrideTenantId?: number | null, overrideMode?: SaasRouteMode) => {
    setIsInitializing(true);
    try {
      const installStatus = await api.install.status().catch(() => null);
      if (
        (installStatus && !installStatus.installed) ||
        window.location.pathname === '/install' ||
        window.location.pathname.startsWith('/install/') ||
        overrideMode === 'INSTALLER'
      ) {
        setSaasMode('INSTALLER');
        if (window.location.pathname !== '/install') window.history.replaceState({}, '', '/install');
        return;
      }

      if (installStatus && installStatus.isInstalled !== undefined) {
        try {
          localStorage.setItem('pos_is_installed', String(Boolean(installStatus.isInstalled)));
        } catch {}
      }

      const existingSession = getValidatedStoredSession();
      const hasExistingToken = Boolean(existingSession);
      const cachedUser = existingSession?.user || null;
      const cachedTenantId = Number(cachedUser?.tenantId) > 0 ? Number(cachedUser.tenantId) : null;
      const cachedRole = String(cachedUser?.originalRole || cachedUser?.role || '').toUpperCase();

      const queryTenantId = Number(tenantIdParam) > 0 ? Number(tenantIdParam) : null;
      const pathTab = window.location.pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
      const isAppTabPath = APP_TAB_ROUTES.has(pathTab === 'dashboard/notifications' ? 'notifications' : pathTab);
      const tenantIdForInit = overrideTenantId !== undefined
        ? overrideTenantId
        : (hasExistingToken
            ? (queryTenantId || (cachedRole === 'SUPERADMIN' ? (isAppTabPath ? getActiveTenantId() : null) : cachedTenantId || getActiveTenantId() || null))
            : queryTenantId);
      const modeForInit =
        overrideMode ||
        (hasExistingToken && tenantIdForInit && saasMode !== 'SUPERADMIN' && saasMode !== 'TENANT_ONBOARDING'
          ? 'TENANT_ACTIVE'
          : saasMode);

      await refreshTenantDirectory(modeForInit);

      if (!hasExistingToken) {
        setCurrentUser(null);
        if (modeForInit === 'SUPERADMIN' || modeForInit === 'TENANT_ACTIVE' || modeForInit === 'TENANT_ONBOARDING') {
          const fallbackUrl = tenantIdForInit ? `/auth?tenantId=${encodeURIComponent(tenantIdForInit)}` : '/';
          window.history.replaceState({}, '', fallbackUrl);
          setSaasMode(tenantIdForInit ? 'AUTH' : 'LANDING');
        }
        return;
      }

      // Verify existing JWT token & load tenant settings when applicable
      const shouldFetchSettings = modeForInit !== 'SUPERADMIN' && Boolean(tenantIdForInit);
      const [userRes, settingsRes] = await Promise.all([
        api.auth.me().catch(() => null),
        shouldFetchSettings ? api.settings.get().catch(() => null) : Promise.resolve(null),
      ]);

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
          setTenantIdParam(String(tenantIdForInit));
          setIsLoginModalOpen(true);
          setSaasMode('AUTH');
          window.history.replaceState({}, '', `/auth?tenantId=${encodeURIComponent(tenantIdForInit)}`);
          return;
        }

        const normalizedRole =
          dbRole === 'CASHIER' ? 'CASHIER' : dbRole === 'SUPERADMIN' ? 'SUPERADMIN' : 'ADMIN';
        const verifiedUser = {
          ...userRes.user,
          role: normalizedRole,
          originalRole: normalizedRole,
          isSimulatedCashier: false,
        };
        setCurrentUser(verifiedUser);
        try {
          localStorage.setItem('pos_current_user', JSON.stringify(verifiedUser));
        } catch {}

        if (normalizedRole === 'SUPERADMIN' && !tenantIdForInit) {
          setSaasMode('SUPERADMIN');
          window.history.replaceState({}, '', '/admin');
        } else if (verifiedUser.onboardingCompleted === false && normalizedRole === 'ADMIN') {
          setSaasMode('TENANT_ONBOARDING');
          const obTid = Number(verifiedUser.tenantId || tenantIdForInit || 0);
          if (obTid > 0) {
            window.history.replaceState({}, '', `/onboarding?tenantId=${encodeURIComponent(obTid)}`);
          }
        } else if (modeForInit === 'TENANT_ACTIVE' || normalizedRole !== 'SUPERADMIN') {
          setTenantIdParam('');
        }
      } else if (navigator.onLine) {
        removeAuthToken();
        setCurrentUser(null);
        const fallbackUrl = tenantIdForInit ? `/auth?tenantId=${encodeURIComponent(tenantIdForInit)}` : '/';
        window.history.replaceState({}, '', fallbackUrl);
        setIsLoginModalOpen(Boolean(tenantIdForInit));
        setSaasMode(tenantIdForInit ? 'AUTH' : 'LANDING');
      }
    } catch (err) {
      console.error('Initialization error:', err);
    } finally {
      setIsInitializing(false);
    }
  }, [tenantIdParam, refreshTenantDirectory, saasMode]);

  useEffect(() => {
    initializeApp();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (saasMode !== 'TENANT_ACTIVE' || isInitializing || currentUser) return;
    if (activeTenant) {
      setStoreLoginTarget(activeTenant);
      setTenantIdNotice('');
      setTenantIdParam(String(activeTenant.id));
      setIsLoginModalOpen(true);
      setSaasMode('LANDING');
      window.history.replaceState({}, '', `/?tenantId=${encodeURIComponent(activeTenant.id)}`);
    } else {
      setTenantIdParam('');
      setIsLoginModalOpen(false);
      setSaasMode('LANDING');
      window.history.replaceState({}, '', '/');
    }
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

  // /onboarding is a protected destination for authenticated store owners / admins.
  useEffect(() => {
    const role = String(currentUser?.originalRole || currentUser?.role || '').toUpperCase();
    if (saasMode !== 'TENANT_ONBOARDING' || isInitializing) return;
    if (!currentUser) {
      const authUrl = tenantIdParam ? `/auth?tenantId=${encodeURIComponent(tenantIdParam)}` : '/auth';
      window.history.replaceState({}, '', authUrl);
      setIsLoginModalOpen(true);
      setSaasMode('AUTH');
      return;
    }
    if (role !== 'ADMIN' && role !== 'SUPERADMIN') {
      const fallbackTab = resolveTargetTab(undefined, currentUser, companySettings);
      setCurrentTab(fallbackTab);
      window.history.replaceState({}, '', appPathForTab(fallbackTab));
      setSaasMode('TENANT_ACTIVE');
    }
  }, [saasMode, isInitializing, currentUser, tenantIdParam, companySettings]);

  // An already-authenticated SuperAdmin opening the shared root (including
  // their PWA start URL) goes straight to the admin destination.
  useEffect(() => {
    const role = String(currentUser?.originalRole || currentUser?.role || '').toUpperCase();
    if (saasMode !== 'LANDING' || isInitializing || tenantIdParam || role !== 'SUPERADMIN') return;
    window.history.replaceState({}, '', '/admin');
    setSaasMode('SUPERADMIN');
  }, [saasMode, isInitializing, tenantIdParam, currentUser]);

  // Redirect to login immediately if any mid-session API call detects an expired/revoked token (401)
  useEffect(() => {
    const handleSessionExpired = () => {
      setIsProfileModalOpen(false);
      setMobileMenuOpen(false);
      setCurrentUser(null);
      setCompanySettings(null);
      setCachedStoreName('');
      setAuthSessionNotice('Your session has expired. Please sign in again.');
      const targetTid = Number(activeTenant?.id || getActiveTenantId() || 0);
      setActiveTenantId(null);
      if (targetTid > 0) {
        setTenantIdParam(String(targetTid));
        setIsLoginModalOpen(true);
        setSaasMode('AUTH');
        window.history.replaceState({}, '', `/auth?tenantId=${encodeURIComponent(targetTid)}`);
      } else {
        setTenantIdParam('');
        setIsLoginModalOpen(false);
        setSaasMode('LANDING');
        window.history.replaceState({}, '', '/');
      }
    };
    window.addEventListener('auth:session-expired', handleSessionExpired);
    return () => window.removeEventListener('auth:session-expired', handleSessionExpired);
  }, [activeTenant?.id]);

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

  // Handle popstate so browser back/forward stays in sync with login modal / protected route guards
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

      const role = String(currentUser?.originalRole || currentUser?.role || '').toUpperCase();
      if (pathname === '/admin' || pathname.startsWith('/admin/')) {
        if (role === 'SUPERADMIN') {
          setSaasMode('SUPERADMIN');
          setIsLoginModalOpen(false);
        } else {
          window.history.replaceState({}, '', '/');
          setSaasMode('LANDING');
          setIsLoginModalOpen(false);
        }
        return;
      }

      let popTab = pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
      if (popTab === 'dashboard/notifications') popTab = 'notifications';
      if (APP_TAB_ROUTES.has(popTab)) {
        if (currentUser) {
          const valid = resolveTargetTab(popTab, currentUser, companySettings);
          setCurrentTab(valid);
          setSaasMode('TENANT_ACTIVE');
        } else {
          const redirectUrl = tid ? `/auth?tenantId=${encodeURIComponent(tid)}` : '/';
          window.history.replaceState({}, '', redirectUrl);
          setSaasMode(tid ? 'AUTH' : 'LANDING');
          setTenantIdParam(tid);
          setIsLoginModalOpen(Boolean(tid));
        }
        return;
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
  }, [currentUser, companySettings]);

  // Explicit clearance of unauthenticated tenant scope
  const handleClearTenantScope = useCallback(() => {
    clearStoredUnauthTenantId();
    setAuthSessionNotice(null);
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
    setAuthSessionNotice(null);
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
    setAuthSessionNotice(null);
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
    tab?: string;
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
      if (!isSuperAdmin) {
        if (!currentUser) {
          setTenantIdParam('');
          setStoreLoginTarget(null);
          setActiveTenant(null);
          setActiveTenantId(null);
          setIsLoginModalOpen(true);
          setSaasMode('AUTH');
          window.history.pushState({}, '', '/auth');
        } else if (currentUser.tenantId) {
          await handleNavigateDomain({ mode: 'TENANT', tenantId: Number(currentUser.tenantId), authenticated: true });
        } else {
          setSaasMode('LANDING');
          window.history.replaceState({}, '', '/');
        }
        return;
      }
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
      if (!currentUser) {
        setTenantIdParam(String(targetId));
        setIsLoginModalOpen(true);
        setSaasMode('AUTH');
        window.history.pushState({}, '', `/auth?tenantId=${encodeURIComponent(targetId)}`);
        return;
      }
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

      // Clear any stale login target and pre-auth tenant query state
      setStoreLoginTarget(null);
      setTenantIdParam('');

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

      const nextTab = target.tab || currentTab;
      setActiveTenantId(targetId);
      setSaasMode('TENANT_ACTIVE');
      window.history.pushState({}, '', target.authenticated || isSuperAdmin ? appPathForTab(nextTab) : `/?tenantId=${encodeURIComponent(targetId)}`);
      // Sync tenant directory and store settings without triggering full-screen LoadingWindow
      void syncTenantContext(targetId);
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
    setAuthSessionNotice(null);
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
      void import('./components/pos/PosTerminal.tsx');
    } else if (role === 'SUPERADMIN') {
      setCurrentTab('dashboard');
      void import('./components/saas/SuperAdminControlPanel.tsx');
    } else {
      setCurrentTab('dashboard');
      void import('./components/dashboard/DashboardOverview.tsx');
    }
    if (role === 'SUPERADMIN') {
      setActiveTenant(null);
      setActiveTenantId(null);
      setSaasMode('SUPERADMIN');
      window.history.pushState({}, '', '/admin');
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
      const nextTab = role === 'CASHIER' ? 'pos' : 'dashboard';
      handleNavigateDomain({ mode: 'TENANT', tenantId: userTenantId, authenticated: true, tab: nextTab });
      return;
    }
  }, [availableTenants, companySettings, handleNavigateDomain]);

  const handleLogout = (options?: { reason?: 'idle' | 'manual' } | unknown) => {
    // Immediate logout, no prompt. The remembered login email is stored under its own key
    // (see utils/rememberedAccount.ts) and is intentionally NOT cleared here; only the
    // "Forget this account" action on the sign-in screen removes it.
    // Capture the tenant id BEFORE the session/tenant state is cleared.
    const isIdleLogout =
      typeof options === 'object' &&
      options !== null &&
      'reason' in options &&
      (options as { reason?: string }).reason === 'idle';

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
    setIsProfileModalOpen(false);
    setMobileMenuOpen(false);
    setActiveTenantId(null);
    setCurrentUser(null);
    setCompanySettings(null);
    setCachedStoreName('');
    setActiveExchangeForPos(null);
    setSelectedSupplierForPurchase(null);
    setTenantIdNotice('');
    setAuthSessionNotice(isIdleLogout ? CASHIER_IDLE_LOGOUT_NOTICE : null);
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

  const cashierIdleTimerEnabled = isCashierIdleTimerEnabled(currentUser, saasMode);
  const {
    isWarningOpen: isCashierIdleWarningOpen,
    remainingSeconds: cashierIdleRemainingSeconds,
    totalWarningSeconds: cashierIdleTotalWarningSeconds,
    staySignedIn: handleCashierStaySignedIn,
    logoutNow: handleCashierLogoutNow,
  } = useCashierIdleLogout({
    enabled: cashierIdleTimerEnabled,
    onAutoLogout: () => handleLogout({ reason: 'idle' }),
  });

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

  const currentRoleUpper = String(currentUser?.originalRole || currentUser?.role || '').toUpperCase();
  const isCurrentUserSuperAdmin = Boolean(currentUser && currentRoleUpper === 'SUPERADMIN');
  const canAccessOnboarding = Boolean(
    currentUser && (currentRoleUpper === 'ADMIN' || currentRoleUpper === 'SUPERADMIN')
  );

  return (
    <div className="min-h-screen w-full flex flex-col bg-slate-100 dark:bg-[#0A0E1A] text-slate-900 dark:text-slate-100 font-sans antialiased transition-colors duration-200">
      {saasMode === 'INSTALLER' && (
        <Suspense
          fallback={
            isInitializing ? (
              <LoadingWindow
                isAdmin={false}
                storeName="SarbaazSoft Shoe POS"
                statusMessage="Checking installation..."
              />
            ) : (
              <PortalRouteFallback label="Loading installer..." />
            )
          }
        >
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
        </Suspense>
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
              sessionNotice={authSessionNotice}
            />
          </>
        )
      )}

      {/* 1. ROOT DOMAIN SAAS LANDING PAGE */}
      {saasMode === 'LANDING' && (
        isLoginModalOpen ? (
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
                  : `Connecting to store #${tenantIdParam}...`
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
              sessionNotice={authSessionNotice}
            />
          </>
          )
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
        <Suspense fallback={<PortalRouteFallback label="Loading verification..." />}>
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
        </Suspense>
      )}

      {/* 2. SUPERADMIN CONTROL PANEL (`/admin`) */}
      {saasMode === 'SUPERADMIN' && (
        isInitializing && hasStoredAuthToken && isCurrentUserSuperAdmin ? (
          <LoadingWindow
            isAdmin={true}
            storeName="POS SaaS C-Panel"
            statusMessage="Loading SuperAdmin Control Plane..."
            subtitle="Loading platform telemetry, tenant directory, and security controls..."
          />
        ) : !isInitializing && isCurrentUserSuperAdmin ? (
          <Suspense fallback={<PortalRouteFallback label="Loading SuperAdmin Control Plane..." />}>
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
          </Suspense>
        ) : null
      )}

      {/* 3. UNKNOWN STORE FALLBACK SCREEN (404 TENANT) */}
      {saasMode === 'TENANT_NOT_FOUND' && (
        <Suspense fallback={<PortalRouteFallback label="Loading..." />}>
          <UnknownStore404View
            onBackHome={() => {
              setSaasMode('LANDING');
              window.history.pushState({}, '', '/');
            }}
            onGoToSuperAdmin={() => handleNavigateDomain({ mode: 'SUPERADMIN' })}
          />
        </Suspense>
      )}

      {/* 4. SUSPENDED OR EXPIRED STORE SCREEN (when status = SUSPENDED or EXPIRED) */}
      {(saasMode === 'TENANT_SUSPENDED' || saasMode === 'TENANT_EXPIRED') && (
        <Suspense fallback={<PortalRouteFallback label="Loading store status..." />}>
          <SuspendedStoreView
            tenant={activeTenant}
            onGoToLanding={() => handleNavigateDomain({ mode: 'LANDING' })}
            onGoToSuperAdmin={() => handleNavigateDomain({ mode: 'SUPERADMIN' })}
            onOpenStoreSettings={
              isCurrentUserSuperAdmin
                ? () => {
                    setSaasMode('TENANT_ACTIVE');
                    setCurrentTab('settings');
                    window.history.replaceState({}, '', '/settings');
                  }
                : undefined
            }
          />
        </Suspense>
      )}

      {/* 5. TENANT FIRST-TIME ONBOARDING WIZARD (shared root with tenantId) */}
      {saasMode === 'TENANT_ONBOARDING' && (
        isInitializing && hasStoredAuthToken && canAccessOnboarding ? (
          <LoadingWindow
            isAdmin={false}
            storeName={effectiveStoreName || 'Store Setup'}
            statusMessage="Preparing store onboarding..."
            logoSrc={(activeTenant as any)?.logo || (activeTenant as any)?.logo_url || activeTenant?.logoUrl}
          />
        ) : !isInitializing && canAccessOnboarding ? (
          <Suspense fallback={<PortalRouteFallback label="Loading onboarding setup..." />}>
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
                  authenticated: true,
                })
              }
            />
          </Suspense>
        ) : null
      )}

      {/* 6. ACTIVE TENANT POS & INVENTORY SUITE (shared root with tenantId) */}
      {saasMode === 'TENANT_ACTIVE' && (
        <>
          {isInitializing && hasStoredAuthToken && Boolean(currentUser) ? (
            <LoadingWindow
              isAdmin={false}
              storeName={effectiveStoreName || (activeTenant?.name ? activeTenant.name : 'Store Workspace')}
              statusMessage={effectiveStoreName ? `Loading ${effectiveStoreName} Workspace...` : 'Synchronizing Store Workspace...'}
              logoSrc={(activeTenant as any)?.logo || (activeTenant as any)?.logo_url || activeTenant?.logoUrl}
            />
          ) : !isInitializing && currentUser ? (
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
                      <Suspense fallback={<InlineTabLoader />}>
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
                      </Suspense>
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
          ) : null}
        </>
      )}

      {currentUser && (
        <Suspense fallback={null}>
          <UserProfileModal
            isOpen={isProfileModalOpen}
            onClose={() => setIsProfileModalOpen(false)}
            currentUser={currentUser}
            storeName={effectiveStoreName}
            onUserUpdated={(updatedUser) => {
              setCurrentUser(updatedUser);
            }}
          />
        </Suspense>
      )}

      <OfflineToastNotification
        currencySymbol={companySettings?.currency_symbol || companySettings?.currencySymbol || 'Rs.'}
      />

      {currentUser && (
        <PushNotificationSoftPrompt currentUser={currentUser} />
      )}

      <CashierIdleWarningModal
        isOpen={cashierIdleTimerEnabled && isCashierIdleWarningOpen}
        remainingSeconds={cashierIdleRemainingSeconds}
        totalWarningSeconds={cashierIdleTotalWarningSeconds}
        cashierName={currentUser?.name || currentUser?.email}
        storeName={effectiveStoreName}
        onStaySignedIn={handleCashierStaySignedIn}
        onLogoutNow={handleCashierLogoutNow}
      />
    </div>
  );
}
