import { pgClient } from '../../db/index.ts';

export type AppSettingCategory = 'billing' | 'email' | 'notifications' | 'system';

export interface AppSettingDefinition {
  key: string;
  defaultValue: string;
  category: AppSettingCategory;
  description: string;
  isSecret: boolean;
}

export const APP_SETTINGS_DEFAULTS: AppSettingDefinition[] = [
  // 1. Billing Group
  {
    key: 'INVOICE_PREFIX',
    defaultValue: 'INV-',
    category: 'billing',
    description: 'Default prefix for customer sales receipts and invoices',
    isSecret: false,
  },
  {
    key: 'PURCHASE_PREFIX',
    defaultValue: 'PUR-',
    category: 'billing',
    description: 'Default prefix for supplier purchase orders and stock receipts',
    isSecret: false,
  },

  // 2. Email Group (Exclusively powered by Resend)
  {
    key: 'RESEND_API_KEY',
    defaultValue: '',
    category: 'email',
    description: 'Resend API Key for transactional emails (e.g. re_...)',
    isSecret: true,
  },
  {
    key: 'RESEND_FROM',
    defaultValue: 'SarbaazSoft Shoe POS Security <onboarding@resend.dev>',
    category: 'email',
    description: 'Default verified sender address for Resend emails',
    isSecret: false,
  },
  {
    key: 'EMAIL_WEBHOOK_URL',
    defaultValue: '',
    category: 'email',
    description: 'Optional backup webhook URL to receive outgoing email payloads',
    isSecret: false,
  },
  {
    key: 'RESEND_WEBHOOK_URL',
    defaultValue: '',
    category: 'email',
    description: 'Optional Resend delivery webhook URL',
    isSecret: false,
  },

  // 3. Notifications Group
  {
    key: 'VAPID_PUBLIC_KEY',
    defaultValue: '',
    category: 'notifications',
    description: 'Web Push VAPID Public Key for browser and PWA push notifications',
    isSecret: false,
  },
  {
    key: 'VAPID_PRIVATE_KEY',
    defaultValue: '',
    category: 'notifications',
    description: 'Web Push VAPID Private Key for server notification signing',
    isSecret: true,
  },
  {
    key: 'VAPID_SUBJECT',
    defaultValue: 'mailto:support@sarbaazsoft.com',
    category: 'notifications',
    description: 'Web Push contact subject URI or mailto link',
    isSecret: false,
  },

  // 4. System Group
  {
    key: 'SW_KILL_SWITCH',
    defaultValue: 'false',
    category: 'system',
    description: 'Emergency Service Worker bypass toggle for PWA debugging',
    isSecret: false,
  },
  {
    key: 'DISABLE_HMR',
    defaultValue: 'false',
    category: 'system',
    description: 'Disable Vite Hot Module Reloading in sandbox environments',
    isSecret: false,
  },
];

export interface AppSettingItem {
  key: string;
  value: string;
  category: AppSettingCategory;
  description: string;
  isSecret: boolean;
  updatedAt?: string;
}

// In-memory cache for fast, non-blocking synchronous lookups
const settingsCache = new Map<string, string>();
let cacheLoaded = false;
let cachePromise: Promise<void> | null = null;
let schemaInitPromise: Promise<void> | null = null;

// Optional listener when settings are updated
type SettingsUpdateListener = (updatedKey: string, newValue: string) => void;
const updateListeners = new Set<SettingsUpdateListener>();

export function registerSettingsUpdateListener(listener: SettingsUpdateListener): () => void {
  updateListeners.add(listener);
  return () => {
    updateListeners.delete(listener);
  };
}

/**
 * Initializes the app_settings table and seeds default values (preferring any initial .env values during migration).
 */
export async function ensureAppSettingsSchema(): Promise<void> {
  if (schemaInitPromise) return schemaInitPromise;

  schemaInitPromise = (async () => {
    try {
      await pgClient.query(`
        CREATE TABLE IF NOT EXISTS public.app_settings (
          key VARCHAR(100) PRIMARY KEY,
          value TEXT NOT NULL DEFAULT '',
          category VARCHAR(50) NOT NULL DEFAULT 'system',
          description TEXT DEFAULT '',
          is_secret BOOLEAN NOT NULL DEFAULT FALSE,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);
      await pgClient.query(`
        CREATE INDEX IF NOT EXISTS idx_app_settings_category ON public.app_settings (category)
      `);

      // Seed all default settings if not already present
      for (const def of APP_SETTINGS_DEFAULTS) {
        // Check if there is an existing environment variable to migrate seamlessly
        const envVal = process.env[def.key]?.trim();
        const initialVal = envVal !== undefined && envVal !== '' ? envVal : def.defaultValue;

        await pgClient.query(
          `INSERT INTO public.app_settings (key, value, category, description, is_secret, updated_at)
           VALUES ($1, $2, $3, $4, $5, NOW())
           ON CONFLICT (key) DO NOTHING`,
          [def.key, initialVal, def.category, def.description, def.isSecret]
        );
      }
    } catch (err: any) {
      console.warn('Notice while ensuring app_settings schema:', err?.message || err);
    }
  })();

  return schemaInitPromise;
}

/**
 * Loads or refreshes the in-memory cache of app settings from PostgreSQL.
 */
export async function loadAppSettingsCache(): Promise<void> {
  if (cachePromise) return cachePromise;

  cachePromise = (async () => {
    try {
      await ensureAppSettingsSchema();
      const res = await pgClient.query<{ key: string; value: string }>(
        'SELECT key, value FROM public.app_settings'
      );
      for (const row of res.rows) {
        settingsCache.set(row.key, row.value ?? '');
      }
      cacheLoaded = true;
    } catch (err: any) {
      console.warn('Notice loading app_settings cache:', err?.message || err);
    } finally {
      cachePromise = null;
    }
  })();

  return cachePromise;
}

/**
 * Dynamic asynchronous getter for an app setting with fallback value.
 */
export async function getAppSetting(key: string, fallback?: string): Promise<string> {
  if (!cacheLoaded) {
    await loadAppSettingsCache();
  }
  const cached = settingsCache.get(key);
  if (cached !== undefined && cached !== '') {
    return cached;
  }
  const envVal = process.env[key]?.trim();
  if (envVal !== undefined && envVal !== '') {
    return envVal;
  }
  const def = APP_SETTINGS_DEFAULTS.find((d) => d.key === key);
  if (key === 'RESEND_API_KEY') return '';
  return fallback ?? def?.defaultValue ?? '';
}

/**
 * Synchronous getter for hot paths (e.g. middleware, request headers).
 * If cache is loaded, returns the cached value.
 * If cache is not loaded yet, falls back to process.env or default while initiating background cache load.
 */
export function getCachedAppSetting(key: string, fallback?: string): string {
  if (settingsCache.has(key)) {
    const val = settingsCache.get(key)!;
    if (val !== '') return val;
  }
  if (!cacheLoaded) {
    // Initiate background load without awaiting
    loadAppSettingsCache().catch(() => {});
  }
  const envVal = process.env[key]?.trim();
  if (envVal !== undefined && envVal !== '') {
    return envVal;
  }
  const def = APP_SETTINGS_DEFAULTS.find((d) => d.key === key);
  if (key === 'RESEND_API_KEY') return '';
  return fallback ?? def?.defaultValue ?? '';
}

/**
 * Returns all app settings grouped by category and keyed by key name.
 * Service-layer enforcement: Validates that callers specifying a user role hold Platform Owner (SUPERADMIN).
 */
export async function getAllAppSettings(
  userRole?: string,
  options?: { allowInternal?: boolean }
): Promise<{
  byKey: Record<string, string>;
  grouped: Record<AppSettingCategory, AppSettingItem[]>;
  items: AppSettingItem[];
}> {
  if (userRole !== undefined && !options?.allowInternal) {
    if (String(userRole).toUpperCase() !== 'SUPERADMIN') {
      const err: any = new Error('Forbidden: Platform Owner (SuperAdmin) permission required to access root system settings.');
      err.statusCode = 403;
      err.code = 'FORBIDDEN_PLATFORM_OWNER_REQUIRED';
      throw err;
    }
  }

  await ensureAppSettingsSchema();
  const res = await pgClient.query<AppSettingItem>(
    `SELECT key, value, category, description, is_secret as "isSecret", updated_at as "updatedAt"
     FROM public.app_settings
     ORDER BY category ASC, key ASC`
  );

  const byKey: Record<string, string> = {};
  const grouped: Record<AppSettingCategory, AppSettingItem[]> = {
    billing: [],
    email: [],
    notifications: [],
    system: [],
  };

  const rows = res.rows.length > 0 ? res.rows : APP_SETTINGS_DEFAULTS.map((d) => ({
    key: d.key,
    value: settingsCache.get(d.key) ?? process.env[d.key]?.trim() ?? d.defaultValue,
    category: d.category,
    description: d.description,
    isSecret: d.isSecret,
    updatedAt: new Date().toISOString(),
  }));

  for (const item of rows) {
    byKey[item.key] = item.value ?? '';
    const cat = (item.category || 'system') as AppSettingCategory;
    if (!grouped[cat]) {
      grouped[cat] = [];
    }
    grouped[cat].push(item);
  }

  // Ensure all known defaults appear in the response even if unseeded
  for (const def of APP_SETTINGS_DEFAULTS) {
    if (byKey[def.key] === undefined) {
      const val = settingsCache.get(def.key) ?? def.defaultValue;
      byKey[def.key] = val;
      const item: AppSettingItem = {
        key: def.key,
        value: val,
        category: def.category,
        description: def.description,
        isSecret: def.isSecret,
      };
      grouped[def.category].push(item);
    }
  }

  return { byKey, grouped, items: rows };
}

/**
 * Updates one or multiple app settings dynamically in PostgreSQL and syncs the cache.
 * Service-layer enforcement: Validates that callers specifying a user role hold Platform Owner (SUPERADMIN).
 */
export async function updateAppSettings(
  updates: Record<string, string | number | boolean | null | undefined>,
  userRole?: string,
  options?: { allowInternal?: boolean }
): Promise<Record<string, string>> {
  if (userRole !== undefined && !options?.allowInternal) {
    if (String(userRole).toUpperCase() !== 'SUPERADMIN') {
      const err: any = new Error('Forbidden: Platform Owner (SuperAdmin) permission required to mutate root system settings.');
      err.statusCode = 403;
      err.code = 'FORBIDDEN_PLATFORM_OWNER_REQUIRED';
      throw err;
    }
  }

  await ensureAppSettingsSchema();

  const cleanUpdates: Record<string, string> = {};
  for (const [k, v] of Object.entries(updates)) {
    if (v === undefined || v === null) continue;
    cleanUpdates[k] = String(v).trim();
  }

  for (const [key, value] of Object.entries(cleanUpdates)) {
    const def = APP_SETTINGS_DEFAULTS.find((d) => d.key === key);
    const category = def?.category || 'system';
    const description = def?.description || '';
    const isSecret = def?.isSecret || false;

    await pgClient.query(
      `INSERT INTO public.app_settings (key, value, category, description, is_secret, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (key) DO UPDATE SET
         value = EXCLUDED.value,
         updated_at = NOW()`,
      [key, value, category, description, isSecret]
    );

    settingsCache.set(key, value);

    // Notify listeners (e.g. push notification service when VAPID keys change)
    for (const listener of updateListeners) {
      try {
        listener(key, value);
      } catch (lErr) {
        console.warn('Listener notice during setting update:', lErr);
      }
    }
  }

  return cleanUpdates;
}

