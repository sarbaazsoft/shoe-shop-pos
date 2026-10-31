import 'dotenv/config';

import pg from 'pg';
import type { Pool as PgPool, PoolClient } from 'pg';
import { AsyncLocalStorage } from 'async_hooks';
import bcrypt from 'bcryptjs';

const Pool = pg.Pool;

// Transaction context storage to ensure queries between BEGIN and COMMIT/ROLLBACK
// execute on the same checked-out client from the pool.
interface TxContext {
  client: PoolClient | null;
}

export const txStorage = new AsyncLocalStorage<TxContext>();

export interface DbConnectionInfo {
  type: 'PostgreSQL Server';
  isStandardPostgres: true;
  host: string;
  port: number;
  database: string;
  user: string;
  ssl: boolean;
  maskedUrl: string;
  connected?: boolean;
  lastError?: string;
}

const rawDatabaseUrl = process.env.DATABASE_URL?.trim();

export const isStandardPostgres = true;
let dbInfo: DbConnectionInfo;
let rawPool: PgPool | null = null;
let useMock = false;

// In-memory mock store used when DATABASE_URL is not configured or unreachable in AI Studio
const defaultPasswordHash = bcrypt.hashSync('admin123', 10);
const defaultStorePasswordHash = bcrypt.hashSync('baloch@2026', 10);

const mockStore: Record<string, any[]> = {
  tenants: [
    {
      id: 1,
      name: 'Baloch Shoes',
      status: 'ACTIVE',
      subscription_type: '1_year',
      subscription_plan: 'YEARLY',
      subscription_start_date: new Date(Date.now() - 86400000 * 30).toISOString(),
      subscription_end_date: new Date(Date.now() + 86400000 * 335).toISOString(),
      subscription_status: 'ACTIVE',
      logo_url: '/pwa-512x512.png',
      address: 'Main Boulevard, Retail District',
      tax_id: 'STRN-100200300',
      currency: 'PKR',
      onboarding_completed: true,
      deleted_product_ids: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 2,
      name: 'StepUp Footwear',
      status: 'ACTIVE',
      subscription_type: '6_months',
      subscription_plan: '6_MONTHS',
      subscription_start_date: new Date(Date.now() - 86400000 * 15).toISOString(),
      subscription_end_date: new Date(Date.now() + 86400000 * 165).toISOString(),
      subscription_status: 'ACTIVE',
      logo_url: '',
      address: 'Liberty Market, Gulberg, Lahore',
      tax_id: 'STRN-200300400',
      currency: 'PKR',
      onboarding_completed: true,
      deleted_product_ids: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 3,
      name: 'Metro Shoes Studio',
      status: 'ACTIVE',
      subscription_type: '1_year',
      subscription_plan: 'YEARLY',
      subscription_start_date: new Date(Date.now() - 86400000 * 45).toISOString(),
      subscription_end_date: new Date(Date.now() + 86400000 * 320).toISOString(),
      subscription_status: 'ACTIVE',
      logo_url: '',
      address: 'Tariq Road Commercial Area, Karachi',
      tax_id: 'STRN-300400500',
      currency: 'PKR',
      onboarding_completed: true,
      deleted_product_ids: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 4,
      name: 'Apex Walk Store',
      status: 'ACTIVE',
      subscription_type: '1_year',
      subscription_plan: 'YEARLY',
      subscription_start_date: new Date(Date.now() - 86400000 * 10).toISOString(),
      subscription_end_date: new Date(Date.now() + 86400000 * 355).toISOString(),
      subscription_status: 'ACTIVE',
      logo_url: '',
      address: 'Bank Road, Saddar Bazaar, Rawalpindi',
      tax_id: 'STRN-400500600',
      currency: 'PKR',
      onboarding_completed: true,
      deleted_product_ids: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ],
  users: [
    {
      id: 1,
      tenant_id: 0,
      name: 'Platform SuperAdmin',
      email: 'sarbaazsoft@gmail.com',
      phone: '+92-321-2257340',
      avatar_url: '',
      password_hash: defaultPasswordHash,
      quick_password: 'admin123',
      role: 'SUPERADMIN',
      status: 'APPROVED',
      active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 2,
      tenant_id: 1,
      name: 'Store Owner',
      email: 'admin@balochshoes.com',
      phone: '+923001234567',
      avatar_url: '',
      password_hash: defaultStorePasswordHash,
      quick_password: 'baloch@2026',
      role: 'ADMIN',
      status: 'APPROVED',
      active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 3,
      tenant_id: 2,
      name: 'StepUp Owner',
      email: 'owner@stepupfootwear.com',
      phone: '+923019876543',
      avatar_url: '',
      password_hash: defaultStorePasswordHash,
      quick_password: 'stepup@2026',
      role: 'ADMIN',
      status: 'APPROVED',
      active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 4,
      tenant_id: 3,
      name: 'Metro Shoes Manager',
      email: 'admin@metroshoes.pk',
      phone: '+923214567890',
      avatar_url: '',
      password_hash: defaultStorePasswordHash,
      quick_password: 'metro@2026',
      role: 'ADMIN',
      status: 'APPROVED',
      active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 5,
      tenant_id: 4,
      name: 'Apex Walk Owner',
      email: 'contact@apexwalk.com',
      phone: '+923335551234',
      avatar_url: '',
      password_hash: defaultStorePasswordHash,
      quick_password: 'apex@2026',
      role: 'ADMIN',
      status: 'APPROVED',
      active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ],
  company_settings: [
    {
      id: 1,
      tenant_id: 1,
      name: 'Baloch Shoes',
      logo: '',
      address: 'Main Boulevard, Retail District',
      phone: '+923001234567',
      email: 'admin@balochshoes.com',
      website: '',
      strn: 'STRN-100200300',
      tax_id: 'STRN-100200300',
      tax_rate: 0,
      currency: 'PKR',
      currency_name: 'Pakistani Rupee',
      currency_symbol: 'Rs.',
      invoice_footer: 'Thank you for shopping with us!',
      show_receipt_logo: false,
      receipt_logo: '',
      low_stock_limit: 5,
      pricing_mode: 'FIXED',
      pricing_policy_locked: true,
      business_type: 'RETAIL',
      min_selling_quantity: 1.0,
      allow_half_carton: true,
      updated_at: new Date().toISOString(),
    },
    {
      id: 2,
      tenant_id: 2,
      name: 'StepUp Footwear',
      logo: '',
      address: 'Liberty Market, Gulberg, Lahore',
      phone: '+923019876543',
      email: 'owner@stepupfootwear.com',
      website: '',
      strn: 'STRN-200300400',
      tax_id: 'STRN-200300400',
      tax_rate: 0,
      currency: 'PKR',
      currency_name: 'Pakistani Rupee',
      currency_symbol: 'Rs.',
      invoice_footer: 'Quality footwear for every step.',
      show_receipt_logo: false,
      receipt_logo: '',
      low_stock_limit: 5,
      pricing_mode: 'NEGOTIABLE',
      pricing_policy_locked: true,
      business_type: 'RETAIL',
      min_selling_quantity: 1.0,
      allow_half_carton: true,
      updated_at: new Date().toISOString(),
    },
    {
      id: 3,
      tenant_id: 3,
      name: 'Metro Shoes Studio',
      logo: '',
      address: 'Tariq Road Commercial Area, Karachi',
      phone: '+923214567890',
      email: 'admin@metroshoes.pk',
      website: '',
      strn: 'STRN-300400500',
      tax_id: 'STRN-300400500',
      tax_rate: 0,
      currency: 'PKR',
      currency_name: 'Pakistani Rupee',
      currency_symbol: 'Rs.',
      invoice_footer: 'Style and comfort combined.',
      show_receipt_logo: false,
      receipt_logo: '',
      low_stock_limit: 5,
      pricing_mode: 'FIXED',
      pricing_policy_locked: true,
      business_type: 'RETAIL',
      min_selling_quantity: 1.0,
      allow_half_carton: true,
      updated_at: new Date().toISOString(),
    },
    {
      id: 4,
      tenant_id: 4,
      name: 'Apex Walk Store',
      logo: '',
      address: 'Bank Road, Saddar Bazaar, Rawalpindi',
      phone: '+923335551234',
      email: 'contact@apexwalk.com',
      website: '',
      strn: 'STRN-400500600',
      tax_id: 'STRN-400500600',
      tax_rate: 0,
      currency: 'PKR',
      currency_name: 'Pakistani Rupee',
      currency_symbol: 'Rs.',
      invoice_footer: 'Walk with confidence.',
      show_receipt_logo: false,
      receipt_logo: '',
      low_stock_limit: 5,
      pricing_mode: 'FIXED',
      pricing_policy_locked: true,
      business_type: 'RETAIL',
      min_selling_quantity: 1.0,
      allow_half_carton: true,
      updated_at: new Date().toISOString(),
    },
  ],
  categories: [
    { id: 1, name: 'Men', created_at: new Date().toISOString() },
    { id: 2, name: 'Women', created_at: new Date().toISOString() },
    { id: 3, name: 'Kids', created_at: new Date().toISOString() },
    { id: 4, name: 'Toddler', created_at: new Date().toISOString() },
    { id: 5, name: 'Infant', created_at: new Date().toISOString() },
  ],
  products: [
    {
      id: 1,
      tenant_id: 1,
      tenant_product_no: 1,
      name: 'Classic Leather Runner',
      brand: 'Unbranded',
      category: 'Casual Shoes',
      barcode: '890100000001',
      article: 'SF-0001',
      primary_image_url: '',
      description: 'Everyday comfort leather runner',
      cost_price: 2500,
      min_price: 3800,
      max_price: 4200,
      pairs_per_carton: 6,
      total_stock: 20,
      low_stock_limit: 5,
      allow_half_carton: true,
      active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ],
  customers: [
    {
      id: 1,
      tenant_id: 1,
      name: 'Tariq Wholesale Traders',
      shop_name: 'Tariq Shoes & Sons',
      market_name: 'Moti Bazar',
      city: 'Rawalpindi',
      phone: '+923009876543',
      email: 'tariq.traders@example.com',
      address: 'Shop 14, Moti Bazar, Rawalpindi',
      notes: 'Registered Wholesale Dealer',
      credit_limit: 100000,
      current_balance: 0,
      outstanding_balance: 0,
      ntn_number: 'NTN-7890123-4',
      created_at: new Date().toISOString(),
    },
  ],
  customer_ledger: [],
  supplier_ledger: [],
  suppliers: [],
  sales: [],
  sale_items: [],
  returns: [],
  return_items: [],
  purchases: [],
  purchase_items: [],
  purchase_returns: [],
  purchase_return_items: [],
  supplier_payments: [],
  stock_movements: [],
  push_subscriptions: [],
  trial_activations: [],
  app_settings: [
    { key: 'INVOICE_PREFIX', value: 'INV-', category: 'billing', description: 'Default prefix for customer sales receipts and invoices', is_secret: false, updated_at: new Date().toISOString() },
    { key: 'PURCHASE_PREFIX', value: 'PUR-', category: 'billing', description: 'Default prefix for supplier purchase orders and stock receipts', is_secret: false, updated_at: new Date().toISOString() },
    { key: 'RESEND_API_KEY', value: '', category: 'email', description: 'Resend API Key for transactional emails', is_secret: true, updated_at: new Date().toISOString() },
    { key: 'RESEND_FROM', value: 'SarbaazSoft Shoe POS <noreply@sarbaazsoft.com>', category: 'email', description: 'Verified default sender address for Resend emails', is_secret: false, updated_at: new Date().toISOString() },
    { key: 'EMAIL_WEBHOOK_URL', value: '', category: 'email', description: 'Custom webhook URL to receive outgoing email payloads', is_secret: false, updated_at: new Date().toISOString() },
    { key: 'RESEND_WEBHOOK_URL', value: '', category: 'email', description: 'Resend delivery webhook URL', is_secret: false, updated_at: new Date().toISOString() },
    { key: 'VAPID_PUBLIC_KEY', value: '', category: 'notifications', description: 'Web Push VAPID Public Key for browser and PWA push notifications', is_secret: false, updated_at: new Date().toISOString() },
    { key: 'VAPID_PRIVATE_KEY', value: '', category: 'notifications', description: 'Web Push VAPID Private Key for server notification signing', is_secret: true, updated_at: new Date().toISOString() },
    { key: 'VAPID_SUBJECT', value: 'mailto:support@sarbaazsoft.com', category: 'notifications', description: 'Web Push contact subject URI or mailto link', is_secret: false, updated_at: new Date().toISOString() },
    { key: 'SW_KILL_SWITCH', value: 'false', category: 'system', description: 'Emergency Service Worker bypass toggle for PWA debugging', is_secret: false, updated_at: new Date().toISOString() },
    { key: 'DISABLE_HMR', value: 'false', category: 'system', description: 'Disable Vite Hot Module Reloading in sandbox environments', is_secret: false, updated_at: new Date().toISOString() },
  ],
  platform_notifications: [],
  platform_notification_reads: [],
  pos_notification_dismissals: [],
};

let mockIdCounters: Record<string, number> = {
  tenants: 2,
  users: 3,
  company_settings: 2,
  categories: 4,
  products: 2,
  customers: 2,
  customer_ledger: 1,
  supplier_ledger: 1,
  suppliers: 1,
  sales: 1,
  sale_items: 1,
  returns: 1,
  return_items: 1,
  purchases: 1,
  purchase_items: 1,
  purchase_returns: 1,
  purchase_return_items: 1,
  supplier_payments: 1,
  stock_movements: 1,
  push_subscriptions: 1,
  trial_activations: 1,
  platform_notifications: 1,
  platform_notification_reads: 1,
  pos_notification_dismissals: 1,
};

function nextMockId(table: string): number {
  const current = mockIdCounters[table] || (mockStore[table]?.length || 0) + 1;
  mockIdCounters[table] = current + 1;
  return current;
}

async function executeMockQuery<T = any>(text: string, params: any[] = []): Promise<{ rows: T[]; rowCount?: number }> {
  const sql = text.trim();
  const upper = sql.toUpperCase();

  if (
    upper === 'SELECT 1' ||
    upper === 'SELECT 1 AS OK' ||
    upper === 'BEGIN' ||
    upper === 'COMMIT' ||
    upper === 'ROLLBACK' ||
    upper.includes('PG_ADVISORY_XACT_LOCK')
  ) {
    return { rows: [{ ok: 1 } as unknown as T], rowCount: 1 };
  }

  // Public landing page aggregate stats (/api/saas/public-stats)
  if (upper.includes('AS STORE_COUNT') && upper.includes('AS PRODUCT_COUNT')) {
    const todayStr = new Date().toISOString().slice(0, 10);
    const storeCount = mockStore.tenants.length;
    const productCount = mockStore.products.filter((p) => p.active !== false).length;
    const platformRevenue = Math.round(
      mockStore.sales.reduce((sum, s) => sum + Number(s.total_amount || 0), 0)
    );
    const invoicesTodayCount = mockStore.sales.filter((s) => s.sale_date === todayStr).length;
    return {
      rows: [
        {
          store_count: String(storeCount),
          product_count: String(productCount),
          platform_revenue: String(platformRevenue),
          invoices_today_count: String(invoicesTodayCount),
        } as unknown as T,
      ],
      rowCount: 1,
    };
  }

  if (upper.includes('TO_REGCLASS')) {
    if (upper.includes('UNNEST')) {
      const tables: string[] = Array.isArray(params[0]) ? params[0] : [];
      const rows = tables.map((table_name) => ({ table_name, present: true })) as unknown as T[];
      return { rows, rowCount: rows.length };
    }
    return { rows: [{ exists: true, ok: true } as unknown as T], rowCount: 1 };
  }

  // APP_SETTINGS table handling in in-memory mock store
  if (upper.includes('APP_SETTINGS')) {
    if (!mockStore.app_settings) mockStore.app_settings = [];

    if (upper.startsWith('INSERT INTO') || upper.includes('INSERT INTO PUBLIC.APP_SETTINGS')) {
      const key = String(params[0] || '').trim();
      const value = String(params[1] !== undefined && params[1] !== null ? params[1] : '');
      const category = String(params[2] || 'system');
      const description = String(params[3] || '');
      const isSecret = Boolean(params[4]);

      const existingIdx = mockStore.app_settings.findIndex((s) => s.key === key);
      const isDoNothing = upper.includes('DO NOTHING');

      if (existingIdx >= 0) {
        if (!isDoNothing) {
          mockStore.app_settings[existingIdx].value = value;
          mockStore.app_settings[existingIdx].updated_at = new Date().toISOString();
        }
        return { rows: [mockStore.app_settings[existingIdx] as unknown as T], rowCount: 1 };
      } else {
        const entry = {
          key,
          value,
          category,
          description,
          is_secret: isSecret,
          updated_at: new Date().toISOString(),
        };
        mockStore.app_settings.push(entry);
        return { rows: [entry as unknown as T], rowCount: 1 };
      }
    }

    if (upper.startsWith('SELECT')) {
      let list = [...mockStore.app_settings];
      if (upper.includes('WHERE KEY = $1')) {
        const targetKey = String(params[0] || '').trim();
        list = list.filter((s) => s.key === targetKey);
      }
      return { rows: list as unknown as T[], rowCount: list.length };
    }

    if (upper.startsWith('UPDATE')) {
      const targetKey = String(params[params.length - 1] || '').trim();
      const entry = mockStore.app_settings.find((s) => s.key === targetKey);
      if (entry && params.length >= 2) {
        entry.value = String(params[0]);
        entry.updated_at = new Date().toISOString();
      }
      return { rows: entry ? ([entry] as unknown as T[]) : [], rowCount: entry ? 1 : 0 };
    }
    return { rows: [], rowCount: 0 };
  }

  // 7-day sales series chart query (WITH days AS (... generate_series ...))
  if (upper.includes('GENERATE_SERIES') && upper.includes('WITH DAYS AS')) {
    const tenantFilter = params.length > 0 ? Number(params[0]) : null;
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const rows: any[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const dateStr = d.toISOString().slice(0, 10);
      const label = dayNames[d.getDay()];
      const daySales = mockStore.sales.filter(
        (s) => s.sale_date === dateStr && (!tenantFilter || Number(s.tenant_id) === tenantFilter)
      );
      const amount = daySales.reduce((sum, s) => sum + Number(s.total_amount || 0), 0);
      rows.push({
        date: dateStr,
        label,
        amount: String(amount),
        tx_count: String(daySales.length),
      });
    }
    return { rows: rows as unknown as T[], rowCount: rows.length };
  }

  // Deleted store requests tracking (deprecated & dropped)
  if (upper.includes('DELETED_STORE_REQUESTS')) {
    return { rows: [], rowCount: 0 };
  }

  // Push Subscriptions tracking for Web Push API
  if (upper.includes('PUSH_SUBSCRIPTIONS')) {
    if (upper.startsWith('INSERT INTO') || upper.includes('INSERT INTO PUBLIC.PUSH_SUBSCRIPTIONS')) {
      const tenantId = Number(params[0] || 1);
      const userId = Number(params[1] || 0);
      const endpoint = String(params[2] || '');
      const p256dh = String(params[3] || '');
      const auth = String(params[4] || '');
      const userAgent = String(params[5] || '');
      const existingIdx = mockStore.push_subscriptions.findIndex((s) => s.endpoint === endpoint);
      const entry = {
        id: existingIdx >= 0 ? mockStore.push_subscriptions[existingIdx].id : nextMockId('push_subscriptions'),
        tenant_id: tenantId,
        user_id: userId,
        endpoint,
        p256dh,
        auth,
        user_agent: userAgent,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      if (existingIdx >= 0) {
        mockStore.push_subscriptions[existingIdx] = entry;
      } else {
        mockStore.push_subscriptions.push(entry);
      }
      return { rows: [entry as unknown as T], rowCount: 1 };
    }
    if (upper.startsWith('SELECT')) {
      const tenantId = params.length > 0 && params[0] !== null && params[0] !== undefined ? Number(params[0]) : null;
      let subs = mockStore.push_subscriptions;
      if (tenantId !== null) {
        subs = subs.filter((s) => Number(s.tenant_id) === tenantId);
      }
      return { rows: subs as unknown as T[], rowCount: subs.length };
    }
    if (upper.startsWith('DELETE FROM')) {
      const endpoint = String(params[0] || '');
      mockStore.push_subscriptions = mockStore.push_subscriptions.filter((s) => s.endpoint !== endpoint);
      return { rows: [], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  // Trial Activations tracking for Free Trial management
  if (upper.includes('TRIAL_ACTIVATIONS')) {
    if (upper.startsWith('INSERT INTO') || upper.includes('INSERT INTO PUBLIC.TRIAL_ACTIVATIONS')) {
      const entry = {
        id: nextMockId('trial_activations'),
        user_id: params[0] !== undefined && params[0] !== null ? Number(params[0]) : null,
        tenant_id: params[1] !== undefined && params[1] !== null ? Number(params[1]) : null,
        email: String(params[2] || '').trim().toLowerCase(),
        user_name: String(params[3] || ''),
        phone: String(params[4] || ''),
        store_name: String(params[5] || ''),
        business_type: String(params[6] || 'RETAIL'),
        pricing_mode: String(params[7] || 'FIXED'),
        plan: String(params[8] || 'TRIAL'),
        trial_duration_days: Number(params[9] || 30),
        trial_start_date: params[10] ? new Date(params[10]).toISOString() : new Date().toISOString(),
        trial_end_date: params[11] ? new Date(params[11]).toISOString() : new Date(Date.now() + 86400000 * 30).toISOString(),
        status: String(params[12] || 'ACTIVE'),
        ip_address: String(params[13] || ''),
        user_agent: String(params[14] || ''),
        activated_at: new Date().toISOString(),
        details: params[15] ? (typeof params[15] === 'string' ? JSON.parse(params[15]) : params[15]) : {},
      };
      if (!Array.isArray(mockStore.trial_activations)) {
        mockStore.trial_activations = [];
      }
      mockStore.trial_activations.unshift(entry);
      return { rows: [entry as unknown as T], rowCount: 1 };
    }
    if (upper.startsWith('SELECT')) {
      let list = [...(mockStore.trial_activations || [])];
      if (upper.includes('COUNT(*)')) {
        return { rows: [{ count: String(list.length) } as unknown as T], rowCount: 1 };
      }
      if (upper.includes('WHERE ID = $1')) {
        const targetId = Number(params[0]);
        list = list.filter((t: any) => Number(t.id) === targetId);
      } else if (upper.includes('LOWER(BTRIM(EMAIL)) =') || upper.includes('EMAIL =')) {
        const targetEmail = String(params[0] || '').trim().toLowerCase();
        list = list.filter((t: any) => String(t.email || '').toLowerCase() === targetEmail);
      }
      return { rows: list as unknown as T[], rowCount: list.length };
    }
    if (upper.startsWith('UPDATE')) {
      const targetId = Number(params[params.length - 1]);
      const entry = (mockStore.trial_activations || []).find((t: any) => Number(t.id) === targetId);
      if (entry) {
        if (upper.includes('TRIAL_END_DATE = $1')) {
          entry.trial_end_date = params[0] ? new Date(params[0]).toISOString() : entry.trial_end_date;
          entry.status = 'ACTIVE';
        }
        if (upper.includes('STATUS = $1')) {
          entry.status = String(params[0] || entry.status);
        }
      }
      return { rows: entry ? ([entry] as unknown as T[]) : [], rowCount: entry ? 1 : 0 };
    }
    return { rows: [], rowCount: 0 };
  }

  // PLATFORM_NOTIFICATIONS tracking for Announcements & System Alerts
  if (upper.includes('PLATFORM_NOTIFICATIONS')) {
    if (!mockStore.platform_notifications) mockStore.platform_notifications = [];

    if (upper.startsWith('INSERT INTO') || upper.includes('INSERT INTO PUBLIC.PLATFORM_NOTIFICATIONS') || upper.includes('INSERT INTO PLATFORM_NOTIFICATIONS')) {
      const hasExplicitTargetRole = upper.includes('TARGET_ROLE');
      let targetTenantId: number | null = null;
      let targetRole = 'ALL';
      let title = '';
      let message = '';
      let type = 'INFO';
      let actionUrl = '';
      let actionLabel = '';

      if (hasExplicitTargetRole) {
        targetTenantId = params[0] !== undefined && params[0] !== null ? Number(params[0]) : null;
        targetRole = String(params[1] || 'ALL').toUpperCase();
        title = String(params[2] || '');
        message = String(params[3] || '');
        type = String(params[4] || 'INFO');
        actionUrl = String(params[5] || '');
        actionLabel = String(params[6] || '');
      } else {
        targetTenantId = params[0] !== undefined && params[0] !== null ? Number(params[0]) : null;
        title = String(params[1] || '');
        message = String(params[2] || '');
        type = String(params[3] || 'INFO');
        actionUrl = String(params[4] || '');
        actionLabel = String(params[5] || '');
      }

      const titleLower = title.toLowerCase();
      const actionUrlLower = actionUrl.toLowerCase();
      if (
        titleLower.includes('new free trial') ||
        titleLower.includes('renewal request') ||
        actionUrlLower.includes('/superadmin')
      ) {
        targetRole = 'SUPERADMIN';
        targetTenantId = null;
      }

      const entry = {
        id: nextMockId('platform_notifications'),
        tenant_id: targetTenantId,
        target_role: targetRole,
        title,
        message,
        type,
        action_url: actionUrl,
        action_label: actionLabel,
        created_by: null,
        expires_at: null,
        created_at: new Date().toISOString(),
      };
      mockStore.platform_notifications.unshift(entry);
      return { rows: [entry as unknown as T], rowCount: 1 };
    }

    if (upper.startsWith('SELECT')) {
      const tenantId = params.length > 0 && params[0] !== null && params[0] !== undefined ? Number(params[0]) : 1;
      const userId = params.length > 1 && params[1] !== null && params[1] !== undefined ? Number(params[1]) : 0;
      const role = params.length > 2 && params[2] !== null && params[2] !== undefined ? String(params[2]).toUpperCase() : 'CASHIER';

      const reads = mockStore.platform_notification_reads || [];
      const nowMs = Date.now();
      const list = (mockStore.platform_notifications || []).filter((pn: any) => {
        // Expiry check
        if (pn.expires_at) {
          const expTime = new Date(pn.expires_at).getTime();
          if (!isNaN(expTime) && expTime <= nowMs) {
            return false;
          }
        }

        const notifRole = (pn.target_role || 'ALL').toUpperCase();
        const notifTitle = (pn.title || '').toLowerCase();
        const notifMsg = (pn.message || '').toLowerCase();
        const notifAction = (pn.action_url || '').toLowerCase();

        const isSuperAdminOnly =
          notifRole === 'SUPERADMIN' ||
          notifTitle.includes('new free trial') ||
          notifTitle.includes('renewal request') ||
          notifMsg.includes('free tier store registered') ||
          notifMsg.includes('subscription renewal') ||
          notifAction.includes('/superadmin');

        if (role === 'SUPERADMIN') {
          if (notifTitle.includes('welcome to sarbaazsoft')) return false;
          return true;
        }

        // NON-SUPERADMIN (Store Owners, Cashiers, Public) MUST NEVER SEE SUPERADMIN NOTIFICATIONS
        if (isSuperAdminOnly) return false;

        if (role === 'ADMIN') {
          if (pn.tenant_id !== null && Number(pn.tenant_id) !== tenantId) return false;
          return notifRole === 'ALL' || notifRole === 'ADMIN';
        }

        if (role === 'CASHIER') {
          if (notifTitle.includes('welcome to sarbaazsoft')) return false;
          if (pn.tenant_id !== null && Number(pn.tenant_id) !== tenantId) return false;
          return notifRole === 'ALL' || notifRole === 'CASHIER';
        }

        return notifRole === 'ALL';
      });

      let rows = list.map((pn: any) => {
        const isRead = reads.some((r: any) => Number(r.notification_id) === Number(pn.id) && (Number(r.tenant_id) === tenantId || Number(r.user_id) === userId));
        return {
          ...pn,
          is_read: isRead,
          created_by_name: 'Platform SuperAdmin',
          read_count: '0',
          store_name: pn.tenant_id ? (mockStore.tenants.find((t) => Number(t.id) === Number(pn.tenant_id))?.name || 'Store') : 'All Stores (Platform Broadcast)',
        };
      });

      // Filter out dismissed if queried with NOT EXISTS
      if (upper.includes('NOT EXISTS') && upper.includes('PLATFORM_NOTIFICATION_READS')) {
        rows = rows.filter((r) => !r.is_read);
      }

      return { rows: rows as unknown as T[], rowCount: rows.length };
    }

    if (upper.startsWith('DELETE FROM')) {
      const targetId = Number(params[0]);
      mockStore.platform_notifications = (mockStore.platform_notifications || []).filter((pn: any) => Number(pn.id) !== targetId);
      return { rows: [], rowCount: 1 };
    }

    if (upper.startsWith('UPDATE')) {
      if (upper.includes('EXPIRES_AT = NOW()')) {
        const nowIso = new Date().toISOString();
        const targetTid = params.length > 0 && params[0] !== undefined ? Number(params[0]) : null;
        for (const pn of mockStore.platform_notifications || []) {
          if (!targetTid || Number(pn.tenant_id) === targetTid || pn.target_role === 'SUPERADMIN') {
            const title = (pn.title || '').toLowerCase();
            const msg = (pn.message || '').toLowerCase();
            if (
              title.includes('renewal') ||
              title.includes('subscription') ||
              title.includes('free trial') ||
              msg.includes('renewal') ||
              msg.includes('subscription')
            ) {
              pn.expires_at = nowIso;
            }
          }
        }
        return { rows: [], rowCount: 1 };
      }

      for (const pn of mockStore.platform_notifications || []) {
        const notifTitle = (pn.title || '').toLowerCase();
        if (notifTitle.includes('new free trial') || notifTitle.includes('renewal request')) {
          pn.target_role = 'SUPERADMIN';
          pn.tenant_id = null;
        }
      }
      return { rows: [], rowCount: 1 };
    }

    return { rows: [], rowCount: 0 };
  }

  if (upper.includes('PLATFORM_NOTIFICATION_READS')) {
    if (!mockStore.platform_notification_reads) mockStore.platform_notification_reads = [];
    if (upper.startsWith('INSERT INTO')) {
      const notifId = Number(params[0] || 0);
      const tid = Number(params[1] || 1);
      const uid = Number(params[2] || 0);
      mockStore.platform_notification_reads.push({
        notification_id: notifId,
        tenant_id: tid,
        user_id: uid,
        read_at: new Date().toISOString(),
      });
      return { rows: [], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  if (upper.includes('POS_NOTIFICATION_DISMISSALS')) {
    if (!mockStore.pos_notification_dismissals) mockStore.pos_notification_dismissals = [];
    if (upper.startsWith('INSERT INTO')) {
      const tid = Number(params[0] || 1);
      const uid = Number(params[1] || 0);
      const itemType = String(params[2] || 'SALE');
      const itemId = Number(params[3] || 0);
      const existing = mockStore.pos_notification_dismissals.find(
        (d) => d.tenant_id === tid && d.user_id === uid && d.item_type === itemType && d.item_id === itemId
      );
      if (!existing) {
        mockStore.pos_notification_dismissals.push({
          id: nextMockId('pos_notification_dismissals'),
          tenant_id: tid,
          user_id: uid,
          item_type: itemType,
          item_id: itemId,
          dismissed_at: new Date().toISOString(),
        });
      }
      return { rows: [], rowCount: 1 };
    }
    if (upper.startsWith('SELECT')) {
      return { rows: (mockStore.pos_notification_dismissals || []) as unknown as T[], rowCount: mockStore.pos_notification_dismissals?.length || 0 };
    }
    return { rows: [], rowCount: 0 };
  }

  // SuperAdmin & Store report queries joining products + tenants
  if (upper.startsWith('SELECT') && upper.includes('FROM PRODUCTS P') && upper.includes('JOIN TENANTS T')) {
    if (upper.includes('GROUP BY COALESCE(NULLIF(TRIM(P.CATEGORY)')) {
      const map = new Map<string, { name: string; product_count: number; total_stock: number; units_sold: number; total_revenue: number }>();
      for (const p of mockStore.products.filter((x) => x.active !== false)) {
        const key = (p.category || 'General').trim() || 'General';
        const cur = map.get(key) || { name: key, product_count: 0, total_stock: 0, units_sold: 0, total_revenue: 0 };
        cur.product_count += 1;
        cur.total_stock += Number(p.total_stock || 0);
        const items = mockStore.sale_items.filter((si) => Number(si.product_id) === Number(p.id));
        cur.units_sold += items.reduce((s, i) => s + Number(i.quantity || 0), 0);
        cur.total_revenue += items.reduce((s, i) => s + Number(i.subtotal || 0), 0);
        map.set(key, cur);
      }
      const rows = Array.from(map.values()).map((c) => ({
        name: c.name,
        product_count: String(c.product_count),
        total_stock: String(c.total_stock),
        units_sold: String(c.units_sold),
        total_revenue: String(c.total_revenue),
      })) as unknown as T[];
      return { rows, rowCount: rows.length };
    }

    if (upper.includes('GROUP BY COALESCE(NULLIF(TRIM(P.BRAND)')) {
      const map = new Map<string, { name: string; product_count: number; total_stock: number; units_sold: number; total_revenue: number }>();
      for (const p of mockStore.products.filter((x) => x.active !== false)) {
        const key = (p.brand || 'Unbranded').trim() || 'Unbranded';
        const cur = map.get(key) || { name: key, product_count: 0, total_stock: 0, units_sold: 0, total_revenue: 0 };
        cur.product_count += 1;
        cur.total_stock += Number(p.total_stock || 0);
        const items = mockStore.sale_items.filter((si) => Number(si.product_id) === Number(p.id));
        cur.units_sold += items.reduce((s, i) => s + Number(i.quantity || 0), 0);
        cur.total_revenue += items.reduce((s, i) => s + Number(i.subtotal || 0), 0);
        map.set(key, cur);
      }
      const rows = Array.from(map.values()).map((b) => ({
        name: b.name,
        product_count: String(b.product_count),
        total_stock: String(b.total_stock),
        units_sold: String(b.units_sold),
        total_revenue: String(b.total_revenue),
      })) as unknown as T[];
      return { rows, rowCount: rows.length };
    }

    const rows = mockStore.products
      .filter((p) => p.active !== false)
      .map((p) => {
        const t = mockStore.tenants.find((tn) => Number(tn.id) === Number(p.tenant_id)) || mockStore.tenants[0];
        const cs = mockStore.company_settings.find((c) => Number(c.tenant_id) === Number(p.tenant_id));
        const items = mockStore.sale_items.filter((si) => Number(si.product_id) === Number(p.id));
        const unitsSold = items.reduce((s, i) => s + Number(i.quantity || 0), 0);
        const totalRev = items.reduce((s, i) => s + Number(i.subtotal || 0), 0);
        return {
          id: p.id,
          tenant_id: p.tenant_id,
          store_name: t?.name || 'Baloch Shoes',
          currency: cs?.currency || 'PKR',
          product_name: p.article || p.name || 'Shoe Item',
          name: p.name || 'Shoe Item',
          article: p.article || '',
          barcode: p.barcode || '',
          brand: p.brand || 'Unbranded',
          category: p.category || 'General',
          primary_image_url: p.primary_image_url || '',
          max_price: String(p.max_price || 0),
          selling_price: String(p.max_price || 0),
          cost_price: String(p.cost_price || 0),
          total_stock: String(p.total_stock || 0),
          low_stock_limit: String(p.low_stock_limit || 5),
          units_sold: String(unitsSold),
          total_revenue: String(totalRev),
          gross_revenue: String(totalRev),
          order_count: String(items.length),
        };
      }) as unknown as T[];
    return { rows, rowCount: rows.length };
  }

  // TENANTS queries (SELECT, INSERT, UPDATE, DELETE)
  if (upper.startsWith('SELECT') && upper.includes('FROM TENANTS')) {
    if (upper.includes('COUNT(*)::INT AS CNT') && upper.includes('MAX(ID)')) {
      const cnt = mockStore.tenants.length;
      const maxId = mockStore.tenants.reduce((m, t) => Math.max(m, Number(t.id || 0)), 0);
      return { rows: [{ cnt, max_id: maxId } as unknown as T], rowCount: 1 };
    }
    if (upper.includes('AS NEXT_ID') && upper.includes('LEFT JOIN TENANTS T2')) {
      const usedIds = new Set(mockStore.tenants.map((t) => Number(t.id)));
      let candidate = 1;
      while (usedIds.has(candidate)) {
        candidate++;
      }
      return { rows: [{ next_id: candidate } as unknown as T], rowCount: 1 };
    }

    const isJoinedStoreQuery =
      upper.includes('JOIN COMPANY_SETTINGS') ||
      upper.includes('PRODUCT_COUNT') ||
      upper.includes('INVENTORY_VALUE') ||
      upper.includes('TOTAL_STOCK_UNITS');

    let rows = mockStore.tenants.map((t) => {
      if (!isJoinedStoreQuery) {
        return { ...t };
      }

      const owner = mockStore.users.find((u) => Number(u.tenant_id) === Number(t.id) && u.role === 'ADMIN');
      const cs = mockStore.company_settings.find((c) => Number(c.tenant_id) === Number(t.id));
      const storeProducts = mockStore.products.filter((p) => Number(p.tenant_id) === Number(t.id) && p.active !== false);
      const storeSales = mockStore.sales.filter((s) => Number(s.tenant_id) === Number(t.id));
      const storeSaleItems = mockStore.sale_items.filter((si) => Number(si.tenant_id) === Number(t.id));
      const storeStaff = mockStore.users.filter((u) => Number(u.tenant_id) === Number(t.id) && u.role !== 'SUPERADMIN');
      const storeCashiers = mockStore.users.filter((u) => Number(u.tenant_id) === Number(t.id) && u.role === 'CASHIER');
      const storeCustomers = mockStore.customers.filter((c) => Number(c.tenant_id) === Number(t.id));
      const storeSuppliers = mockStore.suppliers.filter((sp) => Number(sp.tenant_id) === Number(t.id));

      const rowResult: any = {
        ...t,
        business_type: cs?.business_type || 'RETAIL',
        pricing_mode: cs?.pricing_mode || 'FIXED',
        name: t.name || cs?.name || 'Baloch Shoes',
        admin_user_id: owner?.id || null,
        owner_name: owner?.name || 'Store Owner',
        admin_name: owner?.name || 'Store Owner',
        owner_email: owner?.email || cs?.email || `admin+${t.id}@store.com`,
        admin_email: owner?.email || cs?.email || `admin+${t.id}@store.com`,
        owner_phone: owner?.phone || cs?.phone || '',
        admin_phone: owner?.phone || cs?.phone || '',
        logo_url: cs?.logo || t.logo_url || '/pwa-512x512.png',
        address: cs?.address || t.address || '',
        tax_id: cs?.tax_id || t.tax_id || '',
        currency: cs?.currency || t.currency || 'PKR',
        product_count: String(storeProducts.length),
        total_stock_units: String(storeProducts.reduce((sum, p) => sum + Number(p.total_stock || 0), 0)),
        sales_count: String(storeSales.length),
        total_sales_revenue: String(storeSales.reduce((sum, s) => sum + Number(s.total_amount || 0), 0)),
        staff_count: String(storeStaff.length),
        cashier_count: storeCashiers.length,
        customer_count: String(storeCustomers.length),
        supplier_count: String(storeSuppliers.length),
        units_sold: String(storeSaleItems.reduce((sum, si) => sum + Number(si.quantity || 0), 0)),
        inventory_value: String(
          storeProducts.reduce((sum, p) => sum + Number(p.total_stock || 0) * Number(p.max_price || 0), 0)
        ),
      };

      if (upper.includes('MIN_SELLING_QUANTITY') || upper.includes('CS.MIN_SELLING_QUANTITY')) {
        rowResult.min_selling_quantity = cs?.min_selling_quantity !== undefined ? Number(cs.min_selling_quantity) : 1.0;
      }
      if (upper.includes('ALLOW_HALF_CARTON') || upper.includes('CS.ALLOW_HALF_CARTON')) {
        rowResult.allow_half_carton = cs?.allow_half_carton !== undefined ? Boolean(cs.allow_half_carton) : true;
      }

      return rowResult;
    });

    if (upper.includes('WHERE ($1::INTEGER IS NOT NULL AND ID = $1)')) {
      rows = rows.filter(
        (r) =>
          (params[0] !== null && params[0] !== undefined && Number(r.id) === Number(params[0])) ||
          String(r.name).toLowerCase() === String(params[1] || '').toLowerCase()
      );
    } else if (upper.includes('WHERE ID = ANY($1')) {
      const ids: number[] = Array.isArray(params[0]) ? params[0].map(Number) : [];
      rows = rows.filter((r) => ids.includes(Number(r.id)));
    } else if (upper.includes('WHERE T.ID = $1') || upper.includes('WHERE ID = $1')) {
      rows = rows.filter((r) => Number(r.id) === Number(params[0]));
    }
    return { rows: rows as unknown as T[], rowCount: rows.length };
  }

  if (upper.startsWith('INSERT INTO TENANTS')) {
    const hasExplicitId = params.length >= 7;
    const usedIds = new Set(mockStore.tenants.map((t) => Number(t.id)));
    let recycledId = 1;
    while (usedIds.has(recycledId)) {
      recycledId++;
    }
    const tenantId = hasExplicitId ? Number(params[0]) || recycledId : recycledId;
    const tenantName = String((hasExplicitId ? params[1] : params[0]) || 'New Shoe Store').trim();
    let subPlan = 'YEARLY';
    let subStart = new Date().toISOString();
    let subEnd = new Date(Date.now() + 86400000 * 365).toISOString();
    let subStatus = 'ACTIVE';

    if (hasExplicitId) {
      if (upper.includes('SUBSCRIPTION_TYPE')) {
        const subType = String(params[2] || 'free_tier');
        subPlan = String(params[3] || subType || 'free_tier');
        subStart = params[4] || subStart;
        subEnd = params[5] || subEnd;
        subStatus = String(params[6] || 'ACTIVE');
      } else {
        subPlan = String(params[2] || 'YEARLY');
        subStart = params[3] || subStart;
        subEnd = params[4] || subEnd;
        subStatus = String(params[5] || 'ACTIVE');
      }
    }

    if (subPlan === 'TRIAL' && !params[5]) {
      subEnd = new Date(Date.now() + 86400000 * 30).toISOString();
    }

    const newTenant = {
      id: tenantId,
      name: tenantName,
      status: 'ACTIVE',
      subscription_type: subPlan === '6_MONTHS' ? '6_months' : subPlan === 'YEARLY' ? '1_year' : 'free_tier',
      subscription_plan: subPlan,
      subscription_start_date: subStart,
      subscription_end_date: subEnd,
      subscription_status: subStatus,
      logo_url: '/pwa-512x512.png',
      address: '',
      tax_id: '',
      currency: 'PKR',
      onboarding_completed: false,
      deleted_product_ids: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    mockStore.tenants.push(newTenant);
    mockStore.tenants.sort((a, b) => Number(a.id) - Number(b.id));
    return { rows: [newTenant as unknown as T], rowCount: 1 };
  }

  if (upper.startsWith('UPDATE TENANTS')) {
    if (upper.includes('WHERE SUBSCRIPTION_END_DATE IS NOT NULL')) {
      for (const t of mockStore.tenants) {
        if (t.subscription_end_date && new Date(t.subscription_end_date).getTime() < Date.now() && t.subscription_status !== 'SUSPENDED') {
          t.subscription_status = 'EXPIRED';
        }
      }
      return { rows: [], rowCount: 0 };
    }
    const targetId = Number(params[params.length - 1]);
    const tenant = mockStore.tenants.find((t) => Number(t.id) === targetId);
    if (!tenant) return { rows: [], rowCount: 0 };

    if (upper.includes('ARRAY_REMOVE') && upper.includes('DELETED_PRODUCT_IDS')) {
      const usedNo = Number(params[0]);
      tenant.deleted_product_ids = (Array.isArray(tenant.deleted_product_ids) ? tenant.deleted_product_ids : []).filter(
        (n: number) => Number(n) !== usedNo
      );
      tenant.updated_at = new Date().toISOString();
      return { rows: [tenant as unknown as T], rowCount: 1 };
    }
    if (upper.includes('ARRAY_APPEND') && upper.includes('DELETED_PRODUCT_IDS')) {
      const deletedNo = Number(params[0]);
      if (Number.isInteger(deletedNo) && deletedNo >= 1) {
        const currentIds = Array.isArray(tenant.deleted_product_ids) ? tenant.deleted_product_ids.map(Number) : [];
        tenant.deleted_product_ids = [...new Set([...currentIds, deletedNo])]
          .filter((n) => Number.isInteger(n) && n >= 1)
          .sort((a, b) => a - b);
      }
      tenant.updated_at = new Date().toISOString();
      return { rows: [tenant as unknown as T], rowCount: 1 };
    }
    if (upper.includes('SET DELETED_PRODUCT_IDS = $1')) {
      const nextIds = Array.isArray(params[0]) ? params[0].map(Number).filter((n: number) => Number.isInteger(n) && n >= 1) : [];
      tenant.deleted_product_ids = [...new Set(nextIds)].sort((a, b) => a - b);
      tenant.updated_at = new Date().toISOString();
      return { rows: [tenant as unknown as T], rowCount: 1 };
    }

    if (upper.includes('SET NAME = $1') && upper.includes('SUBSCRIPTION_PLAN = $2') && upper.includes('SUBSCRIPTION_TYPE = $3') && params.length >= 8) {
      tenant.name = String(params[0] || tenant.name);
      tenant.subscription_plan = String(params[1] || tenant.subscription_plan);
      tenant.subscription_type = String(params[2] || (tenant.subscription_plan === '6_MONTHS' ? '6_months' : tenant.subscription_plan === 'YEARLY' ? '1_year' : 'free_tier'));
      tenant.subscription_start_date = params[3] || tenant.subscription_start_date;
      tenant.subscription_end_date = params[4] || tenant.subscription_end_date;
      tenant.subscription_status = String(params[5] || tenant.subscription_status);
      tenant.status = String(params[6] || tenant.status);
    } else if (upper.includes('SET NAME = $1') && upper.includes('SUBSCRIPTION_PLAN = $2') && params.length >= 7) {
      tenant.name = String(params[0] || tenant.name);
      tenant.subscription_plan = String(params[1] || tenant.subscription_plan);
      tenant.subscription_type =
        tenant.subscription_plan === '6_MONTHS' ? '6_months' : tenant.subscription_plan === 'YEARLY' ? '1_year' : 'free_tier';
      tenant.subscription_start_date = params[2] || tenant.subscription_start_date;
      tenant.subscription_end_date = params[3] || tenant.subscription_end_date;
      tenant.subscription_status = String(params[4] || tenant.subscription_status);
      tenant.status = String(params[5] || tenant.status);
    } else if (upper.includes('SET NAME = $1') && (upper.includes('ONBOARDING_COMPLETED = TRUE') || params.length === 2)) {
      tenant.name = String(params[0] || tenant.name);
      if (upper.includes('ONBOARDING_COMPLETED = TRUE')) {
        tenant.status = 'ACTIVE';
        tenant.onboarding_completed = true;
      }
    } else if (upper.includes('SET SUBSCRIPTION_PLAN = $1') && upper.includes('SUBSCRIPTION_TYPE = $2') && params.length >= 6) {
      tenant.subscription_plan = String(params[0] || tenant.subscription_plan);
      tenant.subscription_type = String(params[1] || (tenant.subscription_plan === '6_MONTHS' ? '6_months' : tenant.subscription_plan === 'YEARLY' ? '1_year' : 'free_tier'));
      tenant.subscription_start_date = params[2] || tenant.subscription_start_date;
      tenant.subscription_end_date = params[3] || tenant.subscription_end_date;
      tenant.subscription_status = String(params[4] || tenant.subscription_status);
    } else if (upper.includes('SET SUBSCRIPTION_PLAN = $1') && params.length === 5) {
      tenant.subscription_plan = String(params[0] || tenant.subscription_plan);
      tenant.subscription_type =
        tenant.subscription_plan === '6_MONTHS' ? '6_months' : tenant.subscription_plan === 'YEARLY' ? '1_year' : 'free_tier';
      tenant.subscription_start_date = params[1] || tenant.subscription_start_date;
      tenant.subscription_end_date = params[2] || tenant.subscription_end_date;
      tenant.subscription_status = String(params[3] || tenant.subscription_status);
    } else if (upper.includes('SET SUBSCRIPTION_PLAN = $1') && params.length === 4) {
      tenant.subscription_plan = String(params[0] || tenant.subscription_plan);
      tenant.subscription_type =
        tenant.subscription_plan === '6_MONTHS' ? '6_months' : tenant.subscription_plan === 'YEARLY' ? '1_year' : 'free_tier';
      tenant.subscription_start_date = params[1] || tenant.subscription_start_date;
      tenant.subscription_end_date = params[2] || tenant.subscription_end_date;
      tenant.subscription_status = 'ACTIVE';
      tenant.status = 'ACTIVE';
    } else if (upper.includes('SET STATUS = $1') && upper.includes('SUBSCRIPTION_STATUS = $2')) {
      tenant.status = String(params[0] || tenant.status);
      tenant.subscription_status = String(params[1] || tenant.subscription_status);
      tenant.subscription_end_date = params[2] || tenant.subscription_end_date;
    } else if (upper.includes("SET SUBSCRIPTION_STATUS = 'EXPIRED'")) {
      tenant.subscription_status = 'EXPIRED';
    }
    tenant.updated_at = new Date().toISOString();
    return { rows: [tenant as unknown as T], rowCount: 1 };
  }

  if (upper.startsWith('DELETE FROM TENANTS')) {
    const targetId = Number(params[0]);
    mockStore.tenants = mockStore.tenants.filter((t) => Number(t.id) !== targetId);
    return { rows: [], rowCount: 1 };
  }

  // STORE_REQUESTS queries (deprecated & dropped)
  if (upper.includes('STORE_REQUESTS')) {
    return { rows: [], rowCount: 0 };
  }

  // USERS count queries (only when querying FROM USERS directly)
  if (upper.startsWith('SELECT') && upper.includes('FROM USERS') && upper.includes('COUNT(*)') && !upper.includes('FROM TENANTS')) {
    if (upper.includes("UPPER(ROLE) = 'SUPERADMIN'") || upper.includes("SUPERADMIN")) {
      const count = mockStore.users.filter((u) => String(u.role).toUpperCase() === 'SUPERADMIN' && u.active).length;
      return { rows: [{ count: String(count) } as unknown as T], rowCount: 1 };
    }
    const total = mockStore.users.length;
    const admins = mockStore.users.filter((u) => u.role === 'ADMIN' && u.status === 'APPROVED').length;
    return { rows: [{ total: String(total), admins: String(admins) } as unknown as T], rowCount: 1 };
  }

  // COMPANY_SETTINGS queries (SELECT, INSERT, UPDATE, DELETE)
  if (upper.startsWith('SELECT') && upper.includes('FROM COMPANY_SETTINGS')) {
    let rows = mockStore.company_settings.map((cs) => ({
      ...cs,
      name: mockStore.tenants.find((t) => Number(t.id) === Number(cs.tenant_id))?.name || cs.name || 'Baloch Shoes',
    }));
    if (params.length > 0 && (upper.includes('TENANT_ID = $1') || upper.includes('COALESCE(TENANT_ID, 1) = $1'))) {
      rows = rows.filter((cs) => Number(cs.tenant_id) === Number(params[0]));
    }
    return { rows: rows as unknown as T[], rowCount: rows.length };
  }

  if (upper.startsWith('INSERT INTO COMPANY_SETTINGS')) {
    const tid = Number(params[0]) || 1;
    const tenant = mockStore.tenants.find((t) => Number(t.id) === tid);

    let address = '';
    let phone = '';
    let email = '';
    let tax_id = '';
    let tax_rate = 0;
    let currency = 'PKR';
    let currency_symbol = 'Rs.';
    let invoice_footer = 'Thank you for shopping with us! Exchanges within 7 days with original receipt.';
    let pricing_mode = 'FIXED';
    let business_type = 'RETAIL';
    let min_selling_quantity = 1.0;
    let allow_half_carton = true;

    const colMatch = upper.match(/INSERT\s+INTO\s+COMPANY_SETTINGS\s*\(([^)]+)\)/i);
    const valMatch = upper.match(/VALUES\s*\(([^)]+)\)/i);

    if (colMatch && valMatch) {
      const cols = colMatch[1].split(',').map((c) => c.trim().toLowerCase());
      const valTokens = valMatch[1].split(',').map((v) => v.trim());
      let pIdx = 0;

      cols.forEach((col, idx) => {
        const token = valTokens[idx] || '';
        let v: any;
        if (token.startsWith('$')) {
          v = params[pIdx++];
        } else {
          v = token.replace(/^'|'$/g, '');
        }

        if (col === 'address') address = String(v || '');
        else if (col === 'phone') phone = String(v || '');
        else if (col === 'email') email = String(v || '');
        else if (col === 'tax_id') tax_id = String(v || '');
        else if (col === 'tax_rate') tax_rate = Number(v || 0);
        else if (col === 'currency') currency = String(v || 'PKR');
        else if (col === 'currency_symbol') currency_symbol = String(v || 'Rs.');
        else if (col === 'invoice_footer') invoice_footer = String(v || '');
        else if (col === 'pricing_mode') pricing_mode = String(v || 'FIXED');
        else if (col === 'business_type') business_type = String(v || 'RETAIL');
        else if (col === 'min_selling_quantity') min_selling_quantity = Number(v || 1.0);
        else if (col === 'allow_half_carton') allow_half_carton = Boolean(v);
      });
    }

    const newCs = {
      id: nextMockId('company_settings'),
      tenant_id: tid,
      name: tenant?.name || 'Shoe Store',
      logo: '/pwa-512x512.png',
      address,
      phone,
      email,
      website: '',
      strn: '',
      tax_id,
      tax_rate,
      currency,
      currency_name: currency === 'PKR' ? 'Pakistani Rupee' : currency === 'USD' ? 'US Dollar' : 'Currency',
      currency_symbol,
      invoice_footer,
      show_receipt_logo: false,
      receipt_logo: '',
      low_stock_limit: 5,
      pricing_mode,
      pricing_policy_locked: false,
      business_type,
      min_selling_quantity,
      allow_half_carton,
      updated_at: new Date().toISOString(),
    };
    mockStore.company_settings.push(newCs);
    return { rows: [newCs as unknown as T], rowCount: 1 };
  }

  if (upper.startsWith('UPDATE COMPANY_SETTINGS')) {
    const tid = Number(params[params.length - 1]) || 1;
    const cs = mockStore.company_settings.find((c) => Number(c.tenant_id) === tid);
    if (cs) {
      if (params.length >= 16) {
        cs.logo = params[0] ?? cs.logo;
        cs.address = params[1] ?? cs.address;
        cs.tax_id = params[2] ?? cs.tax_id;
        cs.strn = params[3] ?? cs.strn;
        cs.tax_rate = Number(params[4] ?? cs.tax_rate);
        cs.currency = params[5] ?? cs.currency;
        cs.currency_symbol = params[6] ?? cs.currency_symbol;
        if (params[7]) cs.phone = params[7];
        if (params[8]) cs.email = params[8];
        cs.invoice_footer = params[10] ?? cs.invoice_footer;
        cs.low_stock_limit = Number(params[11] ?? cs.low_stock_limit);
        cs.pricing_mode = params[12] ?? cs.pricing_mode;
        cs.pricing_policy_locked = true;
        if (upper.includes('MIN_SELLING_QUANTITY')) {
          const foundMin = params.find((p, i) => i >= 13 && typeof p === 'number' && (p === 0.5 || p === 1 || p === 1.0));
          if (foundMin !== undefined) cs.min_selling_quantity = foundMin;
          const foundHalf = params.find((p, i) => i >= 14 && typeof p === 'boolean');
          if (foundHalf !== undefined) cs.allow_half_carton = foundHalf;
        }
      }
      cs.updated_at = new Date().toISOString();
      return { rows: [cs as unknown as T], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  if (upper.startsWith('DELETE FROM COMPANY_SETTINGS')) {
    const tid = Number(params[0]);
    mockStore.company_settings = mockStore.company_settings.filter((c) => Number(c.tenant_id) !== tid);
    return { rows: [], rowCount: 1 };
  }

  // USERS queries (SELECT, INSERT, UPDATE, DELETE)
  if (upper.startsWith('SELECT') && upper.includes('FROM USERS')) {
    let rows = [...mockStore.users];
    if (upper.includes('WHERE ID = $1')) {
      const targetId = Number(params[0]);
      const targetTenantId = params.length >= 2 ? Number(params[1]) : null;
      rows = rows.filter((u) => {
        if (Number(u.id) !== targetId) return false;
        if (targetTenantId !== null && (upper.includes('TENANT_ID = $2') || upper.includes('OR TENANT_ID = $2'))) {
          if (String(u.role).toUpperCase() !== 'SUPERADMIN' && Number(u.tenant_id) !== targetTenantId) {
            return false;
          }
        }
        return true;
      });
    } else if (upper.includes('COALESCE(TENANT_ID, 1) = $2') && upper.includes('LOWER(EMAIL) = LOWER($1)')) {
      rows = rows.filter(
        (u) =>
          String(u.email).toLowerCase() === String(params[0] || '').toLowerCase() &&
          Number(u.tenant_id) === Number(params[1])
      );
    } else if (upper.includes("ROLE = 'ADMIN'") && upper.includes('TENANT_ID = $1')) {
      rows = rows.filter((u) => Number(u.tenant_id) === Number(params[0]) && u.role === 'ADMIN');
    } else if (upper.includes("ROLE = 'CASHIER'") && upper.includes('TENANT_ID = $1')) {
      rows = rows.filter((u) => Number(u.tenant_id) === Number(params[0]) && u.role === 'CASHIER');
    } else if (upper.includes("ROLE = 'ADMIN'")) {
      rows = rows.filter((u) => u.role === 'ADMIN' && (!upper.includes("STATUS = 'APPROVED'") || u.status === 'APPROVED'));
    } else if (upper.includes("ROLE = 'CASHIER'")) {
      rows = rows.filter((u) => u.role === 'CASHIER' && (!upper.includes("STATUS = 'APPROVED'") || u.status === 'APPROVED'));
    } else if (upper.includes("ROLE = 'SUPERADMIN'") && upper.includes('LOWER(EMAIL) = LOWER($1)')) {
      rows = rows.filter(
        (u) =>
          String(u.role).toUpperCase() === 'SUPERADMIN' &&
          String(u.email).toLowerCase() === String(params[0] || '').toLowerCase()
      );
    } else if (upper.includes("ROLE = 'SUPERADMIN'")) {
      rows = rows.filter((u) => String(u.role).toUpperCase() === 'SUPERADMIN' && (!upper.includes("STATUS = 'APPROVED'") || u.status === 'APPROVED'));
    } else if (upper.includes('LOWER(BTRIM(EMAIL)) = LOWER(BTRIM($1))') && upper.includes('ID != COALESCE($2, 0)')) {
      rows = rows.filter(
        (u) =>
          String(u.email).trim().toLowerCase() === String(params[0] || '').trim().toLowerCase() &&
          Number(u.id) !== Number(params[1] || 0)
      );
    } else if (upper.includes('LOWER(EMAIL) = LOWER($1)') && params.length >= 2) {
      rows = rows.filter(
        (u) =>
          String(u.email).toLowerCase() === String(params[0] || '').toLowerCase() &&
          Number(u.tenant_id) === Number(params[1])
      );
    } else if (
      upper.includes('LOWER(EMAIL) = LOWER($1)') ||
      upper.includes('LOWER(BTRIM(EMAIL)) = $1') ||
      upper.includes('LOWER(BTRIM(EMAIL)) = LOWER(BTRIM($1))')
    ) {
      rows = rows.filter((u) => String(u.email).trim().toLowerCase() === String(params[0] || '').trim().toLowerCase());
    } else if (upper.includes("UPPER(ROLE) = 'SUPERADMIN'") || (upper.includes('SUPERADMIN') && upper.includes('ROLE'))) {
      rows = rows.filter((u) => String(u.role).toUpperCase() === 'SUPERADMIN');
    } else if (upper.includes('TENANT_ID = $1') || upper.includes('COALESCE(TENANT_ID, 1) = $1')) {
      rows = rows.filter((u) => Number(u.tenant_id) === Number(params[0]));
    }
    return { rows: rows as unknown as T[], rowCount: rows.length };
  }

  if (upper.startsWith('INSERT INTO USERS')) {
    const candidateEmail = String(params[2] || 'user@example.com').trim().toLowerCase();
    const duplicate = mockStore.users.find(
      (u) => String(u.email || '').trim().toLowerCase() === candidateEmail
    );
    if (duplicate) {
      if (upper.includes('ON CONFLICT')) {
        return { rows: [], rowCount: 0 };
      }
      const dupErr: any = new Error('duplicate key value violates unique constraint "users_email_key"');
      dupErr.code = '23505';
      dupErr.constraint = 'users_email_key';
      throw dupErr;
    }
    const newUser = {
      id: nextMockId('users'),
      tenant_id: Number(params[0]) || 1,
      name: String(params[1] || 'User').trim(),
      email: candidateEmail,
      phone: params.length > 4 ? String(params[3] || '').trim() : '',
      avatar_url: '',
      password_hash: params.length > 4 ? params[4] : params[2],
      quick_password: params.length > 5 ? params[5] : '',
      role: upper.includes("'SUPERADMIN'") ? 'SUPERADMIN' : upper.includes("'CASHIER'") ? 'CASHIER' : 'ADMIN',
      status: upper.includes("'PENDING'") ? 'PENDING' : 'APPROVED',
      active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    mockStore.users.push(newUser);
    return { rows: [newUser as unknown as T], rowCount: 1 };
  }

  if (upper.startsWith('UPDATE USERS')) {
    if (upper.includes('SET PASSWORD_HASH = $1, QUICK_PASSWORD = $2')) {
      const uid = Number(params[2]);
      const u = mockStore.users.find((x) => Number(x.id) === uid);
      if (u) {
        u.password_hash = params[0];
        u.quick_password = params[1];
        u.status = 'APPROVED';
        u.active = true;
      }
      return { rows: u ? ([u] as unknown as T[]) : [], rowCount: u ? 1 : 0 };
    }
    if (upper.includes('SET QUICK_PASSWORD = $1')) {
      const uid = Number(params[1]);
      const u = mockStore.users.find((x) => Number(x.id) === uid);
      if (u) {
        u.quick_password = params[0];
        u.status = 'APPROVED';
        u.active = true;
      }
      return { rows: u ? ([u] as unknown as T[]) : [], rowCount: u ? 1 : 0 };
    }
    if (upper.includes('SET EMAIL = CASE WHEN $1')) {
      const uid = Number(params[2]);
      const u = mockStore.users.find((x) => Number(x.id) === uid);
      if (u) {
        if (params[0]) {
          const nextEmail = String(params[0]).trim().toLowerCase();
          const dup = mockStore.users.find(
            (x) => Number(x.id) !== uid && String(x.email || '').trim().toLowerCase() === nextEmail
          );
          if (dup) {
            const dupErr: any = new Error('duplicate key value violates unique constraint "users_email_key"');
            dupErr.code = '23505';
            dupErr.constraint = 'users_email_key';
            throw dupErr;
          }
          u.email = nextEmail;
        }
        u.phone = String(params[1] ?? u.phone);
      }
      return { rows: u ? ([u] as unknown as T[]) : [], rowCount: u ? 1 : 0 };
    }
    if (upper.includes('SET STATUS = $1')) {
      const statusVal = String(params[0] || 'APPROVED');
      const uid = Number(params[1]);
      const u = mockStore.users.find((x) => Number(x.id) === uid);
      if (u) {
        u.status = statusVal;
        u.updated_at = new Date().toISOString();
      }
      return { rows: u ? ([u] as unknown as T[]) : [], rowCount: u ? 1 : 0 };
    }
    if (upper.includes('SET ROLE = $1')) {
      const roleVal = String(params[0] || 'CASHIER');
      const uid = Number(params[1]);
      const u = mockStore.users.find((x) => Number(x.id) === uid);
      if (u) {
        u.role = roleVal;
        u.updated_at = new Date().toISOString();
      }
      return { rows: u ? ([u] as unknown as T[]) : [], rowCount: u ? 1 : 0 };
    }
    if (upper.includes('SET NAME = $1, PHONE = $2, AVATAR_URL = $3')) {
      const uid = Number(params[3]);
      const u = mockStore.users.find((x) => Number(x.id) === uid);
      if (u) {
        u.name = String(params[0]);
        u.phone = String(params[1]);
        u.avatar_url = String(params[2]);
        u.updated_at = new Date().toISOString();
      }
      return { rows: u ? ([u] as unknown as T[]) : [], rowCount: u ? 1 : 0 };
    }
    if (upper.includes('SET NAME = $1, EMAIL = $2, PHONE = $3, ROLE = $4, STATUS = $5')) {
      const uid = Number(params[7]);
      const u = mockStore.users.find((x) => Number(x.id) === uid);
      if (u) {
        u.name = String(params[0]);
        u.email = String(params[1]).trim().toLowerCase();
        u.phone = String(params[2]);
        u.role = String(params[3]);
        u.status = String(params[4]);
        if (params[5]) u.password_hash = params[5];
        if (params[6]) u.quick_password = params[6];
        u.updated_at = new Date().toISOString();
      }
      return { rows: u ? ([u] as unknown as T[]) : [], rowCount: u ? 1 : 0 };
    }
    if (upper.includes('SET NAME = $1 WHERE ID = $2')) {
      const u = mockStore.users.find((x) => Number(x.id) === Number(params[1]));
      if (u) u.name = String(params[0]);
      return { rows: u ? ([u] as unknown as T[]) : [], rowCount: u ? 1 : 0 };
    }
    if (upper.includes('SET EMAIL = $1 WHERE ID = $2')) {
      const uid = Number(params[1]);
      const u = mockStore.users.find((x) => Number(x.id) === uid);
      if (u) {
        const nextEmail = String(params[0] || '').trim().toLowerCase();
        const dup = mockStore.users.find(
          (x) => Number(x.id) !== uid && String(x.email || '').trim().toLowerCase() === nextEmail
        );
        if (dup) {
          const dupErr: any = new Error('duplicate key value violates unique constraint "users_email_key"');
          dupErr.code = '23505';
          dupErr.constraint = 'users_email_key';
          throw dupErr;
        }
        u.email = nextEmail;
      }
      return { rows: u ? ([u] as unknown as T[]) : [], rowCount: u ? 1 : 0 };
    }
    if (upper.includes('SET PHONE = $1 WHERE ID = $2')) {
      const u = mockStore.users.find((x) => Number(x.id) === Number(params[1]));
      if (u) u.phone = String(params[0]);
      return { rows: u ? ([u] as unknown as T[]) : [], rowCount: u ? 1 : 0 };
    }
    return { rows: [], rowCount: 0 };
  }

  if (upper.startsWith('DELETE FROM USERS')) {
    if (upper.includes("ROLE = 'CASHIER'")) {
      const tid = Number(params[0]);
      mockStore.users = mockStore.users.filter((u) => !(Number(u.tenant_id) === tid && u.role === 'CASHIER'));
    } else if (upper.includes("ROLE != 'SUPERADMIN'")) {
      const tid = Number(params[0]);
      mockStore.users = mockStore.users.filter((u) => !(Number(u.tenant_id) === tid && u.role !== 'SUPERADMIN'));
    } else if (params.length > 0) {
      const uid = Number(params[0]);
      mockStore.users = mockStore.users.filter((u) => Number(u.id) !== uid);
    }
    return { rows: [], rowCount: 1 };
  }

  // PRODUCTS queries
  if (upper.startsWith('SELECT') && upper.includes('FROM PRODUCTS')) {
    if (
      upper.includes('LOWER(BARCODE) = LOWER($1)') ||
      upper.includes('LOWER(TRIM(BARCODE)) = LOWER(TRIM($1))') ||
      upper.includes('LOWER(TRIM(BARCODE)) = LOWER($1)') ||
      upper.includes('BARCODE = $1')
    ) {
      const bc = String(params[0] || '').trim().toLowerCase();
      // Determine tenantId parameter index (usually $2, or $3 if id != $2)
      const hasIdNotEqualSecond = upper.includes('ID != $2');
      const tFilter = Number(hasIdNotEqualSecond ? params[2] : params[1]) || 1;
      const excludeId = hasIdNotEqualSecond
        ? (params[1] ? Number(params[1]) : null)
        : (params[2] ? Number(params[2]) : null);
      const matched = mockStore.products.filter(
        (p) =>
          Number(p.tenant_id || 1) === tFilter &&
          String(p.barcode || '').trim().toLowerCase() === bc &&
          (!excludeId || Number(p.id) !== excludeId)
      );
      return { rows: matched as unknown as T[], rowCount: matched.length };
    }
    if (
      upper.includes('LOWER(TRIM(ARTICLE)) = LOWER(TRIM($1))') ||
      upper.includes('LOWER(TRIM(ARTICLE)) = LOWER($1)') ||
      upper.includes('LOWER(ARTICLE) = LOWER($1)')
    ) {
      const art = String(params[0] || '').trim().toLowerCase();
      const hasIdNotEqualSecond = upper.includes('ID != $2');
      const tFilter = Number(hasIdNotEqualSecond ? params[2] : params[1]) || 1;
      const excludeId = hasIdNotEqualSecond
        ? (params[1] ? Number(params[1]) : null)
        : (params[2] ? Number(params[2]) : null);
      const matched = mockStore.products.filter(
        (p) =>
          Number(p.tenant_id || 1) === tFilter &&
          String(p.article || '').trim().toLowerCase() === art &&
          (!excludeId || Number(p.id) !== excludeId)
      );
      return { rows: matched as unknown as T[], rowCount: matched.length };
    }
    if (
      (upper.includes('WHERE P.ID = $1') || upper.includes('WHERE ID = $1')) &&
      (upper.includes('TENANT_ID') || params.length >= 2)
    ) {
      const targetId = Number(params[0]);
      const tFilter = Number(params[1] || 1);
      const matched = mockStore.products.filter(
        (p) => Number(p.id) === targetId && Number(p.tenant_id || 1) === tFilter
      );
      return { rows: matched as unknown as T[], rowCount: matched.length };
    }

    const tid = params.length > 0 ? Number(params[0]) : null;
    const storeProds = mockStore.products.filter(
      (p) => p.active !== false && (!tid || Number(p.tenant_id) === tid)
    );
    if (upper.includes('AS TOTAL_PRODUCTS') && upper.includes('AS OUT_OF_STOCK_COUNT')) {
      return {
        rows: [
          {
            total_products: String(storeProds.length),
            total_stock_units: String(storeProds.reduce((s, p) => s + Number(p.total_stock || 0), 0)),
            low_stock_count: String(
              storeProds.filter((p) => Number(p.total_stock || 0) <= Number(p.low_stock_limit || 5) && Number(p.total_stock || 0) > 0).length
            ),
            out_of_stock_count: String(storeProds.filter((p) => Number(p.total_stock || 0) <= 0).length),
          } as unknown as T,
        ],
        rowCount: 1,
      };
    }
    if (upper.includes('COUNT(*)::INT AS CNT') && upper.includes('MAX(TENANT_PRODUCT_NO)')) {
      const allTenantProds = mockStore.products.filter((p) => !tid || Number(p.tenant_id) === tid);
      const maxNo = allTenantProds.reduce((m, p) => Math.max(m, Number(p.tenant_product_no || p.id || 0)), 0);
      return { rows: [{ cnt: allTenantProds.length, max_no: maxNo } as unknown as T], rowCount: 1 };
    }
    if (upper.includes('TENANT_PRODUCT_NO = ANY($2')) {
      const candidates: number[] = Array.isArray(params[1]) ? params[1].map(Number) : [];
      const matched = mockStore.products
        .filter((p) => Number(p.tenant_id || 1) === Number(params[0] || 1) && candidates.includes(Number(p.tenant_product_no)))
        .map((p) => ({ tenant_product_no: p.tenant_product_no }));
      return { rows: matched as unknown as T[], rowCount: matched.length };
    }
    if (upper.includes('AS PRODUCT_ID') && upper.includes('AS UNITS_SOLD')) {
      const rows = storeProds.slice(0, 4).map((p) => ({
        product_id: p.id,
        name: p.article || p.name,
        category_name: p.category || '',
        stock: String(p.total_stock || 0),
        brand_name: p.brand || 'Unbranded',
        brand_logo: '',
        primary_image_url: p.primary_image_url || '',
        units_sold: 0,
      })) as unknown as T[];
      return { rows, rowCount: rows.length };
    }
    if (upper.includes('AS STOCK_COUNT') && upper.includes('GROUP BY P.BRAND')) {
      const rows = storeProds.map((p) => ({
        name: p.brand || 'Unbranded',
        stock_count: Number(p.total_stock || 0),
      })) as unknown as T[];
      return { rows, rowCount: rows.length };
    }
    return { rows: storeProds as unknown as T[], rowCount: storeProds.length };
  }

  if (upper.startsWith('INSERT INTO PRODUCTS')) {
    const tid = Number(params[0]) || 1;
    const storeProds = mockStore.products.filter((p) => Number(p.tenant_id) === tid);
    const isFullInsert = params.length >= 15;
    const hasAllowHalfCarton = upper.includes('ALLOW_HALF_CARTON');
    const newProd = isFullInsert
      ? {
          id: nextMockId('products'),
          tenant_id: tid,
          tenant_product_no: Number(params[1]) || storeProds.length + 1,
          name: String(params[2] || 'Shoe Product'),
          brand: String(params[3] || 'Unbranded'),
          category: String(params[4] || 'Men'),
          article: String(params[6] || 'SH-01'),
          barcode: String(params[7] || `BC-${Date.now()}`),
          primary_image_url: String(params[8] || ''),
          description: String(params[9] || ''),
          cost_price: Number(params[10] || 0),
          min_price: Number(params[11] || 0),
          max_price: Number(params[12] || 0),
          pairs_per_carton: params.length >= 16 ? Number(params[13] || 12) : 12,
          allow_half_carton: hasAllowHalfCarton ? Boolean(params.find((p, idx) => idx >= 13 && typeof p === 'boolean') ?? true) : true,
          total_stock: params.length >= 16 ? Number(params[14] || 0) : Number(params[13] || 0),
          low_stock_limit: params.length >= 16 ? Number(params[15] || 5) : Number(params[14] || 5),
          active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
      : {
          id: nextMockId('products'),
          tenant_id: tid,
          tenant_product_no: storeProds.length + 1,
          name: String(params[1] || 'Shoe Product'),
          article: String(params[1] || 'SH-01'),
          barcode: String(params[3] || `BC-${Date.now()}`),
          brand: String(params[4] || 'Unbranded'),
          category: String(params[5] || 'Casual Shoes'),
          cost_price: Number(params[6] || 2000),
          min_price: Number(params[7] || 3000),
          max_price: Number(params[8] || 3500),
          pairs_per_carton: 12,
          allow_half_carton: true,
          total_stock: Number(params[9] || 15),
          low_stock_limit: Number(params[10] || 5),
          primary_image_url: '',
          description: '',
          active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
    mockStore.products.push(newProd);
    return { rows: [newProd as unknown as T], rowCount: 1 };
  }

  if (upper.startsWith('UPDATE PRODUCTS')) {
    if (upper.includes('SET ALLOW_HALF_CARTON = FALSE')) {
      const tid = params.length > 0 ? Number(params[0]) : null;
      for (const p of mockStore.products) {
        if (!tid || Number(p.tenant_id || 1) === tid) {
          p.allow_half_carton = false;
        }
      }
      return { rows: [], rowCount: 1 };
    }
    if (upper.includes('WHERE ID = $17 AND COALESCE(TENANT_ID, 1) = $18') || upper.includes('WHERE ID = $16 AND COALESCE(TENANT_ID, 1) = $17') || upper.includes('WHERE ID = $15 AND COALESCE(TENANT_ID, 1) = $16')) {
      const targetId = Number(params[params.length - 2]);
      const tid = Number(params[params.length - 1]) || 1;
      const prod = mockStore.products.find((p) => Number(p.id) === targetId && Number(p.tenant_id || 1) === tid);
      if (prod) {
        prod.name = String(params[0] ?? prod.name);
        prod.brand = String(params[1] ?? prod.brand);
        prod.category = String(params[2] ?? prod.category);
        prod.article = String(params[4] ?? prod.article);
        prod.barcode = String(params[5] ?? prod.barcode);
        prod.pairs_per_carton = Number(params[6] ?? prod.pairs_per_carton ?? 12);
        prod.primary_image_url = String(params[7] ?? prod.primary_image_url);
        prod.description = String(params[8] ?? prod.description);
        prod.cost_price = Number(params[9] ?? prod.cost_price);
        prod.total_stock = Number(params[10] ?? prod.total_stock);
        prod.low_stock_limit = Number(params[11] ?? prod.low_stock_limit);
        prod.active = Boolean(params[12] ?? prod.active);
        prod.min_price = Number(params[13] ?? prod.min_price);
        prod.max_price = Number(params[14] ?? prod.max_price);
        if (upper.includes('ALLOW_HALF_CARTON = $')) {
          const foundBool = params.find((x) => typeof x === 'boolean');
          if (foundBool !== undefined) prod.allow_half_carton = foundBool;
        }
        prod.updated_at = new Date().toISOString();
        return { rows: [prod as unknown as T], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }
    if (upper.includes('SET ACTIVE = FALSE') && upper.includes('WHERE ID = $1')) {
      const targetId = Number(params[0]);
      const tid = Number(params[1]) || 1;
      const prod = mockStore.products.find((p) => Number(p.id) === targetId && Number(p.tenant_id || 1) === tid);
      if (prod) {
        prod.active = false;
        prod.updated_at = new Date().toISOString();
      }
      return { rows: prod ? ([prod] as unknown as T[]) : [], rowCount: prod ? 1 : 0 };
    }
    return { rows: [], rowCount: 0 };
  }

  if (upper.startsWith('DELETE FROM PRODUCTS')) {
    const targetId = Number(params[0]);
    const tid = params.length > 1 ? Number(params[1]) : null;
    mockStore.products = mockStore.products.filter(
      (p) => !(Number(p.id) === targetId && (!tid || Number(p.tenant_id || 1) === tid))
    );
    return { rows: [], rowCount: 1 };
  }

  // Sales / Dashboard aggregates
  if (upper.startsWith('SELECT') && upper.includes('FROM SALES')) {
    if (upper.includes('AS TOTAL_SALES') && upper.includes('AS TOTAL_DISCOUNT')) {
      return { rows: [{ count: '0', total_sales: '0', total_discount: '0' } as unknown as T], rowCount: 1 };
    }
    if (upper.includes('AS TOTAL_REVENUE') && upper.includes('AS TOTAL_PROFIT')) {
      return { rows: [{ total_revenue: '0', total_profit: '0', total_sales_count: '0' } as unknown as T], rowCount: 1 };
    }
    let sList = [...mockStore.sales];
    if (upper.includes('WHERE S.ID = $1') || upper.includes('WHERE ID = $1')) {
      const targetId = Number(params[0]);
      sList = sList.filter((s) => Number(s.id) === targetId);
    } else {
      const tid = params.length > 0 && params[0] !== undefined ? Number(params[0]) : null;
      if (tid && (upper.includes('TENANT_ID = $1') || upper.includes('S.TENANT_ID = $1'))) {
        sList = sList.filter((s: any) => Number(s.tenant_id) === tid);
      }
      const roleParam = params.find((p) => typeof p === 'string' && (p === 'CASHIER' || p === 'ADMIN' || p === 'SUPERADMIN'));
      if (roleParam === 'CASHIER') {
        const uid = params.length >= 2 && params[1] !== undefined ? Number(params[1]) : 0;
        if (uid > 0) {
          sList = sList.filter((s: any) => Number(s.created_by) === uid);
        }
      }
      if (upper.includes("INTERVAL '48 HOURS'")) {
        const cutoff = Date.now() - 48 * 3600 * 1000;
        sList = sList.filter((s: any) => new Date(s.created_at || s.sale_date).getTime() >= cutoff);
      }
      if (upper.includes('NOT EXISTS') && upper.includes('POS_NOTIFICATION_DISMISSALS')) {
        const dismissals = mockStore.pos_notification_dismissals || [];
        const uid = params.length >= 2 ? Number(params[1]) : 0;
        sList = sList.filter((s: any) => !dismissals.some((d: any) => d.item_type === 'SALE' && Number(d.item_id) === Number(s.id) && (Number(d.user_id) === uid || Number(d.user_id) === 0)));
      }
    }
    return { rows: sList as unknown as T[], rowCount: sList.length };
  }

  if (upper.startsWith('INSERT INTO SALES')) {
    const newSale = {
      id: nextMockId('sales'),
      tenant_id: Number(params[0] || 1),
      invoice_number: String(params[1] || 'INV-000001'),
      sale_type: String(params[2] || 'RETAIL'),
      customer_id: params[3] ? Number(params[3]) : null,
      subtotal: Number(params[4] || 0),
      discount: Number(params[5] || 0),
      total_amount: Number(params[6] || 0),
      total_cartons: Number(params[7] || 0),
      transport_name: String(params[8] || ''),
      bilty_number: String(params[9] || ''),
      booking_destination: String(params[10] || ''),
      previous_balance: Number(params[11] || 0),
      paid_amount: Number(params[12] || 0),
      remaining_balance: Number(params[13] || 0),
      payment_method: String(params[14] || 'CASH'),
      cash_received: Number(params[15] || 0),
      change_given: Number(params[16] || 0),
      created_by: Number(params[17] || 1),
      is_min_price_overridden: Boolean(params[18]),
      overridden_by: params[19] ? Number(params[19]) : null,
      notes: String(params[20] || ''),
      sale_date: params[21] ? String(params[21]) : new Date().toISOString().slice(0, 10),
      created_at: new Date().toISOString(),
    };
    mockStore.sales.unshift(newSale);
    return { rows: [{ id: newSale.id } as unknown as T], rowCount: 1 };
  }

  if (upper.startsWith('INSERT INTO SALE_ITEMS')) {
    const newItem = {
      id: nextMockId('sale_items'),
      tenant_id: Number(params[0] || 1),
      sale_id: Number(params[1]),
      product_id: Number(params[2]),
      product_name: String(params[3]),
      packing_type: String(params[4] || 'PAIR'),
      carton_quantity: Number(params[5] || 0),
      pairs_per_carton: Number(params[6] || 1),
      quantity: Number(params[7]),
      unit_price: Number(params[8]),
      discount: Number(params[9] || 0),
      subtotal: Number(params[10]),
      purchase_price: Number(params[11] || 0),
    };
    mockStore.sale_items.push(newItem);
    return { rows: [newItem as unknown as T], rowCount: 1 };
  }

  if (upper.startsWith('SELECT') && upper.includes('FROM SALE_ITEMS')) {
    if (upper.includes('AS PROFIT')) {
      return { rows: [{ profit: '0', cost: '0' } as unknown as T], rowCount: 1 };
    }
    if (upper.includes('WHERE SALE_ID = $1')) {
      const sid = Number(params[0]);
      const items = mockStore.sale_items.filter((i) => Number(i.sale_id) === sid);
      return { rows: items as unknown as T[], rowCount: items.length };
    }
    return { rows: mockStore.sale_items as unknown as T[], rowCount: mockStore.sale_items.length };
  }

  // CUSTOMERS
  if (upper.startsWith('SELECT') && upper.includes('FROM CUSTOMERS')) {
    if (upper.includes('COUNT(*)')) {
      return { rows: [{ count: String(mockStore.customers.length) } as unknown as T], rowCount: 1 };
    }
    let cList = [...mockStore.customers];
    if (upper.includes('WHERE C.ID = $1') || upper.includes('WHERE ID = $1')) {
      const cid = Number(params[0]);
      cList = cList.filter((c) => Number(c.id) === cid);
    }
    return { rows: cList as unknown as T[], rowCount: cList.length };
  }

  if (upper.startsWith('INSERT INTO CUSTOMERS')) {
    const newCust = {
      id: nextMockId('customers'),
      tenant_id: Number(params[0] || 1),
      name: String(params[1] || ''),
      phone: String(params[2] || ''),
      shop_name: String(params[3] || ''),
      market_name: String(params[4] || ''),
      city: String(params[5] || ''),
      email: String(params[6] || ''),
      address: String(params[7] || ''),
      notes: String(params[8] || ''),
      credit_limit: Number(params[9] || 0),
      current_balance: Number(params[10] || 0),
      outstanding_balance: Number(params[11] ?? params[10] ?? 0),
      ntn_number: String(params[12] || ''),
      created_at: new Date().toISOString(),
    };
    mockStore.customers.unshift(newCust);
    return { rows: [newCust as unknown as T], rowCount: 1 };
  }

  if (upper.startsWith('UPDATE CUSTOMERS')) {
    if (upper.includes('SET OUTSTANDING_BALANCE = $1') || upper.includes('SET CURRENT_BALANCE = $1')) {
      const newBal = Number(params[0]);
      const cid = Number(params[1]);
      const cust = mockStore.customers.find((c) => Number(c.id) === cid);
      if (cust) {
        cust.outstanding_balance = newBal;
        cust.current_balance = newBal;
      }
      return { rows: cust ? [cust as unknown as T] : [], rowCount: cust ? 1 : 0 };
    }
    const cid = Number(params[params.length - 2]);
    const cust = mockStore.customers.find((c) => Number(c.id) === cid);
    if (cust) {
      cust.name = String(params[0] ?? cust.name);
      cust.phone = String(params[1] ?? cust.phone);
      cust.shop_name = String(params[2] ?? cust.shop_name);
      cust.market_name = String(params[3] ?? cust.market_name);
      cust.city = String(params[4] ?? cust.city);
      cust.email = String(params[5] ?? cust.email);
      cust.address = String(params[6] ?? cust.address);
      cust.notes = String(params[7] ?? cust.notes);
      cust.credit_limit = Number(params[8] ?? cust.credit_limit);
      cust.current_balance = Number(params[9] ?? cust.current_balance);
      cust.outstanding_balance = Number(params[10] ?? cust.outstanding_balance);
      cust.ntn_number = String(params[11] ?? cust.ntn_number);
      return { rows: [cust as unknown as T], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  // CUSTOMER_LEDGER
  if (upper.startsWith('SELECT') && upper.includes('FROM CUSTOMER_LEDGER')) {
    let kList = [...mockStore.customer_ledger];
    if (upper.includes('WHERE CUSTOMER_ID = $1')) {
      const cid = Number(params[0]);
      kList = kList.filter((k) => Number(k.customer_id) === cid);
    }
    return { rows: kList as unknown as T[], rowCount: kList.length };
  }

  if (upper.startsWith('INSERT INTO CUSTOMER_LEDGER')) {
    const newEntry = {
      id: nextMockId('customer_ledger'),
      tenant_id: Number(params[0] || 1),
      customer_id: Number(params[1]),
      transaction_date: String(params[2] || new Date().toISOString().slice(0, 10)),
      invoice_id: params[3] ? Number(params[3]) : null,
      invoice_number: String(params[4] || ''),
      total_bill: Number(params[5] || 0),
      amount_paid: Number(params[6] || 0),
      balance_change: Number(params[7] || 0),
      running_balance: Number(params[8] || 0),
      payment_method: String(params[9] || 'KHATA'),
      notes: String(params[10] || ''),
      created_at: new Date().toISOString(),
    };
    mockStore.customer_ledger.unshift(newEntry);
    return { rows: [newEntry as unknown as T], rowCount: 1 };
  }

  if (upper.startsWith('SELECT') && upper.includes('FROM PURCHASES') && upper.includes('COUNT(*)')) {
    return { rows: [{ count: String(mockStore.purchases.length), total: '0' } as unknown as T], rowCount: 1 };
  }

  if (upper.startsWith('SELECT') && upper.includes('FROM CATEGORIES')) {
    return { rows: mockStore.categories as unknown as T[], rowCount: mockStore.categories.length };
  }

  if (upper.startsWith('SELECT') && upper.includes('FROM RETURNS')) {
    let rList = [...(mockStore.returns || [])];
    const tid = params.length > 0 && params[0] !== undefined ? Number(params[0]) : null;
    if (tid && (upper.includes('TENANT_ID = $1') || upper.includes('R.TENANT_ID = $1'))) {
      rList = rList.filter((r: any) => Number(r.tenant_id) === tid);
    }
    const roleParam = params.find((p) => typeof p === 'string' && (p === 'CASHIER' || p === 'ADMIN' || p === 'SUPERADMIN'));
    if (roleParam === 'CASHIER') {
      const uid = params.length >= 2 && params[1] !== undefined ? Number(params[1]) : 0;
      if (uid > 0) {
        rList = rList.filter((r: any) => Number(r.created_by) === uid);
      }
    }
    if (upper.includes("INTERVAL '48 HOURS'")) {
      const cutoff = Date.now() - 48 * 3600 * 1000;
      rList = rList.filter((r: any) => new Date(r.created_at || r.return_date).getTime() >= cutoff);
    }
    if (upper.includes('NOT EXISTS') && upper.includes('POS_NOTIFICATION_DISMISSALS')) {
      const dismissals = mockStore.pos_notification_dismissals || [];
      const uid = params.length >= 2 ? Number(params[1]) : 0;
      rList = rList.filter((r: any) => !dismissals.some((d: any) => d.item_type === 'RETURN' && Number(d.item_id) === Number(r.id) && (Number(d.user_id) === uid || Number(d.user_id) === 0)));
    }
    return { rows: rList as unknown as T[], rowCount: rList.length };
  }

  return { rows: [], rowCount: 0 };
}

function createDbInfo(url: string): DbConnectionInfo {
  let maskedUrl = 'postgresql://[in-memory-mock]';
  let host = 'in-memory-mock';
  let port = 5432;
  let database = 'postgres';
  let user = 'postgres';

  if (url) {
    try {
      const parsed = new URL(url);
      host = parsed.hostname || 'localhost';
      port = parsed.port ? parseInt(parsed.port, 10) : 5432;
      database = parsed.pathname ? parsed.pathname.replace(/^\//, '') : 'postgres';
      user = parsed.username || 'postgres';
      maskedUrl = `${parsed.protocol}//${user}:****@${host}:${port}/${database}`;
    } catch (_) {
      // Keep credentials masked if DATABASE_URL cannot be parsed.
    }
  }

  return {
    type: 'PostgreSQL Server',
    isStandardPostgres: true,
    host,
    port,
    database,
    user,
    ssl: true,
    maskedUrl,
    connected: false,
  };
}

function isValidDatabaseUrl(urlStr: string | undefined): boolean {
  if (!urlStr) return false;
  const trimmed = urlStr.trim();
  if (!trimmed.startsWith('postgres://') && !trimmed.startsWith('postgresql://')) return false;
  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname;
    if (!host) return false;
    if (host === 'localhost' || host === '127.0.0.1') return true;
    if (host.endsWith('-') || host.endsWith('.') || host.startsWith('-') || host.startsWith('.')) return false;
    const parts = host.split('.');
    if (parts.length < 2) return false;
    if (parts.some((p) => !p || p.startsWith('-') || p.endsWith('-'))) return false;
    return true;
  } catch {
    return false;
  }
}

if (!isValidDatabaseUrl(rawDatabaseUrl)) {
  console.log('ℹ️ Running in in-memory PostgreSQL store mode.');
  useMock = true;
  dbInfo = createDbInfo('');
  dbInfo.connected = true;
} else {
  dbInfo = createDbInfo(rawDatabaseUrl!);
  try {
    rawPool = new Pool({
      connectionString: rawDatabaseUrl,
      ssl: { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 15000,
      connectionTimeoutMillis: 5000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
    });

    rawPool.on('error', (err: any) => {
      if (useMock) return;
      const msg = err?.message || String(err);
      if (
        msg.includes('Connection terminated unexpectedly') ||
        msg.includes('ECONNRESET') ||
        msg.includes('connection reset') ||
        msg.includes('client has been closed') ||
        err?.code === '57P01'
      ) {
        return;
      }
      if (
        msg.includes('ENOTFOUND') ||
        msg.includes('ECONNREFUSED') ||
        msg.includes('ETIMEDOUT') ||
        msg.includes('EHOSTUNREACH')
      ) {
        useMock = true;
        if (rawPool) {
          try {
            rawPool.removeAllListeners();
            rawPool.on('error', () => {});
            rawPool.end().catch(() => {});
          } catch {}
          rawPool = null;
        }
        return;
      }
      dbInfo.lastError = msg;
    });
  } catch {
    useMock = true;
    dbInfo.connected = true;
  }
}

let readinessPromise: Promise<void> | null = null;

async function waitForDatabaseReady(): Promise<void> {
  if (useMock || dbInfo.connected) return;
  if (!rawPool) {
    useMock = true;
    dbInfo.connected = true;
    return;
  }
  if (!readinessPromise) {
    readinessPromise = (async () => {
      try {
        await rawPool!.query('SELECT 1');
        console.log(`✅ Connected to PostgreSQL Server (${dbInfo.host}:${dbInfo.port}/${dbInfo.database})`);
        dbInfo.connected = true;
        dbInfo.lastError = undefined;
        return;
      } catch (err: any) {
        console.log(`ℹ️ External PostgreSQL database unreachable — using in-memory mock store.`);
        useMock = true;
        dbInfo.connected = true;
        dbInfo.lastError = undefined;
        if (rawPool) {
          try {
            rawPool.removeAllListeners();
            rawPool.on('error', () => {});
            rawPool.end().catch(() => {});
          } catch {}
          rawPool = null;
        }
      }
    })().finally(() => {
      readinessPromise = null;
    });
  }
  return readinessPromise!;
}


// Unified PostgreSQL client interface used throughout the application.
export const pgClient = {
  get waitReady() {
    return waitForDatabaseReady();
  },

  async query<T = any>(text: string, params?: any[]): Promise<{ rows: T[]; rowCount?: number }> {
    await waitForDatabaseReady();
    if (useMock || !rawPool) {
      return executeMockQuery<T>(text, params);
    }

    const store = txStorage.getStore();
    const trimmed = text.trim().toUpperCase();

    const isTransientConnectionError = (err: any): boolean => {
      const msg = (err?.message || String(err)).toLowerCase();
      const code = err?.code;
      return (
        msg.includes('connection terminated') ||
        msg.includes('econnreset') ||
        msg.includes('connection reset') ||
        msg.includes('client was closed') ||
        msg.includes('socket hang up') ||
        msg.includes('terminating connection') ||
        msg.includes('closed the connection unexpectedly') ||
        code === '57P01' ||
        code === 'ECONNRESET' ||
        code === 'EPIPE'
      );
    };

    const formatRes = (res: any) => {
      if (Array.isArray(res)) {
        const last = res[res.length - 1] || {};
        return { rows: (last.rows || []) as T[], rowCount: last.rowCount ?? last.rows?.length ?? 0 };
      }
      return { rows: (res?.rows || []) as T[], rowCount: res?.rowCount ?? res?.rows?.length ?? 0 };
    };

    if (trimmed === 'BEGIN') {
      if (store) {
        if (!store.client) store.client = await rawPool.connect();
        const res = await store.client.query(text);
        return formatRes(res);
      }
      const client = await rawPool.connect();
      try {
        const res = await client.query(text);
        return formatRes(res);
      } finally {
        client.release();
      }
    }

    if (trimmed === 'COMMIT' || trimmed === 'ROLLBACK') {
      if (store?.client) {
        const client = store.client;
        store.client = null;
        try {
          const res = await client.query(text);
          client.release();
          return formatRes(res);
        } catch (txErr) {
          try { client.release(true); } catch (_) {}
          throw txErr;
        }
      }
      const res = await rawPool.query(text);
      return formatRes(res);
    }

    if (store?.client) {
      try {
        const res = await store.client.query(text, params);
        return formatRes(res);
      } catch (err: any) {
        if (isTransientConnectionError(err)) {
          try { store.client.release(true); } catch (_) {}
          store.client = null;
        }
        throw err;
      }
    }

    let lastErr: any;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await rawPool.query(text, params);
        return formatRes(res);
      } catch (err: any) {
        lastErr = err;
        if (attempt === 1 && isTransientConnectionError(err)) {
          console.warn(`⚠️ PostgreSQL connection reset during query (${err?.message || err}). Retrying...`);
          await new Promise((resolve) => setTimeout(resolve, 150));
          continue;
        }
        throw err;
      }
    }
    throw lastErr;
  },

  async exec(sql: string): Promise<void> {
    await waitForDatabaseReady();
    if (useMock || !rawPool) {
      return;
    }
    await rawPool.query(sql);
  },
};

export { dbInfo, rawPool };
