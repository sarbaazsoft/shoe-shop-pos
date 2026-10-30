import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { pgClient } from '../db/index.ts';
import { ensureSaasControlPlane, resetSaasControlPlaneState } from '../db/schemaInit.ts';
import { recordTenantMiddlewarePresence, removeTenantMiddlewarePresence } from './middleware/tenantMiddleware.ts';

const JWT_SECRET = process.env.JWT_SECRET || 'shoe-pos-super-secure-jwt-secret-key-2026';

export interface AuthUser {
  id: number;
  tenantId: number;
  name: string;
  email: string;
  phone?: string;
  avatarUrl?: string;
  role: 'SUPERADMIN' | 'ADMIN' | 'CASHIER';
  status: 'PENDING' | 'APPROVED';
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
  tenantContext?: {
    id: number;
    name: string;
    status: string;
    logoUrl: string;
    isOnboarded: boolean;
  };
}

/**
 * Generates a signed JWT containing `tenantId` and `role` in the payload.
 */
export function generateToken(user: {
  id: number;
  tenantId?: number;
  name: string;
  email: string;
  role: 'SUPERADMIN' | 'ADMIN' | 'CASHIER' | string;
  status: 'PENDING' | 'APPROVED' | string;
}): string {
  const role = (user.role || 'CASHIER').toUpperCase();
  const isSuperAdmin = role === 'SUPERADMIN';
  const tenantId = isSuperAdmin ? 0 : (Number(user.tenantId) > 0 ? Number(user.tenantId) : 1);

  return jwt.sign(
    {
      id: user.id,
      tenantId,
      name: user.name,
      email: user.email,
      role,
      status: user.status,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

/**
 * Strict Server-Side JWT Authentication & Tenant Isolation Middleware:
 * - Never trusts `tenant_id` in request bodies or query parameters.
 * - Extracts `tenantId` and `role` strictly from the decrypted JWT payload.
 * - Uses the tenant ID to enforce store isolation.
 * - Immediately blocks access if the tenant has been suspended by SuperAdmin.
 */
export function extractTokenFromRequest(req: Request): string | null {
  const customHeader = req.headers['x-auth-token'];
  if (typeof customHeader === 'string' && customHeader.trim()) {
    const clean = customHeader.trim().replace(/^Bearer\s+/i, '');
    if (clean && clean !== 'null' && clean !== 'undefined') {
      return clean;
    }
  }
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const clean = authHeader.split(' ')[1]?.trim();
    if (clean && clean !== 'null' && clean !== 'undefined') {
      return clean;
    }
  }
  return null;
}

/**
 * Server-side session termination.
 *
 * JWTs are stateless, so "logging out" must also make the server refuse the token for the rest of
 * its lifetime. Revoked tokens are remembered by SHA-256 hash (never the raw token) until they
 * expire naturally. This list lives in process memory: it is cleared on restart and is not shared
 * between multiple server instances.
 */
const revokedTokenHashes = new Map<string, number>(); // hash -> expiry (epoch ms)
const MAX_REVOKED_TOKENS = 50_000;

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function pruneRevokedTokens(now = Date.now()) {
  for (const [hash, expiresAt] of revokedTokenHashes) {
    if (expiresAt <= now) revokedTokenHashes.delete(hash);
  }
  // Hard cap as a safety net; Map iterates in insertion order so the oldest entries go first.
  while (revokedTokenHashes.size > MAX_REVOKED_TOKENS) {
    const oldest = revokedTokenHashes.keys().next().value;
    if (oldest === undefined) break;
    revokedTokenHashes.delete(oldest);
  }
}

export function revokeToken(token: string, expiresAtMs?: number): void {
  const fallbackExpiry = Date.now() + 7 * 24 * 60 * 60 * 1000;
  revokedTokenHashes.set(hashToken(token), expiresAtMs && expiresAtMs > Date.now() ? expiresAtMs : fallbackExpiry);
  pruneRevokedTokens();
}

export function isTokenRevoked(token: string): boolean {
  const expiresAt = revokedTokenHashes.get(hashToken(token));
  if (expiresAt === undefined) return false;
  if (expiresAt <= Date.now()) {
    revokedTokenHashes.delete(hashToken(token));
    return false;
  }
  return true;
}

/** Test helper. */
export function resetRevokedTokensForTests(): void {
  revokedTokenHashes.clear();
}

/** Cookie names that may carry an auth session. The app is bearer-token based, so this is defensive. */
export const AUTH_COOKIE_NAMES = ['pos_auth_token', 'pos_session', 'connect.sid'] as const;

/**
 * Expires auth cookies using the same attributes they would have been set with.
 * Deliberately does NOT touch anything else, and never uses Clear-Site-Data (which would also wipe
 * the remembered email held in browser storage).
 */
export function clearAuthCookies(res: Response): void {
  const secure = process.env.NODE_ENV === 'production';
  for (const name of AUTH_COOKIE_NAMES) {
    res.clearCookie(name, { path: '/', httpOnly: true, secure, sameSite: 'strict' });
  }
  res.setHeader('Cache-Control', 'no-store');
}

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  // Strip any untrusted client-supplied tenant_id / tenantId from body and query
  if (req.body && typeof req.body === 'object') {
    delete req.body.tenant_id;
    delete req.body.tenantId;
  }
  if (req.query && typeof req.query === 'object') {
    delete (req.query as any).tenant_id;
    delete (req.query as any).tenantId;
  }

  const token = extractTokenFromRequest(req);
  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please login.' });
  }

  if (isTokenRevoked(token)) {
    return res.status(401).json({ error: 'Session has been logged out. Please login again.' });
  }

  let decoded: any;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session. Please login again.' });
  }

  try {
    // Check if the users relation exists before running auth queries (handles clean-wipe / installation state gracefully)
    const tableCheck = await pgClient
      .query<{ exists: boolean }>(`SELECT to_regclass('public.users') IS NOT NULL AS exists`)
      .catch(() => ({ rows: [{ exists: false }] }));

    if (!tableCheck.rows[0]?.exists) {
      resetSaasControlPlaneState();
      return res.status(401).json({
        code: 'INSTALLATION_REQUIRED',
        error: 'Database schema is not initialized yet. Please complete the installation wizard.',
      });
    }

    await ensureSaasControlPlane();

    const isJwtSuperAdmin = String(decoded.role || '').toUpperCase() === 'SUPERADMIN';
    const expectedJwtTenantId = isJwtSuperAdmin ? 0 : (Number(decoded.tenantId) > 0 ? Number(decoded.tenantId) : 1);
    const userRes = await pgClient.query<any>(
      `SELECT id, tenant_id, name, email, phone, avatar_url, role, status
       FROM users
       WHERE id = $1 AND (UPPER(role::text) = 'SUPERADMIN' OR tenant_id = $2)
       LIMIT 1`,
      [decoded.id, expectedJwtTenantId]
    );

    if (userRes.rows.length === 0) {
      return res.status(401).json({ error: 'User account no longer exists in this store. Please login again.' });
    }

    const row = userRes.rows[0];
    if (row.status !== 'APPROVED') {
      return res.status(423).json({ error: 'Your account is pending Admin approval.' });
    }

    // Strict tenantId resolution from verified user row, active store resolution, and decrypted JWT
    const jwtTid = Number(decoded.tenantId);
    const rowTid = Number(row.tenant_id);
    const activeRouteTid = Number((req as any).tenantResolution?.tenant?.id);
    const resolvedRole = String(row.role || decoded.role || 'CASHIER').toUpperCase() as 'SUPERADMIN' | 'ADMIN' | 'CASHIER';

    // For Store Owner (ADMIN) and Cashier (CASHIER), enforce that DB row tenant_id matches JWT tenantId
    if (resolvedRole !== 'SUPERADMIN' && Number.isInteger(rowTid) && Number.isInteger(jwtTid) && rowTid !== jwtTid) {
      return res.status(401).json({
        error: 'Session tenant mismatch detected. Please sign in to this store again.',
        code: 'TENANT_TOKEN_MISMATCH',
      });
    }

    let resolvedTenantId =
      resolvedRole === 'SUPERADMIN'
        ? (Number.isInteger(activeRouteTid) && activeRouteTid > 0 ? activeRouteTid : 0)
        : (Number.isInteger(rowTid) && rowTid > 0
            ? rowTid
            : Number.isInteger(jwtTid) && jwtTid > 0
            ? jwtTid
            : 1);

    // Real-time tenant suspension and subscription expiry enforcement (except for global SUPERADMIN)
    if (resolvedRole !== 'SUPERADMIN') {
      try {
        const tenantCheck = await pgClient.query<{
          id: number;
          status: string;
          name: string;
          subscription_end_date: Date | string | null;
          subscription_status: string | null;
        }>(
          'SELECT id, status, name, subscription_end_date, subscription_status FROM tenants WHERE id = $1 LIMIT 1',
          [resolvedTenantId]
        );
        if (tenantCheck.rows.length > 0) {
          const tRow = tenantCheck.rows[0];

          if (
            Number.isInteger(activeRouteTid) &&
            activeRouteTid > 0 &&
            tRow.id !== activeRouteTid
          ) {
            return res.status(401).json({
              error: `Cross-store session rejected: Your credentials belong to store "${tRow.name}". Please sign in to the active store.`,
              code: 'CROSS_STORE_TOKEN_REJECTED',
            });
          }

          const isExpiredByDate =
            tRow.subscription_end_date && new Date(tRow.subscription_end_date).getTime() < Date.now();
          const isMarkedExpired =
            String(tRow.subscription_status || '').toUpperCase() === 'EXPIRED' ||
            String(tRow.status || '').toUpperCase() === 'EXPIRED';

          if (isExpiredByDate || isMarkedExpired) {
            if (String(tRow.subscription_status || '').toUpperCase() !== 'EXPIRED') {
              await pgClient
                .query(
                  `UPDATE tenants SET subscription_status = 'EXPIRED', updated_at = NOW() WHERE id = $1`,
                  [tRow.id]
                )
                .catch(() => {});
            }
            const fullPath = String(req.originalUrl || req.baseUrl || req.path || '').toLowerCase();
            const isAllowedExpiredAdminRoute =
              resolvedRole === 'ADMIN' &&
              (fullPath.includes('/api/settings') ||
                fullPath.includes('/api/auth') ||
                fullPath.includes('/api/saas') ||
                fullPath.includes('/api/install/status'));
            if (!isAllowedExpiredAdminRoute) {
              removeTenantMiddlewarePresence(tRow.id);
              return res.status(403).json({
                error: 'Your subscription key has expired. Please contact support to renew.',
                code: 'SUBSCRIPTION_EXPIRED',
                tenantId: tRow.id,
              });
            }
          }

          if (
            String(tRow.status).toUpperCase() === 'SUSPENDED' ||
            String(tRow.subscription_status || '').toUpperCase() === 'SUSPENDED'
          ) {
            removeTenantMiddlewarePresence(tRow.id);
            return res.status(423).json({
              error: `Store Suspended: Access to "${tRow.name}" has been suspended by platform administration.`,
              code: 'TENANT_SUSPENDED',
              tenantId: tRow.id,
            });
          }

          recordTenantMiddlewarePresence(tRow.id, req.originalUrl || req.path || '/api');
        }
      } catch (_) {}
    } else if (
      Number.isInteger(activeRouteTid) &&
      activeRouteTid > 0 &&
      !String(req.originalUrl || req.path || '').startsWith('/api/superadmin')
    ) {
      recordTenantMiddlewarePresence(activeRouteTid, req.originalUrl || req.path || '/api');
    }

    req.user = {
      id: row.id,
      tenantId: resolvedTenantId,
      name: row.name,
      email: row.email,
      phone: row.phone || '',
      avatarUrl: row.avatar_url || '',
      role: resolvedRole,
      status: row.status,
    };

    next();
  } catch (dbErr: any) {
    const errMsg = String(dbErr?.message || dbErr || '');
    if (dbErr?.code === '42P01' || errMsg.includes('relation "users" does not exist') || errMsg.includes('does not exist')) {
      resetSaasControlPlaneState();
      return res.status(401).json({
        code: 'INSTALLATION_REQUIRED',
        error: 'Database was reset or is not yet initialized. Please complete setup or login again.',
      });
    }
    console.error('requireAuth database error:', errMsg);
    return res.status(503).json({ error: 'Database service temporarily unavailable. Please retry.' });
  }
}

export function forbidCashier(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required. Please login.' });
  }
  const role = (req.user.role || '').toLowerCase();
  if (role === 'cashier') {
    return res.status(423).json({ error: 'Access forbidden: Cashier role is not authorized for this operation.' });
  }
  next();
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required. Please login.' });
  }
  const role = (req.user.role || '').toLowerCase();
  if (role === 'cashier') {
    return res.status(423).json({ error: 'Access forbidden: Cashier role is not authorized for this operation.' });
  }
  if (role !== 'admin' && role !== 'superadmin' && role !== 'manager') {
    return res.status(423).json({ error: 'Admin permission required for this operation.' });
  }
  next();
}

export function requireSuperAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required. Please login.' });
  }
  const role = (req.user.role || '').toUpperCase();
  if (role !== 'SUPERADMIN') {
    return res.status(403).json({
      error: 'Forbidden: Platform Owner (SuperAdmin) permission required.',
      code: 'FORBIDDEN_PLATFORM_OWNER_REQUIRED',
    });
  }
  next();
}

export const requirePlatformOwner = requireSuperAdmin;

