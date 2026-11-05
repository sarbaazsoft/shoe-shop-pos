import { pgClient } from '../../db/index.ts';
import { sendWelcomeEmail, sendStaffWelcomeEmail } from '../utils/email.ts';

let recordedBaseUrl: string = '';

export function recordApplicationBaseUrl(url?: string | null): void {
  if (!url || typeof url !== 'string') return;
  const clean = url.trim();
  if (!clean || clean === 'null' || clean === 'undefined') return;
  try {
    const parsed = new URL(clean);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      recordedBaseUrl = `${parsed.protocol}//${parsed.host}`;
    }
  } catch {
    // If not a full URL with protocol, but valid host
    if (/^[a-zA-Z0-9.-]+(:\d+)?$/.test(clean)) {
      recordedBaseUrl = `https://${clean}`;
    }
  }
}

export function getApplicationBaseUrl(fallbackOrigin?: string | null): string {
  if (fallbackOrigin && typeof fallbackOrigin === 'string') {
    const clean = fallbackOrigin.trim();
    if (clean && clean !== 'null' && clean !== 'undefined') {
      try {
        const parsed = new URL(clean);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
          return `${parsed.protocol}//${parsed.host}`;
        }
      } catch {
        // Fall through
      }
    }
  }

  if (recordedBaseUrl) {
    return recordedBaseUrl;
  }

  if (process.env.APP_URL) {
    return process.env.APP_URL.replace(/\/+$/, '');
  }

  return 'http://localhost:3000';
}

export interface SendWelcomeMsgOptions {
  origin?: string;
  resendEmail?: boolean;
}

export interface SendWelcomeMsgResult {
  success: boolean;
  tenantId: number;
  storeName: string;
  emailDelivered: boolean;
  emailError?: string;
  provider?: string;
  previewUrl?: string | null;
  storeUrl: string;
  portalUrl: string;
  notificationId?: number;
}

export async function sendWelcomeMsg(
  tenantId: number,
  welcomeMsg?: string,
  targetEmail?: string,
  options?: SendWelcomeMsgOptions
): Promise<SendWelcomeMsgResult> {
  const baseUrl = getApplicationBaseUrl(options?.origin);
  const storeUrl = `${baseUrl}/?tenantId=${tenantId}`;
  const portalUrl = `${baseUrl}/?tenantId=${tenantId}`;

  // 1. Fetch store info
  let storeName = 'SarbaazSoft Store';
  try {
    const tenantRes = await pgClient.query('SELECT id, name FROM tenants WHERE id = $1 LIMIT 1', [tenantId]);
    if (tenantRes.rows.length > 0 && tenantRes.rows[0].name) {
      storeName = tenantRes.rows[0].name;
    }
  } catch (err) {
    console.warn(`[welcomeService] Could not fetch tenant ${tenantId}:`, err);
  }

  // 2. Fetch owner info if targetEmail not provided
  let ownerEmail = targetEmail?.trim() || '';
  let ownerName = '';
  if (!ownerEmail) {
    try {
      const userRes = await pgClient.query(
        'SELECT name, email FROM users WHERE tenant_id = $1 AND role = $2 LIMIT 1',
        [tenantId, 'ADMIN']
      );
      if (userRes.rows.length > 0) {
        ownerEmail = userRes.rows[0].email || '';
        ownerName = userRes.rows[0].name || '';
      }
    } catch (err) {
      console.warn(`[welcomeService] Could not fetch owner for tenant ${tenantId}:`, err);
    }
  }

  const finalWelcomeMsg =
    (welcomeMsg || '').trim() ||
    `Welcome to SarbaazSoft Shoe POS, ${storeName}!\n\nThank you for choosing SarbaazSoft to power your footwear business. We are thrilled to partner with ${storeName} and help you streamline your inventory, accelerate counter checkouts, and scale your retail operations seamlessly.`;

  // 3. Ensure platform notification exists for this tenant
  let notificationId: number | undefined;
  try {
    const existing = await pgClient.query(
      `SELECT id FROM platform_notifications
       WHERE tenant_id = $1
         AND (title ILIKE 'Welcome to SarbaazSoft%' OR message ILIKE '%Thank you for choosing SarbaazSoft%')
       ORDER BY id ASC LIMIT 1`,
      [tenantId]
    );

    const title = `Welcome to SarbaazSoft Shoe POS — ${storeName}`;
    const actionLabel = 'Open POS Terminal';
    const actionUrl = `/pos?tenantId=${tenantId}`;

    if (existing.rows.length > 0) {
      notificationId = Number(existing.rows[0].id);
      await pgClient.query(
        `UPDATE platform_notifications
         SET title = $1, message = $2, action_url = $3, action_label = $4
         WHERE id = $5`,
        [title, finalWelcomeMsg, actionUrl, actionLabel, notificationId]
      );
    } else {
      const insertRes = await pgClient.query(
        `INSERT INTO platform_notifications (tenant_id, target_role, title, message, type, action_url, action_label, created_at)
         VALUES ($1, 'ADMIN', $2, $3, 'SUCCESS', $4, $5, NOW())
         RETURNING id`,
        [tenantId, title, finalWelcomeMsg, actionUrl, actionLabel]
      );
      if (insertRes.rows.length > 0) {
        notificationId = Number(insertRes.rows[0].id);
      }
    }
  } catch (notifErr) {
    console.warn(`[welcomeService] Could not store platform notification for tenant ${tenantId}:`, notifErr);
  }

  // 4. Dispatch welcome email if recipient email is available
  let emailDelivered = false;
  let emailError: string | undefined;
  let provider: string | undefined;
  let previewUrl: string | null = null;

  if (ownerEmail) {
    try {
      const emailRes = await sendWelcomeEmail({
        to: ownerEmail,
        ownerName: ownerName || storeName,
        storeName,
        welcomeMessage: finalWelcomeMsg,
        loginUrl: portalUrl,
        storeUrl,
        portalUrl,
      });

      emailDelivered = Boolean(emailRes.delivered);
      emailError = emailRes.error;
      provider = emailRes.provider;
      previewUrl = emailRes.previewUrl || null;
    } catch (mailErr: any) {
      console.warn(`[welcomeService] Failed to dispatch welcome email to ${ownerEmail}:`, mailErr?.message || mailErr);
      emailError = mailErr?.message || String(mailErr);
    }
  }

  return {
    success: true,
    tenantId,
    storeName,
    emailDelivered,
    emailError,
    provider,
    previewUrl,
    storeUrl,
    portalUrl,
    notificationId,
  };
}

export interface SendStaffWelcomeNotificationOptions {
  tenantId: number;
  staffName: string;
  email: string;
  password?: string;
  role: string;
  origin?: string;
}

export interface SendStaffWelcomeNotificationResult {
  emailDelivered: boolean;
  emailPreviewUrl?: string | null;
  provider?: string | null;
  terminalUrl: string;
  loginUrl: string;
  notificationId?: number;
}

export async function sendStaffWelcomeNotification(
  opts: SendStaffWelcomeNotificationOptions
): Promise<SendStaffWelcomeNotificationResult> {
  const baseUrl = getApplicationBaseUrl(opts.origin);
  const loginUrl = `${baseUrl}/?tenantId=${opts.tenantId}`;
  const terminalUrl = `${baseUrl}/pos?tenantId=${opts.tenantId}`;

  // Fetch store name
  let storeName = 'SarbaazSoft Store';
  try {
    const tenantRes = await pgClient.query('SELECT name FROM tenants WHERE id = $1 LIMIT 1', [opts.tenantId]);
    if (tenantRes.rows.length > 0 && tenantRes.rows[0].name) {
      storeName = tenantRes.rows[0].name;
    }
  } catch (err) {
    console.warn(`[welcomeService] Could not fetch tenant ${opts.tenantId}:`, err);
  }

  // Record a platform notification for this staff member
  let notificationId: number | undefined;
  try {
    const roleLabel = opts.role === 'CASHIER' ? 'Cashier' : 'Store Administrator';
    const insertRes = await pgClient.query(
      `INSERT INTO platform_notifications (tenant_id, target_role, title, message, type, action_url, action_label, created_at)
       VALUES ($1, $2, $3, $4, 'INFO', $5, 'Open POS Terminal', NOW())
       RETURNING id`,
      [
        opts.tenantId,
        opts.role,
        `Welcome to ${storeName}`,
        `Your staff account (${roleLabel}) is active. Sign in with ${opts.email} to start your shift.`,
        terminalUrl,
      ]
    );
    if (insertRes.rows.length > 0) {
      notificationId = Number(insertRes.rows[0].id);
    }
  } catch (notifErr) {
    console.warn(`[welcomeService] Could not create platform notification for staff ${opts.email}:`, notifErr);
  }

  // Send staff welcome email
  let emailDelivered = false;
  let emailPreviewUrl: string | null = null;
  let provider: string | null = null;

  try {
    const emailRes = await sendStaffWelcomeEmail({
      to: opts.email,
      staffName: opts.staffName,
      role: opts.role,
      storeName,
      loginEmail: opts.email,
      initialPassword: opts.password,
      loginUrl,
      terminalUrl,
    });

    emailDelivered = Boolean(emailRes.delivered);
    emailPreviewUrl = emailRes.previewUrl || null;
    provider = emailRes.provider || null;
  } catch (mailErr: any) {
    console.warn(`[welcomeService] Could not send staff welcome email to ${opts.email}:`, mailErr?.message || mailErr);
  }

  return {
    emailDelivered,
    emailPreviewUrl,
    provider,
    terminalUrl,
    loginUrl,
    notificationId,
  };
}
