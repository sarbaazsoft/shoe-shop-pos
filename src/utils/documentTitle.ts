import {
  resolvePwaBranding,
  STANDARD_PWA_APP_NAME,
  PWA_BROWSER_FAVICON_PATH,
} from './pwaBranding.ts';

/**
 * Standardized document/browser title & favicon helper.
 *
 * Role-based rules (no dynamic tenant names):
 * 1. Store Owner, Cashier, and Unlogged / Public Users: "SarbaazSoft Shoe Shop POS"
 * 2. SuperAdmin Control Panel: "SuperAdmin SarbaazSoft Shoe POS"
 * 3. Browser Tab Favicon: Multi-resolution /admin/favicon.ico across all routes and roles.
 */

export const SAAS_LANDING_TITLE = STANDARD_PWA_APP_NAME;
export const AUTH_PAGE_TITLE = STANDARD_PWA_APP_NAME;
export const BROWSER_FAVICON_PATH = PWA_BROWSER_FAVICON_PATH;

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
  storeName?: string;
  currentTab?: string;
  routeName?: string;
  isAuthModalOpen?: boolean;
  authSubTab?: 'login' | 'register' | 'signup' | 'forgot' | 'forgot-password' | 'reset' | 'reset-password' | string;
  modalTitle?: string;
}

/**
 * Returns the standardized document/browser title based strictly on role / SuperAdmin state.
 */
export function getStandardDocumentTitle(options: StandardTitleOptions = {}): string {
  const { saasMode, role, isSuperAdmin } = options;
  return resolvePwaBranding({ saasMode, role, isSuperAdmin }).documentTitle;
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
