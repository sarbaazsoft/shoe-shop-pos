import { Router } from 'express';
import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { pgClient } from '../../db/index.ts';
import { ensureSaasControlPlane, ensureDatabaseSchema, ensurePlatformNotificationsSchema, ensureTenantStoreUsers, ensureEmailVerificationSchema, normalizeSubscriptionPlan, normalizeSubscriptionType, calculateSubscriptionEndDate, calculateDaysLeft, daysLeft, syncExpiredTenantSubscriptions, clearSubscriptionAlertsOnRenewal } from '../../db/schemaInit.ts';
import { requireAuth, requireAdmin, requireSuperAdmin, generateToken, type AuthenticatedRequest, type AuthUser } from '../auth.ts';
import { notifyPlatformAnnouncement } from '../pushNotificationService.ts';
import { sendWelcomeMsg } from '../services/welcomeService.ts';
import { sendTrialActivationEmail } from '../utils/email.ts';
import { resolveTenantContext, isTenantOnlineInMiddleware, getTenantMiddlewareLastSeen, removeTenantMiddlewarePresence, getOnlineTenantCount, getTenantPresenceStats } from '../middleware/tenantMiddleware.ts';
import { getCachedAppSetting } from '../services/appSettingsService.ts';

const router = Router();

// Standard PWA colors (match public/manifest.webmanifest and index.html)
const DEFAULT_PWA_THEME_COLOR = '#2563EB';
const DEFAULT_PWA_BACKGROUND_COLOR = '#ffffff';

/**
 * 1. DYNAMIC STORE PWA MANIFEST (`/api/tenants/manifest?tenantId=...`)
 * Generates a separate PWA manifest for each store.
 * Dynamic Fields: `name`, `short_name`, `start_url`. Colors are the app-wide defaults.
 * Each installed store app starts at `/?tenantId=[tenant_id]` and resolves its own
 * sign-in from the shared origin.
 */
router.get(['/tenants/manifest', '/tenants/manifest.json', '/tenants/manifest.webmanifest'], async (req: Request, res: Response) => {
  try {
    await ensureSaasControlPlane();
    const tenantId = Number(req.query.tenantId ?? req.headers['x-tenant-id']);
    if (!Number.isSafeInteger(tenantId) || tenantId <= 0) return res.status(400).json({ error: 'A valid tenantId is required.' });

    const tenantRes = await pgClient.query<{
      id: number;
      name: string;
      status: string;
      logo_url: string;
    }>(
      `SELECT t.id, t.name, t.status,
              COALESCE(NULLIF(cs.logo, ''), '/pwa-512x512.png') AS logo_url
       FROM tenants t
       LEFT JOIN company_settings cs ON cs.tenant_id = t.id
       WHERE t.id = $1
       LIMIT 1`,
      [tenantId]
    );

    if (tenantRes.rows.length === 0) {
      return res.status(404).json({
        error: `Tenant manifest not found for tenant ${tenantId}.`,
      });
    }

    const tenant = tenantRes.rows[0];
    const shortName = tenant.name.length > 12 ? tenant.name.slice(0, 12).trim() : tenant.name;

    const manifest = {
      id: `/?tenantId=${tenant.id}`,
      name: tenant.name,
      short_name: shortName,
      description: `Dedicated Retail POS & Inventory Terminal for ${tenant.name}`,
      start_url: `/?tenantId=${tenant.id}`,
      scope: '/',
      display: 'standalone',
      display_override: ['standalone', 'minimal-ui'],
      orientation: 'any',
      theme_color: DEFAULT_PWA_THEME_COLOR,
      background_color: DEFAULT_PWA_BACKGROUND_COLOR,
      categories: ['business', 'shopping', 'finance'],
      icons: [
        {
          src: '/pwa-192x192.png',
          sizes: '192x192',
          type: 'image/png',
          purpose: 'any',
        },
        {
          src: '/pwa-512x512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any',
        },
        {
          src: '/pwa-maskable-192x192.png',
          sizes: '192x192',
          type: 'image/png',
          purpose: 'maskable',
        },
        {
          src: '/pwa-maskable-512x512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        },
        {
          src: '/apple-touch-icon.png',
          sizes: '180x180',
          type: 'image/png',
          purpose: 'any',
        },
      ],
      shortcuts: [
        {
          name: 'POS Terminal',
          short_name: 'POS',
          description: `Open ${tenant.name} Point of Sale checkout counter`,
          url: `/pos?tenantId=${tenant.id}`,
          icons: [
            { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/pwa-maskable-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          ],
        },
        {
          name: 'Shoe Catalog',
          short_name: 'Catalog',
          description: `Manage ${tenant.name} shoe inventory`,
          url: `/inventory?tenantId=${tenant.id}`,
          icons: [
            { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/pwa-maskable-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          ],
        },
      ],
    };

    res.setHeader('Content-Type', 'application/manifest+json');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.json(manifest);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to generate dynamic tenant manifest: ' + err.message });
  }
});

/**
 * 2. RESOLVE CURRENT SAAS ROUTE & TENANT STATUS (`/api/saas/resolve`)
 * Used by the SPA to inspect the selected tenant status,
 * and returns the directory of deployed tenants for quick multi-tenant preview switching.
 */
router.get('/saas/resolve', async (req: Request, res: Response) => {
  try {
    await ensureSaasControlPlane();
    await syncExpiredTenantSubscriptions();
    const resolution = await resolveTenantContext(req);

    const directoryRes = await pgClient.query<{
      id: number;
      name: string;
      status: 'ACTIVE' | 'SUSPENDED' | 'EXPIRED';
      subscription_plan: string;
      subscription_type?: string;
      subscription_start_date: string;
      subscription_end_date: string;
      subscription_status: 'ACTIVE' | 'EXPIRED' | 'SUSPENDED';
      logo_url: string;
      currency: string;
      onboarding_completed: boolean;
    }>(
      `SELECT t.id, t.name, t.status, t.subscription_plan::text AS subscription_plan,
              COALESCE(NULLIF(t.subscription_type, ''), t.subscription_plan::text, 'free_tier') AS subscription_type,
              t.subscription_start_date, t.subscription_end_date, t.subscription_status,
              t.onboarding_completed,
              COALESCE(NULLIF(cs.logo, ''), '/pwa-512x512.png') AS logo_url,
              COALESCE(cs.currency, 'PKR') AS currency
       FROM tenants t
       LEFT JOIN company_settings cs ON cs.tenant_id = t.id
       ORDER BY t.id ASC`
    );

    return res.json({
      resolution,
      availableTenants: directoryRes.rows.map((t) => {
        const subPlan = normalizeSubscriptionPlan(t.subscription_plan);
        const subType = normalizeSubscriptionType(t.subscription_type || t.subscription_plan);
        const endDateIso = t.subscription_end_date ? new Date(t.subscription_end_date).toISOString() : '';
        return {
          id: t.id,
          name: t.name,
          status: t.status,
          subscriptionType: subType,
          subscriptionPlan: subPlan,
          subscriptionStartDate: t.subscription_start_date ? new Date(t.subscription_start_date).toISOString() : '',
          subscriptionEndDate: endDateIso,
          subscriptionStatus: (t.subscription_status || 'ACTIVE') as 'ACTIVE' | 'EXPIRED' | 'SUSPENDED',
          daysLeft: calculateDaysLeft(endDateIso, new Date(), subPlan),
          logoUrl: t.logo_url,
          currency: t.currency,
          onboardingCompleted: Boolean(t.onboarding_completed),
          appPath: `/?tenantId=${t.id}`,
          manifestUrl: `/api/tenants/manifest?tenantId=${t.id}`,
        };
      }),
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to resolve tenant context: ' + err.message });
  }
});

/**
 * 2b. PUBLIC PLATFORM STATS & METRICS (`/api/saas/public-stats`)
 */
router.get('/saas/public-stats', async (_req: Request, res: Response) => {
  try {
    await ensureSaasControlPlane();
    const storesRes = await pgClient.query('SELECT COUNT(*)::int as c FROM tenants WHERE id > 0');
    const prodsRes = await pgClient.query('SELECT COUNT(*)::int as c FROM products WHERE active != false');
    const todayRes = await pgClient.query('SELECT COUNT(*)::int as c FROM sales WHERE DATE(sale_date) = CURRENT_DATE');
    const revRes = await pgClient.query('SELECT COALESCE(SUM(total_amount), 0)::numeric as s FROM sales');
    const ownerRes = await pgClient.query(
      "SELECT email, phone FROM users WHERE UPPER(COALESCE(role::text, '')) = 'SUPERADMIN' ORDER BY id ASC LIMIT 1"
    );
    const owner = ownerRes.rows[0];
    return res.json({
      stores: Number(storesRes.rows[0]?.c || 0),
      products: Number(prodsRes.rows[0]?.c || 0),
      invoicesToday: Number(todayRes.rows[0]?.c || 0),
      platformRevenue: Number(revRes.rows[0]?.s || 0),
      superAdminEmail: owner?.email || 'sarbaazsoft@gmail.com',
      superAdminPhone: owner?.phone || '+92-321-2257340',
    });
  } catch (_err) {
    return res.json({
      stores: 4,
      products: 12,
      invoicesToday: 0,
      platformRevenue: 0,
      superAdminEmail: 'sarbaazsoft@gmail.com',
      superAdminPhone: '+92-321-2257340',
    });
  }
});

/**
 * 2c. PLATFORM OWNER CONTACT INFO (`/api/saas/platform-owner`)
 */
router.get('/saas/platform-owner', async (_req: Request, res: Response) => {
  try {
    await ensureSaasControlPlane();
    const ownerRes = await pgClient.query(
      "SELECT name, email, phone FROM users WHERE UPPER(COALESCE(role::text, '')) = 'SUPERADMIN' ORDER BY id ASC LIMIT 1"
    );
    const owner = ownerRes.rows[0];
    return res.json({
      name: owner?.name || 'Platform SuperAdmin',
      email: owner?.email || 'sarbaazsoft@gmail.com',
      phone: owner?.phone || '+92-321-2257340',
    });
  } catch {
    return res.json({
      name: 'Platform SuperAdmin',
      email: 'sarbaazsoft@gmail.com',
      phone: '+92-321-2257340',
    });
  }
});

/**
 * 2d. CHECK EMAIL AVAILABILITY (`/api/saas/check-email`)
 */
router.get('/saas/check-email', async (req: Request, res: Response) => {
  try {
    await ensureSaasControlPlane();
    const email = String(req.query.email || '').trim().toLowerCase();
    if (!email) {
      return res.json({ available: false, message: 'Email address is required.' });
    }
    const check = await pgClient.query('SELECT id FROM users WHERE LOWER(BTRIM(email)) = $1 LIMIT 1', [email]);
    if (check.rows.length > 0) {
      return res.json({
        available: false,
        message: 'This email is already in use. Please use a different email address or log in.',
      });
    }
    return res.json({
      available: true,
      message: 'Email is available.',
    });
  } catch {
    return res.json({ available: true, message: 'Email format is valid.' });
  }
});

/**
 * 2e. PUBLIC FREE TRIAL STORE ACTIVATION (`/api/saas/store-request`)
 */
router.post('/saas/store-request', async (req: Request, res: Response) => {
  try {
    await ensureSaasControlPlane();
    const body = req.body || {};
    const storeName = String(body.storeName || body.name || '').trim();
    const ownerEmail = String(body.ownerEmail || body.email || '').trim().toLowerCase();
    const ownerName = String(body.ownerName || body.name || storeName || 'Store Owner').trim();
    const ownerPhone = String(body.ownerPhone || body.phone || '').trim();
    const password = body.password ? String(body.password).trim() : 'admin123';
    const plan = String(body.plan || 'TRIAL').toUpperCase();
    const businessType: 'RETAIL' | 'WHOLESALE' =
      String(body.businessType || 'RETAIL').toUpperCase() === 'WHOLESALE' ? 'WHOLESALE' : 'RETAIL';
    const pricingMode: 'FIXED' | 'NEGOTIABLE' =
      businessType === 'WHOLESALE'
        ? 'FIXED'
        : String(body.pricingMode || 'FIXED').toUpperCase() === 'NEGOTIABLE'
        ? 'NEGOTIABLE'
        : 'FIXED';
    const minSellingQuantity = body.minSellingQuantity !== undefined ? Number(body.minSellingQuantity) : 1.0;
    const allowHalfCarton = body.allowHalfCarton !== undefined ? Boolean(body.allowHalfCarton) : true;

    if (!storeName || !ownerEmail) {
      return res.status(400).json({ error: 'Store name and owner email are required.' });
    }

    const check = await pgClient.query('SELECT id FROM users WHERE LOWER(BTRIM(email)) = $1 LIMIT 1', [ownerEmail]);
    if (check.rows.length > 0) {
      return res.status(409).json({
        code: 'EMAIL_ALREADY_EXISTS',
        error: 'This email is already in use. Please use a different email address or log in.',
      });
    }

    const trialDurationDays = 30;
    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + trialDurationDays * 86400000);

    await pgClient.query('BEGIN');
    const provisioned = await provisionNewTenantStore({
      storeName,
      ownerName,
      ownerEmail,
      password,
      ownerPhone,
      businessType,
      pricingMode,
      minSellingQuantity,
      allowHalfCarton,
      subscriptionPlan: 'free_tier',
      subscriptionType: 'free_tier',
      subscriptionStartDate: startDate.toISOString(),
      subscriptionEndDate: endDate.toISOString(),
      onboardingCompleted: true,
      ownerStatus: 'APPROVED',
    });
    await pgClient.query('COMMIT');

    await recordTrialActivation({
      userId: provisioned.adminUserId,
      tenantId: provisioned.tenantId,
      email: ownerEmail,
      userName: ownerName,
      phone: ownerPhone,
      storeName: provisioned.storeName,
      businessType,
      pricingMode,
      plan: 'TRIAL',
      trialDurationDays,
      trialStartDate: startDate.toISOString(),
      trialEndDate: endDate.toISOString(),
      status: 'ACTIVE',
      details: { source: 'landing_free_trial' },
    });

    const ownerRes = await pgClient.query(
      "SELECT email, phone FROM users WHERE UPPER(COALESCE(role::text, '')) = 'SUPERADMIN' ORDER BY id ASC LIMIT 1"
    );
    const saOwner = ownerRes.rows[0];

    const authUser: AuthUser = {
      id: provisioned.adminUserId,
      tenantId: provisioned.tenantId,
      name: ownerName,
      email: provisioned.adminEmail,
      phone: ownerPhone,
      avatarUrl: '',
      role: 'ADMIN',
      status: 'APPROVED',
    };
    const token = generateToken(authUser);

    return res.status(201).json({
      success: true,
      message: `Congratulations! Store '${provisioned.storeName}' has been activated with a 30-day Free Trial.`,
      tenantId: provisioned.tenantId,
      user: {
        ...authUser,
        tenantName: provisioned.storeName,
        storeName: provisioned.storeName,
        onboardingCompleted: true,
      },
      token,
      loginUrl: `/?tenantId=${provisioned.tenantId}`,
      redirectUrl: `/?tenantId=${provisioned.tenantId}`,
      superAdminEmail: saOwner?.email || 'sarbaazsoft@gmail.com',
      superAdminPhone: saOwner?.phone || '+92-321-2257340',
    });
  } catch (err: any) {
    await pgClient.query('ROLLBACK').catch(() => {});
    if (err?.code === 'EMAIL_ALREADY_EXISTS') {
      return res.status(409).json({
        code: 'EMAIL_ALREADY_EXISTS',
        error: 'This email is already in use. Please use a different email address.',
      });
    }
    return res.status(500).json({ error: err.message || 'Failed to submit store request.' });
  }
});


/**
 * Helper to record and log every user who activates or achieves a trial,
 * storing their details alongside their email address for tracking & analytics.
 */
export async function recordTrialActivation(data: {
  userId?: number | null;
  tenantId?: number | null;
  email: string;
  userName?: string;
  phone?: string;
  storeName: string;
  businessType: string;
  pricingMode: string;
  plan?: string;
  trialDurationDays?: number;
  trialStartDate?: string | Date;
  trialEndDate?: string | Date;
  status?: 'ACTIVE' | 'EXPIRED' | 'CONVERTED' | 'PENDING';
  ipAddress?: string;
  userAgent?: string;
  details?: Record<string, any>;
}): Promise<any> {
  const cleanEmail = String(data.email || '').trim().toLowerCase();
  const durationDays = data.trialDurationDays || 30;
  const startDate = data.trialStartDate ? new Date(data.trialStartDate) : new Date();
  const endDate = data.trialEndDate
    ? new Date(data.trialEndDate)
    : new Date(startDate.getTime() + durationDays * 86400000);
  const status = data.status || (endDate.getTime() < Date.now() ? 'EXPIRED' : 'ACTIVE');

  try {
    const res = await pgClient.query(
      `INSERT INTO trial_activations (
        user_id, tenant_id, email, user_name, phone, store_name, business_type, pricing_mode,
        plan, trial_duration_days, trial_start_date, trial_end_date, status, ip_address, user_agent, details
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *`,
      [
        data.userId || null,
        data.tenantId || null,
        cleanEmail,
        String(data.userName || '').trim(),
        String(data.phone || '').trim(),
        String(data.storeName || '').trim(),
        String(data.businessType || 'RETAIL'),
        String(data.pricingMode || 'FIXED'),
        String(data.plan || 'TRIAL'),
        durationDays,
        startDate.toISOString(),
        endDate.toISOString(),
        status,
        String(data.ipAddress || ''),
        String(data.userAgent || ''),
        JSON.stringify(data.details || {}),
      ]
    );

    // Alert SuperAdmin via platform notification about the new free trial registration (strictly scoped to SUPERADMIN role)
    await pgClient
      .query(
        `INSERT INTO platform_notifications (tenant_id, target_role, title, message, type, action_url, action_label, created_at)
         VALUES (NULL, 'SUPERADMIN', $1, $2, 'INFO', '/superadmin', 'View Store', NOW())
         RETURNING id, created_at`,
        [
          `New Free Trial: ${String(data.storeName || 'New Store').trim()}`,
          `New 30-day Free Tier store registered by ${String(data.userName || 'Store Owner').trim()} (${cleanEmail}${data.phone ? ' • ' + data.phone : ''}).`,
        ]
      )
      .then(async (notifRes) => {
        const notifRow = notifRes.rows[0];
        if (notifRow?.id) {
          await notifyPlatformAnnouncement({
            id: notifRow.id,
            tenantId: null,
            targetRole: 'SUPERADMIN',
            title: `New Free Trial: ${String(data.storeName || 'New Store').trim()}`,
            message: `New 30-day Free Tier store registered by ${String(data.userName || 'Store Owner').trim()} (${cleanEmail}${data.phone ? ' • ' + data.phone : ''}).`,
            type: 'INFO',
            actionUrl: '/superadmin',
            actionLabel: 'View Store',
            timestamp: notifRow.created_at,
          }).catch(() => {});
        }
      })
      .catch(() => {});

    return res.rows[0];
  } catch (err: any) {
    console.error('[Trial Tracker] Failed to record trial activation:', err?.message || err);
    return null;
  }
}

/**
 * 4. SUPERADMIN CONTROL PANEL: OVERVIEW METRICS, DEPLOYED STORES & PENDING REQUESTS QUEUE
 * Accessible strictly via JWT with `SUPERADMIN` role (`GET /api/superadmin/overview`)
 */
router.get('/superadmin/overview', requireAuth, requireSuperAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    await ensureSaasControlPlane();
    await syncExpiredTenantSubscriptions();

    const storesRes = await pgClient.query<{
      id: number;
      name: string;
      status: 'ACTIVE' | 'SUSPENDED' | 'EXPIRED';
      subscription_plan: string;
      subscription_start_date: string;
      subscription_end_date: string;
      subscription_status: 'ACTIVE' | 'EXPIRED' | 'SUSPENDED';
      logo_url: string;
      owner_email: string;
      owner_phone: string;
      address: string;
      tax_id: string;
      currency: string;
      onboarding_completed: boolean;
      created_at: string;
      product_count: string;
      business_type: 'RETAIL' | 'WHOLESALE';
      total_stock_units: string;
      sales_count: string;
      total_sales_revenue: string;
      staff_count: string;
      customer_count: string;
      supplier_count: string;
      units_sold: string;
      inventory_value: string;
    }>(`
      SELECT 
        t.*,
        COALESCE(NULLIF(cs.business_type::text, ''), 'RETAIL') AS business_type,
        COALESCE(NULLIF(cs.pricing_mode::text, ''), 'FIXED') AS pricing_mode,
        COALESCE(cs.min_selling_quantity, 1.0) AS min_selling_quantity,
        COALESCE(cs.allow_half_carton, true) AS allow_half_carton,
        COALESCE(NULLIF(cs.logo, ''), '/pwa-512x512.png') AS logo_url,
        COALESCE(u.email, cs.email, '') AS owner_email,
        COALESCE(NULLIF(u.phone, ''), cs.phone, '') AS owner_phone,
        COALESCE(cs.address, '') AS address,
        COALESCE(cs.tax_id, '') AS tax_id,
        COALESCE(cs.currency, 'PKR') AS currency,
        (SELECT COUNT(*) FROM products p WHERE p.tenant_id = t.id AND p.active = true)::text as product_count,
        (SELECT COALESCE(SUM(p.total_stock), 0) FROM products p WHERE p.tenant_id = t.id AND p.active = true)::text as total_stock_units,
        (SELECT COUNT(*) FROM sales s WHERE s.tenant_id = t.id)::text as sales_count,
        (SELECT COALESCE(SUM(s.total_amount), 0) FROM sales s WHERE s.tenant_id = t.id)::text as total_sales_revenue,
        (SELECT COUNT(*) FROM users u2 WHERE u2.tenant_id = t.id AND u2.role != 'SUPERADMIN')::text as staff_count,
        (SELECT COUNT(*) FROM customers c WHERE c.tenant_id = t.id)::text as customer_count,
        (SELECT COUNT(*) FROM suppliers sp WHERE sp.tenant_id = t.id)::text as supplier_count,
        (SELECT COALESCE(SUM(si.quantity), 0) FROM sale_items si WHERE si.tenant_id = t.id)::text as units_sold,
        (SELECT COALESCE(SUM(p.total_stock * p.max_price), 0) FROM products p WHERE p.tenant_id = t.id AND p.active = true)::text as inventory_value
      FROM tenants t
      LEFT JOIN company_settings cs ON cs.tenant_id = t.id
      LEFT JOIN LATERAL (
        SELECT email, phone
        FROM users
        WHERE tenant_id = t.id AND role = 'ADMIN'
        ORDER BY id ASC
        LIMIT 1
      ) u ON true
      ORDER BY t.id ASC
    `);

    const trialsRes = await pgClient
      .query(`
        SELECT *
        FROM trial_activations
        ORDER BY created_at DESC
      `)
      .catch(() => ({ rows: [] }));

    const activeTrialsCount = trialsRes.rows.filter((r: any) => {
      const endsAt = r.trial_ends_at ? new Date(r.trial_ends_at).getTime() : 0;
      return endsAt > Date.now() && r.status !== 'EXPIRED';
    }).length;

    const topProductsRes = await pgClient
      .query<{
        id: number;
        tenant_id: number;
        store_name: string;
        currency: string;
        product_name: string;
        barcode: string;
        brand: string;
        category: string;
        primary_image_url: string;
        max_price: string;
        cost_price: string;
        total_stock: string;
        units_sold: string;
        total_revenue: string;
        order_count: string;
      }>(`
        SELECT
          p.id,
          p.tenant_id,
          t.name AS store_name,
          COALESCE(cs.currency, 'PKR') AS currency,
          COALESCE(NULLIF(TRIM(p.article), ''), p.name) AS product_name,
          p.barcode,
          COALESCE(NULLIF(TRIM(p.brand), ''), 'Unbranded') AS brand,
          COALESCE(NULLIF(TRIM(p.category), ''), 'General') AS category,
          COALESCE(p.primary_image_url, '') AS primary_image_url,
          COALESCE(p.max_price, 0)::text AS max_price,
          COALESCE(p.cost_price, 0)::text AS cost_price,
          COALESCE(p.total_stock, 0)::text AS total_stock,
          COALESCE(SUM(si.quantity), 0)::text AS units_sold,
          COALESCE(SUM(si.subtotal), 0)::text AS total_revenue,
          COUNT(DISTINCT si.sale_id)::text AS order_count
        FROM products p
        JOIN tenants t ON t.id = p.tenant_id
        LEFT JOIN company_settings cs ON cs.tenant_id = t.id
        LEFT JOIN sale_items si ON si.product_id = p.id AND si.tenant_id = p.tenant_id
        WHERE p.active = true
        GROUP BY p.id, p.tenant_id, t.name, cs.currency, p.article, p.name, p.barcode, p.brand, p.category, p.primary_image_url, p.max_price, p.cost_price, p.total_stock
        ORDER BY COALESCE(SUM(si.subtotal), 0) DESC, COALESCE(SUM(si.quantity), 0) DESC, (COALESCE(p.total_stock, 0) * COALESCE(p.max_price, 0)) DESC
        LIMIT 30
      `)
      .catch(() => ({ rows: [] }));

    const sevenDaysRes = await pgClient
      .query<{
        date: string;
        label: string;
        amount: string;
        tx_count: string;
      }>(`
        WITH days AS (
          SELECT (CURRENT_DATE - i)::text AS d,
                 TO_CHAR(CURRENT_DATE - i, 'Dy') AS label,
                 i AS idx
          FROM generate_series(6, 0, -1) AS i
        )
        SELECT days.d AS date,
               days.label,
               COALESCE(SUM(s.total_amount), 0)::text AS amount,
               COUNT(s.id)::text AS tx_count
        FROM days
        LEFT JOIN sales s ON s.sale_date = days.d
        GROUP BY days.d, days.label, days.idx
        ORDER BY days.idx DESC
      `)
      .catch(() => ({ rows: [] }));

    const recentTxRes = await pgClient
      .query<{
        tenant_id: number;
        type: string;
        reference: string;
        store_name: string;
        customer_name: string;
        amount: string;
        currency: string;
        status: string;
        created_at: string;
      }>(`
        SELECT * FROM (
          SELECT
            s.tenant_id,
            'Sale' AS type,
            s.invoice_number AS reference,
            t.name AS store_name,
            COALESCE(c.name, 'Walk-in Customer') AS customer_name,
            s.total_amount::text AS amount,
            COALESCE(cs.currency_symbol, 'Rs.') AS currency,
            'Completed' AS status,
            s.created_at
          FROM sales s
          JOIN tenants t ON t.id = s.tenant_id
          LEFT JOIN company_settings cs ON cs.tenant_id = t.id
          LEFT JOIN customers c ON c.id = s.customer_id AND c.tenant_id = s.tenant_id
          UNION ALL
          SELECT
            pu.tenant_id,
            'Purchase' AS type,
            pu.purchase_number AS reference,
            t.name AS store_name,
            COALESCE(pu.supplier_name, 'Supplier') AS customer_name,
            pu.total_amount::text AS amount,
            COALESCE(cs.currency_symbol, 'Rs.') AS currency,
            'Received' AS status,
            pu.created_at
          FROM purchases pu
          JOIN tenants t ON t.id = pu.tenant_id
          LEFT JOIN company_settings cs ON cs.tenant_id = t.id
          UNION ALL
          SELECT
            r.tenant_id,
            'Return' AS type,
            r.return_number AS reference,
            t.name AS store_name,
            'Customer Return' AS customer_name,
            r.total_refund_amount::text AS amount,
            COALESCE(cs.currency_symbol, 'Rs.') AS currency,
            'Refunded' AS status,
            r.created_at
          FROM returns r
          JOIN tenants t ON t.id = r.tenant_id
          LEFT JOIN company_settings cs ON cs.tenant_id = t.id
        ) tx
        ORDER BY created_at DESC
        LIMIT 8
      `)
      .catch(() => ({ rows: [] }));

    const topCategoriesRes = await pgClient
      .query<{
        name: string;
        product_count: string;
        total_stock: string;
        units_sold: string;
        total_revenue: string;
      }>(`
        SELECT
          COALESCE(NULLIF(TRIM(p.category), ''), 'General') AS name,
          COUNT(DISTINCT p.id)::text AS product_count,
          COALESCE(SUM(DISTINCT p.total_stock), 0)::text AS total_stock,
          COALESCE(SUM(si.quantity), 0)::text AS units_sold,
          COALESCE(SUM(si.subtotal), 0)::text AS total_revenue
        FROM products p
        JOIN tenants t ON t.id = p.tenant_id
        LEFT JOIN sale_items si ON si.product_id = p.id AND si.tenant_id = p.tenant_id
        WHERE p.active = true
        GROUP BY COALESCE(NULLIF(TRIM(p.category), ''), 'General')
        ORDER BY COALESCE(SUM(si.subtotal), 0) DESC, COUNT(DISTINCT p.id) DESC
        LIMIT 10
      `)
      .catch(() => ({ rows: [] }));

    // Tenant SaaS Subscription Plans Breakdown & Health
    const stores = storesRes.rows.map((s) => {
      const endDateIso = s.subscription_end_date ? new Date(s.subscription_end_date).toISOString() : '';
      const startDateIso = s.subscription_start_date ? new Date(s.subscription_start_date).toISOString() : '';
      const isDateExpired = endDateIso && new Date(endDateIso).getTime() < Date.now();
      let subStatus: 'ACTIVE' | 'EXPIRED' | 'SUSPENDED' = (String(s.subscription_status || 'ACTIVE').toUpperCase() as any);
      if (s.status === 'SUSPENDED') {
        subStatus = 'SUSPENDED';
      } else if (isDateExpired) {
        subStatus = 'EXPIRED';
      }

      const isOnline =
        s.status === 'ACTIVE' &&
        subStatus === 'ACTIVE' &&
        isTenantOnlineInMiddleware(s.id, s.status, subStatus);
      const lastSeenAt = getTenantMiddlewareLastSeen(s.id);

      return {
        id: s.id,
        name: s.name,
        status: s.status,
        businessType: String(s.business_type || 'RETAIL').toUpperCase() === 'WHOLESALE' ? 'WHOLESALE' : 'RETAIL',
        minSellingQuantity: (s as any).min_selling_quantity !== undefined && (s as any).min_selling_quantity !== null
          ? parseFloat(String((s as any).min_selling_quantity))
          : ((s as any).allow_half_carton !== false ? 0.5 : 1.0),
        allowHalfCarton: (s as any).allow_half_carton !== undefined ? Boolean((s as any).allow_half_carton) : true,
        subscriptionType: normalizeSubscriptionType((s as any).subscription_type || s.subscription_plan),
        subscriptionPlan: normalizeSubscriptionPlan(s.subscription_plan),
        subscriptionStartDate: startDateIso,
        subscriptionEndDate: endDateIso,
        subscriptionStatus: subStatus,
        daysLeft: calculateDaysLeft(endDateIso, new Date(), s.subscription_plan),
        isOnline,
        lastSeenAt,
        logoUrl: s.logo_url || '/pwa-512x512.png',
        ownerEmail: s.owner_email || '',
        ownerPhone: s.owner_phone || '',
        address: s.address || '',
        taxId: s.tax_id || '',
        currency: s.currency || 'PKR',
        onboardingCompleted: Boolean(s.onboarding_completed),
        createdAt: s.created_at,
        productCount: parseInt(s.product_count || '0', 10),
        totalStockUnits: parseInt(s.total_stock_units || '0', 10),
        salesCount: parseInt(s.sales_count || '0', 10),
        totalSales: parseFloat(s.total_sales_revenue || '0'),
        staffCount: parseInt(s.staff_count || '0', 10),
        customerCount: parseInt(s.customer_count || '0', 10),
        supplierCount: parseInt(s.supplier_count || '0', 10),
        unitsSold: parseInt(s.units_sold || '0', 10),
        inventoryValue: parseFloat(s.inventory_value || '0'),
        manifestUrl: `/api/tenants/manifest?tenantId=${s.id}`,
        appUrl: `/?tenantId=${s.id}`,
        installUrl: `/?tenantId=${s.id}`,
      };
    });

    const totalPlatformRevenue = stores.reduce((sum, st) => sum + st.totalSales, 0);
    const totalPlatformProducts = stores.reduce((sum, st) => sum + st.productCount, 0);
    const totalPlatformInvoices = stores.reduce((sum, st) => sum + st.salesCount, 0);
    const totalStaffAccounts = stores.reduce((sum, st) => sum + st.staffCount, 0);

    const activeStoresCount = stores.filter((st) => st.status === 'ACTIVE' && st.subscriptionStatus === 'ACTIVE').length;
    const suspendedStoresCount = stores.filter((st) => st.status === 'SUSPENDED' || st.subscriptionStatus === 'SUSPENDED').length;
    const expiredStoresCount = stores.filter((st) => st.subscriptionStatus === 'EXPIRED').length;
    const expiringSoonStores = stores.filter((st) => st.daysLeft !== null && st.daysLeft !== undefined && st.daysLeft <= 30 && st.daysLeft >= 0 && st.subscriptionStatus !== 'SUSPENDED');
    const expiringSoonCount = expiringSoonStores.length;
    const onlineStoresCount = stores.filter((st) => st.isOnline).length;
    const onboardedStoresCount = stores.filter((st) => st.onboardingCompleted).length;
    const retailStoresCount = stores.filter((st) => st.businessType === 'RETAIL').length;
    const wholesaleStoresCount = stores.filter((st) => st.businessType === 'WHOLESALE').length;

    // Tenant SaaS Subscription Plans Breakdown
    const planCounts: Record<string, { count: number; active: number; expiring: number }> = {
      YEARLY: { count: 0, active: 0, expiring: 0 },
      '6_MONTHS': { count: 0, active: 0, expiring: 0 },
      TRIAL: { count: 0, active: 0, expiring: 0 },
    };

    for (const st of stores) {
      const planKey = st.subscriptionPlan === 'YEARLY' ? 'YEARLY' : st.subscriptionPlan === '6_MONTHS' ? '6_MONTHS' : 'TRIAL';
      if (!planCounts[planKey]) planCounts[planKey] = { count: 0, active: 0, expiring: 0 };
      planCounts[planKey].count++;
      if (st.status === 'ACTIVE' && st.subscriptionStatus === 'ACTIVE') {
        planCounts[planKey].active++;
      }
      if (st.daysLeft !== null && st.daysLeft !== undefined && st.daysLeft <= 30 && st.daysLeft >= 0 && st.subscriptionStatus !== 'SUSPENDED') {
        planCounts[planKey].expiring++;
      }
    }

    const subscriptionPlans = [
      {
        plan: 'YEARLY',
        label: 'Yearly Plan (1 Year)',
        count: planCounts.YEARLY.count,
        percentage: Math.round((planCounts.YEARLY.count / Math.max(1, stores.length)) * 100),
        activeCount: planCounts.YEARLY.active,
        expiringCount: planCounts.YEARLY.expiring,
      },
      {
        plan: '6_MONTHS',
        label: '6-Months Plan',
        count: planCounts['6_MONTHS'].count,
        percentage: Math.round((planCounts['6_MONTHS'].count / Math.max(1, stores.length)) * 100),
        activeCount: planCounts['6_MONTHS'].active,
        expiringCount: planCounts['6_MONTHS'].expiring,
      },
      {
        plan: 'TRIAL',
        label: '30-Day Free Trial',
        count: planCounts.TRIAL.count,
        percentage: Math.round((planCounts.TRIAL.count / Math.max(1, stores.length)) * 100),
        activeCount: planCounts.TRIAL.active,
        expiringCount: planCounts.TRIAL.expiring,
      },
    ];

    const expiringTenants = expiringSoonStores
      .sort((a, b) => (a.daysLeft ?? 999) - (b.daysLeft ?? 999))
      .map((st) => ({
        id: st.id,
        name: st.name,
        ownerEmail: st.ownerEmail,
        ownerPhone: st.ownerPhone,
        subscriptionPlan: st.subscriptionPlan,
        subscriptionEndDate: st.subscriptionEndDate,
        daysLeft: st.daysLeft ?? 0,
        subscriptionStatus: st.subscriptionStatus,
        status: st.status,
      }));

    const saasMetrics = {
      totalStores: stores.length,
      activeStores: activeStoresCount,
      expiringSoonStores: expiringSoonCount,
      expiredStores: expiredStoresCount,
      suspendedStores: suspendedStoresCount,
      activeTrials: activeTrialsCount,
      totalTrials: trialsRes.rows.length,
      onlineStores: onlineStoresCount,
      onboardedStores: onboardedStoresCount,
      retailStores: retailStoresCount,
      wholesaleStores: wholesaleStoresCount,
      totalPlatformRevenue,
      totalInvoicesCount: totalPlatformInvoices,
      totalStaffAccounts,
    };

    const topProducts = topProductsRes.rows.map((r) => ({
      id: r.id,
      tenantId: r.tenant_id,
      storeName: r.store_name,
      currency: r.currency || 'PKR',
      productName: r.product_name,
      barcode: r.barcode,
      brand: r.brand,
      category: r.category,
      imageUrl: r.primary_image_url || '',
      maxPrice: parseFloat(r.max_price || '0'),
      sellingPrice: parseFloat(r.max_price || '0'),
      costPrice: parseFloat(r.cost_price || '0'),
      totalStock: parseInt(r.total_stock || '0', 10),
      unitsSold: parseInt(r.units_sold || '0', 10),
      totalRevenue: parseFloat(r.total_revenue || '0'),
      orderCount: parseInt(r.order_count || '0', 10),
    }));

    const topCategories = topCategoriesRes.rows.map((r) => ({
      name: r.name,
      productCount: parseInt(r.product_count || '0', 10),
      totalStock: parseInt(r.total_stock || '0', 10),
      unitsSold: parseInt(r.units_sold || '0', 10),
      totalRevenue: parseFloat(r.total_revenue || '0'),
    }));

    const sevenDaySales = sevenDaysRes.rows.map((r, idx) => ({
      date: r.date || '',
      label: r.label || `Day ${idx + 1}`,
      amount: parseFloat(r.amount || '0'),
      txCount: parseInt(r.tx_count || '0', 10),
    }));

    const recentTransactions = recentTxRes.rows.map((r) => {
      const dt = r.created_at ? new Date(r.created_at) : new Date();
      return {
        tenantId: r.tenant_id,
        type: r.type || 'Sale',
        reference: r.reference || '',
        storeName: r.store_name || '',
        customerName: r.customer_name || 'Walk-in Customer',
        amount: parseFloat(r.amount || '0'),
        currency: r.currency || 'Rs.',
        status: r.status || 'Completed',
        date: dt.toISOString(),
        timeString: dt.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      };
    });

    return res.json({
      metrics: {
        totalStores: stores.length,
        activeStores: activeStoresCount,
        expiringSoonStores: expiringSoonCount,
        suspendedStores: suspendedStoresCount,
        expiredStores: expiredStoresCount,
        pendingRequests: 0,
        activeTrials: activeTrialsCount,
        totalTrials: trialsRes.rows.length,
        onlineStores: onlineStoresCount,
        onboardedStores: onboardedStoresCount,
        totalPlatformRevenue,
        totalPlatformProducts,
        totalInvoicesCount: totalPlatformInvoices,
      },
      saasMetrics,
      subscriptionPlans,
      expiringTenants,
      stores,
      storeRequests: [],
      trialActivations: trialsRes.rows,
      reports: {
        topProducts,
        topCategories,
        topBrands: [],
        subscriptionPlans,
        expiringTenants,
        sevenDaySales,
        recentTransactions,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to load SuperAdmin overview: ' + err.message });
  }
});

/**
 * 4B. SUPERADMIN DEDICATED SAAS & SUBSCRIPTION TELEMETRY ENDPOINT (`GET /api/superadmin/saas-metrics`)
 * Provides tenant-centric subscription distribution, churn risk, and live presence telemetry.
 */
router.get('/superadmin/saas-metrics', requireAuth, requireSuperAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    await ensureSaasControlPlane();
    await syncExpiredTenantSubscriptions();
    const presence = getTenantPresenceStats();

    const storesRes = await pgClient.query<{
      id: number;
      name: string;
      status: 'ACTIVE' | 'SUSPENDED' | 'EXPIRED';
      subscription_plan: string;
      subscription_type?: string;
      subscription_start_date: string;
      subscription_end_date: string;
      subscription_status: 'ACTIVE' | 'EXPIRED' | 'SUSPENDED';
      onboarding_completed: boolean;
      created_at: string;
      business_type: 'RETAIL' | 'WHOLESALE';
      owner_email: string;
      owner_phone: string;
      sales_count: string;
      total_sales_revenue: string;
      staff_count: string;
      product_count: string;
    }>(`
      SELECT 
        t.id, t.name, t.status, t.subscription_plan, t.subscription_type,
        t.subscription_start_date, t.subscription_end_date, t.subscription_status,
        t.onboarding_completed, t.created_at,
        COALESCE(cs.business_type::text, 'RETAIL') AS business_type,
        COALESCE(u.email, cs.email, '') AS owner_email,
        COALESCE(u.phone, cs.phone, '') AS owner_phone,
        (SELECT COUNT(*) FROM sales s WHERE s.tenant_id = t.id)::text as sales_count,
        (SELECT COALESCE(SUM(s.total_amount), 0) FROM sales s WHERE s.tenant_id = t.id)::text as total_sales_revenue,
        (SELECT COUNT(*) FROM users u2 WHERE u2.tenant_id = t.id AND u2.role != 'SUPERADMIN')::text as staff_count,
        (SELECT COUNT(*) FROM products p WHERE p.tenant_id = t.id AND p.active = true)::text as product_count
      FROM tenants t
      LEFT JOIN company_settings cs ON cs.tenant_id = t.id
      LEFT JOIN LATERAL (
        SELECT email, phone FROM users WHERE tenant_id = t.id AND role = 'ADMIN' ORDER BY id ASC LIMIT 1
      ) u ON true
      ORDER BY t.id ASC
    `);

    const stores = storesRes.rows.map((s) => {
      const endDateIso = s.subscription_end_date ? new Date(s.subscription_end_date).toISOString() : '';
      const isDateExpired = endDateIso && new Date(endDateIso).getTime() < Date.now();
      let subStatus: 'ACTIVE' | 'EXPIRED' | 'SUSPENDED' = (String(s.subscription_status || 'ACTIVE').toUpperCase() as any);
      if (s.status === 'SUSPENDED') subStatus = 'SUSPENDED';
      else if (isDateExpired) subStatus = 'EXPIRED';

      const isOnline = s.status === 'ACTIVE' && subStatus === 'ACTIVE' && isTenantOnlineInMiddleware(s.id, s.status, subStatus);
      return {
        id: s.id,
        name: s.name,
        status: s.status,
        businessType: s.business_type,
        subscriptionPlan: normalizeSubscriptionPlan(s.subscription_plan),
        subscriptionEndDate: endDateIso,
        subscriptionStatus: subStatus,
        daysLeft: calculateDaysLeft(endDateIso, new Date(), s.subscription_plan),
        isOnline,
        ownerEmail: s.owner_email,
        ownerPhone: s.owner_phone,
        salesCount: parseInt(s.sales_count || '0', 10),
        totalSales: parseFloat(s.total_sales_revenue || '0'),
        staffCount: parseInt(s.staff_count || '0', 10),
        productCount: parseInt(s.product_count || '0', 10),
      };
    });

    const activeStores = stores.filter((s) => s.status === 'ACTIVE' && s.subscriptionStatus === 'ACTIVE');
    const suspendedStores = stores.filter((s) => s.status === 'SUSPENDED' || s.subscriptionStatus === 'SUSPENDED');
    const expiredStores = stores.filter((s) => s.subscriptionStatus === 'EXPIRED');
    const expiringSoon = stores.filter((s) => s.daysLeft !== null && s.daysLeft !== undefined && s.daysLeft <= 30 && s.daysLeft >= 0 && s.subscriptionStatus !== 'SUSPENDED');

    return res.json({
      totalTenants: stores.length,
      activeTenants: activeStores.length,
      expiringSoonTenants: expiringSoon.length,
      expiredTenants: expiredStores.length,
      suspendedTenants: suspendedStores.length,
      onlineTenantsCount: stores.filter((s) => s.isOnline).length,
      presenceTelemetry: presence,
      tenants: stores,
      expiringTenants: expiringSoon,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to load SaaS metrics: ' + err.message });
  }
});

/**
 * 5. SUPERADMIN REAL-TIME TENANT ACTIVE / DISABLE TOGGLE (`PATCH /api/superadmin/tenants/:id/status`)
 * Immediately revokes or restores tenant access at the API and tenant-routing middleware levels.
 */
router.patch('/superadmin/tenants/:id/status', requireAuth, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = parseInt(req.params.id, 10);
    const { status } = req.body || {};

    if (!['ACTIVE', 'SUSPENDED', 'EXPIRED'].includes(status)) {
      return res.status(400).json({ error: 'Status must be ACTIVE, EXPIRED, or SUSPENDED.' });
    }

    const currRes = await pgClient.query<{
      id: number;
      subscription_plan: string;
      subscription_end_date: string | null;
    }>('SELECT id, subscription_plan, subscription_end_date FROM tenants WHERE id = $1 LIMIT 1', [tenantId]);

    if (currRes.rows.length === 0) {
      return res.status(404).json({ error: 'Store tenant not found.' });
    }

    const curr = currRes.rows[0];
    let nextTenantStatus = status === 'EXPIRED' ? 'ACTIVE' : status;
    let nextSubStatus = status;
    let nextEndDate = curr.subscription_end_date ? new Date(curr.subscription_end_date) : calculateSubscriptionEndDate(curr.subscription_plan || 'YEARLY');

    // If activating an expired store via status toggle, automatically renew its expiry from today based on its plan
    if (status === 'ACTIVE' && nextEndDate.getTime() < Date.now()) {
      nextEndDate = calculateSubscriptionEndDate(curr.subscription_plan || 'YEARLY', new Date());
    }

    const updateRes = await pgClient.query<{
      id: number;
      name: string;
      status: string;
      subscription_status: string;
      subscription_end_date: string;
    }>(
      `UPDATE tenants
       SET status = $1,
           subscription_status = $2,
           subscription_end_date = $3,
           updated_at = NOW()
       WHERE id = $4
       RETURNING id, name, status, subscription_status, subscription_end_date`,
      [nextTenantStatus, nextSubStatus, nextEndDate.toISOString(), tenantId]
    );

    const updated = updateRes.rows[0];
    if (updated.status !== 'ACTIVE' || updated.subscription_status !== 'ACTIVE') {
      removeTenantMiddlewarePresence(tenantId);
    }
    return res.json({
      success: true,
      tenant: updated,
      message:
        updated.subscription_status === 'SUSPENDED'
          ? `Store '${updated.name}' has been suspended immediately.`
          : updated.subscription_status === 'EXPIRED'
          ? `Store '${updated.name}' subscription marked as expired.`
          : `Store '${updated.name}' is now active.`,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to toggle store status: ' + err.message });
  }
});

/**
 * 5A-2. SUPERADMIN MANAGE STORE SUBSCRIPTION & EXPIRY (`PATCH /api/superadmin/tenants/:id/subscription`)
 */
async function handleUpdateTenantSubscription(req: AuthenticatedRequest, res: Response) {
  try {
    await ensureSaasControlPlane();
    const tenantId = parseInt(req.params.id, 10);
    const {
      storeName,
      ownerEmail,
      ownerPhone,
      subscriptionPlan,
      subscriptionStartDate,
      subscriptionEndDate,
      subscriptionStatus,
      renewFromNow,
    } = req.body || {};

    const existingRes = await pgClient.query<any>(
      `SELECT t.*,
              u.id AS admin_user_id,
              u.email AS owner_email,
              u.phone AS owner_phone
       FROM tenants t
       LEFT JOIN LATERAL (
         SELECT id, email, phone
         FROM users
         WHERE tenant_id = t.id AND role = 'ADMIN'
         ORDER BY id ASC
         LIMIT 1
       ) u ON true
       WHERE t.id = $1
       LIMIT 1`,
      [tenantId]
    );
    if (existingRes.rows.length === 0) {
      return res.status(404).json({ error: 'Store tenant not found.' });
    }
    const curr = existingRes.rows[0];

    const finalStoreName = storeName && String(storeName).trim() ? String(storeName).trim() : curr.name;
    const finalOwnerEmail = ownerEmail !== undefined ? String(ownerEmail).trim().toLowerCase() : (curr.owner_email || '');
    const finalOwnerPhone = ownerPhone !== undefined ? String(ownerPhone).trim() : (curr.owner_phone || '');

    if (finalOwnerEmail) {
      const duplicateEmail = await pgClient.query(
        `SELECT id FROM users
         WHERE LOWER(BTRIM(email)) = LOWER(BTRIM($1))
           AND id != COALESCE($2, 0)
         LIMIT 1`,
        [finalOwnerEmail, curr.admin_user_id]
      );
      if (duplicateEmail.rows.length > 0) {
        return res.status(409).json({
          code: 'EMAIL_ALREADY_EXISTS',
          error: 'This email is already in use. Please use a different email address.',
        });
      }
    }

    const finalPlan = subscriptionPlan
      ? normalizeSubscriptionPlan(subscriptionPlan)
      : normalizeSubscriptionPlan(curr.subscription_plan);

    let finalStartDate = subscriptionStartDate
      ? new Date(subscriptionStartDate)
      : renewFromNow
      ? new Date()
      : curr.subscription_start_date
      ? new Date(curr.subscription_start_date)
      : new Date();
    if (isNaN(finalStartDate.getTime())) {
      finalStartDate = new Date();
    }

    let finalEndDate: Date;
    if (subscriptionEndDate && String(subscriptionEndDate).trim()) {
      finalEndDate = new Date(subscriptionEndDate);
      // If a date-only string like YYYY-MM-DD was provided, set time to end of day 23:59:59
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(subscriptionEndDate).trim())) {
        finalEndDate = new Date(`${String(subscriptionEndDate).trim()}T23:59:59.999Z`);
      }
    } else if (renewFromNow || (subscriptionPlan && subscriptionPlan !== curr.subscription_plan)) {
      finalEndDate = calculateSubscriptionEndDate(finalPlan, finalStartDate);
    } else if (curr.subscription_end_date) {
      finalEndDate = new Date(curr.subscription_end_date);
    } else {
      finalEndDate = calculateSubscriptionEndDate(finalPlan, finalStartDate);
    }

    if (isNaN(finalEndDate.getTime())) {
      finalEndDate = calculateSubscriptionEndDate(finalPlan, finalStartDate);
    }

    const isDateExpired = finalEndDate.getTime() < Date.now();
    let finalSubStatus: 'ACTIVE' | 'EXPIRED' | 'SUSPENDED' = curr.subscription_status || 'ACTIVE';
    if (subscriptionStatus && ['ACTIVE', 'EXPIRED', 'SUSPENDED'].includes(String(subscriptionStatus).toUpperCase())) {
      finalSubStatus = String(subscriptionStatus).toUpperCase() as 'ACTIVE' | 'EXPIRED' | 'SUSPENDED';
    } else if (renewFromNow) {
      finalSubStatus = 'ACTIVE';
    }

    // If subscriptionEndDate < now, enforce EXPIRED unless explicitly SUSPENDED
    if (isDateExpired && finalSubStatus !== 'SUSPENDED') {
      finalSubStatus = 'EXPIRED';
    } else if (!isDateExpired && finalSubStatus === 'EXPIRED') {
      // If SuperAdmin extended the expiry date into the future, automatically restore ACTIVE status
      finalSubStatus = 'ACTIVE';
    }

    const finalTenantStatus = finalSubStatus === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE';
    const finalSubType = normalizeSubscriptionType(finalPlan);

    const updatedRes = await pgClient.query(
      `UPDATE tenants
       SET name = $1,
           subscription_plan = $2,
           subscription_type = $3,
           subscription_start_date = $4,
           subscription_end_date = $5,
           subscription_status = $6,
           status = $7,
           updated_at = NOW()
       WHERE id = $8
       RETURNING *`,
      [
        finalStoreName,
        finalPlan,
        finalSubType,
        finalStartDate.toISOString(),
        finalEndDate.toISOString(),
        finalSubStatus,
        finalTenantStatus,
        tenantId,
      ]
    );

    // Sync store owner contact in users table
    if (curr.admin_user_id) {
      await pgClient.query(
          `UPDATE users
           SET email = CASE WHEN $1 != '' THEN $1 ELSE email END,
               phone = $2,
               updated_at = NOW()
           WHERE id = $3 AND tenant_id = $4`,
          [finalOwnerEmail, finalOwnerPhone, curr.admin_user_id, tenantId]
        );
    }

    if (finalSubStatus === 'ACTIVE') {
      await clearSubscriptionAlertsOnRenewal(tenantId);
    }

    const row = updatedRes.rows[0];
    const resolvedPlan = normalizeSubscriptionPlan(row?.subscription_plan || finalPlan);
    const resolvedType = normalizeSubscriptionType(row?.subscription_type || resolvedPlan);
    return res.json({
      success: true,
      tenant: {
        id: row.id,
        name: row.name,
        status: row.status,
        subscriptionPlan: resolvedPlan,
        subscriptionType: resolvedType,
        subscriptionStartDate: new Date(row.subscription_start_date).toISOString(),
        subscriptionEndDate: new Date(row.subscription_end_date).toISOString(),
        subscriptionStatus: row.subscription_status,
        ownerEmail: finalOwnerEmail,
        ownerPhone: finalOwnerPhone,
      },
      message: `Subscription updated for '${row.name}'.`,
    });
  } catch (err: any) {
    if (err?.code === '23505' && String(err?.constraint || '').includes('users_email')) {
      return res.status(409).json({
        code: 'EMAIL_ALREADY_EXISTS',
        error: 'This email is already in use. Please use a different email address.',
      });
    }
    return res.status(500).json({ error: 'Failed to update store subscription: ' + err.message });
  }
}

router.patch('/superadmin/tenants/:id/subscription', requireAuth, requireSuperAdmin, handleUpdateTenantSubscription);
router.put('/superadmin/tenants/:id', requireAuth, requireSuperAdmin, handleUpdateTenantSubscription);

/**
 * Finds the lowest available store ID (1, 2, 3, ...) in the tenants table
 * so deleted store IDs are recycled automatically without requiring any extra column.
 */
export async function getNextTenantId(): Promise<number> {
  try {
    const statsRes = await pgClient.query<{ cnt: number; max_id: number }>(
      `SELECT COUNT(*)::int AS cnt,
              COALESCE(MAX(id), 0)::int AS max_id
       FROM tenants
       WHERE id > 0`
    );
    const cnt = Number(statsRes.rows[0]?.cnt || 0);
    const maxId = Number(statsRes.rows[0]?.max_id || 0);

    // Fast path: empty table -> 1, or contiguous 1..N -> cnt + 1
    if (cnt === 0) return 1;
    if (cnt === maxId) return cnt + 1;

    // Gap exists (a store was deleted): find the first missing positive integer ID (1..maxId)
    const gapRes = await pgClient.query<{ next_id: number }>(
      `SELECT COALESCE(
        CASE WHEN NOT EXISTS (
          SELECT 1 FROM tenants WHERE id = 1
        ) THEN 1 END,
        (SELECT t1.id + 1
         FROM tenants t1
         LEFT JOIN tenants t2 ON t2.id = t1.id + 1
         WHERE t1.id >= 1
           AND t2.id IS NULL
         ORDER BY t1.id ASC
         LIMIT 1),
        $1::int
      ) AS next_id`,
      [Math.max(cnt, maxId) + 1]
    );
    return Number(gapRes.rows[0]?.next_id || cnt + 1);
  } catch (_) {
    const fallbackRes = await pgClient.query<{ next_id: string }>(
      'SELECT (COALESCE(MAX(id), 0) + 1)::text AS next_id FROM tenants WHERE id > 0'
    );
    return parseInt(fallbackRes.rows[0]?.next_id || '1', 10);
  }
}

router.get('/superadmin/tenants/next-id', requireAuth, requireSuperAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const nextTenantId = await getNextTenantId();
    return res.json({ nextTenantId });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to retrieve next store ID: ' + err.message });
  }
});

/**
 * Helper to provision a new tenant store + initial admin credentials + store_settings
 */
async function provisionNewTenantStore(params: {
  storeName: string;
  ownerName?: string;
  ownerEmail: string;
  password?: string;
  ownerPhone?: string;
  address?: string;
  currency?: string;
  currencySymbol?: string;
  taxId?: string;
  taxRate?: number;
  invoiceFooter?: string;
  businessType?: 'RETAIL' | 'WHOLESALE';
  pricingMode?: 'FIXED' | 'NEGOTIABLE';
  minSellingQuantity?: number | string;
  allowHalfCarton?: boolean;
  subscriptionType?: 'free_tier' | '6_months' | '1_year' | string;
  subscriptionPlan?: 'free_tier' | '6_MONTHS' | 'YEARLY' | string;
  subscriptionStartDate?: string;
  subscriptionEndDate?: string;
  createCashier?: boolean;
  cashierName?: string;
  cashierEmail?: string;
  cashierPassword?: string;
  cashierPhone?: string;
  onboardingCompleted?: boolean;
  ownerStatus?: 'PENDING' | 'APPROVED';
}) {
  const normalizedOwnerEmail = params.ownerEmail.trim().toLowerCase();
  const onboardingCompleted = params.onboardingCompleted ?? false;

  // Serialize tenant provisioning to prevent concurrent requests from colliding on recycled tenant ID or email
  await pgClient.query('SELECT pg_advisory_xact_lock(904821)');
  await pgClient.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [normalizedOwnerEmail]);

  const duplicateOwnerEmail = await pgClient.query(
    'SELECT id FROM users WHERE LOWER(BTRIM(email)) = $1 LIMIT 1',
    [normalizedOwnerEmail]
  );
  if (duplicateOwnerEmail.rows.length > 0) {
    const duplicateEmailError: any = new Error(
      'This email is already in use. Please use a different email address.'
    );
    duplicateEmailError.code = 'EMAIL_ALREADY_EXISTS';
    throw duplicateEmailError;
  }

  const currency = params.currency || 'PKR';
  const businessType: 'RETAIL' | 'WHOLESALE' =
    String(params.businessType || 'RETAIL').toUpperCase() === 'WHOLESALE' ? 'WHOLESALE' : 'RETAIL';
  const pricingMode: 'FIXED' | 'NEGOTIABLE' =
    businessType === 'WHOLESALE'
      ? 'FIXED'
      : String(params.pricingMode || 'FIXED').toUpperCase() === 'NEGOTIABLE'
      ? 'NEGOTIABLE'
      : 'FIXED';

  let minSellingQuantity = 1.0;
  let allowHalfCarton = true;
  if (businessType === 'WHOLESALE') {
    if (params.minSellingQuantity !== undefined && params.minSellingQuantity !== null && String(params.minSellingQuantity).trim() !== '') {
      const parsed = parseFloat(String(params.minSellingQuantity));
      minSellingQuantity = parsed <= 0.5 ? 0.5 : 1.0;
      allowHalfCarton = minSellingQuantity <= 0.5;
    } else if (params.allowHalfCarton !== undefined && params.allowHalfCarton !== null) {
      allowHalfCarton = String(params.allowHalfCarton) === 'true' || params.allowHalfCarton === true;
      minSellingQuantity = allowHalfCarton ? 0.5 : 1.0;
    } else {
      minSellingQuantity = 0.5;
      allowHalfCarton = true;
    }
  }

  const subscriptionType = normalizeSubscriptionType(params.subscriptionType || params.subscriptionPlan || 'free_tier');
  const subscriptionPlan = normalizeSubscriptionPlan(params.subscriptionPlan || params.subscriptionType || 'free_tier');

  const now = new Date();
  const startDate = params.subscriptionStartDate ? new Date(params.subscriptionStartDate) : now;
  const validStartDate = isNaN(startDate.getTime()) ? now : startDate;
  let endDate = params.subscriptionEndDate
    ? new Date(params.subscriptionEndDate)
    : (subscriptionPlan === 'free_tier' ? new Date(validStartDate.getTime() + 30 * 86400000) : calculateSubscriptionEndDate(subscriptionPlan, validStartDate));
  if (isNaN(endDate.getTime())) {
    endDate = new Date(validStartDate.getTime() + 30 * 86400000);
  }
  const subscriptionStatus = endDate.getTime() < Date.now() ? 'EXPIRED' : 'ACTIVE';

  // Recycle lowest available store ID (or MAX(id) + 1 if no gaps exist)
  const nextTenantId = await getNextTenantId();

  // Clean up any stale non-SuperAdmin rows that might reference a recycled tenant_id
  await pgClient.query('DELETE FROM company_settings WHERE tenant_id = $1', [nextTenantId]).catch(() => {});
  await pgClient.query("DELETE FROM users WHERE tenant_id = $1 AND role != 'SUPERADMIN'", [nextTenantId]).catch(() => {});

  let tenantInsert;
  try {
    tenantInsert = await pgClient.query<{
      id: number;
      name: string;
      subscription_type: string;
      subscription_plan: string;
      subscription_start_date: string;
      subscription_end_date: string;
      subscription_status: string;
    }>(
      `INSERT INTO tenants (
        id, name, status,
        subscription_type, subscription_plan, subscription_start_date, subscription_end_date, subscription_status,
        onboarding_completed, deleted_product_ids
      ) VALUES ($1, $2, 'ACTIVE', $3, $4, $5, $6, $7, $8, '{}')
      RETURNING id, name, subscription_type, subscription_plan, subscription_start_date, subscription_end_date, subscription_status`,
      [
        nextTenantId,
        params.storeName.trim(),
        subscriptionType,
        subscriptionPlan,
        validStartDate.toISOString(),
        endDate.toISOString(),
        subscriptionStatus,
        onboardingCompleted,
      ]
    );
  } catch (tErr: any) {
    throw tErr;
  }

  // Keep tenants_id_seq synchronized with the highest current id
  await pgClient
    .query(
      `SELECT setval(
         pg_get_serial_sequence('tenants', 'id'),
         COALESCE((SELECT MAX(id) FROM tenants WHERE id > 0), 1),
         (SELECT EXISTS (SELECT 1 FROM tenants WHERE id > 0))
       )`
    )
    .catch(() => {});

  const newTenant = tenantInsert.rows[0];

  const currencySymbol =
    params.currencySymbol?.trim() ||
    (currency === 'USD' ? '$' : currency === 'AED' ? 'AED' : currency === 'SAR' ? 'SAR' : currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : 'Rs.');
  const invoiceFooter =
    params.invoiceFooter?.trim() ||
    'Thank you for shopping with us! Exchanges within 7 days with original receipt.';
  const storeAddress = params.address?.trim() || '';
  const taxId = params.taxId?.trim() || '';
  const taxRate = params.taxRate ? Number(params.taxRate) : 0;

  // Store is fully initialized upon provisioning with locked pricing policy
  await pgClient.query(
    `INSERT INTO company_settings (
      tenant_id, logo, address, phone, email, tax_id, tax_rate, currency, currency_symbol,
      invoice_footer, pricing_mode, business_type, min_selling_quantity, allow_half_carton, pricing_policy_locked
    ) VALUES ($1, '/pwa-512x512.png', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, true)`,
    [
      newTenant.id,
      storeAddress,
      (params.ownerPhone || '').trim(),
      params.ownerEmail.trim().toLowerCase(),
      taxId,
      taxRate,
      currency,
      currencySymbol,
      invoiceFooter,
      pricingMode,
      businessType,
      minSellingQuantity,
      allowHalfCarton,
    ]
  );

  // Create initial Store Owner (ADMIN) user and optional Cashier if explicitly requested
  const storeUsers = await ensureTenantStoreUsers({
    tenantId: newTenant.id,
    storeName: params.storeName.trim(),
    ownerName: params.ownerName?.trim() || params.ownerEmail.split('@')[0],
    ownerEmail: params.ownerEmail.trim().toLowerCase(),
    ownerPhone: (params.ownerPhone || '').trim(),
    ownerPassword: params.password && params.password.trim() ? params.password.trim() : undefined,
    createCashier: Boolean(params.createCashier),
    cashierName: params.cashierName?.trim(),
    cashierEmail: params.cashierEmail?.trim(),
    cashierPassword: params.cashierPassword?.trim(),
    cashierPhone: params.cashierPhone?.trim(),
    ownerStatus: params.ownerStatus,
  });

  return {
    tenantId: newTenant.id,
    storeName: newTenant.name,
    businessType,
    pricingMode,
    minSellingQuantity,
    allowHalfCarton,
    subscriptionType: (newTenant as any).subscription_type || subscriptionType,
    subscriptionPlan: newTenant.subscription_plan,
    subscriptionStartDate: new Date(newTenant.subscription_start_date).toISOString(),
    subscriptionEndDate: new Date(newTenant.subscription_end_date).toISOString(),
    subscriptionStatus: newTenant.subscription_status,
    daysLeft: calculateDaysLeft(newTenant.subscription_end_date, validStartDate, subscriptionPlan),
    trialDays: 30,
    adminUserId: storeUsers.owner.id,
    adminEmail: storeUsers.owner.email,
    initialPassword: storeUsers.owner.password,
    cashierEmail: storeUsers.cashier ? storeUsers.cashier.email : null,
    cashierPassword: storeUsers.cashier ? storeUsers.cashier.password : null,
    cashierName: storeUsers.cashier ? storeUsers.cashier.name : null,
    address: storeAddress,
    invoiceFooter: invoiceFooter,
    currency,
    currencySymbol,
    onboardingCompleted: onboardingCompleted,
    onboardingUrl: `/onboarding?tenantId=${newTenant.id}`,
    loginUrl: `/?tenantId=${newTenant.id}`,
    manifestUrl: `/api/tenants/manifest?tenantId=${newTenant.id}`,
  };
}

/**
 * Helper to format a SQL literal value safely for .sql backup export files
 */
function formatSqlValue(val: any): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (typeof val === 'number') return Number.isFinite(val) ? String(val) : '0';
  if (val instanceof Date) return `'${val.toISOString().replace(/'/g, "''")}'`;
  if (typeof val === 'object') {
    return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
  }
  return `'${String(val).replace(/'/g, "''")}'`;
}

async function generateTableInsertStatements(
  tableName: string,
  whereClause: string,
  params: any[] = []
): Promise<{ sql: string; count: number }> {
  try {
    const queryText = `SELECT * FROM ${tableName} ${whereClause}`;
    const res = await pgClient.query<any>(queryText, params);
    if (!res.rows || res.rows.length === 0) {
      return { sql: `-- Table: ${tableName} (0 rows)\n`, count: 0 };
    }
    const columns = Object.keys(res.rows[0]);
    const colList = columns.map((c) => `"${c}"`).join(', ');
    const lines: string[] = [`-- Table: ${tableName} (${res.rows.length} rows)`];
    for (const row of res.rows) {
      const vals = columns.map((col) => formatSqlValue(row[col])).join(', ');
      lines.push(`INSERT INTO "${tableName}" (${colList}) VALUES (${vals}) ON CONFLICT DO NOTHING;`);
    }
    lines.push('');
    return { sql: lines.join('\n'), count: res.rows.length };
  } catch {
    return { sql: `-- Table: ${tableName} (skipped)\n`, count: 0 };
  }
}

/**
 * 5B. SUPERADMIN EXPORT SINGLE STORE DATA TO SQL FILE (`GET /api/superadmin/tenants/:id/export-sql`)
 */
router.get('/superadmin/tenants/:id/export-sql', requireAuth, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await ensureSaasControlPlane();
    const tenantId = parseInt(req.params.id, 10);
    const tenantRes = await pgClient.query<any>('SELECT * FROM tenants WHERE id = $1 LIMIT 1', [tenantId]);
    if (tenantRes.rows.length === 0) {
      return res.status(404).json({ error: 'Store tenant not found.' });
    }
    const tenant = tenantRes.rows[0];
    const dateStamp = new Date().toISOString().slice(0, 10);
    const filename = `store-${tenant.id}-backup-${dateStamp}.sql`;

    const sections: string[] = [
      `-- ============================================================================`,
      `-- Store SQL Backup Dump`,
      `-- Store Name : ${tenant.name}`,
      `-- Tenant ID  : #${tenant.id}`,
      `-- Exported At: ${new Date().toISOString()}`,
      `-- ============================================================================`,
      `BEGIN;`,
      ``,
    ];

    const tenantTables: Array<{ table: string; where: string; params: any[] }> = [
      { table: 'tenants', where: 'WHERE id = $1', params: [tenantId] },
      { table: 'company_settings', where: 'WHERE tenant_id = $1', params: [tenantId] },
      { table: 'users', where: "WHERE tenant_id = $1 AND role != 'SUPERADMIN' ORDER BY id ASC", params: [tenantId] },
      { table: 'categories', where: 'ORDER BY id ASC', params: [] },
      { table: 'products', where: 'WHERE tenant_id = $1 ORDER BY id ASC', params: [tenantId] },
      { table: 'suppliers', where: 'WHERE tenant_id = $1 ORDER BY id ASC', params: [tenantId] },
      { table: 'customers', where: 'WHERE tenant_id = $1 ORDER BY id ASC', params: [tenantId] },
      { table: 'purchases', where: 'WHERE tenant_id = $1 ORDER BY id ASC', params: [tenantId] },
      { table: 'purchase_items', where: 'WHERE tenant_id = $1 ORDER BY id ASC', params: [tenantId] },
      { table: 'supplier_payments', where: 'WHERE tenant_id = $1 ORDER BY id ASC', params: [tenantId] },
      { table: 'purchase_returns', where: 'WHERE tenant_id = $1 ORDER BY id ASC', params: [tenantId] },
      { table: 'purchase_return_items', where: 'WHERE tenant_id = $1 ORDER BY id ASC', params: [tenantId] },
      { table: 'sales', where: 'WHERE tenant_id = $1 ORDER BY id ASC', params: [tenantId] },
      { table: 'sale_items', where: 'WHERE tenant_id = $1 ORDER BY id ASC', params: [tenantId] },
      { table: 'returns', where: 'WHERE tenant_id = $1 ORDER BY id ASC', params: [tenantId] },
      { table: 'return_items', where: 'WHERE tenant_id = $1 ORDER BY id ASC', params: [tenantId] },
      { table: 'stock_movements', where: 'WHERE tenant_id = $1 ORDER BY id ASC', params: [tenantId] },
    ];

    let totalRows = 0;
    for (const item of tenantTables) {
      const dump = await generateTableInsertStatements(item.table, item.where, item.params);
      sections.push(dump.sql);
      totalRows += dump.count;
    }

    sections.push('COMMIT;');
    sections.push(`-- End of SQL Backup for ${tenant.name} (${totalRows} total records)`);

    return res.json({
      success: true,
      filename,
      storeName: tenant.name,
      totalRows,
      sql: sections.join('\n'),
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to export store SQL data: ' + err.message });
  }
});

/**
 * 5C. SUPERADMIN EXPORT ALL STORES / PLATFORM DATA TO SQL FILE (`GET /api/superadmin/export-sql`)
 */
router.get('/superadmin/export-sql', requireAuth, requireSuperAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    await ensureSaasControlPlane();
    const dateStamp = new Date().toISOString().slice(0, 10);
    const filename = `pos-all-stores-backup-${dateStamp}.sql`;

    const sections: string[] = [
      `-- ============================================================================`,
      `-- Multi-Tenant POS SaaS — Complete Platform SQL Backup (All Stores)`,
      `-- Exported At: ${new Date().toISOString()}`,
      `-- ============================================================================`,
      `BEGIN;`,
      ``,
    ];

    const allTables = [
      'tenants',
      'trial_activations',
      'company_settings',
      'users',
      'categories',
      'products',
      'suppliers',
      'customers',
      'purchases',
      'purchase_items',
      'supplier_payments',
      'purchase_returns',
      'purchase_return_items',
      'sales',
      'sale_items',
      'returns',
      'return_items',
      'stock_movements',
    ];

    let totalRows = 0;
    for (const tbl of allTables) {
      const dump = await generateTableInsertStatements(tbl, 'ORDER BY id ASC');
      sections.push(dump.sql);
      totalRows += dump.count;
    }

    sections.push('COMMIT;');
    sections.push(`-- End of Platform SQL Backup (${totalRows} total records)`);

    return res.json({
      success: true,
      filename,
      totalRows,
      sql: sections.join('\n'),
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to export platform SQL backup: ' + err.message });
  }
});

/**
 * 5C-2. SUPERADMIN IMPORT PLATFORM / MULTI-STORE SQL FILE (`POST /api/superadmin/import-sql`)
 */
router.post('/superadmin/import-sql', requireAuth, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sql = String(req.body?.sql || req.body?.sqlContent || '').trim();
    if (!sql) {
      return res.status(400).json({ error: 'SQL script content is required.' });
    }

    await pgClient.waitReady;
    await pgClient.exec(`
      DO $$
      BEGIN
        BEGIN
          ALTER TABLE categories ADD COLUMN IF NOT EXISTS tenant_id INTEGER DEFAULT 1;
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
        BEGIN
          ALTER TABLE tenants ADD COLUMN IF NOT EXISTS slug TEXT DEFAULT '';
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
      END $$;
    `).catch(() => {});
    await pgClient.exec(sql);
    await ensureDatabaseSchema();

    const superAdminHash = await bcrypt.hash('superadmin123', 10);
    const storeUserHash = await bcrypt.hash('admin123', 10);
    await pgClient
      .query(
        `UPDATE users
         SET password_hash = $1, quick_password = 'superadmin123', status = 'APPROVED', active = true
         WHERE UPPER(COALESCE(role::text, '')) = 'SUPERADMIN'`,
        [superAdminHash]
      )
      .catch(() => {});
    await pgClient
      .query(
        `UPDATE users
         SET password_hash = $1, quick_password = 'admin123', status = 'APPROVED', active = true
         WHERE UPPER(COALESCE(role::text, '')) != 'SUPERADMIN'`,
        [storeUserHash]
      )
      .catch(() => {});
    const seqTables = [
      'tenants',
      'trial_activations',
      'company_settings',
      'users',
      'categories',
      'products',
      'suppliers',
      'customers',
      'purchases',
      'purchase_items',
      'supplier_payments',
      'purchase_returns',
      'purchase_return_items',
      'sales',
      'sale_items',
      'returns',
      'return_items',
      'stock_movements',
    ];
    for (const tbl of seqTables) {
      await pgClient
        .query(
          `SELECT setval(
             pg_get_serial_sequence('${tbl}', 'id'),
             COALESCE((SELECT MAX(id) FROM ${tbl}), 1),
             (SELECT EXISTS (SELECT 1 FROM ${tbl}))
           )`
        )
        .catch(() => {});
    }

    const [storesRes, prodRes, purRes, salesRes, custRes, retRes] = await Promise.all([
      pgClient.query('SELECT COUNT(*)::int as c FROM tenants').catch(() => ({ rows: [{ c: 0 }] })),
      pgClient.query('SELECT COUNT(*)::int as c FROM products').catch(() => ({ rows: [{ c: 0 }] })),
      pgClient.query('SELECT COUNT(*)::int as c FROM purchases').catch(() => ({ rows: [{ c: 0 }] })),
      pgClient.query('SELECT COUNT(*)::int as c FROM sales').catch(() => ({ rows: [{ c: 0 }] })),
      pgClient.query('SELECT COUNT(*)::int as c FROM customers').catch(() => ({ rows: [{ c: 0 }] })),
      pgClient.query('SELECT COUNT(*)::int as c FROM returns').catch(() => ({ rows: [{ c: 0 }] })),
    ]);

    const counts = {
      stores: Number(storesRes.rows[0]?.c || 0),
      products: Number(prodRes.rows[0]?.c || 0),
      purchases: Number(purRes.rows[0]?.c || 0),
      sales: Number(salesRes.rows[0]?.c || 0),
      customers: Number(custRes.rows[0]?.c || 0),
      returns: Number(retRes.rows[0]?.c || 0),
    };

    return res.json({
      success: true,
      message: `SQL script executed! Imported ${counts.stores} stores, ${counts.products.toLocaleString()} Products, ${counts.purchases} purchases, and ${counts.sales} sales.`,
      counts,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to execute platform SQL import: ' + err.message });
  }
});

/**
 * 5D. SUPERADMIN DELETE STORE TENANT & ALL ISOLATED DATA (`DELETE /api/superadmin/tenants/:id` & `POST /api/superadmin/tenants/:id/delete`)
 */
async function handleDeleteTenantStore(req: AuthenticatedRequest, res: Response) {
  try {
    await ensureSaasControlPlane();
    const tenantId = parseInt(req.params.id, 10);
    if (!Number.isInteger(tenantId) || tenantId <= 0) {
      return res.status(400).json({ error: 'Invalid store tenant ID.' });
    }

    const tenantRes = await pgClient.query<{ id: number; name: string }>(
      'SELECT id, name FROM tenants WHERE id = $1 LIMIT 1',
      [tenantId]
    );

    if (tenantRes.rows.length === 0) {
      return res.status(404).json({ error: 'Store tenant not found or already deleted.' });
    }

    const store = tenantRes.rows[0];

    // Execute child-to-parent cleanup queries individually (outside a single transaction block so any optional table never aborts PostgreSQL transaction state)
    const orderedCleanupStatements: Array<{ sql: string; params: any[] }> = [
      {
        sql: `DELETE FROM return_items
              WHERE tenant_id = $1
                 OR return_id IN (SELECT id FROM returns WHERE tenant_id = $1)
                 OR sale_item_id IN (SELECT id FROM sale_items WHERE tenant_id = $1)
                 OR product_id IN (SELECT id FROM products WHERE tenant_id = $1)`,
        params: [tenantId],
      },
      {
        sql: `DELETE FROM returns
              WHERE tenant_id = $1
                 OR original_sale_id IN (SELECT id FROM sales WHERE tenant_id = $1)
                 OR created_by IN (SELECT id FROM users WHERE tenant_id = $1 AND role != 'SUPERADMIN')`,
        params: [tenantId],
      },
      {
        sql: `DELETE FROM sale_items
              WHERE tenant_id = $1
                 OR sale_id IN (SELECT id FROM sales WHERE tenant_id = $1)
                 OR product_id IN (SELECT id FROM products WHERE tenant_id = $1)`,
        params: [tenantId],
      },
      {
        sql: `DELETE FROM sales
              WHERE tenant_id = $1
                 OR created_by IN (SELECT id FROM users WHERE tenant_id = $1 AND role != 'SUPERADMIN')
                 OR overridden_by IN (SELECT id FROM users WHERE tenant_id = $1 AND role != 'SUPERADMIN')`,
        params: [tenantId],
      },
      {
        sql: `DELETE FROM purchase_return_items
              WHERE tenant_id = $1
                 OR purchase_return_id IN (SELECT id FROM purchase_returns WHERE tenant_id = $1)
                 OR product_id IN (SELECT id FROM products WHERE tenant_id = $1)`,
        params: [tenantId],
      },
      {
        sql: `DELETE FROM purchase_returns
              WHERE tenant_id = $1
                 OR purchase_id IN (SELECT id FROM purchases WHERE tenant_id = $1)
                 OR supplier_id IN (SELECT id FROM suppliers WHERE tenant_id = $1)
                 OR created_by IN (SELECT id FROM users WHERE tenant_id = $1 AND role != 'SUPERADMIN')`,
        params: [tenantId],
      },
      {
        sql: `DELETE FROM supplier_payments
              WHERE tenant_id = $1
                 OR supplier_id IN (SELECT id FROM suppliers WHERE tenant_id = $1)
                 OR purchase_id IN (SELECT id FROM purchases WHERE tenant_id = $1)
                 OR created_by IN (SELECT id FROM users WHERE tenant_id = $1 AND role != 'SUPERADMIN')`,
        params: [tenantId],
      },
      {
        sql: `DELETE FROM purchase_items
              WHERE tenant_id = $1
                 OR purchase_id IN (SELECT id FROM purchases WHERE tenant_id = $1)
                 OR product_id IN (SELECT id FROM products WHERE tenant_id = $1)`,
        params: [tenantId],
      },
      {
        sql: `DELETE FROM purchases
              WHERE tenant_id = $1
                 OR supplier_id IN (SELECT id FROM suppliers WHERE tenant_id = $1)
                 OR created_by IN (SELECT id FROM users WHERE tenant_id = $1 AND role != 'SUPERADMIN')`,
        params: [tenantId],
      },
      {
        sql: `DELETE FROM stock_movements
              WHERE tenant_id = $1
                 OR product_id IN (SELECT id FROM products WHERE tenant_id = $1)
                 OR user_id IN (SELECT id FROM users WHERE tenant_id = $1 AND role != 'SUPERADMIN')`,
        params: [tenantId],
      },
      { sql: `DELETE FROM products WHERE tenant_id = $1`, params: [tenantId] },
      { sql: `DELETE FROM customers WHERE tenant_id = $1`, params: [tenantId] },
      { sql: `DELETE FROM suppliers WHERE tenant_id = $1`, params: [tenantId] },
      {
        sql: `DELETE FROM password_reset_tokens
              WHERE tenant_id = $1
                 OR user_id IN (SELECT id FROM users WHERE tenant_id = $1 AND role != 'SUPERADMIN')`,
        params: [tenantId],
      },
      {
        sql: `DELETE FROM api_tokens
              WHERE tenant_id = $1
                 OR user_id IN (SELECT id FROM users WHERE tenant_id = $1 AND role != 'SUPERADMIN')`,
        params: [tenantId],
      },
      { sql: `DELETE FROM company_settings WHERE tenant_id = $1`, params: [tenantId] },
      { sql: `DELETE FROM users WHERE tenant_id = $1 AND role != 'SUPERADMIN'`, params: [tenantId] },
      { sql: `DELETE FROM trial_activations WHERE tenant_id = $1`, params: [tenantId] },
    ];

    for (const stmt of orderedCleanupStatements) {
      await pgClient.query(stmt.sql, stmt.params).catch(() => {});
    }

    // Finally delete the tenant record itself
    await pgClient.query('DELETE FROM tenants WHERE id = $1', [tenantId]);
    removeTenantMiddlewarePresence(tenantId);

    // Keep tenants_id_seq synchronized after deletion so store IDs are cleanly recycled
    await pgClient
      .query(
        `SELECT setval(
           pg_get_serial_sequence('tenants', 'id'),
           COALESCE((SELECT MAX(id) FROM tenants WHERE id > 0), 1),
           (SELECT EXISTS (SELECT 1 FROM tenants WHERE id > 0))
         )`
      )
      .catch(() => {});

    return res.json({
      success: true,
      deletedStore: store,
      recycledTenantId: tenantId,
      message: `Store '${store.name}' and all its isolated records have been permanently deleted.`,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to delete store tenant: ' + err.message });
  }
}

router.delete('/superadmin/tenants/:id', requireAuth, requireSuperAdmin, handleDeleteTenantStore);
router.post('/superadmin/tenants/:id/delete', requireAuth, requireSuperAdmin, handleDeleteTenantStore);

/**
 * 6. SUPERADMIN STORE REQUESTS (DEPRECATED — Replaced by 30-Day Free Trial Activations)
 */
const deprecatedStoreRequestsHandler = (_req: AuthenticatedRequest, res: Response) => {
  return res.json({
    success: true,
    deprecated: true,
    message: 'Store requests have been deprecated in favor of 30-day free trial activations.',
  });
};

router.post('/superadmin/store-requests/:id/approve', requireAuth, requireSuperAdmin, deprecatedStoreRequestsHandler);
router.post('/superadmin/store-requests/:id/reject', requireAuth, requireSuperAdmin, deprecatedStoreRequestsHandler);
router.patch('/superadmin/store-requests/:id', requireAuth, requireSuperAdmin, deprecatedStoreRequestsHandler);
router.delete('/superadmin/store-requests/:id', requireAuth, requireSuperAdmin, deprecatedStoreRequestsHandler);
router.post('/superadmin/store-requests/:id/delete', requireAuth, requireSuperAdmin, deprecatedStoreRequestsHandler);

/**
 * 7b. SUPERADMIN TRIAL ACTIVATIONS TRACKING & ANALYTICS (`GET /api/superadmin/trial-activations`)
 * Fetches all users who activated or achieved a trial, with full details and analytics metrics.
 */
router.get('/superadmin/trial-activations', requireAuth, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await ensureSaasControlPlane();
    const search = String(req.query.search || '').trim().toLowerCase();
    const statusFilter = String(req.query.status || 'ALL').trim().toUpperCase();

    let querySql = `
      SELECT ta.*,
             t.name as live_tenant_name,
             t.status as live_tenant_status,
             t.subscription_status as live_subscription_status,
             t.subscription_end_date as live_subscription_end_date
      FROM trial_activations ta
      LEFT JOIN tenants t ON t.id = ta.tenant_id
    `;
    const params: any[] = [];
    const whereClauses: string[] = [];

    if (search) {
      params.push(`%${search}%`);
      whereClauses.push(`(
        LOWER(ta.email) LIKE $${params.length} OR
        LOWER(ta.store_name) LIKE $${params.length} OR
        LOWER(ta.user_name) LIKE $${params.length} OR
        LOWER(ta.phone) LIKE $${params.length}
      )`);
    }

    if (statusFilter === 'ACTIVE') {
      whereClauses.push(`(ta.trial_end_date > NOW() AND ta.status = 'ACTIVE')`);
    } else if (statusFilter === 'EXPIRED') {
      whereClauses.push(`(ta.trial_end_date <= NOW() OR ta.status = 'EXPIRED')`);
    }

    if (whereClauses.length > 0) {
      querySql += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    querySql += ` ORDER BY ta.activated_at DESC, ta.id DESC LIMIT 200`;

    const result = await pgClient.query(querySql, params);
    const now = Date.now();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const trials = result.rows.map((row: any) => {
      const end = row.live_subscription_end_date ? new Date(row.live_subscription_end_date) : new Date(row.trial_end_date);
      const daysRemaining = Math.max(0, Math.ceil((end.getTime() - now) / 86400000));
      const isExpired = end.getTime() <= now || row.live_subscription_status === 'EXPIRED';

      return {
        id: row.id,
        userId: row.user_id,
        tenantId: row.tenant_id,
        email: row.email,
        userName: row.user_name || row.store_name,
        phone: row.phone || '',
        storeName: row.live_tenant_name || row.store_name,
        businessType: row.business_type || 'RETAIL',
        pricingMode: row.pricing_mode || 'FIXED',
        plan: row.plan || 'TRIAL',
        trialDurationDays: Number(row.trial_duration_days || 30),
        trialStartDate: row.trial_start_date ? new Date(row.trial_start_date).toISOString() : new Date().toISOString(),
        trialEndDate: end.toISOString(),
        daysRemaining: isExpired ? 0 : daysRemaining,
        status: isExpired ? 'EXPIRED' : (row.status || 'ACTIVE'),
        ipAddress: row.ip_address || '',
        userAgent: row.user_agent || '',
        activatedAt: row.activated_at ? new Date(row.activated_at).toISOString() : new Date().toISOString(),
        details: typeof row.details === 'string' ? JSON.parse(row.details || '{}') : (row.details || {}),
      };
    });

    // Compute summary stats across all trials
    const allTrialsRes = await pgClient.query(`
      SELECT trial_end_date, status, activated_at FROM trial_activations
    `);
    const allRows = allTrialsRes.rows || [];
    const totalTrials = allRows.length;
    const activeTrials = allRows.filter((r: any) => new Date(r.trial_end_date).getTime() > now && r.status !== 'EXPIRED').length;
    const expiredTrials = allRows.filter((r: any) => new Date(r.trial_end_date).getTime() <= now || r.status === 'EXPIRED').length;
    const todayTrials = allRows.filter((r: any) => new Date(r.activated_at).getTime() >= startOfToday.getTime()).length;

    return res.json({
      trials,
      summary: {
        totalTrials,
        activeTrials,
        expiredTrials,
        todayTrials,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch trial activations: ' + err.message });
  }
});

/**
 * 7c. SUPERADMIN EXTEND 30-DAY TRIAL (`POST /api/superadmin/trial-activations/:id/extend`)
 */
router.post('/superadmin/trial-activations/:id/extend', requireAuth, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const trialId = parseInt(req.params.id, 10);
    const extensionDays = Number(req.body?.days || 30);

    const trialRes = await pgClient.query('SELECT * FROM trial_activations WHERE id = $1', [trialId]);
    if (trialRes.rows.length === 0) {
      return res.status(404).json({ error: 'Trial activation record not found.' });
    }

    const trial = trialRes.rows[0];
    const currEnd = trial.trial_end_date ? new Date(trial.trial_end_date) : new Date();
    const baseDate = currEnd.getTime() > Date.now() ? currEnd : new Date();
    const newEndDate = new Date(baseDate.getTime() + extensionDays * 86400000);

    await pgClient.query(
      `UPDATE trial_activations
       SET trial_end_date = $1,
           trial_duration_days = trial_duration_days + $2,
           status = 'ACTIVE'
       WHERE id = $3`,
      [newEndDate.toISOString(), extensionDays, trialId]
    );

    if (trial.tenant_id) {
      await pgClient.query(
        `UPDATE tenants
         SET subscription_end_date = $1,
             subscription_status = 'ACTIVE',
             status = 'ACTIVE',
             updated_at = NOW()
         WHERE id = $2`,
        [newEndDate.toISOString(), trial.tenant_id]
      );
      await clearSubscriptionAlertsOnRenewal(trial.tenant_id);
    }

    return res.json({
      success: true,
      message: `Trial for '${trial.email}' (${trial.store_name}) extended by ${extensionDays} days until ${newEndDate.toLocaleDateString()}.`,
      newEndDate: newEndDate.toISOString(),
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to extend trial: ' + err.message });
  }
});

/**
 * 8. SUPERADMIN DIRECT STORE CREATION (`POST /api/superadmin/tenants`)
 * Minimal Required Fields Only: Store Name, Owner Email and Password
 */
router.post('/superadmin/tenants', requireAuth, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      storeName,
      ownerName,
      ownerEmail,
      password,
      ownerPhone,
      currency,
      businessType,
      pricingMode,
      subscriptionPlan,
      subscriptionStartDate,
      subscriptionEndDate,
    } = req.body || {};
    if (!storeName || !ownerName || !ownerEmail) {
      return res.status(400).json({ error: 'Store name, owner name, and owner email are required.' });
    }
    const normalizedOwnerEmail = String(ownerEmail).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizedOwnerEmail)) {
      return res.status(400).json({ error: 'Enter a valid owner email address.' });
    }
    if (!String(storeName).trim() || !String(ownerName).trim()) {
      return res.status(400).json({ error: 'Store name and owner name cannot be blank.' });
    }
    const duplicateOwnerEmail = await pgClient.query<{ id: number }>(
      'SELECT id FROM users WHERE LOWER(BTRIM(email)) = $1 LIMIT 1',
      [normalizedOwnerEmail]
    );
    if (duplicateOwnerEmail.rows.length > 0) {
      return res.status(409).json({
        code: 'EMAIL_ALREADY_EXISTS',
        error: 'This email is already in use. Please use a different email address.',
      });
    }
    if (password === undefined || String(password).trim().length < 4) {
      return res.status(400).json({ error: 'Owner password must be at least 4 characters.' });
    }

    const rawBusinessType = String(businessType || 'RETAIL').toUpperCase();
    const finalBusinessType: 'RETAIL' | 'WHOLESALE' = rawBusinessType === 'WHOLESALE' ? 'WHOLESALE' : 'RETAIL';
    const finalPricingMode: 'FIXED' | 'NEGOTIABLE' =
      finalBusinessType === 'WHOLESALE'
        ? 'FIXED'
        : String(pricingMode || 'FIXED').toUpperCase() === 'NEGOTIABLE'
        ? 'NEGOTIABLE'
        : 'FIXED';


    await pgClient.query('BEGIN');
    const provisioned = await provisionNewTenantStore({
      storeName,
      ownerName: String(ownerName).trim(),
      ownerEmail: normalizedOwnerEmail,
      password: password ? String(password).trim() : undefined,
      ownerPhone,
      currency,
      businessType: finalBusinessType,
      pricingMode: finalPricingMode,
      minSellingQuantity: req.body?.minSellingQuantity ?? req.body?.min_selling_quantity,
      allowHalfCarton: req.body?.allowHalfCarton ?? req.body?.allow_half_carton,
      subscriptionPlan: subscriptionPlan || 'YEARLY',
      subscriptionStartDate,
      subscriptionEndDate,
    });
    await pgClient.query('COMMIT');

    if (provisioned.subscriptionPlan === 'TRIAL') {
      await recordTrialActivation({
        userId: provisioned.adminUserId,
        tenantId: provisioned.tenantId,
        email: normalizedOwnerEmail,
        userName: String(ownerName || storeName).trim(),
        phone: ownerPhone,
        storeName: provisioned.storeName,
        businessType: finalBusinessType,
        pricingMode: finalPricingMode,
        plan: 'TRIAL',
        trialDurationDays: 30,
        trialStartDate: provisioned.subscriptionStartDate,
        trialEndDate: provisioned.subscriptionEndDate,
        status: 'ACTIVE',
        details: { createdBy: 'SUPERADMIN' },
      });
    }

    return res.status(201).json({
      success: true,
      provisioned,
      message: `Store '${provisioned.storeName}' created successfully.`,
    });
  } catch (err: any) {
    await pgClient.query('ROLLBACK').catch(() => {});
    if (err?.code === 'EMAIL_ALREADY_EXISTS' || (err?.code === '23505' && String(err?.constraint || '').includes('users_email'))) {
      return res.status(409).json({
        code: 'EMAIL_ALREADY_EXISTS',
        error: 'This email is already in use. Please use a different email address.',
      });
    }
    return res.status(400).json({ error: err.message || 'Failed to create tenant store.' });
  }
});

/**
 * 9. TENANT FIRST-TIME OWNER INITIAL STORE SETUP GET & POST (`/api/tenants/onboarding?tenantId=...`)
 * Configures essential store defaults for a newly created store before granting full Owner portal access:
 * - Fixed document numbering (INV- / PUR-)
 * - Store Settings & Low Stock Threshold
 * - Store Contact Details & Physical Address
 * - Tax Rates, Tax ID / STRN & Receipt Footer Notes
 */
router.get('/tenants/onboarding', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    await ensureSaasControlPlane();
    const tenantId = Number(req.query.tenantId ?? req.headers['x-tenant-id'] ?? (req as any).user?.tenantId);
    if (!Number.isSafeInteger(tenantId) || tenantId <= 0) return res.status(400).json({ error: 'A valid tenantId is required.' });
    const tenantRes = await pgClient.query(
      `SELECT t.*,
              u.name as admin_name,
              u.email as admin_email,
              u.phone as admin_phone,
              (SELECT COUNT(*) FROM products p WHERE p.tenant_id = t.id)::int as product_count,
              (SELECT COUNT(*) FROM users ca WHERE ca.tenant_id = t.id AND ca.role = 'CASHIER')::int as cashier_count
       FROM tenants t
       LEFT JOIN LATERAL (
         SELECT name, email, phone
         FROM users
         WHERE tenant_id = t.id AND role = 'ADMIN'
         ORDER BY id ASC
         LIMIT 1
       ) u ON true
       WHERE t.id = $1
       LIMIT 1`,
      [tenantId]
    );

    if (tenantRes.rows.length === 0) {
      return res.status(404).json({ error: `Tenant '${tenantId}' not found.` });
    }

    const t: any = tenantRes.rows[0];
    const settingsRes = await pgClient.query<any>(
      'SELECT * FROM company_settings WHERE tenant_id = $1 LIMIT 1',
      [t.id]
    );
    const cs = settingsRes.rows[0] || {};

    return res.json({
      tenant: {
        id: t.id,
        name: t.name,
        status: t.status,
        address: cs.address || '',
        taxId: cs.tax_id || '',
        strn: cs.strn || '',
        taxRate: Number(cs.tax_rate) || 0,
        currency: cs.currency || 'PKR',
        currencySymbol: cs.currency_symbol || 'Rs.',
        invoiceFooter:
          cs.invoice_footer ||
          'Thank you for shopping with us! Exchanges accepted within 7 days with original receipt.',
        lowStockLimit: Number(cs.low_stock_limit) || 5,
        pricingMode: cs.pricing_mode || 'FIXED',
        businessType: (cs.business_type || 'RETAIL') as 'RETAIL' | 'WHOLESALE',
        minSellingQuantity: cs.min_selling_quantity !== undefined && cs.min_selling_quantity !== null
          ? parseFloat(String(cs.min_selling_quantity))
          : (cs.allow_half_carton !== false ? 0.5 : 1.0),
        allowHalfCarton: cs.allow_half_carton !== undefined
          ? Boolean(cs.allow_half_carton)
          : true,
        logoUrl: cs.logo || '/pwa-512x512.png',
        ownerName: t.admin_name || '',
        ownerEmail: cs.email || t.admin_email || '',
        ownerPhone: cs.phone || t.admin_phone || '',
        hasCashier: Boolean(t.cashier_count > 0),
        onboardingCompleted: Boolean(t.onboarding_completed),
        isLocked: Boolean(t.onboarding_completed),
        productCount: t.product_count || 0,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to load onboarding state: ' + err.message });
  }
});

router.post('/tenants/onboarding', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    await ensureSaasControlPlane();
    const tenantId = Number(req.body?.tenantId ?? req.query?.tenantId ?? req.headers['x-tenant-id'] ?? (req as any).user?.tenantId);
    if (!Number.isSafeInteger(tenantId) || tenantId <= 0) return res.status(400).json({ error: 'A valid tenantId is required.' });

    const tenantRes = await pgClient.query<{
      id: number;
      name: string;
      status: string;
      business_type: string;
      pricing_mode: string;
      owner_email: string;
      onboarding_completed: boolean;
    }>(
      `SELECT t.id, t.name, t.status, t.onboarding_completed,
              COALESCE(NULLIF(cs.business_type::text, ''), 'RETAIL') AS business_type,
              COALESCE(NULLIF(cs.pricing_mode::text, ''), 'FIXED') AS pricing_mode,
              u.email AS owner_email
       FROM tenants t
       LEFT JOIN company_settings cs ON cs.tenant_id = t.id
       LEFT JOIN LATERAL (
         SELECT email
         FROM users
         WHERE tenant_id = t.id AND role = 'ADMIN'
         ORDER BY id ASC
         LIMIT 1
       ) u ON true
       WHERE t.id = $1
       LIMIT 1`,
      [tenantId]
    );

    if (tenantRes.rows.length === 0) {
      return res.status(404).json({ error: `Tenant '${tenantId}' does not exist.` });
    }

    const tenant = tenantRes.rows[0];

    // Lock Initial Store Setup & POS Defaults once store owner has completed setup
    if (tenant.onboarding_completed) {
      return res.status(403).json({
        error:
          'Initial Store Setup & POS Defaults is locked because this store has already been configured by the Store Owner.',
        isLocked: true,
      });
    }

    const {
      storeName,
      address,
      taxId,
      strn,
      taxRate,
      currency,
      currencySymbol,
      phone,
      email,
      ownerName,
      invoiceFooter,
      lowStockLimit,
      logoUrl,
      businessType,
      pricingMode,
      adminPassword,
      // Cashier fields (optional! If skipped, no cashier account is created):
      createCashier,
      cashierName,
      cashierEmail,
      cashierPassword,
      cashierPhone,
      initialProducts,
    } = req.body || {};

    await pgClient.query('BEGIN');

    const finalName = storeName && String(storeName).trim() ? String(storeName).trim() : tenant.name;
    const finalAddress = String(address || '').trim();
    const finalTaxId = String(taxId || '').trim();
    const finalStrn = String(strn || '').trim();
    const finalTaxRate = Math.max(0, Math.min(100, Number(taxRate) || 0));
    const finalCurrency = String(currency || 'PKR').trim();
    const finalCurrencySymbol = String(
      currencySymbol ||
        (finalCurrency === 'USD'
          ? '$'
          : finalCurrency === 'AED'
          ? 'AED'
          : finalCurrency === 'SAR'
          ? 'SAR'
          : finalCurrency === 'GBP'
          ? '£'
          : finalCurrency === 'EUR'
          ? '€'
          : 'Rs.')
    ).trim();
    const finalInvoiceFooter =
      String(
        invoiceFooter ||
          'Thank you for shopping with us! Exchanges accepted within 7 days with original receipt.'
      ).trim();
    const finalLowStockLimit = Math.max(1, parseInt(String(lowStockLimit ?? 5), 10) || 5);
    const requestedBusinessType = String(businessType || req.body.business_type || tenant.business_type || 'RETAIL').toUpperCase();
    const finalBusinessType: 'RETAIL' | 'WHOLESALE' =
      requestedBusinessType === 'WHOLESALE'
        ? 'WHOLESALE'
        : 'RETAIL';
    const requestedPricingMode = String(pricingMode || tenant.pricing_mode || 'FIXED').toUpperCase();
    const finalPricingMode =
      finalBusinessType === 'WHOLESALE'
        ? 'FIXED'
        : requestedPricingMode === 'NEGOTIABLE'
        ? 'NEGOTIABLE'
        : 'FIXED';
    const finalLogoUrl = String(logoUrl || '/pwa-512x512.png').trim();
    const finalPhone = String(phone || '').trim();
    const finalEmail = String(email || tenant.owner_email || '').trim().toLowerCase();
    const cleanCashierEmail =
      Boolean(createCashier) && cashierEmail && String(cashierEmail).trim()
        ? String(cashierEmail).trim().toLowerCase()
        : '';

    if (finalEmail && cleanCashierEmail && finalEmail === cleanCashierEmail) {
      await pgClient.query('ROLLBACK').catch(() => {});
      return res.status(409).json({
        code: 'EMAIL_ALREADY_EXISTS',
        error: 'Cashier email cannot be the same as the store owner email. Please use a unique email address.',
      });
    }

    const currentStoreAdminRes = await pgClient.query<{ id: number }>(
      `SELECT id FROM users WHERE tenant_id = $1 AND role = 'ADMIN' ORDER BY id ASC LIMIT 1`,
      [tenant.id]
    );
    const currentStoreAdminId = currentStoreAdminRes.rows[0]?.id || 0;

    if (finalEmail) {
      const duplicateOwnerEmailRes = await pgClient.query<{ id: number }>(
        `SELECT id FROM users
         WHERE LOWER(BTRIM(email)) = LOWER(BTRIM($1))
           AND id != $2
         LIMIT 1`,
        [finalEmail, currentStoreAdminId]
      );
      if (duplicateOwnerEmailRes.rows.length > 0) {
        await pgClient.query('ROLLBACK').catch(() => {});
        return res.status(409).json({
          code: 'EMAIL_ALREADY_EXISTS',
          error: 'This email is already in use. Please use a different email address.',
        });
      }
    }

    if (cleanCashierEmail) {
      const currentCashierRes = await pgClient.query<{ id: number }>(
        `SELECT id FROM users WHERE tenant_id = $1 AND role = 'CASHIER' ORDER BY id ASC LIMIT 1`,
        [tenant.id]
      );
      const currentCashierId = currentCashierRes.rows[0]?.id || 0;
      const duplicateCashierEmailRes = await pgClient.query<{ id: number }>(
        `SELECT id FROM users
         WHERE LOWER(BTRIM(email)) = LOWER(BTRIM($1))
           AND id != $2
         LIMIT 1`,
        [cleanCashierEmail, currentCashierId]
      );
      if (duplicateCashierEmailRes.rows.length > 0) {
        await pgClient.query('ROLLBACK').catch(() => {});
        return res.status(409).json({
          code: 'EMAIL_ALREADY_EXISTS',
          error: 'This cashier email is already in use. Please use a different email address.',
        });
      }
    }

    const rawMinQty = req.body?.minSellingQuantity ?? req.body?.min_selling_quantity;
    const rawAllowHalf = req.body?.allowHalfCarton ?? req.body?.allow_half_carton;
    let finalMinSellingQuantity = 1.0;
    let finalAllowHalfCarton = true;
    if (finalBusinessType === 'WHOLESALE') {
      if (rawMinQty !== undefined && rawMinQty !== null && String(rawMinQty).trim() !== '') {
        const parsed = parseFloat(String(rawMinQty));
        finalMinSellingQuantity = parsed <= 0.5 ? 0.5 : 1.0;
        finalAllowHalfCarton = finalMinSellingQuantity <= 0.5;
      } else if (rawAllowHalf !== undefined && rawAllowHalf !== null) {
        finalAllowHalfCarton = String(rawAllowHalf) === 'true' || rawAllowHalf === true;
        finalMinSellingQuantity = finalAllowHalfCarton ? 0.5 : 1.0;
      } else {
        finalMinSellingQuantity = 0.5;
        finalAllowHalfCarton = true;
      }
    }

    // Update tenants table and mark store ACTIVE + onboarded (locked)
    await pgClient.query(
      `UPDATE tenants
       SET name = $1,
           status = 'ACTIVE',
           onboarding_completed = true,
           updated_at = NOW()
       WHERE id = $2`,
      [
        finalName,
        tenant.id,
      ]
    );

    // Sync tenant company_settings with all configured Initial Store Setup defaults and lock POS defaults
    const settingsCheck = await pgClient.query('SELECT id FROM company_settings WHERE tenant_id = $1 LIMIT 1', [tenant.id]);
    if (settingsCheck.rows.length > 0) {
      await pgClient.query(
        `UPDATE company_settings
         SET logo = $1,
             address = $2,
             tax_id = $3,
             strn = $4,
             tax_rate = $5,
             currency = $6,
             currency_symbol = $7,
             phone = COALESCE(NULLIF($8, ''), phone),
             email = COALESCE(NULLIF($9, ''), email),
             invoice_footer = $10,
             low_stock_limit = $11,
             pricing_mode = $12,
             pricing_policy_locked = true,
             business_type = $13,
             min_selling_quantity = $14,
             allow_half_carton = $15,
             updated_at = NOW()
         WHERE tenant_id = $16`,
        [
          finalLogoUrl,
          finalAddress,
          finalTaxId,
          finalStrn,
          finalTaxRate,
          finalCurrency,
          finalCurrencySymbol,
          finalPhone,
          finalEmail,
          finalInvoiceFooter,
          finalLowStockLimit,
          finalPricingMode,
          finalBusinessType,
          finalMinSellingQuantity,
          finalAllowHalfCarton,
          tenant.id,
        ]
      );
    } else {
      await pgClient.query(
        `INSERT INTO company_settings (
           tenant_id, logo, address, tax_id, strn, tax_rate, currency, currency_symbol,
           phone, email, invoice_footer,
           low_stock_limit, pricing_mode, pricing_policy_locked, business_type, min_selling_quantity, allow_half_carton
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, true, $14, $15, $16)`,
        [
          tenant.id,
          finalLogoUrl,
          finalAddress,
          finalTaxId,
          finalStrn,
          finalTaxRate,
          finalCurrency,
          finalCurrencySymbol,
          finalPhone,
          finalEmail,
          finalInvoiceFooter,
          finalLowStockLimit,
          finalPricingMode,
          finalBusinessType,
          finalMinSellingQuantity,
          finalAllowHalfCarton,
        ]
      );
    }

    // Ensure Store Owner (ADMIN) exists, and only create Cashier if user explicitly requested it!
    const ensuredUsers = await ensureTenantStoreUsers({
      tenantId: tenant.id,
      storeName: finalName,
      ownerName: ownerName && String(ownerName).trim() ? String(ownerName).trim() : undefined,
      ownerEmail: finalEmail || tenant.owner_email,
      ownerPhone: finalPhone,
      createCashier: Boolean(createCashier),
      cashierName: cashierName && String(cashierName).trim() ? String(cashierName).trim() : undefined,
      cashierEmail: cashierEmail && String(cashierEmail).trim() ? String(cashierEmail).trim().toLowerCase() : undefined,
      cashierPassword: cashierPassword && String(cashierPassword).trim() ? String(cashierPassword).trim() : undefined,
      cashierPhone: cashierPhone && String(cashierPhone).trim() ? String(cashierPhone).trim() : undefined,
    });
    const adminUser: any = ensuredUsers.owner;

    if (adminPassword && String(adminPassword).trim().length >= 4) {
      const cleanPass = String(adminPassword).trim();
      const hash = bcrypt.hashSync(cleanPass, 10);
      await pgClient.query(
        `UPDATE users SET password_hash = $1, quick_password = $2, status = 'APPROVED', active = true WHERE id = $3 AND tenant_id = $4`,
        [hash, cleanPass, adminUser.id, tenant.id]
      );
    }
    if (ownerName && String(ownerName).trim()) {
      await pgClient.query(
        `UPDATE users SET name = $1 WHERE id = $2 AND tenant_id = $3`,
        [String(ownerName).trim(), adminUser.id, tenant.id]
      );
      adminUser.name = String(ownerName).trim();
    }
    if (finalEmail) {
      await pgClient.query(
        `UPDATE users SET email = $1 WHERE id = $2 AND tenant_id = $3`,
        [finalEmail, adminUser.id, tenant.id]
      );
      adminUser.email = finalEmail;
    }
    if (finalPhone) {
      await pgClient.query(
        `UPDATE users SET phone = $1 WHERE id = $2 AND tenant_id = $3`,
        [finalPhone, adminUser.id, tenant.id]
      );
      adminUser.phone = finalPhone;
    }

    // If user skipped cashier creation during onboarding wizard, ensure no cashier account was automatically created!
    if (!createCashier) {
      await pgClient.query(
        `DELETE FROM users WHERE tenant_id = $1 AND role = 'CASHIER'`,
        [tenant.id]
      );
    }

    // Optional initial inventory items if provided
    if (Array.isArray(initialProducts) && initialProducts.length > 0) {
      for (let i = 0; i < initialProducts.length; i++) {
        const item = initialProducts[i];
        if (!item || !item.name || !String(item.name).trim()) continue;
        const pName = String(item.name).trim();
        const pBrand = String(item.brand || 'Unbranded').trim() || 'Unbranded';
        const pCategory = String(item.category || 'Sneakers').trim();
        const pCost = Math.max(0, Number(item.purchasePrice) || 2000);
        const pMax = Math.max(1, Number(item.maxPrice ?? item.sellingPrice) || 3500);
        const pMin = finalPricingMode === 'NEGOTIABLE'
          ? Math.max(pCost, Number(item.minPrice) || pCost)
          : pMax;
        const tagPrice = finalPricingMode === 'NEGOTIABLE' ? Math.max(pMax, pMin + 1) : Math.max(pMax, pCost);
        const pStock = Math.max(0, parseInt(String(item.stock ?? 15), 10) || 15);
        const pBarcode =
          item.barcode && String(item.barcode).trim()
            ? String(item.barcode).trim()
            : `${pCategory.slice(0, 2).toUpperCase() || 'CA'}-${i + 1}`;

        await pgClient.query(
          `INSERT INTO products (
            tenant_id, name, article, barcode, brand, category,
            cost_price, min_price, max_price, total_stock, low_stock_limit, primary_image_url, active
          ) VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $8, $9, $10, '/assets/images/hd-07.jpg', true)`,
          [tenant.id, pName, pBarcode, pBrand, pCategory, pCost, pMin, tagPrice, pStock, finalLowStockLimit]
        );
      }
    }

    await pgClient.query('COMMIT');

    // Issue fresh tenant-scoped JWT token for immediate login after setup
    let token: string | null = null;
    if (adminUser) {
      token = generateToken({
        id: adminUser.id,
        tenantId: tenant.id,
        name: adminUser.name,
        email: adminUser.email,
        role: 'ADMIN',
        status: 'APPROVED',
      });
    }

    const updatedSettingsRes = await pgClient.query('SELECT * FROM company_settings WHERE tenant_id = $1 LIMIT 1', [tenant.id]);

    // Trigger welcome notification & email to owner when onboarding completes
    const cleanFinalName = finalName || 'Your Store';
    const finalWelcomeMsg =
      req.body?.msg ||
      req.body?.welcomeMsg ||
      `Welcome to SarbaazSoft Shoe POS, ${cleanFinalName}!\n\nThank you for choosing SarbaazSoft to power your footwear business. We are thrilled to partner with ${cleanFinalName} and help you streamline your inventory, accelerate counter checkouts, and scale your retail operations seamlessly.`;

    const welcomeResult = await sendWelcomeMsg(tenant.id, finalWelcomeMsg, finalEmail).catch((welcomeErr) => {
      console.warn('sendWelcomeMsg notice during onboarding completion:', welcomeErr);
      return null;
    });

    return res.json({
      success: true,
      message: `Initial store setup completed for ${finalName}!`,
      welcomeMsgSent: Boolean(welcomeResult?.success),
      welcomeMsgDeliveredEmail: Boolean(welcomeResult?.emailDelivered),
      token,
      user: adminUser
        ? {
            id: adminUser.id,
            tenantId: tenant.id,
            tenantName: finalName,
            name: adminUser.name,
            email: adminUser.email,
            role: 'ADMIN',
            originalRole: 'ADMIN',
            status: 'APPROVED',
            onboardingCompleted: true,
          }
        : null,
      settings: updatedSettingsRes.rows[0] || null,
      manifestUrl: `/api/tenants/manifest?tenantId=${tenant.id}`,
      redirectUrl: `/?tenantId=${tenant.id}`,
    });
  } catch (err: any) {
    await pgClient.query('ROLLBACK').catch(() => {});
    if (err?.code === 'EMAIL_ALREADY_EXISTS' || (err?.code === '23505' && String(err?.constraint || '').includes('users_email'))) {
      return res.status(409).json({
        code: 'EMAIL_ALREADY_EXISTS',
        error: 'This email is already in use. Please use a different email address.',
      });
    }
    return res.status(500).json({ error: 'Failed to complete initial store setup: ' + err.message });
  }
});

/**
 * SUPERADMIN CUSTOM NOTIFICATIONS API
 * Allows platform SuperAdmin to broadcast custom notifications to all stores or target a specific store.
 */

// POST /api/superadmin/notifications - Send custom announcement to all stores or specific store
router.post('/superadmin/notifications', requireAuth, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await ensurePlatformNotificationsSchema();
    const title = String(req.body?.title || '').trim();
    const message = String(req.body?.message || '').trim();
    if (!title || !message) {
      return res.status(400).json({ error: 'Notification title and message are required.' });
    }

    const rawTenantId = req.body?.tenantId;
    let targetTenantId: number | null = null;
    let targetStoreName = 'All Stores (Platform Broadcast)';

    if (
      rawTenantId !== undefined &&
      rawTenantId !== null &&
      String(rawTenantId).trim() !== '' &&
      String(rawTenantId).trim() !== '0' &&
      String(rawTenantId).toUpperCase() !== 'ALL'
    ) {
      const parsedId = parseInt(String(rawTenantId), 10);
      if (Number.isInteger(parsedId) && parsedId > 0) {
        const storeCheck = await pgClient.query('SELECT id, name FROM tenants WHERE id = $1', [parsedId]);
        if (storeCheck.rows.length === 0) {
          return res.status(404).json({ error: `Store with ID #${parsedId} was not found.` });
        }
        targetTenantId = parsedId;
        targetStoreName = storeCheck.rows[0].name;
      }
    }

    const rawTargetRole = String(req.body?.targetRole || 'ALL').toUpperCase();
    const validRoles = ['ALL', 'ADMIN', 'CASHIER', 'SUPERADMIN'];
    const targetRole = validRoles.includes(rawTargetRole) ? rawTargetRole : 'ALL';

    const rawType = String(req.body?.type || 'INFO').toUpperCase();
    const validTypes = ['INFO', 'WARNING', 'SUCCESS', 'URGENT'];
    const type = validTypes.includes(rawType) ? rawType : 'INFO';
    const actionUrl = String(req.body?.actionUrl || '').trim();
    const actionLabel = String(req.body?.actionLabel || '').trim();

    let expiresAt: string | null = null;
    if (req.body?.expiresAt) {
      const parsedDate = new Date(req.body.expiresAt);
      if (!isNaN(parsedDate.getTime())) {
        expiresAt = parsedDate.toISOString();
      }
    }

    const currentUserId = req.user?.id || null;

    const insertRes = await pgClient.query<{
      id: number;
      tenant_id: number | null;
      target_role: string;
      title: string;
      message: string;
      type: string;
      action_url: string;
      action_label: string;
      created_by: number | null;
      expires_at: string | null;
      created_at: string;
    }>(
      `INSERT INTO platform_notifications (
        tenant_id, target_role, title, message, type, action_url, action_label, created_by, expires_at, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      RETURNING *`,
      [targetTenantId, targetRole, title, message, type, actionUrl, actionLabel, currentUserId, expiresAt]
    );

    const row = insertRes.rows[0];

    // Dispatch real-time SSE event & Web Push to subscribers with role isolation
    await notifyPlatformAnnouncement({
      id: row.id,
      tenantId: row.tenant_id,
      targetRole: row.target_role as any,
      title: row.title,
      message: row.message,
      type: row.type,
      actionUrl: row.action_url,
      actionLabel: row.action_label,
      timestamp: row.created_at,
    }).catch((err) => console.warn('Failed to dispatch announcement notification:', err));

    return res.status(201).json({
      success: true,
      message: targetTenantId
        ? `Custom notification sent to ${targetStoreName} (${targetRole}) successfully!`
        : `Custom notification broadcast to all stores (${targetRole}) successfully!`,
      notification: {
        id: row.id,
        tenantId: row.tenant_id,
        targetRole: row.target_role,
        storeName: targetStoreName,
        title: row.title,
        message: row.message,
        type: row.type,
        actionUrl: row.action_url,
        actionLabel: row.action_label,
        createdBy: row.created_by,
        expiresAt: row.expires_at,
        createdAt: row.created_at,
        readCount: 0,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to send custom notification: ' + err.message });
  }
});

// GET /api/superadmin/notifications - List all dispatched custom notifications
router.get('/superadmin/notifications', requireAuth, requireSuperAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    await ensurePlatformNotificationsSchema();
    const notificationsRes = await pgClient.query<{
      id: number;
      tenant_id: number | null;
      target_role: string;
      store_name: string | null;
      title: string;
      message: string;
      type: string;
      action_url: string;
      action_label: string;
      created_by: number | null;
      created_by_name: string | null;
      expires_at: string | null;
      created_at: string;
      read_count: string;
    }>(`
      SELECT
        pn.id,
        pn.tenant_id,
        COALESCE(pn.target_role, 'ALL') AS target_role,
        COALESCE(t.name, 'All Stores (Platform Broadcast)') AS store_name,
        pn.title,
        pn.message,
        pn.type,
        pn.action_url,
        pn.action_label,
        pn.created_by,
        COALESCE(u.name, 'Platform SuperAdmin') AS created_by_name,
        pn.expires_at,
        pn.created_at,
        (SELECT COUNT(*) FROM platform_notification_reads pnr WHERE pnr.notification_id = pn.id)::text AS read_count
      FROM platform_notifications pn
      LEFT JOIN tenants t ON t.id = pn.tenant_id
      LEFT JOIN users u ON u.id = pn.created_by
      WHERE pn.title NOT ILIKE 'Welcome to SarbaazSoft%'
      ORDER BY pn.created_at DESC
      LIMIT 100
    `);

    const notifications = notificationsRes.rows.map((r) => ({
      id: r.id,
      tenantId: r.tenant_id,
      targetRole: r.target_role,
      storeName: r.store_name,
      title: r.title,
      message: r.message,
      type: r.type,
      actionUrl: r.action_url,
      actionLabel: r.action_label,
      createdBy: r.created_by,
      createdByName: r.created_by_name,
      expiresAt: r.expires_at,
      createdAt: r.created_at,
      readCount: parseInt(r.read_count || '0', 10),
    }));

    return res.json({ notifications });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to load notifications: ' + err.message });
  }
});

// DELETE /api/superadmin/notifications/:id - Revoke / delete a dispatched notification
router.delete('/superadmin/notifications/:id', requireAuth, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await ensurePlatformNotificationsSchema();
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid notification ID' });
    }
    await pgClient.query('DELETE FROM platform_notifications WHERE id = $1', [id]);
    return res.json({ success: true, message: 'Notification revoked successfully.' });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to delete notification: ' + err.message });
  }
});


export default router;
