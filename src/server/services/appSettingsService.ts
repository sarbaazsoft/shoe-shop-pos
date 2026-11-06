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

  // 2. Email Group (Dynamic Provider Support: Resend and Gmail SMTP)
  {
    key: 'ACTIVE_EMAIL_PROVIDER',
    defaultValue: 'resend',
    category: 'email',
    description: 'Active transactional email provider (resend or gmail)',
    isSecret: false,
  },
  {
    key: 'RESEND_API_KEY',
    defaultValue: '',
    category: 'email',
    description: 'Resend API Key for transactional emails (e.g. re_...)',
    isSecret: true,
  },
  {
    key: 'GMAIL_USER',
    defaultValue: 'sarbaazsoft@gmail.com',
    category: 'email',
    description: 'Gmail sender address for SMTP (e.g. sarbaazsoft@gmail.com)',
    isSecret: false,
  },
  {
    key: 'GMAIL_FROM_NAME',
    defaultValue: 'superadmin',
    category: 'email',
    description: 'Display sender name for Gmail SMTP emails (e.g. superadmin)',
    isSecret: false,
  },
  {
    key: 'GMAIL_APP_PASSWORD',
    defaultValue: '',
    category: 'email',
    description: 'Google App Password (16 characters) for Gmail SMTP',
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
    key: 'RESEND_FROM_EMAIL',
    defaultValue: 'onboarding@resend.dev',
    category: 'email',
    description: 'Sender email address for Resend emails (RESEND_FROM_EMAIL)',
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
  {
    key: 'REQUIRE_EMAIL_VERIFICATION_FOR_FREE_TRIAL',
    defaultValue: 'true',
    category: 'email',
    description: 'Require email verification for new free trial registrations before access is activated',
    isSecret: false,
  },
  {
    key: 'EMAIL_POS_ALERTS_ENABLED',
    defaultValue: 'true',
    category: 'email',
    description: 'Send instant transaction receipts and invoice alerts to store owner email',
    isSecret: false,
  },
  {
    key: 'EMAIL_SUPERADMIN_ON_SALES',
    defaultValue: 'false',
    category: 'email',
    description: 'Send copy of all cashier store sales to SuperAdmin Gmail address',
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
  {
    key: 'TELEGRAM_BOT_TOKEN',
    defaultValue: '',
    category: 'notifications',
    description: 'Platform Telegram Bot Token for POS alert dispatch (e.g. 7891234567:AAFl...)',
    isSecret: true,
  },
  {
    key: 'TELEGRAM_SUPERADMIN_CHAT_ID',
    defaultValue: '',
    category: 'notifications',
    description: 'Telegram Chat ID or Group ID for SuperAdmin platform alerts',
    isSecret: false,
  },
  {
    key: 'TELEGRAM_ALERTS_ENABLED',
    defaultValue: 'true',
    category: 'notifications',
    description: 'Global master toggle for Telegram push notification delivery',
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
      await pgClient.query(`
        CREATE OR REPLACE VIEW public.app_setting AS SELECT * FROM public.app_settings
      `).catch(() => {});

      // Sanitize any malformed non-HTTP URLs that may have been saved into webhook fields
      await pgClient.query(`
        UPDATE public.app_settings 
        SET value = '' 
        WHERE key IN ('EMAIL_WEBHOOK_URL', 'RESEND_WEBHOOK_URL') 
          AND value != '' 
          AND value NOT ILIKE 'http://%' 
          AND value NOT ILIKE 'https://%'
      `).catch(() => {});

      // Seed all default settings if not already present
      for (const def of APP_SETTINGS_DEFAULTS) {
        // RESEND_API_KEY and email settings must NEVER be loaded or seeded from process.env or .env
        const isEmailCat = def.category === 'email' || def.key === 'RESEND_API_KEY';
        const envVal = !isEmailCat ? process.env[def.key]?.trim() : undefined;
        const initialVal = envVal !== undefined && envVal !== '' ? envVal : def.defaultValue;

        await pgClient.query(
          `INSERT INTO public.app_settings (key, value, category, description, is_secret, updated_at)
           VALUES ($1, $2, $3, $4, $5, NOW())
           ON CONFLICT (key) DO NOTHING`,
          [def.key, initialVal, def.category, def.description, def.isSecret]
        );
      }

      // Ensure Gmail SMTP sender credentials have the requested defaults if currently empty
      await pgClient.query(`
        UPDATE public.app_settings
        SET value = 'sarbaazsoft@gmail.com'
        WHERE key = 'GMAIL_USER' AND (value IS NULL OR value = '')
      `).catch(() => {});
      await pgClient.query(`
        UPDATE public.app_settings
        SET value = 'superadmin'
        WHERE key = 'GMAIL_FROM_NAME' AND (value IS NULL OR value = '')
      `).catch(() => {});
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
 * PostgreSQL app_settings table is the primary and authoritative source of truth.
 * Email settings (RESEND_API_KEY, RESEND_FROM, etc.) are strictly read from app_settings, never from .env.
 */
export async function getAppSetting(key: string, fallback?: string): Promise<string> {
  if (key === 'RESEND_API_KEY') {
    // CRITICAL REQUIREMENT: Do not use .env for resend_api_key.
    // Retrieve resend_api_key dynamically from the app_setting database table.
    try {
      const res = await pgClient.query<{ value: string }>(
        `SELECT value FROM public.app_settings WHERE UPPER(key) = 'RESEND_API_KEY' LIMIT 1`
      ).catch(async () => {
        return await pgClient.query<{ value: string }>(
          `SELECT value FROM public.app_setting WHERE UPPER(key) = 'RESEND_API_KEY' LIMIT 1`
        );
      });
      if (res.rows.length > 0) {
        const val = (res.rows[0].value || '').trim();
        settingsCache.set('RESEND_API_KEY', val);
        return val;
      }
    } catch (err) {
      console.warn('Notice querying RESEND_API_KEY dynamically from app_setting table:', err);
    }
    return settingsCache.get('RESEND_API_KEY') || fallback || '';
  }

  if (!cacheLoaded) {
    await loadAppSettingsCache();
  }
  const def = APP_SETTINGS_DEFAULTS.find((d) => d.key === key);

  if (settingsCache.has(key)) {
    const cached = settingsCache.get(key)!;
    if (cached !== '') {
      return cached;
    }
  }

  // Cross-key fallback for sender address and email
  if (key === 'RESEND_FROM' && settingsCache.has('RESEND_FROM_EMAIL')) {
    const emailVal = settingsCache.get('RESEND_FROM_EMAIL')?.trim();
    if (emailVal) {
      return `SarbaazSoft Shoe POS Security <${emailVal}>`;
    }
  } else if (key === 'RESEND_FROM_EMAIL' && settingsCache.has('RESEND_FROM')) {
    const fromVal = settingsCache.get('RESEND_FROM')?.trim() || '';
    const match = fromVal.match(/<([^>]+)>/);
    const emailVal = match ? match[1].trim() : fromVal;
    if (emailVal && emailVal.includes('@')) {
      return emailVal;
    }
  }

  // Environment variable fallback if not set in database (NEVER used for RESEND_API_KEY)
  if (key !== 'RESEND_API_KEY') {
    const envVal = process.env[key]?.trim();
    if (envVal !== undefined && envVal !== '') {
      return envVal;
    }
  }
  if (key === 'RESEND_FROM_EMAIL') {
    const altEnv = process.env.RESEND_FROM?.trim();
    if (altEnv) {
      const match = altEnv.match(/<([^>]+)>/);
      return match ? match[1].trim() : altEnv;
    }
  } else if (key === 'RESEND_FROM') {
    const altEnv = process.env.RESEND_FROM_EMAIL?.trim();
    if (altEnv) {
      return `SarbaazSoft Shoe POS Security <${altEnv}>`;
    }
  }

  return fallback ?? def?.defaultValue ?? '';
}

/**
 * Synchronous getter for hot paths (e.g. middleware, request headers).
 * If cache is loaded, returns the cached value from PostgreSQL app_settings.
 */
export function getCachedAppSetting(key: string, fallback?: string): string {
  if (key === 'RESEND_API_KEY') {
    // Strictly read from database-synced cache, never from process.env
    return settingsCache.get('RESEND_API_KEY') || fallback || '';
  }

  const def = APP_SETTINGS_DEFAULTS.find((d) => d.key === key);

  if (settingsCache.has(key)) {
    const val = settingsCache.get(key)!;
    if (val !== '') return val;
  }
  if (!cacheLoaded) {
    loadAppSettingsCache().catch(() => {});
  }

  // Cross-key fallback for sender address and email
  if (key === 'RESEND_FROM' && settingsCache.has('RESEND_FROM_EMAIL')) {
    const emailVal = settingsCache.get('RESEND_FROM_EMAIL')?.trim();
    if (emailVal) {
      return `SarbaazSoft Shoe POS Security <${emailVal}>`;
    }
  } else if (key === 'RESEND_FROM_EMAIL' && settingsCache.has('RESEND_FROM')) {
    const fromVal = settingsCache.get('RESEND_FROM')?.trim() || '';
    const match = fromVal.match(/<([^>]+)>/);
    const emailVal = match ? match[1].trim() : fromVal;
    if (emailVal && emailVal.includes('@')) {
      return emailVal;
    }
  }

  if (key !== 'RESEND_API_KEY') {
    const envVal = process.env[key]?.trim();
    if (envVal !== undefined && envVal !== '') {
      return envVal;
    }
  }
  if (key === 'RESEND_FROM_EMAIL') {
    const altEnv = process.env.RESEND_FROM?.trim();
    if (altEnv) {
      const match = altEnv.match(/<([^>]+)>/);
      return match ? match[1].trim() : altEnv;
    }
  } else if (key === 'RESEND_FROM') {
    const altEnv = process.env.RESEND_FROM_EMAIL?.trim();
    if (altEnv) {
      return `SarbaazSoft Shoe POS Security <${altEnv}>`;
    }
  }

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

  const rows = res.rows.length > 0 ? res.rows : APP_SETTINGS_DEFAULTS.map((d) => {
    const isEmail = d.category === 'email' || d.key.startsWith('RESEND_') || d.key.startsWith('EMAIL_');
    return {
      key: d.key,
      value: settingsCache.get(d.key) ?? (!isEmail ? process.env[d.key]?.trim() : undefined) ?? d.defaultValue,
      category: d.category,
      description: d.description,
      isSecret: d.isSecret,
      updatedAt: new Date().toISOString(),
    };
  });

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
      const isEmail = def.category === 'email' || def.key.startsWith('RESEND_') || def.key.startsWith('EMAIL_') || def.key.startsWith('GMAIL_') || def.key === 'ACTIVE_EMAIL_PROVIDER';
      const val = settingsCache.get(def.key) ?? (!isEmail ? process.env[def.key]?.trim() : undefined) ?? def.defaultValue;
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

  // Provide seamless lowercase aliases for email provider fields
  if (byKey.ACTIVE_EMAIL_PROVIDER) byKey.active_email_provider = byKey.ACTIVE_EMAIL_PROVIDER;
  if (byKey.RESEND_API_KEY) byKey.resend_api_key = byKey.RESEND_API_KEY;
  if (byKey.GMAIL_USER) byKey.gmail_user = byKey.GMAIL_USER;
  if (byKey.GMAIL_FROM_NAME) byKey.gmail_from_name = byKey.GMAIL_FROM_NAME;
  if (byKey.GMAIL_APP_PASSWORD) byKey.gmail_app_password = byKey.GMAIL_APP_PASSWORD;

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

  // Alias lowercase email provider fields to standard configuration keys
  if (cleanUpdates.active_email_provider && !cleanUpdates.ACTIVE_EMAIL_PROVIDER) {
    cleanUpdates.ACTIVE_EMAIL_PROVIDER = cleanUpdates.active_email_provider;
  }
  if (cleanUpdates.resend_api_key !== undefined && !cleanUpdates.RESEND_API_KEY) {
    cleanUpdates.RESEND_API_KEY = cleanUpdates.resend_api_key;
  }
  if (cleanUpdates.gmail_user !== undefined && !cleanUpdates.GMAIL_USER) {
    cleanUpdates.GMAIL_USER = cleanUpdates.gmail_user;
  }
  if (cleanUpdates.gmail_from_name !== undefined && !cleanUpdates.GMAIL_FROM_NAME) {
    cleanUpdates.GMAIL_FROM_NAME = cleanUpdates.gmail_from_name;
  }
  if (cleanUpdates.gmail_app_password !== undefined && !cleanUpdates.GMAIL_APP_PASSWORD) {
    cleanUpdates.GMAIL_APP_PASSWORD = cleanUpdates.gmail_app_password;
  }

  if (cleanUpdates.ACTIVE_EMAIL_PROVIDER) {
    cleanUpdates.ACTIVE_EMAIL_PROVIDER = cleanUpdates.ACTIVE_EMAIL_PROVIDER.toLowerCase() === 'gmail' ? 'gmail' : 'resend';
  }

  // Cross-synchronize sender address and sender email for Resend routines
  if (cleanUpdates.RESEND_FROM && !cleanUpdates.RESEND_FROM_EMAIL) {
    const match = cleanUpdates.RESEND_FROM.match(/<([^>]+)>/);
    const emailVal = match ? match[1].trim() : cleanUpdates.RESEND_FROM.trim();
    if (emailVal.includes('@')) {
      cleanUpdates.RESEND_FROM_EMAIL = emailVal;
    }
  } else if (cleanUpdates.RESEND_FROM_EMAIL && (!cleanUpdates.RESEND_FROM || cleanUpdates.RESEND_FROM === 'SarbaazSoft Shoe POS Security <onboarding@resend.dev>')) {
    const emailVal = cleanUpdates.RESEND_FROM_EMAIL.trim();
    if (emailVal.includes('@')) {
      cleanUpdates.RESEND_FROM = `SarbaazSoft Shoe POS Security <${emailVal}>`;
    }
  }

  // Sanitize webhook URLs to ensure malformed non-URL text is not stored
  for (const hookKey of ['EMAIL_WEBHOOK_URL', 'RESEND_WEBHOOK_URL']) {
    if (cleanUpdates[hookKey]) {
      const val = cleanUpdates[hookKey];
      if (!val.startsWith('http://') && !val.startsWith('https://')) {
        cleanUpdates[hookKey] = '';
      }
    }
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

