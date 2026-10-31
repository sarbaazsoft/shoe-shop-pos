import { Router } from 'express';
import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { pgClient } from '../../db/index.ts';
import { ensureSaasControlPlane, ensureTenantStoreUsers } from '../../db/schemaInit.ts';
import { generateToken, requireAuth, requireAdmin, extractTokenFromRequest, revokeToken, clearAuthCookies } from '../auth.ts';
import type { AuthenticatedRequest, AuthUser } from '../auth.ts';
import { extractStrictTenantId } from '../../db/tenantDb.ts';
import { recordTenantMiddlewarePresence, removeTenantMiddlewarePresence } from '../middleware/tenantMiddleware.ts';
import { sendPasswordResetEmail } from '../utils/email.ts';

const router = Router();

// Resolve selected store by tenantId.
async function resolveTargetTenant(req: Request): Promise<{
  id: number;
  name: string;
  status: string;
  subscription_type?: string;
  subscription_plan?: string;
  subscription_start_date?: string;
  subscription_end_date?: string;
  subscription_status?: string;
  owner_name?: string;
  owner_email?: string;
  owner_phone?: string;
} | null> {
  await ensureSaasControlPlane();
  const rawTid =
    req.query?.tenantId ??
    req.query?.tenant_id ??
    req.query?.storeId ??
    req.query?.store_id ??
    req.body?.tenantId ??
    req.body?.tenant_id ??
    req.body?.storeId ??
    req.body?.store_id ??
    req.headers['x-tenant-id'] ??
    (req as any).tenantResolution?.tenant?.id;
  const explicitTenantId = Number(rawTid);
  const hasExplicitTenantId = Number.isInteger(explicitTenantId) && explicitTenantId > 0;

  if (hasExplicitTenantId) {
    const byIdRes = await pgClient.query<any>(
      `SELECT t.id, t.name, t.status, t.subscription_type, t.subscription_plan,
              t.subscription_start_date, t.subscription_end_date, t.subscription_status,
              u.name AS owner_name, u.email AS owner_email, u.phone AS owner_phone
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
      [explicitTenantId]
    );
    return byIdRes.rows[0] || null;
  }

  const defRes = await pgClient.query<any>(
    `SELECT t.id, t.name, t.status, t.subscription_type, t.subscription_plan,
            t.subscription_start_date, t.subscription_end_date, t.subscription_status,
            u.name AS owner_name, u.email AS owner_email, u.phone AS owner_phone
     FROM tenants t
     LEFT JOIN LATERAL (
       SELECT name, email, phone
       FROM users
       WHERE tenant_id = t.id AND role = 'ADMIN'
       ORDER BY id ASC
       LIMIT 1
     ) u ON true
     ORDER BY t.id ASC
     LIMIT 1`
  );
  return defRes.rows[0] || null;
}

// Public Quick Store Login Credentials for active store (returns exact Owner & Cashier credentials for the target store)
const handleGetStoreCredentials = async (req: Request, res: Response) => {
  try {
    const tenant = await resolveTargetTenant(req);
    if (!tenant) {
      return res.status(404).json({ error: 'Store tenant not found.' });
    }

    const creds = await ensureTenantStoreUsers({
      tenantId: tenant.id,
      storeName: tenant.name,
      ownerEmail: tenant.owner_email,
      ownerPhone: tenant.owner_phone,
      createCashier: false,
    });

    return res.json({
      tenant: {
        id: tenant.id,
        name: tenant.name,
        status: tenant.status,
        subscriptionPlan: tenant.subscription_plan || tenant.subscription_type || 'free_tier',
        subscriptionType: tenant.subscription_type || tenant.subscription_plan || 'free_tier',
        subscriptionStartDate: tenant.subscription_start_date || '',
        subscriptionEndDate: tenant.subscription_end_date || '',
        subscriptionStatus: tenant.subscription_status || 'ACTIVE',
      },
      owner: creds.owner,
      cashier: creds.cashier,
    });
  } catch (err: any) {
    return res.status(403).json({ error: 'Failed to load store credentials: ' + err.message });
  }
};
router.get('/store-credentials', handleGetStoreCredentials);

/** Shared login handler; tenantId selects a store when credentials are store-specific. */
async function handleStoreOrPlatformLogin(req: Request, res: Response) {
  try {
    await ensureSaasControlPlane();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    const body = req.body || {};
    const query = req.query || {};
    const email = String(body.email || query.email || '').trim();
    const password = String(body.password || query.password || '');
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const rawTid =
      req.query?.tenantId ??
      req.query?.tenant_id ??
      req.body?.tenantId ??
      req.body?.tenant_id ??
      req.headers['x-tenant-id'] ??
      (req as any).tenantResolution?.tenant?.id;
    const explicitTenantId = Number(rawTid);
    const hasExplicitTenantId = Number.isInteger(explicitTenantId) && explicitTenantId > 0;

    let matchedUser: any = null;
    let resolvedTenantRow: any = null;

    // Authenticate against the explicitly selected tenant when tenantId is supplied.
    if (hasExplicitTenantId) {
      const tenantRes = await pgClient.query<any>(
              'SELECT id, name, status, onboarding_completed, subscription_plan, subscription_start_date, subscription_end_date, subscription_status FROM tenants WHERE id = $1 LIMIT 1',
              [explicitTenantId]
            );
      if (tenantRes.rows.length === 0) {
        return res.status(404).json({
          error: `The target store does not exist or has been removed.`,
          code: 'TENANT_NOT_FOUND',
        });
      }

      const tenant = tenantRes.rows[0];
      resolvedTenantRow = tenant;

      const verifiedTenantId = Number(tenant.id);

      const isExpiredByDate =
        tenant.subscription_end_date && new Date(tenant.subscription_end_date).getTime() < Date.now();
      const isMarkedExpired =
        String(tenant.subscription_status || '').toUpperCase() === 'EXPIRED' ||
        String(tenant.status || '').toUpperCase() === 'EXPIRED';

      if (isExpiredByDate || isMarkedExpired) {
        if (String(tenant.subscription_status || '').toUpperCase() !== 'EXPIRED') {
          await pgClient
            .query(
              `UPDATE tenants SET subscription_status = 'EXPIRED', updated_at = NOW() WHERE id = $1`,
              [verifiedTenantId]
            )
            .catch(() => {});
        }
      }

      if (
        String(tenant.status).toUpperCase() === 'SUSPENDED' ||
        String(tenant.subscription_status || '').toUpperCase() === 'SUSPENDED'
      ) {
        return res.status(423).json({
          error: `Store Suspended: "${tenant.name}" is currently suspended by platform administration.`,
          code: 'TENANT_SUSPENDED',
        });
      }

      // Strictly query users belonging ONLY to this specific store (WHERE tenant_id = $2 AND LOWER(email) = LOWER($1))
      // Even if Store 1 and Store 2 share identical email & password, only Store 2's rows (with tenant_id = verifiedTenantId) are inspected.
      const storeUsersRes = await pgClient.query(
        `SELECT id, tenant_id, name, email, phone, avatar_url, password_hash, role, status
         FROM users
         WHERE COALESCE(tenant_id, 1) = $2 AND LOWER(email) = LOWER($1)
         ORDER BY CASE WHEN role = 'ADMIN' THEN 0 ELSE 1 END, id ASC`,
        [email.trim(), verifiedTenantId]
      );

      for (const candidate of storeUsersRes.rows) {
        if (Number(candidate.tenant_id) !== verifiedTenantId) continue;
        const isMatch = await bcrypt.compare(password, candidate.password_hash);
        if (isMatch) {
          matchedUser = candidate;
          break;
        }
      }

      // Only if no store user matched in this tenant, check if global SUPERADMIN is logging in
      if (!matchedUser) {
        const saRes = await pgClient.query(
          `SELECT id, tenant_id, name, email, phone, avatar_url, password_hash, role, status
           FROM users
           WHERE role = 'SUPERADMIN' AND LOWER(email) = LOWER($1)
           ORDER BY id ASC
           LIMIT 1`,
          [email.trim()]
        );
        if (saRes.rows.length > 0) {
          const saCandidate = saRes.rows[0];
          if (await bcrypt.compare(password, saCandidate.password_hash)) {
            matchedUser = saCandidate;
          }
        }
      }

      if (!matchedUser) {
        return res.status(401).json({
          error: `Invalid email or password for store "${tenant.name}".`,
        });
      }
    } else {
      // Shared platform login resolves the account by its credentials.
      const candidatesRes = await pgClient.query(
        `SELECT id, tenant_id, name, email, phone, avatar_url, password_hash, role, status
         FROM users
         WHERE LOWER(email) = LOWER($1)
         ORDER BY CASE WHEN role = 'SUPERADMIN' THEN 0 ELSE 1 END, id ASC`,
        [email.trim()]
      );

      const credentialMatches: any[] = [];
      for (const candidate of candidatesRes.rows) {
        if (await bcrypt.compare(password, candidate.password_hash)) credentialMatches.push(candidate);
      }

      // Email addresses are allowed to repeat across tenants. If the same
      // credentials match multiple stores, require an explicit store choice.
      const matchedSuperAdmin = credentialMatches.find(
        (candidate) => String(candidate.role).toUpperCase() === 'SUPERADMIN'
      );
      const matchingTenantIds = Array.from(
        new Set(
          credentialMatches
            .filter((candidate) => String(candidate.role).toUpperCase() !== 'SUPERADMIN')
            .map((candidate) => Number(candidate.tenant_id))
            .filter((tenantId) => Number.isInteger(tenantId) && tenantId > 0)
        )
      );

      if (matchedSuperAdmin) {
        matchedUser = matchedSuperAdmin;
      } else if (matchingTenantIds.length > 1) {
        const storesRes = await pgClient.query<any>(
          `SELECT id, name
           FROM tenants
           WHERE id = ANY($1::int[])
           ORDER BY name ASC, id ASC`,
          [matchingTenantIds]
        );
        return res.status(409).json({
          code: 'MULTIPLE_STORE_ACCOUNTS',
          error: 'These credentials match accounts in more than one store. Select a store to continue.',
          stores: storesRes.rows.map((store) => ({
            tenantId: Number(store.id),
            name: store.name,
          })),
        });
      } else {
        matchedUser = credentialMatches[0] || null;
      }

      if (!matchedUser) {
        return res.status(401).json({ error: 'Invalid email or password.' });
      }
    }

    const user: any = matchedUser;

    if (user.status === 'PENDING') {
      return res.status(423).json({
        error: 'Your account is currently PENDING approval by the Shop Owner/Admin.',
        status: 'PENDING',
      });
    }

    const parsedTid = Number(user.tenant_id);
    const isSuperAdminRole = String(user.role).toUpperCase() === 'SUPERADMIN';
    const isStoreAdminRole = String(user.role).toUpperCase() === 'ADMIN';
    const tenantId =
      isSuperAdminRole
        ? 0
        : resolvedTenantRow?.id
        ? Number(resolvedTenantRow.id)
        : Number.isInteger(parsedTid) && parsedTid > 0
        ? parsedTid
        : 1;

    // Extra safeguard: for non-SuperAdmin store login, user.tenant_id MUST equal resolvedTenantRow.id
    if (!isSuperAdminRole && resolvedTenantRow && Number(user.tenant_id) !== Number(resolvedTenantRow.id)) {
      return res.status(403).json({
        error: 'Store authentication mismatch: Credentials do not belong to the selected store.',
        code: 'CROSS_STORE_LOGIN_DENIED',
      });
    }

    let tenantName = isSuperAdminRole ? 'POS SaaS C-Panel' : resolvedTenantRow?.name || 'Retail Store';
    let onboardingCompleted = resolvedTenantRow ? Boolean(resolvedTenantRow.onboarding_completed) : true;
    let subscriptionStatus = resolvedTenantRow
      ? String(resolvedTenantRow.subscription_status || 'ACTIVE').toUpperCase()
      : 'ACTIVE';

    if (!isSuperAdminRole) {
      const t =
        resolvedTenantRow ||
        (
          await pgClient.query<any>(
            'SELECT id, name, status, onboarding_completed, subscription_end_date, subscription_status FROM tenants WHERE id = $1 LIMIT 1',
            [tenantId]
          )
        ).rows[0];

      if (t) {
        tenantName = t.name;
        onboardingCompleted = Boolean(t.onboarding_completed);
        subscriptionStatus = String(t.subscription_status || 'ACTIVE').toUpperCase();

        const isExpiredByDate =
          t.subscription_end_date && new Date(t.subscription_end_date).getTime() < Date.now();
        const isMarkedExpired =
          subscriptionStatus === 'EXPIRED' || String(t.status || '').toUpperCase() === 'EXPIRED';

        if (isExpiredByDate || isMarkedExpired) {
          subscriptionStatus = 'EXPIRED';
          if (String(t.subscription_status || '').toUpperCase() !== 'EXPIRED') {
            await pgClient
              .query(
                `UPDATE tenants SET subscription_status = 'EXPIRED', updated_at = NOW() WHERE id = $1`,
                [t.id]
              )
              .catch(() => {});
          }
          // Cashiers are blocked when expired; Store Owners (ADMIN) can log in to SettingsView to renew subscription
          if (!isStoreAdminRole) {
            return res.status(403).json({
              error: 'Your subscription key has expired. Please contact support to renew.',
              code: 'SUBSCRIPTION_EXPIRED',
            });
          }
        }

        if (
          String(t.status).toUpperCase() === 'SUSPENDED' ||
          String(t.subscription_status || '').toUpperCase() === 'SUSPENDED'
        ) {
          removeTenantMiddlewarePresence(t.id);
          return res.status(423).json({
            error: `Store Suspended: "${t.name}" is currently suspended by platform administration.`,
            code: 'TENANT_SUSPENDED',
          });
        }

        if (subscriptionStatus === 'ACTIVE') {
          recordTenantMiddlewarePresence(t.id, '/api/auth/login');
        }
      }
    }

    const authUser = {
      id: user.id,
      tenantId,
      tenantName,
      name: user.name,
      email: user.email,
      phone: user.phone || '',
      avatarUrl: user.avatar_url || '',
      role: user.role,
      originalRole: user.role,
      status: user.status,
      onboardingCompleted,
      subscriptionStatus,
    };

    const token = generateToken(authUser);
    return res.json({ token, user: authUser });
  } catch (err: any) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Login failed: ' + err.message });
  }
}

// All accounts use the same login route (supporting both POST and GET).
router.all('/login', handleStoreOrPlatformLogin);

// Logout: terminates the session server-side and clears auth cookies.
// Intentionally idempotent and public: it must succeed even if the token already expired, so the
// client can always finish logging out. It never touches the remembered email (client-side only).
router.all('/logout', (req: Request, res: Response) => {
  const token = extractTokenFromRequest(req);
  if (token) {
    const decoded = jwt.decode(token) as { exp?: number } | null;
    revokeToken(token, decoded?.exp ? decoded.exp * 1000 : undefined);
  }
  clearAuthCookies(res);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(200).json({ success: true, message: 'Logged out successfully.' });
});

// Registration uses the shared route and an optional tenantId selector.
const handleStoreRegister = async (req: Request, res: Response) => {
  try {
    const { name, email, password, phone } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    const confirmPassword = req.body.confirmPassword || req.body.confirm_password;
    if (confirmPassword !== undefined && password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match.' });
    }

    const targetTenant = await resolveTargetTenant(req);
    const tenantId = targetTenant?.id || 1;

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
    const userPhone = typeof phone === 'string' ? phone.trim() : '';

    const result = await pgClient.query(
      `INSERT INTO users (tenant_id, name, email, phone, password_hash, quick_password, role, status) 
       VALUES ($1, $2, $3, $4, $5, $6, 'CASHIER', 'PENDING') 
       RETURNING id, tenant_id, name, email, phone, role, status`,
      [tenantId, name.trim(), cleanEmail, userPhone, passwordHash, password]
    );

    res.status(201).json({
      message: 'Registration submitted successfully. Your account is pending Admin approval before you can log in.',
      user: result.rows[0],
    });
  } catch (err: any) {
    console.error('Registration error:', err);
    if (err?.code === '23505' && String(err?.constraint || '').includes('users_email')) {
      return res.status(409).json({
        code: 'EMAIL_ALREADY_EXISTS',
        error: 'This email is already in use. Please use a different email address.',
      });
    }
    res.status(500).json({ error: 'Registration failed: ' + err.message });
  }
};
router.all('/register', handleStoreRegister);
router.all('/signup', handleStoreRegister);

// Get current user profile
router.get('/me', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const isSuperAdmin = String(req.user!.role).toUpperCase() === 'SUPERADMIN';
    const userTenantId = isSuperAdmin ? 0 : (Number(req.user!.tenantId) > 0 ? Number(req.user!.tenantId) : 1);
    const userRes = await pgClient.query(
      `SELECT id, tenant_id, name, email, phone, avatar_url, role, status
       FROM users
       WHERE id = $1 AND (UPPER(role::text) = 'SUPERADMIN' OR tenant_id = $2)`,
      [req.user!.id, userTenantId]
    );
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }
    const row: any = userRes.rows[0];
    const rowTid = Number(row.tenant_id);
    const effectiveTid = isSuperAdmin ? 0 : (req.user!.tenantId || (Number.isInteger(rowTid) && rowTid > 0 ? rowTid : 1));
    let onboardingCompleted = true;
    if (String(row.role).toUpperCase() !== 'SUPERADMIN') {
      const tRes = await pgClient.query<{ onboarding_completed: boolean }>(
        'SELECT onboarding_completed FROM tenants WHERE id = $1 LIMIT 1',
        [effectiveTid]
      );
      if (tRes.rows.length > 0) {
        onboardingCompleted = Boolean(tRes.rows[0].onboarding_completed);
      }
    }
    res.json({
      user: {
        id: row.id,
        tenantId: effectiveTid,
        name: row.name,
        email: row.email,
        phone: row.phone || '',
        avatarUrl: row.avatar_url || '',
        role: row.role,
        originalRole: row.role,
        status: row.status,
        onboardingCompleted,
      },
    });
  } catch {
    res.json({ user: req.user });
  }
});

// Update Profile (Name, Phone, and optional Avatar Image; Email is strictly unchangeable)
router.put('/profile', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, phone, avatarUrl } = req.body;
    const userId = req.user!.id;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name cannot be empty.' });
    }

    const trimmedName = name.trim();
    const trimmedPhone = typeof phone === 'string' ? phone.trim() : '';
    const sanitizedAvatarUrl = typeof avatarUrl === 'string' ? avatarUrl.trim() : (req.user?.avatarUrl || '');

    const isSuperAdmin = String(req.user!.role).toUpperCase() === 'SUPERADMIN';
    const userTenantId = isSuperAdmin ? 0 : (Number(req.user!.tenantId) > 0 ? Number(req.user!.tenantId) : 1);
    const result = await pgClient.query(
      `UPDATE users
       SET name = $1, phone = $2, avatar_url = $3, updated_at = NOW()
       WHERE id = $4 AND (UPPER(role::text) = 'SUPERADMIN' OR tenant_id = $5)
       RETURNING id, tenant_id, name, email, phone, avatar_url, role, status`,
      [trimmedName, trimmedPhone, sanitizedAvatarUrl, userId, userTenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User account not found.' });
    }

    const row: any = result.rows[0];
    const rowTid = Number(row.tenant_id);
    const updatedUser: AuthUser = {
      id: row.id,
      tenantId: isSuperAdmin ? 0 : (req.user!.tenantId || (Number.isInteger(rowTid) && rowTid > 0 ? rowTid : 1)),
      name: row.name,
      email: row.email,
      phone: row.phone || '',
      avatarUrl: row.avatar_url || '',
      role: row.role,
      status: row.status,
    };
    const token = generateToken(updatedUser);

    res.json({
      message: 'Profile updated successfully.',
      user: updatedUser,
      token,
    });
  } catch (err: any) {
    console.error('Profile update error:', err);
    res.status(500).json({ error: 'Failed to update profile: ' + err.message });
  }
});

// Change Password
router.put('/change-password', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    const userId = req.user!.id;

    if (!currentPassword) {
      return res.status(400).json({ error: 'Please enter your current/previous password.' });
    }

    if (!newPassword || !confirmPassword) {
      return res.status(400).json({ error: 'Please enter both new password and confirm password.' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long.' });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'New password and confirm password do not match.' });
    }

    const isSuperAdmin = String(req.user!.role).toUpperCase() === 'SUPERADMIN';
    const userTenantId = isSuperAdmin ? 0 : (Number(req.user!.tenantId) > 0 ? Number(req.user!.tenantId) : 1);
    const userRes = await pgClient.query(
      `SELECT password_hash, tenant_id, role
       FROM users
       WHERE id = $1 AND (UPPER(role::text) = 'SUPERADMIN' OR tenant_id = $2)`,
      [userId, userTenantId]
    );
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'User account not found.' });
    }

    const user: any = userRes.rows[0];
    const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Incorrect previous/current password. Please check and try again.' });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await pgClient.query(
      `UPDATE users
       SET password_hash = $1, quick_password = $2, updated_at = NOW()
       WHERE id = $3 AND (UPPER(role::text) = 'SUPERADMIN' OR tenant_id = $4)`,
      [newHash, newPassword, userId, userTenantId]
    );

    res.json({ message: 'Password changed successfully. Please remember your new password.' });
  } catch (err: any) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Failed to change password: ' + err.message });
  }
});

// Send Password Reset Link to User's Email (POST /api/auth/send-reset-link & POST /api/auth/forgot-password)
const handleSendPasswordResetLink = async (req: Request, res: Response) => {
  try {
    await ensureSaasControlPlane();
    const { email, origin } = req.body || {};
    if (!email || !String(email).trim()) {
      return res.status(400).json({ error: 'Email is required.' });
    }

    const cleanEmail = String(email).trim();
    const rawTid =
      req.body?.tenantId ??
      req.body?.tenant_id ??
      req.query?.tenantId ??
      req.query?.tenant_id ??
      req.headers['x-tenant-id'];
    const explicitTenantId = Number(rawTid);
    const hasExplicitTenantId = Number.isInteger(explicitTenantId) && explicitTenantId > 0;

    let user: any = null;

    if (hasExplicitTenantId) {
      const scopedRes = await pgClient.query(
        `SELECT id, name, email, role, COALESCE(tenant_id, 1) AS tenant_id
         FROM users
         WHERE LOWER(BTRIM(email)) = LOWER(BTRIM($1))
           AND COALESCE(tenant_id, 1) = $2
         ORDER BY CASE WHEN UPPER(role::text) = 'ADMIN' THEN 0 ELSE 1 END, id ASC
         LIMIT 1`,
        [cleanEmail, explicitTenantId]
      );
      user = scopedRes.rows[0] || null;
    }

    if (!user) {
      const globalRes = await pgClient.query(
        `SELECT id, name, email, role, COALESCE(tenant_id, 1) AS tenant_id
         FROM users
         WHERE LOWER(BTRIM(email)) = LOWER(BTRIM($1))
         ORDER BY CASE
           WHEN UPPER(role::text) = 'SUPERADMIN' THEN 0
           WHEN UPPER(role::text) = 'ADMIN' THEN 1
           ELSE 2
         END, id ASC
         LIMIT 1`,
        [cleanEmail]
      );
      user = globalRes.rows[0] || null;
    }

    if (!user) {
      return res.status(404).json({
        error: 'No account found with that email address. Please check your email and try again.',
      });
    }

    const isSuperAdmin = String(user.role || '').toUpperCase() === 'SUPERADMIN';
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    const userTid = isSuperAdmin ? 0 : (Number(user.tenant_id) > 0 ? Number(user.tenant_id) : 1);

    await pgClient.query(
      'DELETE FROM password_reset_tokens WHERE user_id = $1',
      [user.id]
    );

    await pgClient.query(
      'INSERT INTO password_reset_tokens (tenant_id, user_id, token, expires_at) VALUES ($1, $2, $3, $4)',
      [userTid, user.id, resetToken, expiresAt]
    );

    const requestOrigin =
      (typeof origin === 'string' && origin.trim().startsWith('http') ? origin.trim() : '') ||
      (typeof req.headers.origin === 'string' && req.headers.origin.startsWith('http') ? req.headers.origin : '') ||
      `${req.protocol}://${req.get('host')}`;
    let storeName = isSuperAdmin ? 'POS SaaS C-Panel | SarbaazSoft' : 'SarbaazSoft Shoe POS';
    if (!isSuperAdmin && userTid > 0) {
      const tRes = await pgClient
        .query<{ name: string }>('SELECT name FROM tenants WHERE id = $1 LIMIT 1', [userTid])
        .catch(() => ({ rows: [] }));
      if (tRes.rows[0]?.name) {
        storeName = tRes.rows[0].name;
      }
    }

    const resetParams = new URLSearchParams();
    resetParams.set('resetToken', resetToken);
    resetParams.set('email', user.email);
    if (!isSuperAdmin && userTid > 0) {
      resetParams.set('tenantId', String(userTid));
    }
    const resetLink = `${requestOrigin.replace(/\/+$/, '')}/?${resetParams.toString()}`;

    const mailResult = await sendPasswordResetEmail({
      to: user.email,
      userName: user.name,
      storeName,
      resetToken,
      resetLink,
      expiresAt,
    });

    console.log(
      `📧 [Password Reset Email] To: ${user.email} | Provider: ${mailResult.provider} | Delivered: ${mailResult.delivered} | Link: ${resetLink}`
    );

    return res.json({
      success: true,
      emailSent: mailResult.delivered,
      emailProvider: mailResult.provider,
      email: user.email,
      expiresAt: expiresAt.toISOString(),
      message: `Password reset token and link have been sent by email to ${user.email}.`,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to send password reset link: ' + err.message });
  }
};

router.post('/send-reset-link', handleSendPasswordResetLink);
router.post('/forgot-password', handleSendPasswordResetLink);

// Verify Reset Token from URL Link (GET /api/auth/verify-reset-token?token=...)
router.get('/verify-reset-token', async (req: Request, res: Response) => {
  try {
    await ensureSaasControlPlane();
    const token = String(req.query?.token || '').trim();
    if (!token) {
      return res.status(400).json({ valid: false, error: 'Reset token is required.' });
    }

    const tokenRes = await pgClient.query(
      `SELECT prt.user_id, prt.tenant_id, prt.expires_at, u.email, u.name, u.role
       FROM password_reset_tokens prt
       JOIN users u ON u.id = prt.user_id
       WHERE LOWER(BTRIM(prt.token)) = LOWER(BTRIM($1))
       LIMIT 1`,
      [token]
    );

    if (tokenRes.rows.length === 0) {
      return res.status(404).json({ valid: false, error: 'Invalid or already used password reset link.' });
    }

    const row: any = tokenRes.rows[0];
    if (new Date() > new Date(row.expires_at)) {
      await pgClient.query('DELETE FROM password_reset_tokens WHERE LOWER(BTRIM(token)) = LOWER(BTRIM($1))', [token]);
      return res.status(410).json({ valid: false, error: 'This password reset link has expired. Please request a new one.' });
    }

    const isSuperAdmin = String(row.role || '').toUpperCase() === 'SUPERADMIN';
    return res.json({
      valid: true,
      email: row.email,
      name: row.name,
      role: row.role,
      tenantId: isSuperAdmin ? 0 : (Number(row.tenant_id) || 1),
      expiresAt: row.expires_at,
    });
  } catch (err: any) {
    return res.status(500).json({ valid: false, error: 'Failed to verify reset token: ' + err.message });
  }
});

// Reset Password using Token from Reset Link
router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    await ensureSaasControlPlane();
    const { token, newPassword } = req.body || {};
    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Reset token and new password are required.' });
    }

    if (String(newPassword).length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    const cleanToken = String(token).trim();
    const tokenRes = await pgClient.query(
      `SELECT user_id, tenant_id, expires_at
       FROM password_reset_tokens
       WHERE LOWER(BTRIM(token)) = LOWER(BTRIM($1))
       LIMIT 1`,
      [cleanToken]
    );

    if (tokenRes.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired password reset token.' });
    }

    const { user_id, expires_at } = tokenRes.rows[0] as any;

    if (new Date() > new Date(expires_at)) {
      await pgClient.query(
        'DELETE FROM password_reset_tokens WHERE LOWER(BTRIM(token)) = LOWER(BTRIM($1))',
        [cleanToken]
      );
      return res.status(400).json({ error: 'Password reset token has expired. Please request a new one.' });
    }

    const passwordHash = await bcrypt.hash(String(newPassword), 10);
    await pgClient.query(
      'UPDATE users SET password_hash = $1, quick_password = $2, updated_at = NOW() WHERE id = $3',
      [passwordHash, String(newPassword), user_id]
    );
    await pgClient.query(
      'DELETE FROM password_reset_tokens WHERE user_id = $1',
      [user_id]
    );

    res.json({
      success: true,
      message: 'Password has been reset successfully. You may now log in with your new password.',
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Reset password failed: ' + err.message });
  }
});

// --- USER MANAGEMENT ENDPOINTS (/api/auth/users) ---

router.get('/users', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = extractStrictTenantId(req);
    const result = await pgClient.query(
      "SELECT id, tenant_id, name, email, phone, avatar_url, role, status, created_at, updated_at FROM users WHERE tenant_id = $1 AND role != 'SUPERADMIN' ORDER BY id ASC",
      [tenantId]
    );
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.json({ users: result.rows });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch users: ' + err.message });
  }
});

router.post('/users', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = extractStrictTenantId(req);
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

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(201).json({
      message: `${assignedRole === 'ADMIN' ? 'Administrator' : 'Cashier'} account created successfully.`,
      user: result.rows[0],
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

const handleUpdateUserStatus = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = extractStrictTenantId(req);
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
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
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
    const tenantId = extractStrictTenantId(req);
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

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
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

router.put('/users/:id', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = extractStrictTenantId(req);
    const targetUserId = parseInt(req.params.id, 10);
    if (!targetUserId || isNaN(targetUserId)) {
      return res.status(400).json({ error: 'Invalid user ID.' });
    }

    const existing = await pgClient.query('SELECT * FROM users WHERE id = $1 AND tenant_id = $2', [targetUserId, tenantId]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'User not found in your store.' });
    }

    const current: any = existing.rows[0];
    const { name, email, phone, role, status, password } = req.body;

    const newName = name !== undefined && String(name).trim() ? String(name).trim() : current.name;
    const newEmail = email !== undefined && String(email).trim() ? String(email).trim().toLowerCase() : current.email;
    const newPhone = phone !== undefined ? String(phone).trim() : current.phone;
    const newRole = role !== undefined && ['ADMIN', 'CASHIER'].includes(String(role).toUpperCase()) ? String(role).toUpperCase() : current.role;
    const newStatus = status !== undefined && ['APPROVED', 'PENDING'].includes(String(status).toUpperCase()) ? String(status).toUpperCase() : current.status;

    let newHash = current.password_hash;
    let newQuickPass = current.quick_password;
    if (password && String(password).length >= 6) {
      newHash = await bcrypt.hash(password, 10);
      newQuickPass = password;
    }

    const result = await pgClient.query(
      `UPDATE users
       SET name = $1, email = $2, phone = $3, role = $4, status = $5, password_hash = $6, quick_password = $7, updated_at = NOW()
       WHERE id = $8 AND tenant_id = $9
       RETURNING id, tenant_id, name, email, phone, role, status`,
      [newName, newEmail, newPhone, newRole, newStatus, newHash, newQuickPass, targetUserId, tenantId]
    );

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.json({ message: 'User updated successfully.', user: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update user: ' + err.message });
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
      await pgClient.query('UPDATE purchases SET created_by = $1 WHERE created_by = $2 AND tenant_id = $3', [currentAdminId, targetUserId, tenantId]);
      await pgClient.query('UPDATE supplier_payments SET created_by = $1 WHERE created_by = $2 AND tenant_id = $3', [currentAdminId, targetUserId, tenantId]);
      await pgClient.query('UPDATE purchase_returns SET created_by = $1 WHERE created_by = $2 AND tenant_id = $3', [currentAdminId, targetUserId, tenantId]);
      await pgClient.query('UPDATE returns SET created_by = $1 WHERE created_by = $2 AND tenant_id = $3', [currentAdminId, targetUserId, tenantId]);
      await pgClient.query('UPDATE stock_movements SET user_id = $1 WHERE user_id = $2 AND tenant_id = $3', [currentAdminId, targetUserId, tenantId]);
      await pgClient.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [targetUserId]);
    } catch (_) {}

    await pgClient.query('DELETE FROM users WHERE id = $1 AND tenant_id = $2', [targetUserId, tenantId]);

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.json({
      message: `User account "${targetUser.name}" has been deleted successfully.`,
    });
  } catch (err: any) {
    console.error('Delete user error:', err);
    res.status(500).json({ error: 'Failed to delete user: ' + err.message });
  }
});

// --- API TOKENS ENDPOINTS (/api/auth/api-tokens) ---

router.get('/api-tokens', requireAuth, requireAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.json({ tokens: [] });
});

router.post('/api-tokens', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const name = String(req.body?.name || 'API Token').trim();
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.json({
    token: {
      id: Date.now(),
      name,
      token: 'pos_' + crypto.randomBytes(16).toString('hex'),
      created_at: new Date().toISOString(),
    },
  });
});

router.delete('/api-tokens/:id', requireAuth, requireAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.json({ success: true, message: 'Token deleted.' });
});

export default router;
