/**
 * Standardized document/browser title & favicon helper.
 *
 * Title convention (HTML <title> / document.title only — does NOT affect PWA manifests or shortcuts):
 * - Landing Page: "SarbaazSoft Shoe Shop POS"
 * - Auth Pages (Login/Register/Reset): "{platformName} | Login" (or respective auth action)
 * - Dashboard: "{StoreName} | Dashboard"
 * - POS Terminal: "{StoreName} | POS Terminal"
 * - Settings: "{StoreName} | Settings"
 * - Other operational pages: "{StoreName} | [Page Name]"
 * - Browser Tab Favicon: Multi-resolution /admin/favicon.ico across all routes and roles.
 */

export const PLATFORM_DOCUMENT_NAME = 'SarbaazSoft Shoe Shop POS';
export const BROWSER_FAVICON_PATH = '/admin/favicon.ico';

export const APP_ROUTE_TITLES: Record<string, string> = {
  dashboard: 'Dashboard',
  pos: 'POS Terminal',
  inventory: 'Product Catalog',
  products: 'Product Catalog',
  catalog: 'Product Catalog',
  ledger: 'Stock Ledger',
  purchases: 'Purchases & Stock In',
  suppliers: 'Suppliers & Khatas',
  returns: 'Returns & Exchanges',
  customers: 'Customers & Khatas',
  reports: 'Reports & Analytics',
  settings: 'Settings',
  assistant: 'AI Assistant',
  notifications: 'Notifications',
  superadmin: 'SuperAdmin Control Panel',
  trials: 'Trial Activations',
  stores: 'Stores Management',
  requests: 'Subscription Requests',
  manifests: 'WebAPK Manifests',
};

export interface StandardTitleOptions {
  saasMode?: string;
  role?: string;
  isSuperAdmin?: boolean;
  platformName?: string;
  storeName?: string;
  currentTab?: string;
  routeName?: string;
  isAuthModalOpen?: boolean;
  authSubTab?: 'login' | 'register' | 'signup' | 'forgot' | 'forgot-password' | 'reset' | 'reset-password' | string;
  modalTitle?: string;
}

/**
 * Returns the standardized HTML document title for the active route, modal, or tenant workspace.
 */
export function getStandardDocumentTitle(options: StandardTitleOptions = {}): string {
  const {
    saasMode,
    role,
    isSuperAdmin,
    platformName,
    storeName,
    currentTab,
    routeName,
    isAuthModalOpen,
    authSubTab,
    modalTitle,
  } = options;

  const cleanPlatformName =
    (typeof platformName === 'string' && platformName.trim()) || PLATFORM_DOCUMENT_NAME;
  const cleanStoreName = typeof storeName === 'string' ? storeName.trim() : '';
  const modeUpper = String(saasMode || '').trim().toUpperCase();
  const roleUpper = String(role || '').trim().toUpperCase();
  const normalizedTab = typeof currentTab === 'string' ? currentTab.trim().toLowerCase() : '';
  const tabLabel = (typeof routeName === 'string' && routeName.trim()) || APP_ROUTE_TITLES[normalizedTab] || '';
  const cleanModal = typeof modalTitle === 'string' ? modalTitle.trim() : '';

  const resolveAuthLabel = (subRaw?: string): string => {
    const sub = String(subRaw || 'login').trim().toLowerCase();
    if (sub === 'forgot' || sub === 'forgot-password') return 'Reset Password';
    if (sub === 'reset' || sub === 'reset-password') return 'Create New Password';
    if (sub === 'register' || sub === 'signup') return 'Register';
    return 'Login';
  };

  if (isSuperAdmin || modeUpper === 'SUPERADMIN' || roleUpper === 'SUPERADMIN') {
    if (isAuthModalOpen) {
      return `${cleanPlatformName} | ${resolveAuthLabel(authSubTab)}`;
    }
    const adminBase = 'SuperAdmin Control Panel';
    if (cleanModal) return `${adminBase} | ${cleanModal}`;
    if (tabLabel) return `${adminBase} | ${tabLabel}`;
    return `${adminBase} | Dashboard`;
  }

  if (modeUpper === 'INSTALLER') {
    return `${cleanPlatformName} | System Installation`;
  }

  if (modeUpper === 'VERIFY_EMAIL') {
    return `${cleanPlatformName} | Verify Email`;
  }

  if (modeUpper === 'AUTH' || isAuthModalOpen) {
    return `${cleanPlatformName} | ${resolveAuthLabel(authSubTab)}`;
  }

  if (modeUpper === 'TENANT_ONBOARDING') {
    return `${cleanStoreName || cleanPlatformName} | Store Onboarding`;
  }
  if (modeUpper === 'TENANT_SUSPENDED') {
    return `${cleanStoreName || cleanPlatformName} | Store Suspended`;
  }
  if (modeUpper === 'TENANT_EXPIRED') {
    return `${cleanStoreName || cleanPlatformName} | Subscription Expired`;
  }
  if (modeUpper === 'TENANT_NOT_FOUND') {
    return `${cleanPlatformName} | Store Not Found`;
  }

  if (cleanModal) {
    return `${cleanStoreName || cleanPlatformName} | ${cleanModal}`;
  }

  if (modeUpper === 'LANDING') {
    return cleanPlatformName;
  }

  const effectiveStore = cleanStoreName || cleanPlatformName;
  return tabLabel ? `${effectiveStore} | ${tabLabel}` : effectiveStore;
}

/**
 * Ensures browser tab favicon and shortcut icon point to the SuperAdmin S-logo assets
 * across all routes and roles (Store Owner, Cashier, SuperAdmin, SaaS Landing & Public pages).
 * Does NOT alter PWA manifest icons.
 */
export function applyBrowserFavicon(faviconPath: string = BROWSER_FAVICON_PATH): void {
  if (typeof document === 'undefined') return;

  // Remove any legacy 192x192 / 512x512 rel="icon" tags that could override the S-logo tab icon
  document
    .querySelectorAll<HTMLLinkElement>('link[rel="icon"][sizes="192x192"], link[rel="icon"][sizes="512x512"]')
    .forEach((el) => el.remove());

  const ensureLink = (
    selector: string,
    attrs: { rel: string; type: string; href: string; sizes?: string }
  ) => {
    let el = document.querySelector<HTMLLinkElement>(selector);
    if (!el) {
      el = document.createElement('link');
      el.rel = attrs.rel;
      if (attrs.sizes) el.setAttribute('sizes', attrs.sizes);
      document.head.appendChild(el);
    }
    if (el.getAttribute('href') !== attrs.href) {
      el.setAttribute('href', attrs.href);
    }
    if (el.getAttribute('type') !== attrs.type) {
      el.setAttribute('type', attrs.type);
    }
  };

  ensureLink('link[rel="icon"][type="image/x-icon"], link[rel="icon"]:not([sizes])', {
    rel: 'icon',
    type: 'image/x-icon',
    href: faviconPath,
  });
  ensureLink('link[rel="shortcut icon"]', {
    rel: 'shortcut icon',
    type: 'image/x-icon',
    href: faviconPath,
  });
  ensureLink('link[rel="icon"][sizes="32x32"]', {
    rel: 'icon',
    type: 'image/png',
    sizes: '32x32',
    href: '/admin/favicon-32x32.png',
  });
  ensureLink('link[rel="icon"][sizes="16x16"]', {
    rel: 'icon',
    type: 'image/png',
    sizes: '16x16',
    href: '/admin/favicon-16x16.png',
  });
  ensureLink('link[rel="icon"][sizes="48x48"]', {
    rel: 'icon',
    type: 'image/png',
    sizes: '48x48',
    href: '/admin/favicon.png',
  });
}

/**
 * Directly sets document.title if running in a browser environment and ensures browser favicon is maintained.
 */
export function setDocumentTitle(title: string): void {
  if (typeof document !== 'undefined') {
    if (title && document.title !== title) {
      document.title = title;
    }
    applyBrowserFavicon();
  }
}
