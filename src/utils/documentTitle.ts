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
 * Ensures browser tab favicon points to /admin/favicon.ico across all routes and roles.
 * Does NOT touch PWA APK icons (192x192, 512x512, apple-touch-icon).
 */
export function applyBrowserFavicon(faviconPath: string = BROWSER_FAVICON_PATH): void {
  if (typeof document === 'undefined') return;

  // Primary browser tab favicon
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]:not([sizes="192x192"]):not([sizes="512x512"])');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/x-icon';
    document.head.appendChild(link);
  }
  if (link.getAttribute('href') !== faviconPath) {
    link.setAttribute('href', faviconPath);
    link.setAttribute('type', 'image/x-icon');
  }

  // Shortcut icon for legacy browsers
  let shortcutLink = document.querySelector<HTMLLinkElement>('link[rel="shortcut icon"]');
  if (!shortcutLink) {
    shortcutLink = document.createElement('link');
    shortcutLink.rel = 'shortcut icon';
    shortcutLink.type = 'image/x-icon';
    document.head.appendChild(shortcutLink);
  }
  if (shortcutLink.getAttribute('href') !== faviconPath) {
    shortcutLink.setAttribute('href', faviconPath);
    shortcutLink.setAttribute('type', 'image/x-icon');
  }
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
