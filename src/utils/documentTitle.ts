/**
 * Standardized document/browser title helper for SarbaazSoft Shoe POS.
 *
 * Rules:
 * 1. SaaS Landing Page: "SarbaazSoft Shoe POS - Wholesale & Retail POS Solution"
 * 2. Login & Auth Pages: "SarbaazSoft Shoe POS | Login"
 * 3. Authenticated App Views: "[Store Name] | [Current Route Name]"
 *    (e.g., "TJ Shoes Collection | Dashboard", "TJ Shoes Collection | POS Terminal", "TJ Shoes Collection | Settings")
 */

export const SAAS_LANDING_TITLE = 'SarbaazSoft Shoe POS - Wholesale & Retail POS Solution';
export const AUTH_PAGE_TITLE = 'SarbaazSoft Shoe POS | Login';

export const APP_ROUTE_TITLES: Record<string, string> = {
  dashboard: 'Dashboard',
  pos: 'POS Terminal',
  inventory: 'Product Catalog',
  ledger: 'Stock Ledger',
  purchases: 'Purchases & Stock In',
  suppliers: 'Suppliers & Khatas',
  returns: 'Returns & Exchanges',
  customers: 'Customers & Khatas',
  reports: 'Reports & Analytics',
  settings: 'Settings',
  assistant: 'AI Assistant',
  notifications: 'Notifications',
};

export interface StandardTitleOptions {
  saasMode?: string;
  storeName?: string;
  currentTab?: string;
  routeName?: string;
  isAuthModalOpen?: boolean;
  authSubTab?: 'login' | 'register' | 'forgot' | 'reset' | string;
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
    if (authSubTab === 'register') {
      return 'SarbaazSoft Shoe POS | Register';
    }
    if (authSubTab === 'forgot') {
      return 'SarbaazSoft Shoe POS | Forgot Password';
    }
    if (authSubTab === 'reset') {
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

  // 7. Active Store View
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
 * Directly sets document.title if running in a browser environment.
 */
export function setDocumentTitle(title: string): void {
  if (typeof document !== 'undefined' && title && document.title !== title) {
    document.title = title;
  }
}
