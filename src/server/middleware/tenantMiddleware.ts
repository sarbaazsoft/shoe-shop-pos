import type { Request, Response, NextFunction } from 'express';
import { pgClient } from '../../db/index.ts';
import { ensureSaasControlPlane, normalizeSubscriptionPlan, calculateSubscriptionEndDate } from '../../db/schemaInit.ts';

export interface TenantRouteResolution {
  mode: 'LANDING' | 'SUPERADMIN' | 'TENANT_ACTIVE' | 'TENANT_SUSPENDED' | 'TENANT_EXPIRED' | 'TENANT_NOT_FOUND';
  host: string;
  rewrittenPath: string;
  tenant: {
    id: number;
    name: string;
    status: 'ACTIVE' | 'SUSPENDED' | 'EXPIRED';
    subscriptionPlan: '6_MONTHS' | 'YEARLY' | string;
    subscriptionStartDate: string;
    subscriptionEndDate: string;
    subscriptionStatus: 'ACTIVE' | 'EXPIRED' | 'SUSPENDED';
    logoUrl: string;
    address: string;
    taxId: string;
    currency: string;
    onboardingCompleted: boolean;
  } | null;
}

const MIDDLEWARE_ONLINE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes active middleware session window
const onlineTenantPresence = new Map<
  number,
  { tenantId: number; lastSeenAt: number; lastRoute: string }
>();

export function recordTenantMiddlewarePresence(tenantId: number, route: string = '/api'): void {
  const cleanId = Number(tenantId);
  if (!Number.isSafeInteger(cleanId) || cleanId <= 0) return;
  onlineTenantPresence.set(cleanId, {
    tenantId: cleanId,
    lastSeenAt: Date.now(),
    lastRoute: route,
  });
}

export function removeTenantMiddlewarePresence(tenantId: number): void {
  const cleanId = Number(tenantId);
  if (!Number.isSafeInteger(cleanId) || cleanId <= 0) return;
  onlineTenantPresence.delete(cleanId);
}

export function isTenantOnlineInMiddleware(
  tenantId: number,
  status?: string,
  subscriptionStatus?: string
): boolean {
  const cleanId = Number(tenantId);
  if (!Number.isSafeInteger(cleanId) || cleanId <= 0) return false;
  if (
    String(status || '').toUpperCase() === 'SUSPENDED' ||
    String(status || '').toUpperCase() === 'EXPIRED' ||
    String(subscriptionStatus || '').toUpperCase() === 'SUSPENDED' ||
    String(subscriptionStatus || '').toUpperCase() === 'EXPIRED'
  ) {
    onlineTenantPresence.delete(cleanId);
    return false;
  }

  // Prune any expired presence entries first
  const now = Date.now();
  for (const [tid, entry] of onlineTenantPresence.entries()) {
    if (now - entry.lastSeenAt > MIDDLEWARE_ONLINE_WINDOW_MS) {
      onlineTenantPresence.delete(tid);
    }
  }

  if (onlineTenantPresence.size > 0) {
    return onlineTenantPresence.has(cleanId);
  }

  // When no explicit store session heartbeat has been recorded since server start,
  // any tenant whose middleware routing mode is TENANT_ACTIVE is online in middleware
  return (
    String(status || 'ACTIVE').toUpperCase() === 'ACTIVE' &&
    String(subscriptionStatus || 'ACTIVE').toUpperCase() === 'ACTIVE'
  );
}

export function getTenantMiddlewareLastSeen(tenantId: number): string | null {
  const cleanId = Number(tenantId);
  const entry = onlineTenantPresence.get(cleanId);
  if (!entry || Date.now() - entry.lastSeenAt > MIDDLEWARE_ONLINE_WINDOW_MS) {
    return null;
  }
  return new Date(entry.lastSeenAt).toISOString();
}

/** Resolve tenant identity from the shared tenantId selector. */
export function parseTenantSelectionFromRequest(req: Request): {
  host: string;
  isSuperAdminRoute: boolean;
} {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost').split(',')[0].trim().toLowerCase().replace(/:\d+$/, '');
  const pathname = req.path || '/';
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    return { host, isSuperAdminRoute: true };
  }
  return { host, isSuperAdminRoute: false };
}
/**
 * Resolves the tenant context for any incoming request
 */
export async function resolveTenantContext(req: Request): Promise<TenantRouteResolution> {
  await ensureSaasControlPlane();
  const parsed = parseTenantSelectionFromRequest(req);

  if (parsed.isSuperAdminRoute) {
    return {
      mode: 'SUPERADMIN',
      host: parsed.host,
      rewrittenPath: '/admin',
      tenant: null,
    };
  }

  let rawTenantId: any =
    req.query?.tenantId ??
    req.query?.tenant_id ??
    req.query?.storeId ??
    req.query?.store_id ??
    req.headers['x-tenant-id'];
  if (!rawTenantId) {
    const tokenHeader =
      (typeof req.headers['x-auth-token'] === 'string' && req.headers['x-auth-token']) ||
      (typeof req.headers.authorization === 'string' && req.headers.authorization.startsWith('Bearer ')
        ? req.headers.authorization.slice(7)
        : '');
    if (tokenHeader) {
      try {
        const parts = tokenHeader.trim().replace(/^Bearer\s+/i, '').split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
          if (payload && String(payload.role || '').toUpperCase() !== 'SUPERADMIN' && Number(payload.tenantId) > 0) {
            rawTenantId = payload.tenantId;
          }
        }
      } catch {}
    }
  }

  const tenantId = Number(rawTenantId);
  if (!Number.isSafeInteger(tenantId) || tenantId <= 0) {
    return {
      mode: 'LANDING',
      host: parsed.host,
      rewrittenPath: '/',
      tenant: null,
    };
  }

  const tenantRes = await pgClient.query<{
    id: number;
    name: string;
    status: 'ACTIVE' | 'SUSPENDED' | 'EXPIRED';
    subscription_type?: string;
    subscription_plan: string;
    subscription_start_date: string;
    subscription_end_date: string;
    subscription_status: 'ACTIVE' | 'EXPIRED' | 'SUSPENDED';
    logo_url: string;
    address: string;
    tax_id: string;
    currency: string;
    onboarding_completed: boolean;
  }>(
    `SELECT t.id, t.name, t.status, t.subscription_type, t.subscription_plan,
            t.subscription_start_date, t.subscription_end_date, t.subscription_status,
            t.onboarding_completed,
            COALESCE(NULLIF(cs.logo, ''), '/pwa-512x512.png') AS logo_url,
            COALESCE(cs.address, '') AS address,
            COALESCE(cs.tax_id, '') AS tax_id,
            COALESCE(cs.currency, 'PKR') AS currency
     FROM tenants t
     LEFT JOIN company_settings cs ON cs.tenant_id = t.id
     WHERE t.id = $1
     LIMIT 1`,
    [tenantId]
  );

  if (tenantRes.rows.length === 0) {
    return {
      mode: 'TENANT_NOT_FOUND',
      host: parsed.host,
      rewrittenPath: '/',
      tenant: null,
    };
  }

  const row = tenantRes.rows[0];
  const effectivePlan = normalizeSubscriptionPlan(row.subscription_plan || row.subscription_type || 'free_tier');
  const effectiveStartDt = row.subscription_start_date ? new Date(row.subscription_start_date) : new Date();
  const effectiveEndDt = row.subscription_end_date
    ? new Date(row.subscription_end_date)
    : calculateSubscriptionEndDate(effectivePlan, effectiveStartDt);

  let effectiveSubscriptionStatus: 'ACTIVE' | 'EXPIRED' | 'SUSPENDED' =
    (String(row.subscription_status || 'ACTIVE').toUpperCase() as 'ACTIVE' | 'EXPIRED' | 'SUSPENDED');

  // Automatic Expiry Tracking: Check if subscriptionEndDate < currentTimestamp
  if (effectiveEndDt.getTime() < Date.now()) {
    effectiveSubscriptionStatus = 'EXPIRED';
  } else if (row.status === 'SUSPENDED') {
    effectiveSubscriptionStatus = 'SUSPENDED';
  }

  if (!row.subscription_start_date || !row.subscription_end_date || String(row.subscription_status).toUpperCase() !== effectiveSubscriptionStatus) {
    await pgClient
      .query(
        `UPDATE tenants
         SET subscription_plan = $1,
             subscription_start_date = $2,
             subscription_end_date = $3,
             subscription_status = $4,
             updated_at = NOW()
         WHERE id = $5`,
        [
          effectivePlan,
          effectiveStartDt.toISOString(),
          effectiveEndDt.toISOString(),
          effectiveSubscriptionStatus,
          row.id,
        ]
      )
      .catch(() => {});
  }

  const tenant = {
    id: row.id,
    name: row.name,
    status: row.status,
    subscriptionPlan: effectivePlan,
    subscriptionStartDate: effectiveStartDt.toISOString(),
    subscriptionEndDate: effectiveEndDt.toISOString(),
    subscriptionStatus: effectiveSubscriptionStatus,
    logoUrl: row.logo_url || '/pwa-512x512.png',
    address: row.address || '',
    taxId: row.tax_id || '',
    currency: row.currency || 'PKR',
    onboardingCompleted: Boolean(row.onboarding_completed),
  };

  if (row.status === 'SUSPENDED' || effectiveSubscriptionStatus === 'SUSPENDED') {
    return {
      mode: 'TENANT_SUSPENDED',
      host: parsed.host,
      rewrittenPath: `/?tenantId=${row.id}`,
      tenant,
    };
  }

  if (effectiveSubscriptionStatus === 'EXPIRED' || row.status === 'EXPIRED') {
    return {
      mode: 'TENANT_EXPIRED',
      host: parsed.host,
      rewrittenPath: `/?tenantId=${row.id}`,
      tenant,
    };
  }

  return {
    mode: 'TENANT_ACTIVE',
    host: parsed.host,
    rewrittenPath: `/?tenantId=${row.id}`,
    tenant,
  };
}

/**
 * Shared-domain multi-tenant routing middleware
 * Attaches resolved tenant metadata to `req` and enforces real-time suspension and subscription expiry checks on API calls.
 */
export async function tenantRoutingMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // The installer must remain reachable before the application schema exists.
  // Browser document/static requests do not need database tenant resolution.
  if (req.path.startsWith('/api/install/') || !req.path.startsWith('/api/')) {
    return next();
  }

  try {
    // Skip static assets
    if (
      req.path.startsWith('/assets/') ||
      req.path.startsWith('/node_modules/') ||
      req.path.startsWith('/src/') ||
      req.path.startsWith('/@') ||
      req.path.endsWith('.png') ||
      req.path.endsWith('.svg') ||
      req.path.endsWith('.ico') ||
      req.path.endsWith('.jpg')
    ) {
      return next();
    }

    const resolution = await resolveTenantContext(req);
    (req as any).tenantResolution = resolution;

    // Set informational headers for debugging and PWA scope inspection
    res.setHeader('X-SaaS-Mode', resolution.mode);
    if (resolution.tenant) {
      res.setHeader('X-Tenant-Id', String(resolution.tenant.id));
      res.setHeader('X-Tenant-Status', resolution.tenant.status);
      res.setHeader('X-Subscription-Status', resolution.tenant.subscriptionStatus);

      if (
        resolution.mode === 'TENANT_ACTIVE' &&
        !req.path.startsWith('/api/superadmin')
      ) {
        recordTenantMiddlewarePresence(resolution.tenant.id, req.path);
      } else if (
        resolution.mode === 'TENANT_SUSPENDED' ||
        resolution.mode === 'TENANT_EXPIRED'
      ) {
        removeTenantMiddlewarePresence(resolution.tenant.id);
      }
    }

    // Real-time middleware enforcement: block API calls to expired or suspended tenants (except superadmin, auth & saas resolution)
    if (
      req.path.startsWith('/api/') &&
      !req.path.startsWith('/api/superadmin') &&
      !req.path.startsWith('/api/saas') &&
      !req.path.startsWith('/api/tenants/') &&
      !req.path.startsWith('/api/auth')
    ) {
      if (resolution.mode === 'TENANT_EXPIRED' || resolution.tenant?.subscriptionStatus === 'EXPIRED') {
        return res.status(403).json({
          error: 'Your subscription key has expired. Please contact support to renew.',
          code: 'SUBSCRIPTION_EXPIRED',
          tenant: resolution.tenant,
        });
      }
      if (resolution.mode === 'TENANT_SUSPENDED') {
        return res.status(423).json({
          error: `Store "${resolution.tenant?.name || 'this tenant'}" is currently suspended. Please contact platform billing or support.`,
          code: 'TENANT_SUSPENDED',
          tenant: resolution.tenant,
        });
      }
    }

    next();
  } catch (err) {
    next();
  }
}
