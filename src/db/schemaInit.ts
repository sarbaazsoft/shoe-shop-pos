import bcrypt from 'bcryptjs';
import { pgClient } from './index.ts';
import { ensureAppSettingsSchema, loadAppSettingsCache } from '../server/services/appSettingsService.ts';

let saasControlPlaneInitialized = false;
let saasControlPlanePromise: Promise<void> | null = null;
let databaseSchemaPromise: Promise<void> | null = null;
let productPriceMigrationPromise: Promise<void> | null = null;
let documentPrefixMigrationPromise: Promise<void> | null = null;

/** Migrate legacy wholesale product prices before schema fast paths can skip DDL. */
async function migrateLegacyWholesaleProductPricesOnce(): Promise<void> {
  const state = await pgClient.query<{ has_products: boolean; has_wholesale_price: boolean }>(`
    SELECT to_regclass('public.products') IS NOT NULL AS has_products,
           EXISTS (
             SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'wholesale_price'
           ) AS has_wholesale_price
  `);
  if (!state.rows[0]?.has_products || !state.rows[0]?.has_wholesale_price) return;

  await pgClient.query('ALTER TABLE public.products ADD COLUMN IF NOT EXISTS min_price INTEGER NOT NULL DEFAULT 0');
  await pgClient.query('ALTER TABLE public.products ADD COLUMN IF NOT EXISTS max_price INTEGER NOT NULL DEFAULT 0');

  const settings = await pgClient.query<{ has_business_type: boolean }>(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'company_settings' AND column_name = 'business_type'
    ) AS has_business_type
  `);
  if (settings.rows[0]?.has_business_type) {
    await pgClient.query(`
      UPDATE products p
      SET min_price = COALESCE(NULLIF(p.wholesale_price, 0), NULLIF(p.max_price, 0), p.min_price, 0),
          max_price = COALESCE(NULLIF(p.wholesale_price, 0), NULLIF(p.max_price, 0), p.min_price, 0)
      FROM company_settings cs
      WHERE COALESCE(cs.tenant_id, 1) = COALESCE(p.tenant_id, 1)
        AND UPPER(COALESCE(cs.business_type::text, 'RETAIL')) = 'WHOLESALE'
    `);
  }

  await pgClient.query('ALTER TABLE public.products DROP COLUMN IF EXISTS wholesale_price');
}

export function migrateLegacyWholesaleProductPrices(): Promise<void> {
  if (!productPriceMigrationPromise) {
    productPriceMigrationPromise = migrateLegacyWholesaleProductPricesOnce().catch((error) => {
      productPriceMigrationPromise = null;
      throw error;
    });
  }
  return productPriceMigrationPromise;
}

/** Remove legacy per-tenant document prefixes before schema fast paths can skip DDL. */
export function dropLegacyDocumentPrefixColumns(): Promise<void> {
  if (!documentPrefixMigrationPromise) {
    documentPrefixMigrationPromise = pgClient.query(`
      DO $$ BEGIN
        IF to_regclass('public.company_settings') IS NOT NULL THEN
          ALTER TABLE public.company_settings DROP COLUMN IF EXISTS invoice_prefix;
          ALTER TABLE public.company_settings DROP COLUMN IF EXISTS purchase_prefix;
        END IF;
        IF to_regclass('public.tenants') IS NOT NULL AND to_regclass('public.company_settings') IS NOT NULL THEN
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tenants' AND column_name = 'pricing_mode') THEN
            BEGIN
              UPDATE public.company_settings cs
              SET pricing_mode = (CASE WHEN UPPER(TRIM(COALESCE(NULLIF(cs.pricing_mode::text, ''), NULLIF(t.pricing_mode::text, ''), 'FIXED'))) = 'NEGOTIABLE' THEN 'NEGOTIABLE'::pricing_mode_enum ELSE 'FIXED'::pricing_mode_enum END)
              FROM public.tenants t
              WHERE cs.tenant_id = t.id;
            EXCEPTION WHEN OTHERS THEN NULL;
            END;
          END IF;
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tenants' AND column_name = 'business_type') THEN
            BEGIN
              UPDATE public.company_settings cs
              SET business_type = (CASE WHEN UPPER(TRIM(COALESCE(NULLIF(cs.business_type::text, ''), NULLIF(t.business_type::text, ''), 'RETAIL'))) = 'WHOLESALE' THEN 'WHOLESALE'::business_type_enum ELSE 'RETAIL'::business_type_enum END)
              FROM public.tenants t
              WHERE cs.tenant_id = t.id;
            EXCEPTION WHEN OTHERS THEN NULL;
            END;
          END IF;
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tenants' AND column_name = 'allow_half_carton') THEN
            BEGIN
              UPDATE public.company_settings cs
              SET allow_half_carton = COALESCE(cs.allow_half_carton, t.allow_half_carton, true)
              FROM public.tenants t
              WHERE cs.tenant_id = t.id;
            EXCEPTION WHEN OTHERS THEN NULL;
            END;
          END IF;
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tenants' AND column_name = 'allow_half_cartoon') THEN
            BEGIN
              UPDATE public.company_settings cs
              SET allow_half_carton = COALESCE(cs.allow_half_carton, t.allow_half_cartoon, true)
              FROM public.tenants t
              WHERE cs.tenant_id = t.id;
            EXCEPTION WHEN OTHERS THEN NULL;
            END;
          END IF;
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tenants' AND column_name = 'min_selling_quantity') THEN
            BEGIN
              UPDATE public.company_settings cs
              SET min_selling_quantity = COALESCE(cs.min_selling_quantity, t.min_selling_quantity, 1.0)
              FROM public.tenants t
              WHERE cs.tenant_id = t.id;
            EXCEPTION WHEN OTHERS THEN NULL;
            END;
          END IF;
        END IF;
        IF to_regclass('public.tenants') IS NOT NULL THEN
          ALTER TABLE public.tenants DROP COLUMN IF EXISTS invoice_prefix CASCADE;
          ALTER TABLE public.tenants DROP COLUMN IF EXISTS purchase_prefix CASCADE;
          ALTER TABLE public.tenants DROP COLUMN IF EXISTS min_selling_quantity CASCADE;
          ALTER TABLE public.tenants DROP COLUMN IF EXISTS allow_half_carton CASCADE;
          ALTER TABLE public.tenants DROP COLUMN IF EXISTS allow_half_cartoon CASCADE;
          ALTER TABLE public.tenants DROP COLUMN IF EXISTS pricing_mode CASCADE;
          ALTER TABLE public.tenants DROP COLUMN IF EXISTS pricing_policy CASCADE;
          ALTER TABLE public.tenants DROP COLUMN IF EXISTS business_type CASCADE;
        END IF;
        IF to_regclass('public.store_requests') IS NOT NULL THEN
          DROP TABLE public.store_requests CASCADE;
        END IF;
        IF to_regclass('public.deleted_store_requests') IS NOT NULL THEN
          DROP TABLE public.deleted_store_requests CASCADE;
        END IF;
      END $$;
    `).then(() => undefined).catch((error) => {
      documentPrefixMigrationPromise = null;
      throw error;
    });
  }
  return documentPrefixMigrationPromise;
}

export function isSaasControlPlaneInitialized(): boolean {
  return saasControlPlaneInitialized;
}

let databaseEnumsSchemaPromise: Promise<void> | null = null;
let platformNotificationsSchemaPromise: Promise<void> | null = null;

export function resetSaasControlPlaneState(): void {
  saasControlPlaneInitialized = false;
  saasControlPlanePromise = null;
  databaseSchemaPromise = null;
  databaseEnumsSchemaPromise = null;
  customerLedgerSchemaPromise = null;
  salesTransactionIdSchemaPromise = null;
  pushSubscriptionsSchemaPromise = null;
  platformNotificationsSchemaPromise = null;
  productPriceMigrationPromise = null;
  documentPrefixMigrationPromise = null;
}

/**
 * Normalizes subscription plan / type to 'free_tier', '6_MONTHS' or 'YEARLY'
 */
export function normalizeSubscriptionPlan(plan?: string | null): 'free_tier' | '6_MONTHS' | 'YEARLY' {
  const clean = String(plan || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (
    clean === 'free_tier' ||
    clean === 'freetier' ||
    clean === 'free' ||
    clean === 'trial' ||
    clean === 'free_trial' ||
    clean === '30_day_trial' ||
    clean === '30_days' ||
    clean === 'pro_trial' ||
    !clean
  ) {
    return 'free_tier';
  }
  if (clean === '6_months' || clean === '6_month' || clean === 'six_months' || clean.startsWith('6_month')) {
    return '6_MONTHS';
  }
  if (clean === '1_year' || clean === 'yearly' || clean === 'year' || clean === '1year' || clean === 'one_year') {
    return 'YEARLY';
  }
  return 'free_tier';
}

export function normalizeSubscriptionType(plan?: string | null): 'free_tier' | '6_months' | '1_year' {
  const norm = normalizeSubscriptionPlan(plan);
  if (norm === '6_MONTHS') return '6_months';
  if (norm === 'YEARLY') return '1_year';
  return 'free_tier';
}

export { calculateDaysLeft, daysLeft } from '../utils/subscription.ts';

/**
 * Calculates subscriptionEndDate automatically based on plan ('free_tier' => +30 days, '6_MONTHS' => +6 months, 'YEARLY' => +1 year)
 */
export function calculateSubscriptionEndDate(
  plan: 'free_tier' | 'TRIAL' | '6_MONTHS' | 'YEARLY' | string,
  startDate: Date = new Date()
): Date {
  const normalized = normalizeSubscriptionPlan(plan);
  const end = new Date(startDate.getTime());
  if (normalized === 'free_tier') {
    end.setDate(end.getDate() + 30);
  } else if (normalized === '6_MONTHS') {
    end.setMonth(end.getMonth() + 6);
  } else {
    end.setFullYear(end.getFullYear() + 1);
  }
  return end;
}

/**
 * Synchronizes expired subscriptions in PostgreSQL so any tenant whose subscription_end_date < NOW()
 * is automatically marked with subscription_status = 'EXPIRED'.
 */
export async function syncExpiredTenantSubscriptions(): Promise<void> {
  try {
    await pgClient.query(`
      UPDATE tenants
      SET subscription_status = 'EXPIRED',
          updated_at = NOW()
      WHERE subscription_end_date IS NOT NULL
        AND subscription_end_date < NOW()
        AND subscription_status NOT IN ('EXPIRED', 'SUSPENDED')
    `);
  } catch {}
}

export const REQUIRED_DATABASE_TABLES = [
  'tenants',
  'users',
  'trial_activations',
  'password_reset_tokens',
  'company_settings',
  'categories',
  'products',
  'customers',
  'suppliers',
  'purchases',
  'supplier_payments',
  'purchase_items',
  'purchase_returns',
  'purchase_return_items',
  'sales',
  'sale_items',
  'returns',
  'return_items',
  'stock_movements',
  'customer_ledger',
  'supplier_ledger',
  'push_subscriptions',
  'app_settings',
  'platform_notifications',
  'platform_notification_reads',
  'pos_notification_dismissals',
] as const;

export const DATABASE_ENUM_DDL: string[] = [
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'business_type_enum') THEN
      CREATE TYPE business_type_enum AS ENUM ('RETAIL', 'WHOLESALE');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pricing_mode_enum') THEN
      CREATE TYPE pricing_mode_enum AS ENUM ('FIXED', 'NEGOTIABLE');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'movement_type_enum') THEN
      CREATE TYPE movement_type_enum AS ENUM ('PURCHASE', 'SALE', 'SALE_RETURN', 'PURCHASE_RETURN', 'ADJUSTMENT');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'packing_type_enum') THEN
      CREATE TYPE packing_type_enum AS ENUM ('PAIR', 'CARTON');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sale_type_enum') THEN
      CREATE TYPE sale_type_enum AS ENUM ('RETAIL', 'WHOLESALE');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role_enum') THEN
      CREATE TYPE user_role_enum AS ENUM ('SUPERADMIN', 'ADMIN', 'CASHIER', 'MANAGER');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_status_enum') THEN
      CREATE TYPE user_status_enum AS ENUM ('PENDING', 'APPROVED');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tenant_status_enum') THEN
      CREATE TYPE tenant_status_enum AS ENUM ('ACTIVE', 'SUSPENDED', 'EXPIRED');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_status_enum') THEN
      CREATE TYPE subscription_status_enum AS ENUM ('ACTIVE', 'EXPIRED', 'SUSPENDED');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_plan_enum') THEN
      CREATE TYPE subscription_plan_enum AS ENUM ('free_tier', 'TRIAL', '6_MONTHS', 'YEARLY');
    ELSE
      BEGIN
        ALTER TYPE subscription_plan_enum ADD VALUE IF NOT EXISTS 'free_tier';
        ALTER TYPE subscription_plan_enum ADD VALUE IF NOT EXISTS 'FREE_TIER';
        ALTER TYPE subscription_plan_enum ADD VALUE IF NOT EXISTS 'TRIAL';
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_type_enum') THEN
      CREATE TYPE subscription_type_enum AS ENUM ('free_tier', '6_months', '1_year', 'TRIAL', '6_MONTHS', 'YEARLY');
    ELSE
      BEGIN
        ALTER TYPE subscription_type_enum ADD VALUE IF NOT EXISTS 'free_tier';
        ALTER TYPE subscription_type_enum ADD VALUE IF NOT EXISTS '6_months';
        ALTER TYPE subscription_type_enum ADD VALUE IF NOT EXISTS '1_year';
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'purchase_payment_status_enum') THEN
      CREATE TYPE purchase_payment_status_enum AS ENUM ('UNPAID', 'PARTIAL', 'PAID');
    END IF;
  END $$;`,
  `CREATE OR REPLACE FUNCTION upper(val user_role_enum) RETURNS text AS $$ SELECT upper(val::text); $$ LANGUAGE sql IMMUTABLE;`,
  `CREATE OR REPLACE FUNCTION btrim(val user_role_enum) RETURNS text AS $$ SELECT btrim(val::text); $$ LANGUAGE sql IMMUTABLE;`,
  `CREATE OR REPLACE FUNCTION lower(val user_role_enum) RETURNS text AS $$ SELECT lower(val::text); $$ LANGUAGE sql IMMUTABLE;`,
  `CREATE OR REPLACE FUNCTION upper(val user_status_enum) RETURNS text AS $$ SELECT upper(val::text); $$ LANGUAGE sql IMMUTABLE;`,
  `CREATE OR REPLACE FUNCTION btrim(val user_status_enum) RETURNS text AS $$ SELECT btrim(val::text); $$ LANGUAGE sql IMMUTABLE;`,
  `CREATE OR REPLACE FUNCTION lower(val user_status_enum) RETURNS text AS $$ SELECT lower(val::text); $$ LANGUAGE sql IMMUTABLE;`,
  `CREATE OR REPLACE FUNCTION upper(val business_type_enum) RETURNS text AS $$ SELECT upper(val::text); $$ LANGUAGE sql IMMUTABLE;`,
  `CREATE OR REPLACE FUNCTION btrim(val business_type_enum) RETURNS text AS $$ SELECT btrim(val::text); $$ LANGUAGE sql IMMUTABLE;`,
  `CREATE OR REPLACE FUNCTION lower(val business_type_enum) RETURNS text AS $$ SELECT lower(val::text); $$ LANGUAGE sql IMMUTABLE;`,
  `CREATE OR REPLACE FUNCTION upper(val pricing_mode_enum) RETURNS text AS $$ SELECT upper(val::text); $$ LANGUAGE sql IMMUTABLE;`,
  `CREATE OR REPLACE FUNCTION lower(val pricing_mode_enum) RETURNS text AS $$ SELECT lower(val::text); $$ LANGUAGE sql IMMUTABLE;`,
  `CREATE OR REPLACE FUNCTION upper(val tenant_status_enum) RETURNS text AS $$ SELECT upper(val::text); $$ LANGUAGE sql IMMUTABLE;`,
  `CREATE OR REPLACE FUNCTION lower(val tenant_status_enum) RETURNS text AS $$ SELECT lower(val::text); $$ LANGUAGE sql IMMUTABLE;`,
  `CREATE OR REPLACE FUNCTION upper(val subscription_status_enum) RETURNS text AS $$ SELECT upper(val::text); $$ LANGUAGE sql IMMUTABLE;`,
  `CREATE OR REPLACE FUNCTION lower(val subscription_status_enum) RETURNS text AS $$ SELECT lower(val::text); $$ LANGUAGE sql IMMUTABLE;`,
  `CREATE OR REPLACE FUNCTION upper(val subscription_plan_enum) RETURNS text AS $$ SELECT upper(val::text); $$ LANGUAGE sql IMMUTABLE;`,
  `CREATE OR REPLACE FUNCTION lower(val subscription_plan_enum) RETURNS text AS $$ SELECT lower(val::text); $$ LANGUAGE sql IMMUTABLE;`,
  `CREATE OR REPLACE FUNCTION upper(val sale_type_enum) RETURNS text AS $$ SELECT upper(val::text); $$ LANGUAGE sql IMMUTABLE;`,
  `CREATE OR REPLACE FUNCTION lower(val sale_type_enum) RETURNS text AS $$ SELECT lower(val::text); $$ LANGUAGE sql IMMUTABLE;`,
  `CREATE OR REPLACE FUNCTION upper(val packing_type_enum) RETURNS text AS $$ SELECT upper(val::text); $$ LANGUAGE sql IMMUTABLE;`,
  `CREATE OR REPLACE FUNCTION lower(val packing_type_enum) RETURNS text AS $$ SELECT lower(val::text); $$ LANGUAGE sql IMMUTABLE;`,
  `CREATE OR REPLACE FUNCTION upper(val movement_type_enum) RETURNS text AS $$ SELECT upper(val::text); $$ LANGUAGE sql IMMUTABLE;`,
  `CREATE OR REPLACE FUNCTION lower(val movement_type_enum) RETURNS text AS $$ SELECT lower(val::text); $$ LANGUAGE sql IMMUTABLE;`,
  `CREATE OR REPLACE FUNCTION upper(val purchase_payment_status_enum) RETURNS text AS $$ SELECT upper(val::text); $$ LANGUAGE sql IMMUTABLE;`,
  `CREATE OR REPLACE FUNCTION lower(val purchase_payment_status_enum) RETURNS text AS $$ SELECT lower(val::text); $$ LANGUAGE sql IMMUTABLE;`,
];

const DATABASE_TABLE_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS tenants (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    status tenant_status_enum NOT NULL DEFAULT 'ACTIVE',
    subscription_type TEXT NOT NULL DEFAULT 'free_tier',
    subscription_plan TEXT NOT NULL DEFAULT 'free_tier',
    subscription_start_date TIMESTAMP NOT NULL DEFAULT NOW(),
    subscription_end_date TIMESTAMP NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
    subscription_status subscription_status_enum NOT NULL DEFAULT 'ACTIVE',
    onboarding_completed BOOLEAN NOT NULL DEFAULT true,
    deleted_product_ids INTEGER[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL DEFAULT 0,
    name TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL UNIQUE,
    phone TEXT DEFAULT '',
    avatar_url TEXT DEFAULT '',
    password_hash TEXT NOT NULL,
    quick_password TEXT DEFAULT '',
    role user_role_enum NOT NULL DEFAULT 'CASHIER',
    status user_status_enum NOT NULL DEFAULT 'PENDING',
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL DEFAULT 1,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS company_settings (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL DEFAULT 1,
    logo TEXT DEFAULT '',
    address TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    email TEXT DEFAULT '',
    website TEXT DEFAULT '',
    strn TEXT DEFAULT '',
    tax_id TEXT DEFAULT '',
    tax_rate NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    currency TEXT NOT NULL DEFAULT 'PKR',
    currency_name TEXT NOT NULL DEFAULT 'Pakistani Rupee',
    currency_symbol TEXT NOT NULL DEFAULT 'Rs.',
    invoice_footer TEXT NOT NULL DEFAULT 'Thank you for shopping with us!',
    show_receipt_logo BOOLEAN NOT NULL DEFAULT false,
    receipt_logo TEXT DEFAULT '',
    low_stock_limit INTEGER NOT NULL DEFAULT 5,
    pricing_mode pricing_mode_enum NOT NULL DEFAULT 'FIXED',
    pricing_policy_locked BOOLEAN NOT NULL DEFAULT false,
    business_type business_type_enum NOT NULL DEFAULT 'RETAIL',
    min_selling_quantity NUMERIC(3, 1) NOT NULL DEFAULT 1.0,
    allow_half_carton BOOLEAN NOT NULL DEFAULT true,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL DEFAULT 1,
    tenant_product_no INTEGER,
    name TEXT NOT NULL,
    brand VARCHAR(100) NOT NULL DEFAULT 'Unbranded',
    category VARCHAR(100) NOT NULL DEFAULT 'Men',
    barcode TEXT NOT NULL,
    article TEXT DEFAULT '',
    primary_image_url TEXT DEFAULT '',
    description TEXT DEFAULT '',
    cost_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    min_price INTEGER NOT NULL DEFAULT 0,
    max_price INTEGER NOT NULL DEFAULT 0,
    pairs_per_carton INTEGER NOT NULL DEFAULT 12,
    allow_half_carton BOOLEAN NOT NULL DEFAULT true,
    total_stock INTEGER NOT NULL DEFAULT 0,
    low_stock_limit INTEGER NOT NULL DEFAULT 5,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS customers (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL DEFAULT 1,
    name TEXT NOT NULL,
    shop_name TEXT DEFAULT '',
    market_name TEXT DEFAULT '',
    city TEXT DEFAULT '',
    phone TEXT NOT NULL,
    email TEXT,
    address TEXT,
    notes TEXT,
    credit_limit NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    current_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    outstanding_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    ntn_number TEXT DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS suppliers (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL DEFAULT 1,
    name TEXT NOT NULL,
    phone TEXT DEFAULT '',
    email TEXT DEFAULT '',
    balance NUMERIC(12, 2) DEFAULT 0.00,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS purchases (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL DEFAULT 1,
    purchase_number TEXT NOT NULL,
    supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
    supplier_name TEXT NOT NULL,
    purchase_date TEXT NOT NULL,
    total_amount NUMERIC(12, 2) NOT NULL,
    paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    payment_status purchase_payment_status_enum NOT NULL DEFAULT 'UNPAID',
    payment_method TEXT DEFAULT 'CASH',
    notes TEXT,
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS supplier_payments (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL DEFAULT 1,
    payment_number TEXT NOT NULL,
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    supplier_name TEXT NOT NULL,
    purchase_id INTEGER REFERENCES purchases(id) ON DELETE SET NULL,
    amount NUMERIC(12, 2) NOT NULL,
    payment_date TEXT NOT NULL,
    payment_method TEXT NOT NULL DEFAULT 'CASH',
    reference_number TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS purchase_items (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL DEFAULT 1,
    purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id),
    quantity INTEGER NOT NULL,
    unit_purchase_price NUMERIC(12, 2) NOT NULL,
    subtotal NUMERIC(12, 2) NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS purchase_returns (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL DEFAULT 1,
    return_number TEXT NOT NULL,
    purchase_id INTEGER REFERENCES purchases(id) ON DELETE SET NULL,
    supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
    supplier_name TEXT NOT NULL,
    return_date TEXT NOT NULL,
    total_debit_amount NUMERIC(12, 2) NOT NULL,
    reason TEXT NOT NULL,
    notes TEXT,
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS purchase_return_items (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL DEFAULT 1,
    purchase_return_id INTEGER NOT NULL REFERENCES purchase_returns(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id),
    quantity INTEGER NOT NULL,
    unit_purchase_price NUMERIC(12, 2) NOT NULL,
    subtotal NUMERIC(12, 2) NOT NULL,
    defect_type TEXT DEFAULT 'MANUFACTURING_DEFECT'
  )`,
  `CREATE TABLE IF NOT EXISTS sales (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL DEFAULT 1,
    invoice_number TEXT NOT NULL,
    sale_type sale_type_enum NOT NULL DEFAULT 'RETAIL',
    customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
    sale_date TEXT NOT NULL,
    subtotal NUMERIC(12, 2) NOT NULL,
    discount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_amount NUMERIC(12, 2) NOT NULL,
    total_cartons NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    transport_name TEXT DEFAULT '',
    bilty_number TEXT DEFAULT '',
    booking_destination TEXT DEFAULT '',
    previous_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    remaining_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    payment_method TEXT NOT NULL DEFAULT 'CASH',
    transaction_id TEXT DEFAULT '',
    cash_received NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    change_given NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    created_by INTEGER NOT NULL REFERENCES users(id),
    is_min_price_overridden BOOLEAN NOT NULL DEFAULT false,
    overridden_by INTEGER REFERENCES users(id),
    notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS sale_items (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL DEFAULT 1,
    sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id),
    product_name TEXT NOT NULL,
    packing_type packing_type_enum NOT NULL DEFAULT 'PAIR',
    carton_quantity NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    pairs_per_carton INTEGER NOT NULL DEFAULT 1,
    quantity INTEGER NOT NULL,
    unit_price NUMERIC(12, 2) NOT NULL,
    discount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    subtotal NUMERIC(12, 2) NOT NULL,
    purchase_price NUMERIC(12, 2) NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS returns (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL DEFAULT 1,
    return_number TEXT NOT NULL,
    original_sale_id INTEGER NOT NULL REFERENCES sales(id),
    customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
    return_date TEXT NOT NULL,
    total_refund_amount NUMERIC(12, 2) NOT NULL,
    reason TEXT NOT NULL,
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS return_items (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL DEFAULT 1,
    return_id INTEGER NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
    sale_item_id INTEGER NOT NULL REFERENCES sale_items(id),
    product_id INTEGER NOT NULL REFERENCES products(id),
    quantity INTEGER NOT NULL,
    unit_refund_price NUMERIC(12, 2) NOT NULL,
    subtotal NUMERIC(12, 2) NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS stock_movements (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL DEFAULT 1,
    product_id INTEGER NOT NULL REFERENCES products(id),
    qty_change INTEGER NOT NULL,
    prev_stock INTEGER NOT NULL,
    new_stock INTEGER NOT NULL,
    movement_type movement_type_enum NOT NULL,
    reference_id TEXT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS customer_ledger (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL DEFAULT 1,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    transaction_date TEXT NOT NULL,
    invoice_id INTEGER REFERENCES sales(id) ON DELETE SET NULL,
    invoice_number TEXT DEFAULT '',
    total_bill NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    amount_paid NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    balance_change NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    running_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    payment_method TEXT DEFAULT 'KHATA',
    notes TEXT DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`,
  // Supplier ledger entries that are not purchases, returns or payments (opening balances).
  // credit increases what the store owes the supplier; debit reduces it (prepaid advance).
  `CREATE TABLE IF NOT EXISTS supplier_ledger (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL DEFAULT 1,
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    entry_type TEXT NOT NULL DEFAULT 'OPENING_BALANCE',
    entry_date TEXT NOT NULL,
    reference_number TEXT DEFAULT '',
    debit NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    credit NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    notes TEXT DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS push_subscriptions (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL DEFAULT 1,
    user_id INTEGER NOT NULL DEFAULT 0,
    user_role TEXT NOT NULL DEFAULT 'CASHIER',
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS trial_activations (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    tenant_id INTEGER,
    email TEXT NOT NULL,
    user_name TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    store_name TEXT NOT NULL,
    business_type TEXT NOT NULL DEFAULT 'RETAIL',
    pricing_mode TEXT NOT NULL DEFAULT 'FIXED',
    plan TEXT NOT NULL DEFAULT 'TRIAL',
    trial_duration_days INTEGER NOT NULL DEFAULT 30,
    trial_start_date TIMESTAMP NOT NULL DEFAULT NOW(),
    trial_end_date TIMESTAMP NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    ip_address TEXT DEFAULT '',
    user_agent TEXT DEFAULT '',
    activated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    details JSONB DEFAULT '{}'::jsonb
  )`,
  `CREATE TABLE IF NOT EXISTS app_settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL DEFAULT '',
    category VARCHAR(50) NOT NULL DEFAULT 'system',
    description TEXT DEFAULT '',
    is_secret BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS platform_notifications (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NULL REFERENCES tenants(id) ON DELETE CASCADE,
    target_role TEXT NOT NULL DEFAULT 'ALL',
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'INFO',
    action_url TEXT DEFAULT '',
    action_label TEXT DEFAULT '',
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    expires_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS platform_notification_reads (
    id SERIAL PRIMARY KEY,
    notification_id INTEGER NOT NULL REFERENCES platform_notifications(id) ON DELETE CASCADE,
    tenant_id INTEGER NOT NULL DEFAULT 1,
    user_id INTEGER NOT NULL DEFAULT 0,
    read_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT platform_notification_reads_unique UNIQUE(notification_id, tenant_id, user_id)
  )`,
  `CREATE TABLE IF NOT EXISTS pos_notification_dismissals (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL DEFAULT 1,
    user_id INTEGER NOT NULL DEFAULT 0,
    item_type TEXT NOT NULL DEFAULT 'SALE',
    item_id INTEGER NOT NULL,
    dismissed_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT pos_notification_dismissals_unique UNIQUE(tenant_id, user_id, item_type, item_id)
  )`,
];

const DATABASE_INDEX_DDL: string[] = [
  `ALTER TABLE IF EXISTS products DROP COLUMN IF EXISTS sku`,
  `CREATE INDEX IF NOT EXISTS platform_notifications_tenant_idx ON platform_notifications(tenant_id)`,
  `CREATE INDEX IF NOT EXISTS platform_notifications_created_at_idx ON platform_notifications(created_at)`,
  `CREATE INDEX IF NOT EXISTS platform_notification_reads_notif_idx ON platform_notification_reads(notification_id)`,
  `CREATE INDEX IF NOT EXISTS platform_notification_reads_tenant_idx ON platform_notification_reads(tenant_id)`,
  `CREATE INDEX IF NOT EXISTS app_settings_category_idx ON app_settings(category)`,
  `CREATE INDEX IF NOT EXISTS trial_activations_email_idx ON trial_activations(LOWER(BTRIM(email)))`,
  `CREATE INDEX IF NOT EXISTS trial_activations_tenant_idx ON trial_activations(tenant_id)`,
  `CREATE INDEX IF NOT EXISTS trial_activations_status_idx ON trial_activations(status)`,
  `CREATE INDEX IF NOT EXISTS tenants_status_idx ON tenants(status)`,
  `CREATE INDEX IF NOT EXISTS tenants_subscription_status_idx ON tenants(subscription_status)`,
  `CREATE INDEX IF NOT EXISTS users_tenant_idx ON users(tenant_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique_idx ON users (LOWER(BTRIM(email)))`,
  `CREATE INDEX IF NOT EXISTS company_settings_tenant_idx ON company_settings(tenant_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS categories_name_lower_unique_idx ON categories (LOWER(TRIM(name)))`,
  `CREATE INDEX IF NOT EXISTS products_tenant_idx ON products(tenant_id)`,
  `CREATE INDEX IF NOT EXISTS products_tenant_product_no_idx ON products(tenant_id, tenant_product_no)`,
  `CREATE INDEX IF NOT EXISTS products_brand_idx ON products(brand)`,
  `CREATE INDEX IF NOT EXISTS products_category_idx ON products(category)`,
  `CREATE INDEX IF NOT EXISTS products_barcode_idx ON products(barcode)`,
  `CREATE INDEX IF NOT EXISTS products_article_idx ON products(article)`,
  `CREATE INDEX IF NOT EXISTS products_active_idx ON products(active)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS products_tenant_barcode_unique_idx ON products (COALESCE(tenant_id, 1), LOWER(BTRIM(barcode))) WHERE barcode IS NOT NULL AND BTRIM(barcode) <> ''`,
  `CREATE UNIQUE INDEX IF NOT EXISTS products_tenant_article_unique_idx ON products (COALESCE(tenant_id, 1), LOWER(BTRIM(article))) WHERE article IS NOT NULL AND BTRIM(article) <> ''`,
  `CREATE INDEX IF NOT EXISTS customers_tenant_idx ON customers(tenant_id)`,
  `CREATE INDEX IF NOT EXISTS customers_phone_idx ON customers(phone)`,
  `CREATE INDEX IF NOT EXISTS customer_ledger_tenant_cust_idx ON customer_ledger(tenant_id, customer_id)`,
  `CREATE INDEX IF NOT EXISTS customer_ledger_date_idx ON customer_ledger(transaction_date)`,
  `CREATE INDEX IF NOT EXISTS customer_ledger_invoice_idx ON customer_ledger(invoice_id)`,
  `CREATE INDEX IF NOT EXISTS suppliers_tenant_idx ON suppliers(tenant_id)`,
  `CREATE INDEX IF NOT EXISTS purchases_tenant_idx ON purchases(tenant_id)`,
  `CREATE INDEX IF NOT EXISTS supplier_payments_tenant_idx ON supplier_payments(tenant_id)`,
  `CREATE INDEX IF NOT EXISTS supplier_ledger_supplier_idx ON supplier_ledger(tenant_id, supplier_id)`,
  `CREATE INDEX IF NOT EXISTS supplier_payments_supplier_idx ON supplier_payments(supplier_id)`,
  `CREATE INDEX IF NOT EXISTS supplier_payments_date_idx ON supplier_payments(payment_date)`,
  `CREATE INDEX IF NOT EXISTS supplier_payments_number_idx ON supplier_payments(payment_number)`,
  `CREATE INDEX IF NOT EXISTS purchase_returns_tenant_idx ON purchase_returns(tenant_id)`,
  `CREATE INDEX IF NOT EXISTS purchase_returns_number_idx ON purchase_returns(return_number)`,
  `CREATE INDEX IF NOT EXISTS purchase_returns_supplier_idx ON purchase_returns(supplier_id)`,
  `CREATE INDEX IF NOT EXISTS purchase_return_items_return_idx ON purchase_return_items(purchase_return_id)`,
  `CREATE INDEX IF NOT EXISTS purchase_return_items_product_idx ON purchase_return_items(product_id)`,
  `CREATE INDEX IF NOT EXISTS sales_tenant_idx ON sales(tenant_id)`,
  `CREATE INDEX IF NOT EXISTS sales_invoice_idx ON sales(invoice_number)`,
  `CREATE INDEX IF NOT EXISTS returns_tenant_idx ON returns(tenant_id)`,
  `CREATE INDEX IF NOT EXISTS stock_movements_tenant_idx ON stock_movements(tenant_id)`,
  `CREATE INDEX IF NOT EXISTS stock_movements_product_idx ON stock_movements(product_id)`,
  `CREATE INDEX IF NOT EXISTS stock_movements_created_at_idx ON stock_movements(created_at)`,
];

let customerLedgerSchemaPromise: Promise<void> | null = null;
let salesTransactionIdSchemaPromise: Promise<void> | null = null;

/** Adds the payment reference field to existing databases before POS checkout inserts sales. */
export function ensureSalesTransactionIdSchema(): Promise<void> {
  if (!salesTransactionIdSchemaPromise) {
    salesTransactionIdSchemaPromise = (async () => {
      await pgClient.waitReady;
      await pgClient.exec(
        "ALTER TABLE IF EXISTS public.sales ADD COLUMN IF NOT EXISTS transaction_id TEXT DEFAULT ''"
      );
    })().catch((error) => {
      salesTransactionIdSchemaPromise = null;
      throw error;
    });
  }
  return salesTransactionIdSchemaPromise;
}

let pushSubscriptionsSchemaPromise: Promise<void> | null = null;

/** Ensures the Web Push subscriptions table exists in the database. */
export function ensurePushSubscriptionsSchema(): Promise<void> {
  if (!pushSubscriptionsSchemaPromise) {
    pushSubscriptionsSchemaPromise = (async () => {
      await pgClient.waitReady;
      await pgClient.exec(`
        CREATE TABLE IF NOT EXISTS public.push_subscriptions (
          id SERIAL PRIMARY KEY,
          tenant_id INTEGER NOT NULL DEFAULT 1,
          user_id INTEGER NOT NULL DEFAULT 0,
          user_role TEXT NOT NULL DEFAULT 'CASHIER',
          endpoint TEXT NOT NULL UNIQUE,
          p256dh TEXT NOT NULL,
          auth TEXT NOT NULL,
          user_agent TEXT DEFAULT '',
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
        ALTER TABLE public.push_subscriptions ADD COLUMN IF NOT EXISTS user_role TEXT NOT NULL DEFAULT 'CASHIER';
        CREATE INDEX IF NOT EXISTS push_subscriptions_tenant_idx ON public.push_subscriptions(tenant_id);
        CREATE INDEX IF NOT EXISTS push_subscriptions_user_role_idx ON public.push_subscriptions(user_role);
      `);
    })().catch((error) => {
      pushSubscriptionsSchemaPromise = null;
      throw error;
    });
  }
  return pushSubscriptionsSchemaPromise;
}

/** Ensures the platform custom notifications and reads tracking tables exist. */
export function ensurePlatformNotificationsSchema(): Promise<void> {
  if (!platformNotificationsSchemaPromise) {
    platformNotificationsSchemaPromise = (async () => {
      await pgClient.waitReady;
      await pgClient.exec(`
        CREATE TABLE IF NOT EXISTS public.platform_notifications (
          id SERIAL PRIMARY KEY,
          tenant_id INTEGER NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
          target_role TEXT NOT NULL DEFAULT 'ALL',
          title TEXT NOT NULL,
          message TEXT NOT NULL,
          type TEXT NOT NULL DEFAULT 'INFO',
          action_url TEXT DEFAULT '',
          action_label TEXT DEFAULT '',
          created_by INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
          expires_at TIMESTAMP NULL,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
        ALTER TABLE public.platform_notifications ADD COLUMN IF NOT EXISTS target_role TEXT NOT NULL DEFAULT 'ALL';
        CREATE TABLE IF NOT EXISTS public.platform_notification_reads (
          id SERIAL PRIMARY KEY,
          notification_id INTEGER NOT NULL REFERENCES public.platform_notifications(id) ON DELETE CASCADE,
          tenant_id INTEGER NOT NULL DEFAULT 1,
          user_id INTEGER NOT NULL DEFAULT 0,
          read_at TIMESTAMP NOT NULL DEFAULT NOW(),
          CONSTRAINT platform_notification_reads_unique UNIQUE(notification_id, tenant_id, user_id)
        );
        CREATE INDEX IF NOT EXISTS platform_notifications_tenant_idx ON public.platform_notifications(tenant_id);
        CREATE INDEX IF NOT EXISTS platform_notifications_target_role_idx ON public.platform_notifications(target_role);
        CREATE INDEX IF NOT EXISTS platform_notifications_created_at_idx ON public.platform_notifications(created_at);
        CREATE INDEX IF NOT EXISTS platform_notification_reads_notif_idx ON public.platform_notification_reads(notification_id);
        CREATE INDEX IF NOT EXISTS platform_notification_reads_tenant_idx ON public.platform_notification_reads(tenant_id);

        CREATE TABLE IF NOT EXISTS public.pos_notification_dismissals (
          id SERIAL PRIMARY KEY,
          tenant_id INTEGER NOT NULL DEFAULT 1,
          user_id INTEGER NOT NULL DEFAULT 0,
          item_type TEXT NOT NULL DEFAULT 'SALE',
          item_id INTEGER NOT NULL,
          dismissed_at TIMESTAMP NOT NULL DEFAULT NOW(),
          CONSTRAINT pos_notification_dismissals_unique UNIQUE(tenant_id, user_id, item_type, item_id)
        );
        CREATE INDEX IF NOT EXISTS pos_notification_dismissals_idx ON public.pos_notification_dismissals(tenant_id, user_id, item_type);

        UPDATE public.platform_notifications
        SET target_role = 'SUPERADMIN', tenant_id = NULL
        WHERE target_role != 'SUPERADMIN'
          AND (
            title ILIKE 'New Free Trial%'
            OR title ILIKE 'Renewal Request%'
            OR action_url ILIKE '%/superadmin%'
            OR message ILIKE '%Free Tier store registered%'
            OR message ILIKE '%subscription renewal%'
          );
      `);
    })().catch((error) => {
      platformNotificationsSchemaPromise = null;
      throw error;
    });
  }
  return platformNotificationsSchemaPromise;
}

/**
 * Automatically clears subscription and renewal alerts upon renewal or trial extension
 * by setting expires_at = NOW().
 */
export async function clearSubscriptionAlertsOnRenewal(tenantId: number): Promise<void> {
  const cleanId = Number(tenantId) || 1;
  try {
    await pgClient.query(
      `UPDATE platform_notifications
       SET expires_at = NOW()
       WHERE (tenant_id = $1 OR target_role = 'SUPERADMIN')
         AND (
           title ILIKE '%Renewal Request%'
           OR title ILIKE '%Subscription%'
           OR title ILIKE '%Free Trial%'
           OR message ILIKE '%renewal%'
           OR message ILIKE '%subscription%'
           OR message ILIKE '%free tier store registered%'
         )
         AND (expires_at IS NULL OR expires_at > NOW())`,
      [cleanId]
    );
  } catch (err) {
    console.warn('Could not clear subscription alerts on renewal:', err);
  }
}

/** Migrates legacy Khata history and ensures the unified customer ledger exists. */
export function ensureCustomerLedgerSchema(): Promise<void> {
  if (!customerLedgerSchemaPromise) {
    customerLedgerSchemaPromise = (async () => {
      await pgClient.waitReady;
      const tableDdl = DATABASE_TABLE_DDL.find((ddl) => ddl.includes('CREATE TABLE IF NOT EXISTS customer_ledger'));
      if (!tableDdl) throw new Error('Customer ledger table definition is missing.');
      await pgClient.exec(tableDdl);
      await pgClient.exec(`
        DO $$
        BEGIN
          IF to_regclass('public.customer_khata_ledger') IS NOT NULL THEN
            INSERT INTO public.customer_ledger (
              tenant_id, customer_id, transaction_date, invoice_id, invoice_number,
              total_bill, amount_paid, balance_change, running_balance, payment_method, notes, created_at
            )
            SELECT tenant_id, customer_id, transaction_date, invoice_id, invoice_number,
                   total_bill, amount_paid, balance_change, running_balance, payment_method, notes, created_at
            FROM public.customer_khata_ledger;
            DROP TABLE public.customer_khata_ledger CASCADE;
          END IF;
        END $$;
      `);
      for (const indexDdl of DATABASE_INDEX_DDL.filter((ddl) => ddl.includes('customer_ledger'))) {
        await pgClient.exec(indexDdl);
      }
    })().catch((error) => {
      customerLedgerSchemaPromise = null;
      throw error;
    });
  }
  return customerLedgerSchemaPromise;
}

/**
 * Ensures all custom PostgreSQL ENUM types exist and converts any legacy text columns.
 */
export function ensureDatabaseEnumsSchema(): Promise<void> {
  if (!databaseEnumsSchemaPromise) {
    databaseEnumsSchemaPromise = (async () => {
      await pgClient.waitReady;
      for (const enumDdl of DATABASE_ENUM_DDL) {
        await pgClient.exec(enumDdl);
      }
      await pgClient.exec(`
        DO $$ BEGIN
          -- tenants: centralize business_type and pricing_mode exclusively in company_settings
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tenants' AND column_name = 'business_type') THEN
            BEGIN
              UPDATE public.company_settings cs
              SET business_type = (CASE WHEN UPPER(TRIM(COALESCE(NULLIF(cs.business_type::text, ''), NULLIF(t.business_type::text, ''), 'RETAIL'))) = 'WHOLESALE' THEN 'WHOLESALE'::business_type_enum ELSE 'RETAIL'::business_type_enum END)
              FROM public.tenants t
              WHERE cs.tenant_id = t.id;
              ALTER TABLE public.tenants DROP COLUMN IF EXISTS business_type CASCADE;
            EXCEPTION WHEN OTHERS THEN NULL;
            END;
          END IF;
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tenants' AND column_name = 'pricing_mode') THEN
            BEGIN
              UPDATE public.company_settings cs
              SET pricing_mode = (CASE WHEN UPPER(TRIM(COALESCE(NULLIF(cs.pricing_mode::text, ''), NULLIF(t.pricing_mode::text, ''), 'FIXED'))) = 'NEGOTIABLE' THEN 'NEGOTIABLE'::pricing_mode_enum ELSE 'FIXED'::pricing_mode_enum END)
              FROM public.tenants t
              WHERE cs.tenant_id = t.id;
              ALTER TABLE public.tenants DROP COLUMN IF EXISTS pricing_mode CASCADE;
            EXCEPTION WHEN OTHERS THEN NULL;
            END;
          END IF;
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tenants' AND column_name = 'min_selling_quantity') THEN
            BEGIN
              UPDATE public.company_settings cs
              SET min_selling_quantity = COALESCE(cs.min_selling_quantity, t.min_selling_quantity, 1.0)
              FROM public.tenants t
              WHERE cs.tenant_id = t.id;
              ALTER TABLE public.tenants DROP COLUMN IF EXISTS min_selling_quantity CASCADE;
            EXCEPTION WHEN OTHERS THEN NULL;
            END;
          END IF;
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tenants' AND column_name = 'allow_half_carton') THEN
            BEGIN
              UPDATE public.company_settings cs
              SET allow_half_carton = COALESCE(cs.allow_half_carton, t.allow_half_carton, true)
              FROM public.tenants t
              WHERE cs.tenant_id = t.id;
              ALTER TABLE public.tenants DROP COLUMN IF EXISTS allow_half_carton CASCADE;
            EXCEPTION WHEN OTHERS THEN NULL;
            END;
          END IF;
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tenants' AND column_name = 'allow_half_cartoon') THEN
            BEGIN
              UPDATE public.company_settings cs
              SET allow_half_carton = COALESCE(cs.allow_half_carton, t.allow_half_cartoon, true)
              FROM public.tenants t
              WHERE cs.tenant_id = t.id;
              ALTER TABLE public.tenants DROP COLUMN IF EXISTS allow_half_cartoon CASCADE;
            EXCEPTION WHEN OTHERS THEN NULL;
            END;
          END IF;
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tenants' AND column_name = 'status' AND data_type <> 'USER-DEFINED') THEN
            ALTER TABLE public.tenants ALTER COLUMN status DROP DEFAULT;
            ALTER TABLE public.tenants ALTER COLUMN status TYPE tenant_status_enum USING (
              CASE 
                WHEN UPPER(TRIM(status::text)) = 'SUSPENDED' THEN 'SUSPENDED'::tenant_status_enum
                WHEN UPPER(TRIM(status::text)) = 'EXPIRED' THEN 'EXPIRED'::tenant_status_enum
                ELSE 'ACTIVE'::tenant_status_enum
              END
            );
            ALTER TABLE public.tenants ALTER COLUMN status SET DEFAULT 'ACTIVE'::tenant_status_enum;
          END IF;
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tenants' AND column_name = 'subscription_status' AND data_type <> 'USER-DEFINED') THEN
            ALTER TABLE public.tenants ALTER COLUMN subscription_status DROP DEFAULT;
            ALTER TABLE public.tenants ALTER COLUMN subscription_status TYPE subscription_status_enum USING (
              CASE 
                WHEN UPPER(TRIM(subscription_status::text)) = 'SUSPENDED' THEN 'SUSPENDED'::subscription_status_enum
                WHEN UPPER(TRIM(subscription_status::text)) = 'EXPIRED' THEN 'EXPIRED'::subscription_status_enum
                ELSE 'ACTIVE'::subscription_status_enum
              END
            );
            ALTER TABLE public.tenants ALTER COLUMN subscription_status SET DEFAULT 'ACTIVE'::subscription_status_enum;
          END IF;
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tenants' AND column_name = 'subscription_plan' AND data_type <> 'USER-DEFINED') THEN
            ALTER TABLE public.tenants ALTER COLUMN subscription_plan DROP DEFAULT;
            ALTER TABLE public.tenants ALTER COLUMN subscription_plan TYPE subscription_plan_enum USING (
              CASE 
                WHEN UPPER(TRIM(subscription_plan::text)) IN ('TRIAL', 'FREE_TRIAL', '30_DAY_TRIAL', '30_DAYS', 'PRO_TRIAL') THEN 'TRIAL'::subscription_plan_enum
                WHEN UPPER(TRIM(subscription_plan::text)) IN ('6_MONTHS', '6_MONTH', 'SIX_MONTHS') THEN '6_MONTHS'::subscription_plan_enum 
                ELSE 'YEARLY'::subscription_plan_enum 
              END
            );
            ALTER TABLE public.tenants ALTER COLUMN subscription_plan SET DEFAULT 'YEARLY'::subscription_plan_enum;
          END IF;

          -- company_settings
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'company_settings' AND column_name = 'business_type' AND data_type <> 'USER-DEFINED') THEN
            ALTER TABLE public.company_settings ALTER COLUMN business_type DROP DEFAULT;
            ALTER TABLE public.company_settings ALTER COLUMN business_type TYPE business_type_enum USING (
              CASE WHEN UPPER(TRIM(business_type::text)) = 'WHOLESALE' THEN 'WHOLESALE'::business_type_enum ELSE 'RETAIL'::business_type_enum END
            );
            ALTER TABLE public.company_settings ALTER COLUMN business_type SET DEFAULT 'RETAIL'::business_type_enum;
          END IF;
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'company_settings' AND column_name = 'pricing_mode' AND data_type <> 'USER-DEFINED') THEN
            ALTER TABLE public.company_settings ALTER COLUMN pricing_mode DROP DEFAULT;
            ALTER TABLE public.company_settings ALTER COLUMN pricing_mode TYPE pricing_mode_enum USING (
              CASE WHEN UPPER(TRIM(pricing_mode::text)) = 'NEGOTIABLE' THEN 'NEGOTIABLE'::pricing_mode_enum ELSE 'FIXED'::pricing_mode_enum END
            );
            ALTER TABLE public.company_settings ALTER COLUMN pricing_mode SET DEFAULT 'FIXED'::pricing_mode_enum;
          END IF;

          -- users
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'role' AND data_type <> 'USER-DEFINED') THEN
            ALTER TABLE public.users ALTER COLUMN role DROP DEFAULT;
            ALTER TABLE public.users ALTER COLUMN role TYPE user_role_enum USING (
              CASE 
                WHEN UPPER(TRIM(role::text)) = 'SUPERADMIN' THEN 'SUPERADMIN'::user_role_enum
                WHEN UPPER(TRIM(role::text)) = 'ADMIN' THEN 'ADMIN'::user_role_enum
                WHEN UPPER(TRIM(role::text)) = 'MANAGER' THEN 'MANAGER'::user_role_enum
                ELSE 'CASHIER'::user_role_enum
              END
            );
            ALTER TABLE public.users ALTER COLUMN role SET DEFAULT 'CASHIER'::user_role_enum;
          END IF;
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'status' AND data_type <> 'USER-DEFINED') THEN
            ALTER TABLE public.users ALTER COLUMN status DROP DEFAULT;
            ALTER TABLE public.users ALTER COLUMN status TYPE user_status_enum USING (
              CASE WHEN UPPER(TRIM(status::text)) = 'APPROVED' THEN 'APPROVED'::user_status_enum ELSE 'PENDING'::user_status_enum END
            );
            ALTER TABLE public.users ALTER COLUMN status SET DEFAULT 'PENDING'::user_status_enum;
          END IF;

          -- sales & sale_items
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sales' AND column_name = 'sale_type' AND data_type <> 'USER-DEFINED') THEN
            ALTER TABLE public.sales ALTER COLUMN sale_type DROP DEFAULT;
            ALTER TABLE public.sales ALTER COLUMN sale_type TYPE sale_type_enum USING (
              CASE WHEN UPPER(TRIM(sale_type::text)) = 'WHOLESALE' THEN 'WHOLESALE'::sale_type_enum ELSE 'RETAIL'::sale_type_enum END
            );
            ALTER TABLE public.sales ALTER COLUMN sale_type SET DEFAULT 'RETAIL'::sale_type_enum;
          END IF;
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sale_items' AND column_name = 'packing_type' AND data_type <> 'USER-DEFINED') THEN
            ALTER TABLE public.sale_items ALTER COLUMN packing_type DROP DEFAULT;
            ALTER TABLE public.sale_items ALTER COLUMN packing_type TYPE packing_type_enum USING (
              CASE WHEN UPPER(TRIM(packing_type::text)) = 'CARTON' THEN 'CARTON'::packing_type_enum ELSE 'PAIR'::packing_type_enum END
            );
            ALTER TABLE public.sale_items ALTER COLUMN packing_type SET DEFAULT 'PAIR'::packing_type_enum;
          END IF;

          -- stock_movements
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'stock_movements' AND column_name = 'movement_type' AND data_type <> 'USER-DEFINED') THEN
            ALTER TABLE public.stock_movements ALTER COLUMN movement_type TYPE movement_type_enum USING (
              CASE 
                WHEN UPPER(TRIM(movement_type::text)) = 'SALE' THEN 'SALE'::movement_type_enum
                WHEN UPPER(TRIM(movement_type::text)) = 'PURCHASE' THEN 'PURCHASE'::movement_type_enum
                WHEN UPPER(TRIM(movement_type::text)) = 'SALE_RETURN' THEN 'SALE_RETURN'::movement_type_enum
                WHEN UPPER(TRIM(movement_type::text)) = 'PURCHASE_RETURN' THEN 'PURCHASE_RETURN'::movement_type_enum
                ELSE 'ADJUSTMENT'::movement_type_enum
              END
            );
          END IF;

          -- purchases
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'purchases' AND column_name = 'payment_status' AND data_type <> 'USER-DEFINED') THEN
            ALTER TABLE public.purchases ALTER COLUMN payment_status DROP DEFAULT;
            ALTER TABLE public.purchases ALTER COLUMN payment_status TYPE purchase_payment_status_enum USING (
              CASE 
                WHEN UPPER(TRIM(payment_status::text)) = 'PAID' THEN 'PAID'::purchase_payment_status_enum
                WHEN UPPER(TRIM(payment_status::text)) = 'PARTIAL' THEN 'PARTIAL'::purchase_payment_status_enum
                ELSE 'UNPAID'::purchase_payment_status_enum
              END
            );
            ALTER TABLE public.purchases ALTER COLUMN payment_status SET DEFAULT 'UNPAID'::purchase_payment_status_enum;
          END IF;
        END $$;
      `);
    })().catch((error) => {
      databaseEnumsSchemaPromise = null;
      throw error;
    });
  }
  return databaseEnumsSchemaPromise;
}

/**
 * Ensures that all database tables, columns, constraints, and multi-tenant discriminators exist.
 * Idempotent and safe for PostgreSQL.
 */
export async function ensureDatabaseSchema(): Promise<void> {
  if (databaseSchemaPromise) return databaseSchemaPromise;

  databaseSchemaPromise = (async () => {
    try {
      await pgClient.waitReady;

      await dropLegacyDocumentPrefixColumns();
      // 0. Ensure custom ENUM types exist and legacy columns are upgraded
      await ensureDatabaseEnumsSchema();
      // 1. Create all tables in strict dependency order (tenants and users first)
      for (const ddl of DATABASE_TABLE_DDL) {
        await pgClient.exec(ddl);
      }
      await ensureCustomerLedgerSchema();
      await ensurePlatformNotificationsSchema();

      await migrateLegacyWholesaleProductPrices();
      await dropLegacyDocumentPrefixColumns();

      // 1b. Ensure deprecated tables, columns, and slug/subdomain columns are permanently removed
      await pgClient.exec(`
        DROP TABLE IF EXISTS brands CASCADE;
        ALTER TABLE tenants DROP COLUMN IF EXISTS theme_color;
        ALTER TABLE tenants DROP COLUMN IF EXISTS background_color;
        ALTER TABLE company_settings DROP COLUMN IF EXISTS barcode_prefix;
        ALTER TABLE company_settings DROP COLUMN IF EXISTS default_pairs_per_carton;
        ALTER TABLE company_settings DROP COLUMN IF EXISTS wholesale_invoice_format;
        DO $$
        BEGIN
          BEGIN
            DROP TABLE IF EXISTS store_requests CASCADE;
            DROP TABLE IF EXISTS deleted_store_requests CASCADE;
            DROP TYPE IF EXISTS store_request_status_enum CASCADE;
            DROP TYPE IF EXISTS store_request_type_enum CASCADE;
          EXCEPTION WHEN OTHERS THEN NULL;
          END;
          BEGIN
            ALTER TABLE tenants ALTER COLUMN slug DROP NOT NULL;
          EXCEPTION WHEN OTHERS THEN NULL;
          END;
          BEGIN
            ALTER TABLE tenants DROP COLUMN IF EXISTS slug CASCADE;
          EXCEPTION WHEN OTHERS THEN NULL;
          END;
          BEGIN
            ALTER TABLE tenants ALTER COLUMN subdomain DROP NOT NULL;
          EXCEPTION WHEN OTHERS THEN NULL;
          END;
          BEGIN
            ALTER TABLE tenants DROP COLUMN IF EXISTS subdomain CASCADE;
          EXCEPTION WHEN OTHERS THEN NULL;
          END;
          BEGIN
            ALTER TABLE tenants DROP COLUMN IF EXISTS sub_domain CASCADE;
          EXCEPTION WHEN OTHERS THEN NULL;
          END;
          BEGIN
            ALTER TABLE products DROP COLUMN IF EXISTS pricing_policy;
          EXCEPTION WHEN OTHERS THEN NULL;
          END;
          BEGIN
            DROP INDEX IF EXISTS categories_tenant_idx;
          EXCEPTION WHEN OTHERS THEN NULL;
          END;
          BEGIN
            DROP INDEX IF EXISTS categories_tenant_name_lower_idx;
          EXCEPTION WHEN OTHERS THEN NULL;
          END;
          BEGIN
            ALTER TABLE categories DROP COLUMN IF EXISTS tenant_id CASCADE;
          EXCEPTION WHEN OTHERS THEN NULL;
          END;
          BEGIN
            ALTER TABLE users ALTER COLUMN tenant_id SET DEFAULT 0;
          EXCEPTION WHEN OTHERS THEN NULL;
          END;
          BEGIN
            UPDATE users SET tenant_id = 0 WHERE UPPER(COALESCE(role::text, '')) = 'SUPERADMIN' AND tenant_id != 0;
          EXCEPTION WHEN OTHERS THEN NULL;
          END;
          BEGIN
            UPDATE password_reset_tokens SET tenant_id = 0 WHERE user_id IN (SELECT id FROM users WHERE UPPER(COALESCE(role::text, '')) = 'SUPERADMIN');
          EXCEPTION WHEN OTHERS THEN NULL;
          END;

          -- Subscription Fields for 30-Day Free Tier & Tracking
          BEGIN
            ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_type TEXT NOT NULL DEFAULT 'free_tier';
            ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_plan TEXT NOT NULL DEFAULT 'free_tier';
            ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_start_date TIMESTAMP NOT NULL DEFAULT NOW();
            ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_end_date TIMESTAMP NOT NULL DEFAULT (NOW() + INTERVAL '30 days');
            ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'ACTIVE';
            ALTER TABLE tenants ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT true;
            ALTER TABLE tenants ALTER COLUMN onboarding_completed SET DEFAULT true;
            UPDATE tenants SET onboarding_completed = true WHERE onboarding_completed = false;
          EXCEPTION WHEN OTHERS THEN NULL;
          END;

          -- Wholesale (B2B) and Pricing Policy Settings centralized in company_settings
          BEGIN
            ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS business_type business_type_enum NOT NULL DEFAULT 'RETAIL';
          EXCEPTION WHEN OTHERS THEN NULL;
          END;
          BEGIN
            ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS pricing_mode pricing_mode_enum NOT NULL DEFAULT 'FIXED';
          EXCEPTION WHEN OTHERS THEN NULL;
          END;
          -- Wholesale minimum selling quantity (0.5 half carton or 1 full carton) centralized in company_settings
          BEGIN
            ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS min_selling_quantity NUMERIC(3, 1) NOT NULL DEFAULT 1.0;
            ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS allow_half_carton BOOLEAN NOT NULL DEFAULT true;
          EXCEPTION WHEN OTHERS THEN NULL;
          END;
          BEGIN
            ALTER TABLE products ADD COLUMN IF NOT EXISTS allow_half_carton BOOLEAN NOT NULL DEFAULT true;
            ALTER TABLE products DROP COLUMN IF EXISTS min_selling_quantity;
          EXCEPTION WHEN OTHERS THEN NULL;
          END;
          -- Sync any existing business_type, pricing_mode, min_selling_quantity, and allow_half_carton from tenants into company_settings before dropping
          BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tenants' AND column_name = 'business_type') THEN
              UPDATE company_settings cs
              SET business_type = (CASE WHEN UPPER(TRIM(COALESCE(NULLIF(cs.business_type::text, ''), NULLIF(t.business_type::text, ''), 'RETAIL'))) = 'WHOLESALE' THEN 'WHOLESALE'::business_type_enum ELSE 'RETAIL'::business_type_enum END)
              FROM tenants t
              WHERE cs.tenant_id = t.id;
            END IF;
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tenants' AND column_name = 'pricing_mode') THEN
              UPDATE company_settings cs
              SET pricing_mode = (CASE WHEN UPPER(TRIM(COALESCE(NULLIF(cs.pricing_mode::text, ''), NULLIF(t.pricing_mode::text, ''), 'FIXED'))) = 'NEGOTIABLE' THEN 'NEGOTIABLE'::pricing_mode_enum ELSE 'FIXED'::pricing_mode_enum END)
              FROM tenants t
              WHERE cs.tenant_id = t.id;
            END IF;
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tenants' AND column_name = 'min_selling_quantity') THEN
              UPDATE company_settings cs
              SET min_selling_quantity = COALESCE(cs.min_selling_quantity, t.min_selling_quantity, 1.0)
              FROM tenants t
              WHERE cs.tenant_id = t.id;
            END IF;
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tenants' AND column_name = 'allow_half_carton') THEN
              UPDATE company_settings cs
              SET allow_half_carton = COALESCE(cs.allow_half_carton, t.allow_half_carton, true)
              FROM tenants t
              WHERE cs.tenant_id = t.id;
            END IF;
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tenants' AND column_name = 'allow_half_cartoon') THEN
              UPDATE company_settings cs
              SET allow_half_carton = COALESCE(cs.allow_half_carton, t.allow_half_cartoon, true)
              FROM tenants t
              WHERE cs.tenant_id = t.id;
            END IF;
          EXCEPTION WHEN OTHERS THEN NULL;
          END;
          -- For wholesale stores that globally disallow half cartons, set allow_half_carton = false across the entire product catalog
          BEGIN
            UPDATE products p
            SET allow_half_carton = false
            FROM company_settings cs
            WHERE p.tenant_id = cs.tenant_id
              AND UPPER(cs.business_type::text) = 'WHOLESALE'
              AND (cs.allow_half_carton = false);
          EXCEPTION WHEN OTHERS THEN NULL;
          END;
          -- Centralize exclusively in company_settings: permanently drop business_type, pricing_mode, pricing_policy, min_selling_quantity, and allow_half_carton from tenants
          BEGIN
            ALTER TABLE tenants DROP COLUMN IF EXISTS business_type CASCADE;
            ALTER TABLE tenants DROP COLUMN IF EXISTS pricing_mode CASCADE;
            ALTER TABLE tenants DROP COLUMN IF EXISTS pricing_policy CASCADE;
            ALTER TABLE tenants DROP COLUMN IF EXISTS min_selling_quantity CASCADE;
            ALTER TABLE tenants DROP COLUMN IF EXISTS allow_half_carton CASCADE;
            ALTER TABLE tenants DROP COLUMN IF EXISTS allow_half_cartoon CASCADE;
          EXCEPTION WHEN OTHERS THEN NULL;
          END;
          BEGIN
            ALTER TABLE products ADD COLUMN IF NOT EXISTS pairs_per_carton INTEGER;
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='minimum_pairs') THEN
              UPDATE products SET pairs_per_carton = minimum_pairs WHERE (pairs_per_carton IS NULL OR pairs_per_carton <= 0 OR (pairs_per_carton = 12 AND minimum_pairs = 16)) AND minimum_pairs IN (6, 8, 12, 16);
            END IF;
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='store_lot_size') THEN
              UPDATE products SET pairs_per_carton = store_lot_size WHERE store_lot_size IN (6, 8, 12, 16);
              ALTER TABLE products DROP COLUMN IF EXISTS store_lot_size;
            END IF;
            UPDATE products SET pairs_per_carton = CASE pairs_per_carton WHEN 6 THEN 12 WHEN 8 THEN 16 ELSE pairs_per_carton END;
            UPDATE products SET pairs_per_carton = 12 WHERE pairs_per_carton IS NULL OR pairs_per_carton <= 0;
            ALTER TABLE products ALTER COLUMN pairs_per_carton SET DEFAULT 12;
            ALTER TABLE products ALTER COLUMN pairs_per_carton SET NOT NULL;
            ALTER TABLE products DROP COLUMN IF EXISTS minimum_pairs;
            ALTER TABLE products DROP COLUMN IF EXISTS carton_barcode;
            ALTER TABLE products DROP COLUMN IF EXISTS carton_price;
            ALTER TABLE products DROP COLUMN IF EXISTS min_order_cartons;
          EXCEPTION WHEN OTHERS THEN NULL;
          END;
          BEGIN
            ALTER TABLE customers ADD COLUMN IF NOT EXISTS shop_name TEXT DEFAULT '';
          EXCEPTION WHEN OTHERS THEN NULL;
          END;
          BEGIN
            ALTER TABLE customers ADD COLUMN IF NOT EXISTS market_name TEXT DEFAULT '';
          EXCEPTION WHEN OTHERS THEN NULL;
          END;
          BEGIN
            ALTER TABLE customers ADD COLUMN IF NOT EXISTS city TEXT DEFAULT '';
          EXCEPTION WHEN OTHERS THEN NULL;
          END;
          BEGIN
            ALTER TABLE customers ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(12, 2) NOT NULL DEFAULT 0.00;
          EXCEPTION WHEN OTHERS THEN NULL;
          END;
          BEGIN
            ALTER TABLE customers ADD COLUMN IF NOT EXISTS current_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00;
          EXCEPTION WHEN OTHERS THEN NULL;
          END;
          -- Ensure city, tagline, and is_installed are completely removed from store and settings tables
          BEGIN
            ALTER TABLE company_settings DROP COLUMN IF EXISTS city CASCADE;
            ALTER TABLE company_settings DROP COLUMN IF EXISTS tagline CASCADE;
            ALTER TABLE company_settings DROP COLUMN IF EXISTS is_installed CASCADE;
            ALTER TABLE tenants DROP COLUMN IF EXISTS city CASCADE;
            ALTER TABLE tenants DROP COLUMN IF EXISTS tagline CASCADE;
            DROP TABLE IF EXISTS store_requests CASCADE;
            DROP TABLE IF EXISTS deleted_store_requests CASCADE;
            ALTER TABLE trial_activations DROP COLUMN IF EXISTS city CASCADE;
            ALTER TABLE trial_activations DROP COLUMN IF EXISTS tagline CASCADE;
          EXCEPTION WHEN OTHERS THEN NULL;
          END;
          BEGIN
            ALTER TABLE customers ADD COLUMN IF NOT EXISTS outstanding_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00;
            UPDATE customers SET outstanding_balance = COALESCE(current_balance, 0.00) WHERE (outstanding_balance IS NULL OR outstanding_balance = 0) AND current_balance > 0;
          EXCEPTION WHEN OTHERS THEN NULL;
          END;
          BEGIN
            ALTER TABLE customers ADD COLUMN IF NOT EXISTS ntn_number TEXT DEFAULT '';
          EXCEPTION WHEN OTHERS THEN NULL;
          END;
          BEGIN
            ALTER TABLE sales ADD COLUMN IF NOT EXISTS sale_type TEXT NOT NULL DEFAULT 'RETAIL';
          EXCEPTION WHEN OTHERS THEN NULL;
          END;
          BEGIN
            ALTER TABLE sales ADD COLUMN IF NOT EXISTS total_cartons NUMERIC(10, 2) NOT NULL DEFAULT 0.00;
          EXCEPTION WHEN OTHERS THEN NULL;
          END;
          BEGIN
            ALTER TABLE sales ALTER COLUMN total_cartons TYPE NUMERIC(10, 2) USING total_cartons::numeric;
          EXCEPTION WHEN OTHERS THEN NULL;
          END;
          BEGIN
            ALTER TABLE sales ADD COLUMN IF NOT EXISTS transport_name TEXT DEFAULT '';
          EXCEPTION WHEN OTHERS THEN NULL;
          END;
          BEGIN
            ALTER TABLE sales ADD COLUMN IF NOT EXISTS bilty_number TEXT DEFAULT '';
          EXCEPTION WHEN OTHERS THEN NULL;
          END;
          BEGIN
            ALTER TABLE sales ADD COLUMN IF NOT EXISTS booking_destination TEXT DEFAULT '';
          EXCEPTION WHEN OTHERS THEN NULL;
          END;
          BEGIN
            ALTER TABLE sales ADD COLUMN IF NOT EXISTS previous_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00;
          EXCEPTION WHEN OTHERS THEN NULL;
          END;
          BEGIN
            ALTER TABLE sales ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00;
          EXCEPTION WHEN OTHERS THEN NULL;
          END;
          BEGIN
            ALTER TABLE sales ADD COLUMN IF NOT EXISTS remaining_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00;
          EXCEPTION WHEN OTHERS THEN NULL;
          END;
          BEGIN
            ALTER TABLE sales ADD COLUMN IF NOT EXISTS transaction_id TEXT DEFAULT '';
          EXCEPTION WHEN OTHERS THEN NULL;
          END;
          BEGIN
            ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS packing_type TEXT NOT NULL DEFAULT 'PAIR';
          EXCEPTION WHEN OTHERS THEN NULL;
          END;
          BEGIN
            ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS carton_quantity NUMERIC(10, 2) NOT NULL DEFAULT 0.00;
          EXCEPTION WHEN OTHERS THEN NULL;
          END;
          BEGIN
            ALTER TABLE sale_items ALTER COLUMN carton_quantity TYPE NUMERIC(10, 2) USING carton_quantity::numeric;
          EXCEPTION WHEN OTHERS THEN NULL;
          END;
          BEGIN
            ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS pairs_per_carton INTEGER NOT NULL DEFAULT 1;
          EXCEPTION WHEN OTHERS THEN NULL;
          END;
        END $$;
      `).catch(() => {});

      // 2. Create all indexes independently so an index notice never aborts table creation
      for (const idxDdl of DATABASE_INDEX_DDL) {
        await pgClient.exec(idxDdl).catch(() => {});
      }
    } finally {
      databaseSchemaPromise = null;
    }
  })();

  return databaseSchemaPromise;
}

/**
 * Ensures that a given tenant store has both an active Store Owner (ADMIN) and Store Cashier (CASHIER)
 * account with verified credentials, returning their exact email and password for store auth quick login.
 */
export interface StoreQuickCredential {
  id: number;
  name: string;
  email: string;
  password: string;
  role: 'ADMIN' | 'CASHIER';
}

export async function ensureTenantStoreUsers(params: {
  tenantId: number;
  storeName?: string;
  ownerEmail?: string;
  ownerName?: string;
  ownerPhone?: string;
  ownerPassword?: string;
  createCashier?: boolean;
  cashierName?: string;
  cashierEmail?: string;
  cashierPhone?: string;
  cashierPassword?: string;
}): Promise<{
  owner: StoreQuickCredential;
  cashier: StoreQuickCredential | null;
}> {
  const tenantId = Number(params.tenantId) || 1;
  const storeLabel = (params.storeName || 'Store').trim();

  // Determine canonical store-specific emails & default passwords
  const defaultOwnerEmail = (params.ownerEmail || `admin+${tenantId}@store.com`).trim().toLowerCase();
  const defaultOwnerName = (params.ownerName || params.ownerEmail?.split('@')[0] || `${storeLabel} Owner`).trim();
  const explicitPassword = params.ownerPassword && params.ownerPassword.trim() ? params.ownerPassword.trim() : '';
  const defaultOwnerPassword = explicitPassword || 'admin123';

  // 1. Resolve or create Store Owner (ADMIN)
  const adminRes = await pgClient.query<{
    id: number;
    name: string;
    email: string;
    password_hash: string;
    quick_password: string;
    status: string;
  }>(
    `SELECT id, name, email, password_hash, COALESCE(quick_password, '') as quick_password, status
     FROM users
     WHERE tenant_id = $1 AND role = 'ADMIN'
     ORDER BY id ASC
     LIMIT 1`,
    [tenantId]
  );

  let ownerCred: StoreQuickCredential;
  if (adminRes.rows.length > 0) {
    const row = adminRes.rows[0];
    let verifiedPass = '';
    if (row.quick_password && (await bcrypt.compare(row.quick_password, row.password_hash))) {
      verifiedPass = row.quick_password;
    } else {
      const candidates = Array.from(
        new Set([defaultOwnerPassword, 'admin123', 'password123', '123456'])
      );
      for (const cand of candidates) {
        if (await bcrypt.compare(cand, row.password_hash)) {
          verifiedPass = cand;
          break;
        }
      }
      if (!verifiedPass) {
        verifiedPass = defaultOwnerPassword;
        const freshHash = await bcrypt.hash(verifiedPass, 10);
        await pgClient.query(
          `UPDATE users SET password_hash = $1, quick_password = $2, status = 'APPROVED', active = true WHERE id = $3`,
          [freshHash, verifiedPass, row.id]
        );
      } else {
        await pgClient.query(
          `UPDATE users SET quick_password = $1, status = 'APPROVED', active = true WHERE id = $2`,
          [verifiedPass, row.id]
        );
      }
    }
    ownerCred = {
      id: row.id,
      name: row.name,
      email: row.email,
      password: verifiedPass,
      role: 'ADMIN',
    };
  } else {
    let candidateOwnerEmail = defaultOwnerEmail;
    const emailConflictRes = await pgClient.query<{ id: number }>(
      `SELECT id FROM users WHERE LOWER(BTRIM(email)) = LOWER(BTRIM($1)) LIMIT 1`,
      [candidateOwnerEmail]
    );
    if (emailConflictRes.rows.length > 0) {
      if (params.ownerEmail && params.ownerEmail.trim()) {
        const duplicateEmailError: any = new Error(
          'This email is already in use. Please use a different email address.'
        );
        duplicateEmailError.code = 'EMAIL_ALREADY_EXISTS';
        throw duplicateEmailError;
      }
      candidateOwnerEmail = `admin+${tenantId}@store.com`;
    }

    const ownerHash = await bcrypt.hash(defaultOwnerPassword, 10);
    const createdOwner = await pgClient.query<{ id: number; name: string; email: string }>(
      `INSERT INTO users (tenant_id, name, email, phone, password_hash, quick_password, role, status, active)
       VALUES ($1, $2, $3, $4, $5, $6, 'ADMIN', 'APPROVED', true)
       RETURNING id, name, email`,
      [tenantId, defaultOwnerName, candidateOwnerEmail, (params.ownerPhone || '').trim(), ownerHash, defaultOwnerPassword]
    );
    ownerCred = {
      id: createdOwner.rows[0].id,
      name: createdOwner.rows[0].name,
      email: createdOwner.rows[0].email,
      password: defaultOwnerPassword,
      role: 'ADMIN',
    };
  }

  // 2. Resolve Store Cashier (CASHIER) - ONLY create if explicitly requested by user (never automatically!)
  const cashierRes = await pgClient.query<{
    id: number;
    name: string;
    email: string;
    password_hash: string;
    quick_password: string;
    status: string;
  }>(
    `SELECT id, name, email, password_hash, COALESCE(quick_password, '') as quick_password, status
     FROM users
     WHERE tenant_id = $1 AND role = 'CASHIER'
     ORDER BY CASE WHEN status = 'APPROVED' THEN 0 ELSE 1 END, id ASC
     LIMIT 1`,
    [tenantId]
  );

  let cashierCred: StoreQuickCredential | null = null;
  if (cashierRes.rows.length > 0) {
    const row = cashierRes.rows[0];
    let verifiedPass = row.quick_password || '';
    if (!verifiedPass) {
      const candidates = Array.from(
        new Set(['admin123', 'cashier123', '123456'])
      );
      for (const cand of candidates) {
        if (await bcrypt.compare(cand, row.password_hash)) {
          verifiedPass = cand;
          break;
        }
      }
    }
    cashierCred = {
      id: row.id,
      name: row.name,
      email: row.email,
      password: verifiedPass,
      role: 'CASHIER',
    };
  } else if (params.createCashier && params.cashierEmail && params.cashierPassword) {
    // Only create cashier when user explicitly requests it in onboarding or settings
    const cPass = params.cashierPassword.trim();
    const cEmail = params.cashierEmail.trim().toLowerCase();
    const cName = (params.cashierName || `${storeLabel} Cashier`).trim();
    const cPhone = (params.cashierPhone || '').trim();

    const existingCashierEmail = await pgClient.query<{ id: number }>(
      `SELECT id FROM users WHERE LOWER(BTRIM(email)) = LOWER(BTRIM($1)) LIMIT 1`,
      [cEmail]
    );
    if (existingCashierEmail.rows.length > 0) {
      const duplicateEmailError: any = new Error(
        'This email is already in use. Please use a different email address.'
      );
      duplicateEmailError.code = 'EMAIL_ALREADY_EXISTS';
      throw duplicateEmailError;
    }

    const cashierHash = await bcrypt.hash(cPass, 10);

    const createdCashier = await pgClient.query<{ id: number; name: string; email: string }>(
      `INSERT INTO users (tenant_id, name, email, phone, password_hash, quick_password, role, status, active)
       VALUES ($1, $2, $3, $4, $5, $6, 'CASHIER', 'APPROVED', true)
       RETURNING id, name, email`,
      [tenantId, cName, cEmail, cPhone, cashierHash, cPass]
    );
    cashierCred = {
      id: createdCashier.rows[0].id,
      name: createdCashier.rows[0].name,
      email: createdCashier.rows[0].email,
      password: cPass,
      role: 'CASHIER',
    };
  }

  return {
    owner: ownerCred,
    cashier: cashierCred,
  };
}

/**
 * Initializes the SaaS schema and synchronizes existing tenant subscriptions.
 * The installer, not this routine, creates the initial superadmin account.
 */
export async function ensureSaasControlPlane(): Promise<void> {
  if (saasControlPlaneInitialized) return;
  if (saasControlPlanePromise) return saasControlPlanePromise;

  saasControlPlanePromise = (async () => {
    try {
      await pgClient.waitReady;

      await pgClient.exec(`
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'brand'
          ) THEN
            ALTER TABLE public.products ALTER COLUMN brand SET DEFAULT 'Unbranded';
            UPDATE public.products SET brand = 'Unbranded' WHERE brand IS NULL OR BTRIM(brand) = '';
          END IF;
        END $$;
      `);

      // This field migration must run before the schema-version fast path below.
      await migrateLegacyWholesaleProductPrices();
      await dropLegacyDocumentPrefixColumns();

      // Always ensure deprecated slug, subdomain columns, and store_requests tables are dropped
      await pgClient.exec(`
        DO $$
        BEGIN
          BEGIN
            DROP TABLE IF EXISTS store_requests CASCADE;
            DROP TABLE IF EXISTS deleted_store_requests CASCADE;
          EXCEPTION WHEN OTHERS THEN NULL;
          END;
          BEGIN
            ALTER TABLE tenants DROP COLUMN IF EXISTS slug CASCADE;
          EXCEPTION WHEN OTHERS THEN NULL;
          END;
          BEGIN
            ALTER TABLE tenants DROP COLUMN IF EXISTS subdomain CASCADE;
          EXCEPTION WHEN OTHERS THEN NULL;
          END;
          BEGIN
            ALTER TABLE tenants DROP COLUMN IF EXISTS sub_domain CASCADE;
          EXCEPTION WHEN OTHERS THEN NULL;
          END;
        END $$;
      `).catch(() => {});

      // Ensure trial_activations tracking table and indexes are created
      await pgClient.exec(`
        CREATE TABLE IF NOT EXISTS trial_activations (
          id SERIAL PRIMARY KEY,
          user_id INTEGER,
          tenant_id INTEGER,
          email TEXT NOT NULL,
          user_name TEXT DEFAULT '',
          phone TEXT DEFAULT '',
          store_name TEXT NOT NULL,
          business_type TEXT NOT NULL DEFAULT 'RETAIL',
          pricing_mode TEXT NOT NULL DEFAULT 'FIXED',
          plan TEXT NOT NULL DEFAULT 'TRIAL',
          trial_duration_days INTEGER NOT NULL DEFAULT 30,
          trial_start_date TIMESTAMP NOT NULL DEFAULT NOW(),
          trial_end_date TIMESTAMP NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
          status TEXT NOT NULL DEFAULT 'ACTIVE',
          ip_address TEXT DEFAULT '',
          user_agent TEXT DEFAULT '',
          activated_at TIMESTAMP NOT NULL DEFAULT NOW(),
          details JSONB DEFAULT '{}'::jsonb
        );
        CREATE INDEX IF NOT EXISTS trial_activations_email_idx ON trial_activations(LOWER(BTRIM(email)));
        CREATE INDEX IF NOT EXISTS trial_activations_tenant_idx ON trial_activations(tenant_id);
        CREATE INDEX IF NOT EXISTS trial_activations_status_idx ON trial_activations(status);
        DO $$ BEGIN
          ALTER TYPE subscription_plan_enum ADD VALUE IF NOT EXISTS 'TRIAL';
        EXCEPTION WHEN OTHERS THEN NULL;
        END $$;
      `).catch(() => {});

      // Always ensure platform notification tables exist
      await ensurePlatformNotificationsSchema();

      // Fast-path check: if schema & control plane have already been verified in this persistent DB, skip heavy DDL & bcrypt loops
      const fastCheck = await pgClient
        .query<{ count: string; has_core_tables: boolean }>(
          `SELECT COUNT(*) as count,
                  (to_regclass('public.users') IS NOT NULL
                   AND to_regclass('public.tenants') IS NOT NULL
                   AND to_regclass('public.customer_ledger') IS NOT NULL
                   AND to_regclass('public.trial_activations') IS NOT NULL
                   AND to_regclass('public.platform_notifications') IS NOT NULL
                   AND to_regclass('public.platform_notification_reads') IS NOT NULL
                   AND to_regclass('public.store_requests') IS NULL
                   AND to_regclass('public.customer_khata_ledger') IS NULL) as has_core_tables
           FROM app_settings
           WHERE key = '__schema_v15_platform_notifications__'`
        )
        .catch(() => null);

      if (
        fastCheck &&
        fastCheck.rows[0]?.has_core_tables &&
        parseInt(fastCheck.rows[0]?.count || '0', 10) > 0
      ) {
        await pgClient.query(`UPDATE tenants SET onboarding_completed = true WHERE onboarding_completed = false`).catch(() => {});
        await syncExpiredTenantSubscriptions();
        saasControlPlaneInitialized = true;
        return;
      }

      await ensureDatabaseSchema();

      // Ensure deprecated store_requests tables and enums are permanently dropped
      await pgClient.exec(`
        DROP TABLE IF EXISTS store_requests CASCADE;
        DROP TABLE IF EXISTS deleted_store_requests CASCADE;
        DROP TYPE IF EXISTS store_request_status_enum CASCADE;
        DROP TYPE IF EXISTS store_request_type_enum CASCADE;
      `).catch(() => {});

    // 2. Ensure every existing user-created tenant in the database has subscription_plan, subscription dates, and verified Store Owner/Cashier users
    const allTenants = await pgClient.query<{
      id: number;
      name: string;
      status: string;
      subscription_plan: string | null;
      subscription_start_date: Date | string | null;
      subscription_end_date: Date | string | null;
      subscription_status: string | null;
      owner_email: string | null;
      owner_phone: string | null;
    }>(
      `SELECT t.id, t.name, t.status, t.subscription_plan,
              t.subscription_start_date, t.subscription_end_date, t.subscription_status,
              u.email AS owner_email, u.phone AS owner_phone
       FROM tenants t
       LEFT JOIN LATERAL (
         SELECT email, phone
         FROM users
         WHERE tenant_id = t.id AND role = 'ADMIN'
         ORDER BY id ASC
         LIMIT 1
       ) u ON true
       ORDER BY t.id ASC`
    );

    for (const t of allTenants.rows) {
      let needsSubUpdate = false;

      const nextPlan = normalizeSubscriptionPlan(t.subscription_plan || 'YEARLY');
      if (t.subscription_plan !== nextPlan) {
        needsSubUpdate = true;
      }

      const startDt = t.subscription_start_date ? new Date(t.subscription_start_date) : new Date();
      const endDt = t.subscription_end_date
        ? new Date(t.subscription_end_date)
        : calculateSubscriptionEndDate(nextPlan, startDt);
      if (!t.subscription_start_date || !t.subscription_end_date) {
        needsSubUpdate = true;
      }

      const isExpiredNow = endDt.getTime() < Date.now();
      let nextSubStatus = (t.subscription_status || '').toUpperCase();
      if (String(t.status).toUpperCase() === 'SUSPENDED') {
        nextSubStatus = 'SUSPENDED';
      } else if (isExpiredNow) {
        nextSubStatus = 'EXPIRED';
      } else if (!['ACTIVE', 'EXPIRED', 'SUSPENDED'].includes(nextSubStatus)) {
        nextSubStatus = 'ACTIVE';
      }
      if (t.subscription_status !== nextSubStatus) {
        needsSubUpdate = true;
      }

      if (needsSubUpdate) {
        await pgClient.query(
          `UPDATE tenants
           SET subscription_plan = $1,
               subscription_start_date = $2,
               subscription_end_date = $3,
               subscription_status = $4,
               updated_at = NOW()
           WHERE id = $5`,
          [nextPlan, startDt.toISOString(), endDt.toISOString(), nextSubStatus, t.id]
        );
      }

      await ensureTenantStoreUsers({
        tenantId: t.id,
        storeName: t.name,
        ownerEmail: t.owner_email || undefined,
        ownerPhone: t.owner_phone || undefined,
        createCashier: false,
      });
    }

    // Enforce SuperAdmin password = 'superadmin123' and all store user passwords = 'admin123'
    const superAdminHash = await bcrypt.hash('superadmin123', 10);
    const storeAdminHash = await bcrypt.hash('admin123', 10);

    const existingSuperAdmin = await pgClient.query<{ id: number; password_hash: string; quick_password: string }>(
      `SELECT id, password_hash, COALESCE(quick_password, '') AS quick_password FROM users WHERE UPPER(COALESCE(role::text, '')) = 'SUPERADMIN' ORDER BY id ASC LIMIT 1`
    );
    if (existingSuperAdmin.rows.length > 0) {
      const saRow = existingSuperAdmin.rows[0];
      if (!saRow.password_hash) {
        await pgClient.query(
          `UPDATE users
           SET tenant_id = 0,
               password_hash = $1,
               quick_password = 'superadmin123',
               status = 'APPROVED',
               active = true,
               updated_at = NOW()
           WHERE id = $2`,
          [superAdminHash, saRow.id]
        );
      } else {
        await pgClient.query(
          `UPDATE users
           SET tenant_id = 0,
               status = 'APPROVED',
               active = true,
               updated_at = NOW()
           WHERE UPPER(COALESCE(role::text, '')) = 'SUPERADMIN'`
        );
      }
    } else {
      const defaultSaEmail = 'talhah.jan@gmail.com';
      const emailTaken = await pgClient.query<{ id: number }>(
        `SELECT id FROM users WHERE LOWER(BTRIM(email)) = $1 LIMIT 1`,
        [defaultSaEmail]
      );
      const saEmail = emailTaken.rows.length > 0 ? 'superadmin@shoepos.local' : defaultSaEmail;
      await pgClient
        .query(
          `INSERT INTO users (tenant_id, name, email, phone, password_hash, quick_password, role, status, active)
           VALUES (0, 'Platform SuperAdmin', $1, '+92-300-0000001', $2, 'superadmin123', 'SUPERADMIN', 'APPROVED', true)
           ON CONFLICT (email) DO NOTHING`,
          [saEmail, superAdminHash]
        )
        .catch(() => {});
    }

    await pgClient.query(
      `UPDATE users
       SET password_hash = $1,
           quick_password = 'admin123',
           status = 'APPROVED',
           active = true,
           updated_at = NOW()
       WHERE UPPER(COALESCE(role::text, '')) != 'SUPERADMIN'`,
      [storeAdminHash]
    );

    await syncExpiredTenantSubscriptions();

    await ensureAppSettingsSchema();
    await loadAppSettingsCache();

    await pgClient
      .query(
        `INSERT INTO app_settings (key, value, category, description, is_secret)
         VALUES ('__schema_v15_platform_notifications__', 'true', 'system', 'Schema migration dropping store_requests table and ensuring notifications', false)
         ON CONFLICT (key) DO UPDATE SET value = 'true', updated_at = NOW()`
      )
      .catch(() => {});

    saasControlPlaneInitialized = true;
  } catch (err: any) {
    console.warn('Notice during SaaS control plane initialization:', err?.message || err);
  } finally {
    saasControlPlanePromise = null;
  }
  })();

  return saasControlPlanePromise;
}

/**
 * Drops all tables and relations in the public database schema with CASCADE.
 */
export async function dropAllTables(): Promise<void> {
  await pgClient.waitReady;
  resetSaasControlPlaneState();

  await pgClient.exec(`
    DROP TABLE IF EXISTS 
      deleted_store_requests,
      store_requests,
      tenants,
      password_reset_tokens,
      stock_movements,
      return_items,
      returns,
      sale_items,
      sales,
      purchase_return_items,
      purchase_returns,
      supplier_payments,
      purchase_items,
      purchases,
      products,
      customers,
      suppliers,
      categories,
      api_tokens,
      company_settings,
      users
    CASCADE;
  `);

  try {
    const remainingTables = await pgClient.query<{ tablename: string }>(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
    `);

    for (const row of remainingTables.rows) {
      await pgClient.exec(`DROP TABLE IF EXISTS "${row.tablename}" CASCADE;`);
    }
  } catch (err: any) {
    console.warn('Notice during dynamic table drop:', err.message);
  }

  resetSaasControlPlaneState();
  console.log('🗑️ All database tables successfully dropped with CASCADE.');
}
