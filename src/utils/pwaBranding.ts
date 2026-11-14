export type PwaRoleMode = 'SUPERADMIN' | 'ADMIN' | 'CASHIER' | 'PUBLIC';

export const STANDARD_PWA_APP_NAME = 'SarbaazSoft Shoe Shop POS';
export const STANDARD_PWA_SHORT_NAME = 'SarbaazSoft POS';
export const SUPERADMIN_PWA_APP_NAME = 'SuperAdmin SarbaazSoft Shoe POS';
export const SUPERADMIN_PWA_SHORT_NAME = 'SarbaazSoft Admin';

export const PWA_THEME_COLOR = '#9333EA';
export const PWA_BACKGROUND_COLOR = '#FFFFFF';
export const PWA_BROWSER_FAVICON_PATH = '/admin/favicon.ico';

export interface PwaBrandingInput {
  role?: string | null;
  saasMode?: string | null;
  isSuperAdmin?: boolean;
  pathname?: string | null;
}

export interface PwaBrandingConfig {
  mode: PwaRoleMode;
  isSuperAdmin: boolean;
  appName: string;
  shortName: string;
  applicationName: string;
  appleMobileWebAppTitle: string;
  description: string;
  manifestUrl: string;
  staticManifestUrl: string;
  startUrl: string;
  id: string;
  scope: string;
  themeColor: string;
  backgroundColor: string;
  iconPrefix: string;
  appleTouchIcon: string;
  faviconPath: string;
}

export interface WebAppManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose: string;
}

export interface WebAppManifestShortcut {
  name: string;
  short_name: string;
  description: string;
  url: string;
  icons: WebAppManifestIcon[];
}

export interface WebAppManifest {
  id: string;
  name: string;
  short_name: string;
  description: string;
  start_url: string;
  scope: string;
  display: string;
  display_override: string[];
  orientation: string;
  theme_color: string;
  background_color: string;
  prefer_related_applications: boolean;
  related_applications?: Array<{ platform: string; id: string }>;
  categories: string[];
  icons: WebAppManifestIcon[];
  shortcuts: WebAppManifestShortcut[];
}

/**
 * Resolves the canonical PWA role mode strictly from user role and SuperAdmin view state.
 * Dynamic tenant/store names are intentionally ignored to enforce uniform role-based branding.
 */
export function resolvePwaRoleMode(input?: PwaBrandingInput | string | null): PwaRoleMode {
  if (!input) return 'PUBLIC';

  if (typeof input === 'string') {
    const normalized = input.trim().toUpperCase();
    if (normalized === 'SUPERADMIN' || normalized === 'SUPER_ADMIN') return 'SUPERADMIN';
    if (normalized === 'ADMIN' || normalized === 'STORE_OWNER' || normalized === 'OWNER') return 'ADMIN';
    if (normalized === 'CASHIER' || normalized === 'STAFF') return 'CASHIER';
    return 'PUBLIC';
  }

  const roleUpper = String(input.role || '').trim().toUpperCase();
  const saasModeUpper = String(input.saasMode || '').trim().toUpperCase();
  const pathname = String(input.pathname || '').trim().toLowerCase();

  if (
    input.isSuperAdmin === true ||
    saasModeUpper === 'SUPERADMIN' ||
    pathname === '/admin' ||
    pathname.startsWith('/admin/') ||
    roleUpper === 'SUPERADMIN' ||
    roleUpper === 'SUPER_ADMIN'
  ) {
    return 'SUPERADMIN';
  }

  if (roleUpper === 'ADMIN' || roleUpper === 'STORE_OWNER' || roleUpper === 'OWNER') {
    return 'ADMIN';
  }

  if (roleUpper === 'CASHIER' || roleUpper === 'STAFF') {
    return 'CASHIER';
  }

  return 'PUBLIC';
}

/**
 * Returns the strict role-based PWA branding configuration.
 * - SUPERADMIN / Control Panel: "SuperAdmin SarbaazSoft Shoe POS" (Short name: "SarbaazSoft Admin")
 * - ADMIN, CASHIER, and PUBLIC: "SarbaazSoft Shoe Shop POS" (Short name: "SarbaazSoft POS")
 */
export function resolvePwaBranding(input?: PwaBrandingInput | string | null): PwaBrandingConfig {
  const mode = resolvePwaRoleMode(input);
  const isSuperAdmin = mode === 'SUPERADMIN';

  if (isSuperAdmin) {
    return {
      mode: 'SUPERADMIN',
      isSuperAdmin: true,
      appName: SUPERADMIN_PWA_APP_NAME,
      shortName: SUPERADMIN_PWA_SHORT_NAME,
      applicationName: SUPERADMIN_PWA_APP_NAME,
      appleMobileWebAppTitle: SUPERADMIN_PWA_APP_NAME,
      description:
        'Dedicated SuperAdmin Control Plane for Multi-Tenant Dual-Engine Wholesale POS Provisioning, Store Suspension & SaaS Analytics',
      manifestUrl: '/api/pwa/manifest.webmanifest?role=SUPERADMIN',
      staticManifestUrl: '/admin/manifest.webmanifest',
      startUrl: '/admin',
      id: '/admin/',
      scope: '/',
      themeColor: PWA_THEME_COLOR,
      backgroundColor: PWA_BACKGROUND_COLOR,
      iconPrefix: '/admin',
      appleTouchIcon: '/admin/apple-touch-icon.png',
      faviconPath: PWA_BROWSER_FAVICON_PATH,
    };
  }

  return {
    mode,
    isSuperAdmin: false,
    appName: STANDARD_PWA_APP_NAME,
    shortName: STANDARD_PWA_SHORT_NAME,
    applicationName: STANDARD_PWA_APP_NAME,
    appleMobileWebAppTitle: STANDARD_PWA_APP_NAME,
    description:
      'Multi-tenant dual-engine wholesale shoe shop POS and inventory management system',
    manifestUrl: `/api/pwa/manifest.webmanifest?role=${encodeURIComponent(mode)}`,
    staticManifestUrl: '/manifest.webmanifest',
    startUrl: '/',
    id: '/',
    scope: '/',
    themeColor: PWA_THEME_COLOR,
    backgroundColor: PWA_BACKGROUND_COLOR,
    iconPrefix: '',
    appleTouchIcon: '/apple-touch-icon.png',
    faviconPath: PWA_BROWSER_FAVICON_PATH,
  };
}

/**
 * Generates a W3C-compliant Web App Manifest JSON payload bound strictly to role-based branding.
 */
export function buildPwaManifest(
  input?: PwaBrandingInput | string | null,
  overrides?: { id?: string; startUrl?: string }
): WebAppManifest {
  const branding = resolvePwaBranding(input);

  if (branding.isSuperAdmin) {
    return {
      id: overrides?.id || branding.id,
      name: branding.appName,
      short_name: branding.shortName,
      description: branding.description,
      start_url: overrides?.startUrl || branding.startUrl,
      scope: branding.scope,
      display: 'standalone',
      display_override: ['standalone', 'minimal-ui'],
      orientation: 'any',
      theme_color: branding.themeColor,
      background_color: branding.backgroundColor,
      prefer_related_applications: false,
      categories: ['business', 'productivity', 'finance'],
      icons: [
        { src: '/admin/favicon.png', sizes: '48x48', type: 'image/png', purpose: 'any' },
        { src: '/admin/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/admin/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/admin/pwa-maskable-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
        { src: '/admin/pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        { src: '/admin/apple-touch-icon.png', sizes: '180x180', type: 'image/png', purpose: 'any' },
      ],
      shortcuts: [
        {
          name: 'SuperAdmin Dashboard',
          short_name: 'Dashboard',
          description: 'Open SuperAdmin Overview & Metrics',
          url: '/admin',
          icons: [
            { src: '/admin/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/admin/pwa-maskable-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          ],
        },
        {
          name: 'Store Tenants',
          short_name: 'Tenants',
          description: 'Provision & manage tenant stores',
          url: '/admin?tab=tenants',
          icons: [
            { src: '/admin/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/admin/pwa-maskable-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          ],
        },
        {
          name: 'Platform Reports',
          short_name: 'Reports',
          description: 'Platform ledger & analytics',
          url: '/admin?tab=reports',
          icons: [
            { src: '/admin/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/admin/pwa-maskable-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          ],
        },
      ],
    };
  }

  return {
    id: overrides?.id || branding.id,
    name: branding.appName,
    short_name: branding.shortName,
    description: branding.description,
    start_url: overrides?.startUrl || branding.startUrl,
    scope: branding.scope,
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    orientation: 'any',
    theme_color: branding.themeColor,
    background_color: branding.backgroundColor,
    prefer_related_applications: false,
    related_applications: [
      {
        platform: 'play',
        id: 'com.sarbaazsoft.shoepos',
      },
    ],
    categories: ['business', 'productivity', 'shopping'],
    icons: [
      { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/pwa-maskable-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png', purpose: 'any' },
    ],
    shortcuts: [
      {
        name: 'POS Terminal',
        short_name: 'POS',
        description: 'Open Point of Sale checkout counter',
        url: '/?tab=pos',
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/pwa-maskable-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
        ],
      },
      {
        name: 'Shoe Catalog',
        short_name: 'Catalog',
        description: 'View and manage shoe inventory',
        url: '/?tab=inventory',
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/pwa-maskable-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
        ],
      },
      {
        name: 'Sales Reports',
        short_name: 'Reports',
        description: 'Financial ledger & analytics',
        url: '/?tab=reports',
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/pwa-maskable-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
        ],
      },
    ],
  };
}
