import { Router } from 'express';
import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pgClient } from '../../db/index.ts';
import { ensureSaasControlPlane, normalizeSubscriptionPlan, normalizeSubscriptionType, calculateSubscriptionEndDate, calculateDaysLeft, daysLeft, syncExpiredTenantSubscriptions } from '../../db/schemaInit.ts';
import { requireAuth, requireAdmin, requireSuperAdmin } from '../auth.ts';
import type { AuthenticatedRequest } from '../auth.ts';
import { extractStrictTenantId } from '../../db/tenantDb.ts';
import { getAllAppSettings, updateAppSettings, APP_SETTINGS_DEFAULTS } from '../services/appSettingsService.ts';
import { notifyPlatformAnnouncement } from '../pushNotificationService.ts';
import { sendStaffWelcomeNotification } from '../services/welcomeService.ts';
import { testResendConfiguration } from '../utils/email.ts';

const JWT_SECRET = process.env.JWT_SECRET || 'shoe-pos-super-secure-jwt-secret-key-2026';

const router = Router();

let settingsColumnsVerified = false;

async function ensureSettingsPricingColumns() {
  if (settingsColumnsVerified) return;
  try {
    await ensureSaasControlPlane();
    settingsColumnsVerified = true;
  } catch (err) {
    console.warn('Could not ensure settings pricing columns:', err);
  }
}

async function resolvePublicOrAuthTenantId(req: Request): Promise<number> {
  const requestedTenantId = Number(req.headers['x-tenant-id'] || req.query.tenantId);

  const customToken = typeof req.headers['x-auth-token'] === 'string' ? req.headers['x-auth-token'].trim() : '';
  const authHeader = req.headers.authorization;
  const rawToken = customToken || (authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : '');

  let tokenTenantId: number | null = null;
  let tokenRole = '';

  if (rawToken) {
    try {
      const decoded: any = jwt.verify(rawToken, JWT_SECRET);
      if (decoded?.tenantId && Number(decoded.tenantId) > 0) {
        tokenTenantId = Number(decoded.tenantId);
      }
      tokenRole = String(decoded?.role || '').toUpperCase();
    } catch (_) {}
  }

  if (Number.isSafeInteger(requestedTenantId) && requestedTenantId > 0 && (!tokenTenantId || tokenRole === 'SUPERADMIN')) {
    const tRes = await pgClient.query<{ id: number }>('SELECT id FROM tenants WHERE id = $1 LIMIT 1', [requestedTenantId]);
    if (tRes.rows[0]?.id) return tRes.rows[0].id;
  }

  if (tokenTenantId) {
    return tokenTenantId;
  }

  return 1;
}

async function ensureTenantSubscriptionPopulated(tenantId: number): Promise<any> {
  try {
    await syncExpiredTenantSubscriptions();
    let tenantRes = await pgClient.query('SELECT * FROM tenants WHERE id = $1 LIMIT 1', [tenantId]);
    if (tenantRes.rows.length === 0) {
      tenantRes = await pgClient.query('SELECT * FROM tenants ORDER BY id ASC LIMIT 1');
    }
    const t = tenantRes.rows[0];
    if (!t) return null;

    let needsUpdate = false;

    const plan = normalizeSubscriptionPlan(t.subscription_plan || t.subscription_type || 'free_tier');
    const subType = normalizeSubscriptionType(plan);
    if (t.subscription_plan !== plan || t.subscription_type !== subType) {
      needsUpdate = true;
    }

    const startDt = t.subscription_start_date ? new Date(t.subscription_start_date) : new Date();
    const endDt = t.subscription_end_date
      ? new Date(t.subscription_end_date)
      : calculateSubscriptionEndDate(plan, startDt);
    if (!t.subscription_start_date || !t.subscription_end_date) {
      needsUpdate = true;
    }

    const isExpiredNow = endDt.getTime() < Date.now();
    let subStatus = String(t.subscription_status || '').toUpperCase();
    if (String(t.status || '').toUpperCase() === 'SUSPENDED') {
      subStatus = 'SUSPENDED';
    } else if (isExpiredNow) {
      subStatus = 'EXPIRED';
    } else if (!['ACTIVE', 'EXPIRED', 'SUSPENDED'].includes(subStatus)) {
      subStatus = 'ACTIVE';
    }
    if (t.subscription_status !== subStatus) {
      needsUpdate = true;
    }

    if (needsUpdate) {
      const updated = await pgClient.query(
        `UPDATE tenants
         SET subscription_plan = $1,
             subscription_type = $2,
             subscription_start_date = $3,
             subscription_end_date = $4,
             subscription_status = $5,
             updated_at = NOW()
         WHERE id = $6
         RETURNING *`,
        [plan, subType, startDt.toISOString(), endDt.toISOString(), subStatus, t.id]
      );
      return updated.rows[0] || t;
    }

    return t;
  } catch {
    return null;
  }
}

async function getPendingRenewalRequest(_tenantId: number): Promise<any | null> {
  // store_requests table is deprecated and dropped in favor of direct 30-day free trial activations
  return null;
}

function buildSubscriptionInfo(tenantRow?: any, pendingRenewalRequest?: any | null) {
  const subscriptionPlan = normalizeSubscriptionPlan(
    tenantRow?.subscription_plan ||
    tenantRow?.subscriptionPlan ||
    tenantRow?.plan ||
    tenantRow?.subscription_type ||
    'free_tier'
  );
  const subscriptionType = normalizeSubscriptionType(
    subscriptionPlan !== 'free_tier'
      ? subscriptionPlan
      : tenantRow?.subscription_type || tenantRow?.subscription_plan || 'free_tier'
  );
  const isTrial = subscriptionPlan === 'free_tier';
  const startDt = tenantRow?.subscription_start_date
    ? new Date(tenantRow.subscription_start_date)
    : new Date();
  const endDt = tenantRow?.subscription_end_date
    ? new Date(tenantRow.subscription_end_date)
    : calculateSubscriptionEndDate(subscriptionPlan, startDt);

  const startIso = !Number.isNaN(startDt.getTime()) ? startDt.toISOString() : new Date().toISOString();
  const endIso = !Number.isNaN(endDt.getTime())
    ? endDt.toISOString()
    : calculateSubscriptionEndDate(subscriptionPlan, new Date()).toISOString();

  const diffMs = new Date(endIso).getTime() - Date.now();
  const daysRemaining = calculateDaysLeft(endIso, new Date(), subscriptionPlan);
  const isExpired = diffMs < 0 || String(tenantRow?.subscription_status || '').toUpperCase() === 'EXPIRED';
  const subscriptionStatus =
    String(tenantRow?.status || '').toUpperCase() === 'SUSPENDED' ||
    String(tenantRow?.subscription_status || '').toUpperCase() === 'SUSPENDED'
      ? 'SUSPENDED'
      : isExpired
      ? 'EXPIRED'
      : 'ACTIVE';

  return {
    plan: subscriptionPlan,
    subscriptionType,
    subscription_type: subscriptionType,
    subscriptionPlan,
    subscription_plan: subscriptionPlan,
    isTrial,
    is_trial: isTrial,
    startDate: startIso,
    subscriptionStartDate: startIso,
    subscription_start_date: startIso,
    endDate: endIso,
    subscriptionEndDate: endIso,
    subscription_end_date: endIso,
    status: subscriptionStatus,
    subscriptionStatus,
    subscription_status: subscriptionStatus,
    daysRemaining,
    daysLeft: daysRemaining,
    isExpired,
    pendingRenewalRequest: pendingRenewalRequest || null,
  };
}

function formatSettingsResponse(s: any, tenantRow?: any, pendingRenewalRequest?: any | null) {
  const isLocked = tenantRow
    ? Boolean(tenantRow.onboarding_completed)
    : Boolean(s.pricing_policy_locked ?? true);
  const mode = String(s.pricing_mode || 'FIXED').toUpperCase() === 'NEGOTIABLE' ? 'NEGOTIABLE' : 'FIXED';
  const isSetupLocked = tenantRow
    ? Boolean(tenantRow.onboarding_completed)
    : Boolean(s.pricing_policy_locked ?? true);
  const locked = isLocked;
  const logo = s.logo || '';
  const receiptLogo = s.receipt_logo || logo || '';
  const showReceiptLogo = Boolean(s.show_receipt_logo);
  const subInfo = buildSubscriptionInfo(tenantRow, pendingRenewalRequest);
  const storeName = tenantRow?.name || s.name || 'Retail Store';
  const businessType: 'RETAIL' | 'WHOLESALE' =
    String(s.business_type || 'RETAIL').toUpperCase() === 'WHOLESALE'
      ? 'WHOLESALE'
      : 'RETAIL';
  const allowHalfCarton = s.allow_half_carton !== undefined
    ? Boolean(s.allow_half_carton)
    : (s.min_selling_quantity !== undefined && s.min_selling_quantity !== null
        ? parseFloat(String(s.min_selling_quantity)) <= 0.5
        : true);
  const minSellingQuantity = s.min_selling_quantity !== undefined && s.min_selling_quantity !== null
    ? parseFloat(String(s.min_selling_quantity))
    : (allowHalfCarton ? 0.5 : 1.0);

  return {
    id: s.id,
    tenantId: s.tenant_id || tenantRow?.id || 1,
    tenantStatus: tenantRow?.status || 'ACTIVE',
    businessType,
    business_type: businessType,
    minSellingQuantity,
    min_selling_quantity: minSellingQuantity,
    allowHalfCarton,
    subscriptionPlan: subInfo.subscriptionPlan,
    subscription_plan: subInfo.subscriptionPlan,
    subscriptionType: subInfo.subscriptionType,
    subscription_type: subInfo.subscriptionType,
    isTrial: subInfo.isTrial,
    subscriptionStartDate: subInfo.subscriptionStartDate,
    subscriptionEndDate: subInfo.subscriptionEndDate,
    subscriptionStatus: subInfo.subscriptionStatus,
    daysRemaining: subInfo.daysRemaining,
    pendingRenewalRequest: subInfo.pendingRenewalRequest,
    subscriptionInfo: subInfo,
    isOnboarded: tenantRow ? Boolean(tenantRow.onboarding_completed) : true,
    onboardingCompleted: isSetupLocked,
    initialSetupLocked: isSetupLocked,
    name: storeName,
    companyName: storeName,
    phone: s.phone || '',
    email: s.email || '',
    address: s.address || '',
    strn: s.strn || '',
    taxId: s.tax_id || '',
    taxNumber: s.tax_id || '',
    website: s.website || '',
    logo,
    receiptLogo,
    showReceiptLogo,
    currency: s.currency || 'PKR',
    currencyName: s.currency_name || 'Pakistani Rupee',
    currencySymbol: s.currency_symbol || 'Rs.',
    invoiceFooter: s.invoice_footer || '',
    lowStockLimit: s.low_stock_limit,
    pricingMode: mode,
    pricingPolicyLocked: locked,
    pricing_policy_locked: locked,
    updatedAt: s.updated_at,
  };
}

// GET /api/settings/subscription - Dedicated endpoint to fetch populated subscriptionInfo for active store
router.get('/subscription', async (req: Request, res: Response) => {
  try {
    await ensureSettingsPricingColumns();
    const tenantId = await resolvePublicOrAuthTenantId(req);
    const tenantRow = await ensureTenantSubscriptionPopulated(tenantId);
    const pendingRenewal = await getPendingRenewalRequest(tenantRow?.id || tenantId);
    const subscriptionInfo = buildSubscriptionInfo(tenantRow, pendingRenewal);
    return res.json({
      tenantId: tenantRow?.id || tenantId,
      storeName: tenantRow?.name || 'Retail Store',
      pendingRenewalRequest: pendingRenewal,
      subscriptionInfo,
    });
  } catch (err: any) {
    const fallbackSub = buildSubscriptionInfo(null, null);
    return res.status(200).json({
      tenantId: 1,
      storeName: 'Retail Store',
      pendingRenewalRequest: null,
      subscriptionInfo: fallbackSub,
    });
  }
});

// POST /api/settings/renew-subscription - Store Owner triggers a subscription extension request to SuperAdmin
router.post('/renew-subscription', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (req.user?.role === 'SUPERADMIN') {
      return res.status(403).json({ error: 'SuperAdmin cannot request store subscription renewal. Only store owners can request renewals.' });
    }

    await ensureSettingsPricingColumns();
    const tenantId = await resolvePublicOrAuthTenantId(req);
    const tenantRow = await ensureTenantSubscriptionPopulated(tenantId);

    if (!tenantRow) {
      return res.status(404).json({ error: 'Store tenant not found.' });
    }

    const [csRes, ownerRes] = await Promise.all([
      pgClient
        .query('SELECT email, phone, address FROM company_settings WHERE tenant_id = $1 LIMIT 1', [tenantRow.id])
        .catch(() => ({ rows: [] as any[] })),
      pgClient
        .query("SELECT email, phone FROM users WHERE tenant_id = $1 AND role = 'ADMIN' ORDER BY id ASC LIMIT 1", [tenantRow.id])
        .catch(() => ({ rows: [] as any[] })),
    ]);
    const cs = csRes.rows[0] || {};
    const ownerUser = ownerRes.rows[0] || {};

    const requestedPlan = normalizeSubscriptionPlan(
      req.body?.plan || req.body?.subscriptionPlan || tenantRow.subscription_plan || 'YEARLY'
    );
    const planLabel = requestedPlan === '6_MONTHS' ? '6 Months' : 'Yearly (12 Months)';
    const customNote = String(req.body?.notes || req.body?.message || '').trim();
    const fullNotes = customNote
      ? `[RENEWAL REQUEST • ${planLabel}] ${customNote}`
      : `Subscription renewal/extension request (${planLabel}) for store ${tenantRow.name}`;

    const storeName = String(tenantRow.name || 'Retail Store').trim();
    const ownerEmail = String(ownerUser.email || cs.email || `admin+${tenantRow.id}@store.com`).trim().toLowerCase();
    const ownerPhone = String(ownerUser.phone || cs.phone || '').trim();
    const businessAddress = String(cs.address || '').trim();

    // Alert SuperAdmin via platform notification about the renewal request (strictly scoped to SUPERADMIN role)
    await pgClient
      .query(
        `INSERT INTO platform_notifications (tenant_id, target_role, title, message, type, action_url, action_label, created_at)
         VALUES (NULL, 'SUPERADMIN', $1, $2, 'SYSTEM', '/superadmin', 'Review Store', NOW())
         RETURNING id, created_at`,
        [
          `Renewal Request: ${storeName}`,
          `Store owner requested subscription renewal (${planLabel}) for '${storeName}'. Contact: ${ownerEmail} / ${ownerPhone}. Notes: ${fullNotes}`,
        ]
      )
      .then(async (notifRes) => {
        const notifRow = notifRes.rows[0];
        if (notifRow?.id) {
          await notifyPlatformAnnouncement({
            id: notifRow.id,
            tenantId: null,
            targetRole: 'SUPERADMIN',
            title: `Renewal Request: ${storeName}`,
            message: `Store owner requested subscription renewal (${planLabel}) for '${storeName}'. Contact: ${ownerEmail} / ${ownerPhone}. Notes: ${fullNotes}`,
            type: 'SYSTEM',
            actionUrl: '/superadmin',
            actionLabel: 'Review Store',
            timestamp: notifRow.created_at,
          }).catch(() => {});
        }
      })
      .catch(() => {});

    const renewalRow = {
      id: tenantRow.id,
      store_name: storeName,
      owner_email: ownerEmail,
      owner_phone: ownerPhone,
      business_address: businessAddress,
      plan: requestedPlan,
      request_type: 'RENEWAL',
      notes: fullNotes,
      status: 'PENDING',
      provisioned_tenant_id: tenantRow.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const subscriptionInfo = buildSubscriptionInfo(tenantRow, renewalRow);
    return res.status(201).json({
      success: true,
      renewalRequest: renewalRow,
      subscriptionInfo,
      message: `Subscription extension request (${planLabel}) for '${storeName}' has been sent to the SuperAdmin for approval.`,
    });
  } catch (err: any) {
    return res.status(500).json({
      error: 'Failed to submit subscription renewal request: ' + (err?.message || 'Unknown error'),
    });
  }
});

// Helper to filter app-level settings (exclude store-level billing prefixes)
function filterAppLevelSettings(data: { byKey: Record<string, string>; grouped: Record<string, any[]> }) {
  const { billing, ...appOnlyGrouped } = data.grouped;
  const appOnlyByKey = { ...data.byKey };
  delete appOnlyByKey.INVOICE_PREFIX;
  delete appOnlyByKey.PURCHASE_PREFIX;
  return {
    appSettings: appOnlyByKey,
    appSettingsGrouped: appOnlyGrouped,
  };
}

// GET /api/settings/app, /api/settings/system, /api/settings/global, /api/settings/root - Exclusively Platform Owner
router.get(['/app', '/system', '/global', '/root', '/system-settings'], requireAuth, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const appSettingsData = await getAllAppSettings(req.user?.role);
    const filtered = filterAppLevelSettings(appSettingsData);
    res.json(filtered);
  } catch (err: any) {
    const status = err.statusCode || 500;
    res.status(status).json({ error: 'Failed to fetch app settings: ' + err.message });
  }
});

// PUT /api/settings/app, /api/settings/system, /api/settings/global, /api/settings/root - Exclusively Platform Owner
router.put(['/app', '/system', '/global', '/root', '/system-settings'], requireAuth, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const updates = req.body?.appSettings || req.body || {};
    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ error: 'appSettings payload object is required.' });
    }
    // Remove store-level prefixes if sent
    delete updates.INVOICE_PREFIX;
    delete updates.PURCHASE_PREFIX;

    await updateAppSettings(updates, req.user?.role);
    const allAppSettings = await getAllAppSettings(req.user?.role);
    const filtered = filterAppLevelSettings(allAppSettings);
    return res.json({
      message: 'Application settings updated successfully.',
      ...filtered,
    });
  } catch (err: any) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: 'Failed to update app settings: ' + err.message });
  }
});

// POST /api/settings/app, /api/settings/system, /api/settings/global, /api/settings/root - Exclusively Platform Owner
router.post(['/app', '/system', '/global', '/root', '/system-settings'], requireAuth, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const updates = req.body?.appSettings || req.body || {};
    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ error: 'appSettings payload object is required.' });
    }
    delete updates.INVOICE_PREFIX;
    delete updates.PURCHASE_PREFIX;

    await updateAppSettings(updates, req.user?.role);
    const allAppSettings = await getAllAppSettings(req.user?.role);
    const filtered = filterAppLevelSettings(allAppSettings);
    return res.json({
      message: 'Application settings updated successfully.',
      ...filtered,
    });
  } catch (err: any) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: 'Failed to update app settings: ' + err.message });
  }
});

// PATCH /api/settings/app, /api/settings/system, /api/settings/global, /api/settings/root - Exclusively Platform Owner
router.patch(['/app', '/system', '/global', '/root', '/system-settings'], requireAuth, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const updates = req.body?.appSettings || req.body || {};
    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ error: 'appSettings payload object is required.' });
    }
    delete updates.INVOICE_PREFIX;
    delete updates.PURCHASE_PREFIX;

    await updateAppSettings(updates, req.user?.role);
    const allAppSettings = await getAllAppSettings(req.user?.role);
    const filtered = filterAppLevelSettings(allAppSettings);
    return res.json({
      message: 'Application settings updated successfully.',
      ...filtered,
    });
  } catch (err: any) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: 'Failed to update app settings: ' + err.message });
  }
});

// POST /api/settings/test-email - Trigger live Resend test email to verify credentials and sender domain
router.post('/test-email', requireAuth, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const requestedRecipient = req.body?.recipientEmail || req.body?.to || req.user?.email || 'sarbaazsoft@gmail.com';
    const cleanRecipient = String(requestedRecipient).trim().toLowerCase();

    const diagnostics = await testResendConfiguration(cleanRecipient);

    if (diagnostics.delivered) {
      return res.json({
        success: true,
        delivered: true,
        message: diagnostics.info || `Test email sent successfully to ${cleanRecipient}.`,
        details: diagnostics,
      });
    }

    return res.status(200).json({
      success: false,
      delivered: false,
      message: diagnostics.info || `Test email could not be delivered: ${diagnostics.error}`,
      details: diagnostics,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      delivered: false,
      error: 'Test email failed: ' + err.message,
    });
  }
});

// GET /api/settings - Store settings (scoped strictly to store tenant; does not leak app-level secrets)
router.get('/', async (req: Request, res: Response) => {
  try {
    await ensureSettingsPricingColumns();
    const tenantId = await resolvePublicOrAuthTenantId(req);

    const [result, tenantRow] = await Promise.all([
      pgClient.query('SELECT * FROM company_settings WHERE tenant_id = $1 LIMIT 1', [tenantId]),
      ensureTenantSubscriptionPopulated(tenantId),
    ]);
    const pendingRenewal = await getPendingRenewalRequest(tenantRow?.id || tenantId);

    if (result.rows.length === 0) {
      const fallback = await pgClient.query('SELECT * FROM company_settings ORDER BY id ASC LIMIT 1');
      if (fallback.rows.length === 0) {
        return res.status(404).json({ error: 'Company settings not initialized.' });
      }
      return res.json({
        settings: formatSettingsResponse(fallback.rows[0], tenantRow, pendingRenewal),
      });
    }

    const s: any = result.rows[0];
    res.json({
      settings: formatSettingsResponse(s, tenantRow, pendingRenewal),
    });
  } catch (err: any) {
    const fallbackSub = buildSubscriptionInfo(null);
    res.status(200).json({
      settings: {
        id: 0,
        tenantId: 1,
        subscriptionPlan: fallbackSub.subscriptionPlan,
        subscription_plan: fallbackSub.subscriptionPlan,
        subscriptionStartDate: fallbackSub.subscriptionStartDate,
        subscription_start_date: fallbackSub.subscriptionStartDate,
        subscriptionEndDate: fallbackSub.subscriptionEndDate,
        subscription_end_date: fallbackSub.subscriptionEndDate,
        subscriptionStatus: fallbackSub.subscriptionStatus,
        subscription_status: fallbackSub.subscriptionStatus,
        daysRemaining: fallbackSub.daysRemaining,
        subscriptionInfo: fallbackSub,
        name: 'Retail Store',
        companyName: 'Retail Store',
        company_name: 'Retail Store',
        phone: '',
        companyPhone: '',
        email: '',
        companyEmail: '',
        address: '',
        companyAddress: '',
        currency: 'PKR',
        currencyName: 'Pakistani Rupee',
        currency_name: 'Pakistani Rupee',
        currencySymbol: 'Rs.',
        currency_symbol: 'Rs.',
        pricingMode: 'FIXED',
        pricingPolicyLocked: false,
        pricing_policy_locked: false,
      },
    });
  }
});

// POST/PUT/PATCH /api/settings - Update Store Company Settings
const handleUpdateSettings = async (req: AuthenticatedRequest, res: Response) => {
  try {
    await ensureSettingsPricingColumns();

    const userRole = String(req.user?.role || '').toUpperCase();
    const isPlatformOwner = userRole === 'SUPERADMIN';

    // Cashiers and Managers cannot alter store settings -> 403 Forbidden
    if (userRole === 'CASHIER' || userRole === 'MANAGER') {
      return res.status(403).json({
        error: `Forbidden: ${userRole === 'CASHIER' ? 'Cashier' : 'Manager'} role is not authorized to modify settings.`,
        code: 'FORBIDDEN_ROLE',
      });
    }

    const tenantId = extractStrictTenantId(req);

    // SuperAdmin without a store tenant attempting to modify store settings
    if (isPlatformOwner && tenantId <= 0) {
      return res.status(400).json({
        error: 'SuperAdmin must configure application-level settings via /api/settings/app.',
        code: 'USE_APP_SETTINGS_ENDPOINT',
      });
    }

    const companyName = (req.body.company_name || req.body.companyName || req.body.name || '').trim();
    const companyPhone = (req.body.company_phone || req.body.companyPhone || req.body.phone || '').trim();
    const companyEmail = (req.body.company_email || req.body.companyEmail || req.body.email || '').trim();
    const companyAddress = (req.body.company_address || req.body.companyAddress || req.body.address || '').trim();

    const strn = (req.body.strn || '').trim();
    const taxId = (req.body.tax_id || req.body.taxId || req.body.taxNumber || req.body.tax_number || '').trim();
    const website = (req.body.website || '').trim();

    const currencyName = (req.body.currency_name || req.body.currencyName || 'Pakistani Rupee').trim();
    const currencySymbol = (req.body.currency_symbol || req.body.currencySymbol || 'Rs.').trim();
    const logo = req.body.logo || '';
    const receiptLogo = req.body.receipt_logo ?? req.body.receiptLogo ?? logo;
    const showReceiptLogo = Boolean(req.body.show_receipt_logo ?? req.body.showReceiptLogo ?? false);
    const invoiceFooter = req.body.invoice_footer || req.body.invoiceFooter || '';
    const lowStockLimit = parseInt(req.body.low_stock_limit || req.body.lowStockLimit, 10) || 5;

    const [currentSettingsRes, tenantRes] = await Promise.all([
      pgClient.query<{
        id: number;
        pricing_policy_locked: boolean;
        pricing_mode: string;
        business_type: string;
        currency: string;
        currency_name: string;
        currency_symbol: string;
      }>(
        'SELECT id, pricing_policy_locked, pricing_mode, business_type, currency, currency_name, currency_symbol FROM company_settings WHERE tenant_id = $1 LIMIT 1',
        [tenantId]
      ),
      pgClient.query<{
        id: number;
        name: string;
        onboarding_completed: boolean;
      }>(
        'SELECT id, name, onboarding_completed FROM tenants WHERE id = $1 LIMIT 1',
        [tenantId]
      ),
    ]);

    const currentRow = currentSettingsRes.rows[0];

    // Core business type and pricing policy reside in company_settings and are immutable once setup is locked.
    const isLocked = tenantRes.rows[0]
      ? Boolean(tenantRes.rows[0].onboarding_completed)
      : Boolean(currentRow?.pricing_policy_locked ?? false);

    const requestedBusinessType = String(
      isLocked ? currentRow?.business_type || 'RETAIL' : req.body.business_type || req.body.businessType || currentRow?.business_type || 'RETAIL'
    ).toUpperCase();
    const finalBusinessType = requestedBusinessType === 'WHOLESALE' ? 'WHOLESALE' : 'RETAIL';

    const requestedPricingMode = String(
      isLocked ? currentRow?.pricing_mode || 'FIXED' : req.body.pricingMode || currentRow?.pricing_mode || 'FIXED'
    ).toUpperCase();
    const finalPricingMode = finalBusinessType === 'WHOLESALE'
      ? 'FIXED'
      : requestedPricingMode === 'NEGOTIABLE' ? 'NEGOTIABLE' : 'FIXED';

    const finalCurrencyCode = req.body.currency ? String(req.body.currency).trim() : (currentRow?.currency || 'PKR');
    const finalCurrencyName = currencyName || currentRow?.currency_name || 'Pakistani Rupee';
    const finalCurrencySymbol = currencySymbol || currentRow?.currency_symbol || 'Rs.';
    if (!companyName) {
      return res.status(400).json({ error: 'company_name is required.' });
    }
    if (!companyPhone) {
      return res.status(400).json({ error: 'company_phone is required.' });
    }
    if (companyEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(companyEmail)) {
        return res.status(400).json({ error: 'company_email must be in a valid email format (e.g., info@company.com).' });
      }
    }

    if (!finalCurrencyName) {
      return res.status(400).json({ error: 'currency_name is required (e.g., "Pakistani Rupee", "US Dollar").' });
    }
    if (!finalCurrencySymbol) {
      return res.status(400).json({ error: 'currency_symbol is required (e.g., "Rs.", "$", "PKR").' });
    }

    const rawMinQty = req.body.min_selling_quantity ?? req.body.minSellingQuantity;
    const rawAllowHalf = req.body.allow_half_carton ?? req.body.allowHalfCarton;
    let finalMinSellingQuantity = (currentRow as any)?.min_selling_quantity !== undefined && (currentRow as any)?.min_selling_quantity !== null
      ? parseFloat(String((currentRow as any).min_selling_quantity))
      : 1.0;
    let finalAllowHalfCarton = (currentRow as any)?.allow_half_carton !== undefined
      ? Boolean((currentRow as any).allow_half_carton)
      : true;

    if (finalBusinessType === 'WHOLESALE') {
      if (rawMinQty !== undefined && rawMinQty !== null && String(rawMinQty).trim() !== '') {
        const parsed = parseFloat(String(rawMinQty));
        finalMinSellingQuantity = parsed <= 0.5 ? 0.5 : 1.0;
        finalAllowHalfCarton = finalMinSellingQuantity <= 0.5;
      } else if (rawAllowHalf !== undefined && rawAllowHalf !== null) {
        finalAllowHalfCarton = String(rawAllowHalf) === 'true' || rawAllowHalf === true;
        finalMinSellingQuantity = finalAllowHalfCarton ? 0.5 : 1.0;
      }
    }

    let updateRes;
    if (currentRow) {
      updateRes = await pgClient.query(
        `UPDATE company_settings SET
           phone = $1, email = $2, address = $3,
           strn = $4, tax_id = $5, website = $6, logo = $7,
           currency_name = $8, currency = $9, currency_symbol = $10,
           invoice_footer = $11, low_stock_limit = $12,
           pricing_mode = $13, business_type = $14, pricing_policy_locked = $19,
           min_selling_quantity = $20, allow_half_carton = $21,
           show_receipt_logo = $15, receipt_logo = $16, updated_at = NOW()
         WHERE id = $17 AND tenant_id = $18
         RETURNING *`,
        [
          companyPhone,
          companyEmail,
          companyAddress,
          strn,
          taxId,
          website,
          logo,
          finalCurrencyName,
          finalCurrencyCode,
          finalCurrencySymbol,
          invoiceFooter,
          lowStockLimit,
          finalPricingMode,
          finalBusinessType,
          showReceiptLogo,
          receiptLogo,
          currentRow.id,
          tenantId,
          isLocked,
          finalMinSellingQuantity,
          finalAllowHalfCarton,
        ]
      );
    } else {
      updateRes = await pgClient.query(
        `INSERT INTO company_settings (
           tenant_id, phone, email, address, strn, tax_id, website, logo,
           currency_name, currency, currency_symbol,
           invoice_footer, low_stock_limit, pricing_mode, business_type, min_selling_quantity, allow_half_carton, pricing_policy_locked, show_receipt_logo, receipt_logo
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
         RETURNING *`,
        [
          tenantId,
          companyPhone,
          companyEmail,
          companyAddress,
          strn,
          taxId,
          website,
          logo,
          finalCurrencyName,
          finalCurrencyCode,
          finalCurrencySymbol,
          invoiceFooter,
          lowStockLimit,
          finalPricingMode,
          finalBusinessType,
          finalMinSellingQuantity,
          finalAllowHalfCarton,
          isLocked,
          showReceiptLogo,
          receiptLogo,
        ]
      );
    }

    // Store name lives in tenants.name
    await pgClient
      .query(
        'UPDATE tenants SET name = $1, updated_at = NOW() WHERE id = $2',
        [companyName, tenantId]
      )
      .catch(() => {});

    // For wholesale stores that globally disallow half cartons, set allow_half_carton = false across the entire product catalog
    if (finalBusinessType === 'WHOLESALE' && (!finalAllowHalfCarton || finalMinSellingQuantity > 0.5)) {
      await pgClient.query('UPDATE products SET allow_half_carton = false WHERE COALESCE(tenant_id, 1) = $1', [tenantId]).catch(() => {});
    }

    const populatedTenantRow = await ensureTenantSubscriptionPopulated(tenantId);
    const s: any = updateRes.rows[0];
    res.json({
      message: 'Settings updated successfully.',
      settings: formatSettingsResponse(s, populatedTenantRow),
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update settings: ' + err.message });
  }
};

router.post('/', requireAuth, requireAdmin, handleUpdateSettings);
router.put('/', requireAuth, requireAdmin, handleUpdateSettings);
router.patch('/', requireAuth, requireAdmin, handleUpdateSettings);
router.post('/change', requireAuth, requireAdmin, handleUpdateSettings);
router.patch('/change', requireAuth, requireAdmin, handleUpdateSettings);
router.put('/change', requireAuth, requireAdmin, handleUpdateSettings);
router.post('/changeSetting', requireAuth, requireAdmin, handleUpdateSettings);
router.put('/changeSetting', requireAuth, requireAdmin, handleUpdateSettings);
router.patch('/changeSetting', requireAuth, requireAdmin, handleUpdateSettings);
router.post('/change-setting', requireAuth, requireAdmin, handleUpdateSettings);
router.put('/change-setting', requireAuth, requireAdmin, handleUpdateSettings);
router.patch('/change-setting', requireAuth, requireAdmin, handleUpdateSettings);

// --- USER MANAGEMENT (Store Admin Only, Strictly scoped to store tenant) ---

router.get('/users', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userRole = String(req.user?.role || '').toUpperCase();
    const tenantId = extractStrictTenantId(req);
    if (userRole === 'SUPERADMIN' && tenantId <= 0) {
      return res.json({ users: [] });
    }
    const result = await pgClient.query(
      "SELECT id, tenant_id, name, email, phone, avatar_url, role, status, created_at, updated_at FROM users WHERE tenant_id = $1 AND role != 'SUPERADMIN' ORDER BY id ASC",
      [tenantId]
    );
    res.json({ users: result.rows });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch users: ' + err.message });
  }
});

const handleUpdateUserStatus = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userRole = String(req.user?.role || '').toUpperCase();
    const tenantId = extractStrictTenantId(req);
    if (userRole === 'SUPERADMIN' && tenantId <= 0) {
      return res.status(400).json({ error: 'Store tenant context required to manage users.' });
    }
    const targetUserId = parseInt(req.params.id, 10);
    const { status } = req.body;

    if (!['APPROVED', 'PENDING'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be APPROVED or PENDING.' });
    }

    if (targetUserId === req.user!.id && status === 'PENDING') {
      return res.status(400).json({ error: 'You cannot revoke your own account approval.' });
    }

    const result = await pgClient.query(
      'UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3 RETURNING id, name, email, role, status',
      [status, targetUserId, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found in your store.' });
    }

    const updatedUser: any = result.rows[0];
    res.json({
      message: `User ${updatedUser.name} has been ${status === 'APPROVED' ? 'APPROVED' : 'marked PENDING'}.`,
      user: updatedUser,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update user status: ' + err.message });
  }
};

router.put('/users/:id/status', requireAuth, requireAdmin, handleUpdateUserStatus);
router.patch('/users/:id/status', requireAuth, requireAdmin, handleUpdateUserStatus);

const handleUpdateUserRole = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userRole = String(req.user?.role || '').toUpperCase();
    const tenantId = extractStrictTenantId(req);
    if (userRole === 'SUPERADMIN' && tenantId <= 0) {
      return res.status(400).json({ error: 'Store tenant context required to manage users.' });
    }
    const targetUserId = parseInt(req.params.id, 10);
    const { role } = req.body;

    if (!['ADMIN', 'CASHIER'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be ADMIN or CASHIER.' });
    }

    if (targetUserId === req.user!.id && role !== 'ADMIN') {
      return res.status(400).json({ error: 'You cannot remove your own Admin permissions.' });
    }

    const result = await pgClient.query(
      'UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3 RETURNING id, name, email, role, status',
      [role, targetUserId, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found in your store.' });
    }

    res.json({
      message: `User role updated to ${role}.`,
      user: result.rows[0],
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update user role: ' + err.message });
  }
};

router.put('/users/:id/role', requireAuth, requireAdmin, handleUpdateUserRole);
router.patch('/users/:id/role', requireAuth, requireAdmin, handleUpdateUserRole);

router.post('/users', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userRole = String(req.user?.role || '').toUpperCase();
    const tenantId = extractStrictTenantId(req);
    if (userRole === 'SUPERADMIN' && tenantId <= 0) {
      return res.status(400).json({ error: 'Store tenant context required. SuperAdmin must specify or navigate to a store tenant to manage cashiers.' });
    }
    const { name, email, password, phone, role, status } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Full name is required.' });
    }
    if (!email || !email.trim()) {
      return res.status(400).json({ error: 'Email address is required.' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    const confirmPassword = req.body.confirmPassword || req.body.confirm_password;
    if (confirmPassword !== undefined && password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match.' });
    }

    const assignedRole = (role || 'CASHIER').toUpperCase();
    if (!['ADMIN', 'CASHIER'].includes(assignedRole)) {
      return res.status(400).json({ error: 'Invalid role. Must be ADMIN or CASHIER.' });
    }

    const initialStatus = (status || 'APPROVED').toUpperCase();
    if (!['APPROVED', 'PENDING'].includes(initialStatus)) {
      return res.status(400).json({ error: 'Invalid status. Must be APPROVED or PENDING.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const existing = await pgClient.query(
      'SELECT id FROM users WHERE LOWER(BTRIM(email)) = LOWER(BTRIM($1)) LIMIT 1',
      [cleanEmail]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({
        code: 'EMAIL_ALREADY_EXISTS',
        error: 'This email is already in use. Please use a different email address.',
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const cleanPhone = typeof phone === 'string' ? phone.trim() : '';

    const result = await pgClient.query(
      `INSERT INTO users (tenant_id, name, email, phone, password_hash, quick_password, role, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
       RETURNING id, tenant_id, name, email, phone, avatar_url, role, status, created_at, updated_at`,
      [tenantId, name.trim(), cleanEmail, cleanPhone, passwordHash, password, assignedRole, initialStatus]
    );

    const createdUser = result.rows[0];

    // Trigger personalized welcome email & platform notification with secure credentials and POS terminal link (F9)
    let welcomeNotification: any = null;
    try {
      const origin = req.body?.origin || (req.get('origin') || `${req.protocol}://${req.get('host')}`);
      welcomeNotification = await sendStaffWelcomeNotification({
        tenantId,
        staffName: name.trim(),
        email: cleanEmail,
        password,
        role: assignedRole,
        origin,
      });
    } catch (notifErr: any) {
      console.warn('Could not dispatch staff welcome notification/email:', notifErr?.message || notifErr);
    }

    res.status(201).json({
      message: `${assignedRole === 'ADMIN' ? 'Administrator' : 'Cashier'} account created successfully. Welcome credentials & POS Terminal link dispatched.`,
      user: createdUser,
      welcomeNotification: welcomeNotification
        ? {
            delivered: Boolean(welcomeNotification.emailDelivered),
            previewUrl: welcomeNotification.emailPreviewUrl || null,
            provider: welcomeNotification.provider || null,
            terminalUrl: welcomeNotification.terminalUrl,
            notificationId: welcomeNotification.notificationId,
          }
        : undefined,
    });
  } catch (err: any) {
    console.error('Create user error:', err);
    if (err?.code === '23505' && String(err?.constraint || '').includes('users_email')) {
      return res.status(409).json({
        code: 'EMAIL_ALREADY_EXISTS',
        error: 'This email is already in use. Please use a different email address.',
      });
    }
    res.status(500).json({ error: 'Failed to create user: ' + err.message });
  }
});

router.delete('/users/:id', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = extractStrictTenantId(req);
    const targetUserId = parseInt(req.params.id, 10);
    if (!targetUserId || isNaN(targetUserId)) {
      return res.status(400).json({ error: 'Invalid user ID.' });
    }

    if (targetUserId === req.user!.id) {
      return res.status(400).json({ error: 'You cannot delete your own active administrator account.' });
    }

    const targetUserRes = await pgClient.query(
      'SELECT id, name, role FROM users WHERE id = $1 AND tenant_id = $2',
      [targetUserId, tenantId]
    );
    if (targetUserRes.rows.length === 0) {
      return res.status(404).json({ error: 'User not found in your store.' });
    }

    const targetUser: any = targetUserRes.rows[0];
    if (targetUser.role === 'ADMIN') {
      const adminCountRes = await pgClient.query(
        "SELECT COUNT(*) as count FROM users WHERE role = 'ADMIN' AND tenant_id = $1",
        [tenantId]
      );
      const adminCount = parseInt(adminCountRes.rows[0]?.count || '0', 10);
      if (adminCount <= 1) {
        return res.status(400).json({ error: 'Cannot delete the only remaining Administrator account in this store.' });
      }
    }

    const currentAdminId = req.user!.id;
    try {
      await pgClient.query('UPDATE sales SET created_by = $1 WHERE created_by = $2 AND tenant_id = $3', [currentAdminId, targetUserId, tenantId]);
      await pgClient.query('UPDATE sales SET overridden_by = NULL WHERE overridden_by = $1 AND tenant_id = $2', [targetUserId, tenantId]);
      await pgClient.query('UPDATE purchases SET created_by = $1 WHERE created_by = $2 AND tenant_id = $3', [currentAdminId, targetUserId, tenantId]);
      await pgClient.query('UPDATE supplier_payments SET created_by = $1 WHERE created_by = $2 AND tenant_id = $3', [currentAdminId, targetUserId, tenantId]);
      await pgClient.query('UPDATE purchase_returns SET created_by = $1 WHERE created_by = $2 AND tenant_id = $3', [currentAdminId, targetUserId, tenantId]);
      await pgClient.query('UPDATE returns SET created_by = $1 WHERE created_by = $2 AND tenant_id = $3', [currentAdminId, targetUserId, tenantId]);
      await pgClient.query('UPDATE stock_movements SET user_id = $1 WHERE user_id = $2 AND tenant_id = $3', [currentAdminId, targetUserId, tenantId]);
      await pgClient.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [targetUserId]);
    } catch (reassignErr) {
      console.warn('Reassignment notice on user deletion:', reassignErr);
    }

    await pgClient.query('DELETE FROM users WHERE id = $1 AND tenant_id = $2', [targetUserId, tenantId]);

    res.json({
      message: `User account "${targetUser.name}" has been deleted successfully.`,
    });
  } catch (err: any) {
    console.error('Delete user error:', err);
    res.status(500).json({ error: 'Failed to delete user: ' + err.message });
  }
});

export default router;
