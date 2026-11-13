/**
 * Standardized document/browser title & favicon helper for SarbaazSoft Shoe POS.
 *
 * Rules:
 * 1. SaaS Landing Page: "SarbaazSoft Shoe POS - Wholesale & Retail POS Solution"
 * 2. Login & Auth Pages: "SarbaazSoft Shoe POS | Login" (or Signup / Forgot Password / Reset Password)
 * 3. Authenticated App Views: "[Store Name] | [Current Route Name]"
 *    (e.g., "TJ Shoes Collection | Dashboard", "TJ Shoes Collection | POS Terminal", "TJ Shoes Collection | Settings")
 * 4. Browser Tab Favicon: Multi-resolution /admin/favicon.ico across all routes and roles.
 */

export const SAAS_LANDING_TITLE = 'SarbaazSoft Shoe POS - Wholesale & Retail POS Solution';
export const AUTH_PAGE_TITLE = 'SarbaazSoft Shoe POS | Login';
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
  storeName?: string;
  currentTab?: string;
  routeName?: string;
  isAuthModalOpen?: boolean;
  authSubTab?: 'login' | 'register' | 'signup' | 'forgot' | 'forgot-password' | 'reset' | 'reset-password' | string;
  modalTitle?: string;
}

/**
 * Returns a standardized document/browser title based on the current application state.
 */
export function getStandardDocumentTitle(options: StandardTitleOptions = {}): string {
  const {
    saasMode,
    storeName,
    currentTab,
    routeName,
    isAuthModalOpen,
    authSubTab,
    modalTitle,
  } = options;

  // 1. Auth Modal is open or direct Auth Route
  if (isAuthModalOpen || saasMode === 'AUTH') {
    const sub = (authSubTab || '').toLowerCase();
    if (sub === 'register' || sub === 'signup') {
      return 'SarbaazSoft Shoe POS | Signup';
    }
    if (sub === 'forgot' || sub === 'forgot-password') {
      return 'SarbaazSoft Shoe POS | Forgot Password';
    }
    if (sub === 'reset' || sub === 'reset-password') {
      return 'SarbaazSoft Shoe POS | Reset Password';
    }
    return AUTH_PAGE_TITLE;
  }

  // 2. Email Verification Route
  if (saasMode === 'VERIFY_EMAIL') {
    return 'SarbaazSoft Shoe POS | Verify Email';
  }

  // 3. SaaS Landing Page
  if (saasMode === 'LANDING' || (!storeName && saasMode !== 'SUPERADMIN' && saasMode !== 'TENANT_ACTIVE')) {
    return SAAS_LANDING_TITLE;
  }

  // 4. SuperAdmin Control Panel
  if (saasMode === 'SUPERADMIN') {
    return routeName ? `POS Admin | ${routeName}` : 'POS Admin | Control Panel';
  }

  // 5. System Installer
  if (saasMode === 'INSTALLER') {
    return 'SarbaazSoft Shoe POS | Installation Wizard';
  }

  // 6. Tenant Error / Notice States
  if (saasMode === 'TENANT_NOT_FOUND') {
    return 'SarbaazSoft Shoe POS | Store Not Found';
  }
  if (saasMode === 'TENANT_SUSPENDED') {
    return `${storeName || 'Store'} | Account Suspended`;
  }
  if (saasMode === 'TENANT_EXPIRED') {
    return `${storeName || 'Store'} | Subscription Expired`;
  }
  if (saasMode === 'TENANT_ONBOARDING') {
    return `${storeName || 'Store'} | Store Setup`;
  }

  // 7. Authenticated Active Store View: "[Store Name] | [Current Route Name]"
  const resolvedStore = (storeName || '').trim() || 'SarbaazSoft Shoe POS';

  // If a specific modal view title is active inside the authenticated workspace
  if (modalTitle) {
    return `${resolvedStore} | ${modalTitle}`;
  }

  // Determine route name
  let resolvedRoute = routeName;
  if (!resolvedRoute && currentTab) {
    const cleanTab = currentTab.toLowerCase().trim();
    resolvedRoute = APP_ROUTE_TITLES[cleanTab] || cleanTab.charAt(0).toUpperCase() + cleanTab.slice(1);
  }

  if (resolvedRoute) {
    return `${resolvedStore} | ${resolvedRoute}`;
  }

  return `${resolvedStore} | Dashboard`;
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
