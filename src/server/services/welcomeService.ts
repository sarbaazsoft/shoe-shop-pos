import { pgClient } from '../../db/index.ts';
import { ensurePlatformNotificationsSchema } from '../../db/schemaInit.ts';
import { notifyPlatformAnnouncement } from '../pushNotificationService.ts';
import { sendWelcomeEmail, sendStaffWelcomeEmail } from '../utils/email.ts';

let latestKnownBaseUrl: string | null = null;

/**
 * Records the latest known origin or base URL detected from active HTTP requests.
 */
export function recordApplicationBaseUrl(candidate?: string | null): void {
  if (!candidate || typeof candidate !== 'string') return;
  const clean = candidate.trim().replace(/\/+$/, '');
  if (!clean || clean === 'null' || clean === 'undefined') return;
  try {
    const parsed = new URL(clean);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      latestKnownBaseUrl = clean;
    }
  } catch {
    // Ignore invalid URL
  }
}

/**
 * Resolves the application base URL using configured environment variables,
 * active HTTP request headers/origin, or local dev port fallback.
 */
export function getApplicationBaseUrl(fallbackCandidate?: string | null): string {
  if (fallbackCandidate && typeof fallbackCandidate === 'string') {
    const clean = fallbackCandidate.trim().replace(/\/+$/, '');
    if (clean && clean !== 'null' && clean !== 'undefined') {
      try {
        const parsed = new URL(clean);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
          recordApplicationBaseUrl(clean);
          return clean;
        }
      } catch {
        // Fall through
      }
    }
  }

  if (latestKnownBaseUrl) {
    return latestKnownBaseUrl;
  }

  const envUrl = (
    process.env.APP_BASE_URL ||
    process.env.VITE_APP_URL ||
    process.env.PUBLIC_URL ||
    process.env.BASE_URL ||
    ''
  ).trim().replace(/\/+$/, '');
  if (envUrl) {
    try {
      const parsed = new URL(envUrl);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return envUrl;
      }
    } catch {
      // Fall through
    }
  }

  const port = process.env.PORT || 3000;
  return `http://localhost:${port}`;
}

export interface SendWelcomeMsgOptions {
  origin?: string;
  baseUrl?: string;
  resendEmail?: boolean;
}

export interface SendWelcomeMsgResult {
  success: boolean;
  tenantId: number;
  message: string;
  notificationId?: number;
  ownerEmail?: string;
  ownerName?: string;
  emailDelivered: boolean;
  emailPreviewUrl?: string | null;
  storeUrl?: string;
  portalUrl?: string;
}

/**
 * Triggers sending the welcome notification to the tenant and emailing the exact
 * same welcome message to the store owner's email address.
 *
 * CRITICAL: Does NOT add any new database columns, reusing existing columns.
 */
export async function sendWelcomeMsg(
  tenantId: number,
  msg: string,
  explicitOwnerEmail?: string,
  options?: SendWelcomeMsgOptions
): Promise<SendWelcomeMsgResult> {
  const cleanTenantId = Number(tenantId) || 1;

  // 1. Fetch store and owner info from existing schema
  const tenantRes = await pgClient.query<{
    id: number;
    name: string;
    owner_name: string | null;
    owner_email: string | null;
  }>(
    `SELECT t.id, t.name,
            u.name AS owner_name,
            u.email AS owner_email
     FROM tenants t
     LEFT JOIN LATERAL (
       SELECT name, email
       FROM users
       WHERE tenant_id = t.id AND role = 'ADMIN'
       ORDER BY id ASC
       LIMIT 1
     ) u ON true
     WHERE t.id = $1
     LIMIT 1`,
    [cleanTenantId]
  );

  const tenant = tenantRes.rows[0];
  const storeName = tenant?.name || 'Store';
  const ownerName = tenant?.owner_name || 'Store Owner';
  const targetEmail = (explicitOwnerEmail || tenant?.owner_email || '').trim().toLowerCase();

  // 2. Resolve complete dynamic URLs for Store Link and Direct Portal Link
  const baseUrl = getApplicationBaseUrl(options?.origin || options?.baseUrl);
  const storeLink = `${baseUrl}/dashboard?tenantId=${cleanTenantId}`;
  const directPortalLink = `${baseUrl}/?tenantId=${cleanTenantId}`;

  const defaultWelcomeBody = `Thank you for choosing SarbaazSoft to power your footwear business. We are thrilled to partner with ${storeName} and help you streamline your inventory, accelerate counter checkouts, and scale your retail operations seamlessly.`;
  const welcomeTitle = `Welcome to SarbaazSoft Shoe POS, ${storeName}!`;

  // Keep the prominent notification title as the only welcome heading. Strip redundant headings or old links.
  const suppliedMessage = String(msg || '').trim();
  let baseMessage = suppliedMessage
    .replace(/^Welcome\s+to\s+SarbaazSoft\s+Shoe\s+POS,?\s+[^!\n]+!\s*/i, '')
    .replace(/•?\s*Store\s+Link:\s*[^\n]+/gi, '')
    .replace(/•?\s*Direct\s+Portal\s+Link:\s*[^\n]+/gi, '')
    .trim();

  if (!baseMessage) {
    baseMessage = defaultWelcomeBody;
  }

  // Include dynamic Store Link and Direct Portal Link (with ?tenantId=<storeId>) in the message
  const welcomeText = `${baseMessage}\n\n• Store Link: ${storeLink}\n• Direct Portal Link: ${directPortalLink}`;

  // 3. Ensure platform notifications schema and prevent duplicate welcome notifications/emails
  await ensurePlatformNotificationsSchema();

  const existingNotifRes = await pgClient.query<{ id: number; created_at: string }>(
    `SELECT id, created_at FROM platform_notifications
     WHERE tenant_id = $1
       AND (
         title ILIKE '%Welcome%'
         OR message ILIKE '%Welcome%'
         OR message ILIKE '%Thank you for choosing%'
       )
     ORDER BY id ASC
     LIMIT 1`,
    [cleanTenantId]
  );

  if (existingNotifRes.rows.length > 0) {
    const existingId = existingNotifRes.rows[0].id;
    // Delete any secondary duplicate rows if they exist
    await pgClient.query(
      `DELETE FROM platform_notifications
       WHERE tenant_id = $1
         AND id != $2
         AND (
           title ILIKE '%Welcome%'
           OR message ILIKE '%Welcome%'
           OR message ILIKE '%Thank you for choosing%'
         )`,
      [cleanTenantId, existingId]
    ).catch(() => {});

    // Update the existing notice with the corrected message and complete direct portal link
    await pgClient.query(
      `UPDATE platform_notifications
       SET title = $1,
           message = $2,
           action_url = $3,
           action_label = 'Open Store Portal'
       WHERE id = $4`,
      [welcomeTitle, welcomeText, directPortalLink, existingId]
    ).catch(() => {});

    let emailDelivered = false;
    let emailPreviewUrl: string | null = null;
    if (options?.resendEmail && targetEmail && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(targetEmail)) {
      try {
        const mailRes = await sendWelcomeEmail({
          to: targetEmail,
          ownerName,
          storeName,
          welcomeMessage: welcomeText,
          loginUrl: directPortalLink,
          storeUrl: storeLink,
          portalUrl: directPortalLink,
        });
        emailDelivered = mailRes.delivered;
        emailPreviewUrl = mailRes.previewUrl || null;
      } catch (mailErr: any) {
        console.warn(`[welcomeService.ts] Welcome email re-dispatch notice for ${targetEmail}:`, mailErr?.message || mailErr);
      }
    }

    return {
      success: true,
      tenantId: cleanTenantId,
      message: welcomeText,
      notificationId: existingId,
      ownerEmail: targetEmail,
      ownerName,
      emailDelivered,
      emailPreviewUrl,
      storeUrl: storeLink,
      portalUrl: directPortalLink,
    };
  }

  const notifRes = await pgClient.query<{ id: number; created_at: string }>(
    `INSERT INTO platform_notifications (
       tenant_id, target_role, title, message, type, action_url, action_label, expires_at, created_at
     ) VALUES ($1, 'ADMIN', $2, $3, 'SUCCESS', $4, 'Open Store Portal', NOW() + INTERVAL '14 days', NOW())
     RETURNING id, created_at`,
    [
      cleanTenantId,
      welcomeTitle,
      welcomeText,
      directPortalLink,
    ]
  );
  const notificationId = notifRes.rows[0]?.id;

  // 4. Broadcast real-time SSE event & Web Push strictly to store owner (ADMIN)
  await notifyPlatformAnnouncement({
    id: notificationId,
    tenantId: cleanTenantId,
    targetRole: 'ADMIN',
    title: welcomeTitle,
    message: welcomeText,
    type: 'SUCCESS',
    actionUrl: directPortalLink,
    actionLabel: 'Open Store Portal',
    timestamp: notifRes.rows[0]?.created_at,
  }).catch((err) => console.warn('Could not dispatch welcome push/SSE announcement:', err));

  // 5. Email the same welcome message to the owner's email address
  let emailDelivered = false;
  let emailPreviewUrl: string | null = null;
  if (targetEmail && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(targetEmail)) {
    try {
      const mailRes = await sendWelcomeEmail({
        to: targetEmail,
        ownerName,
        storeName,
        welcomeMessage: welcomeText,
        loginUrl: directPortalLink,
        storeUrl: storeLink,
        portalUrl: directPortalLink,
      });
      emailDelivered = mailRes.delivered;
      emailPreviewUrl = mailRes.previewUrl || null;
      if (!mailRes.delivered) {
        console.warn(`[welcomeService.ts] Welcome email delivery notice for ${targetEmail}: ${mailRes.error}`);
      }
    } catch (mailErr: any) {
      console.warn(`[welcomeService.ts] Welcome email dispatch notice for ${targetEmail}:`, mailErr?.message || mailErr);
    }
  }

  return {
    success: true,
    tenantId: cleanTenantId,
    message: welcomeText,
    notificationId,
    ownerEmail: targetEmail,
    ownerName,
    emailDelivered,
    emailPreviewUrl,
    storeUrl: storeLink,
    portalUrl: directPortalLink,
  };
}

export interface SendStaffWelcomeParams {
  tenantId: number;
  staffName: string;
  email: string;
  password: string;
  role: 'ADMIN' | 'CASHIER' | string;
  storeName?: string;
  origin?: string;
}

export interface SendStaffWelcomeResult {
  success: boolean;
  notificationId?: number;
  emailDelivered: boolean;
  emailPreviewUrl?: string | null;
  provider?: string;
  terminalUrl: string;
  loginUrl: string;
  error?: string;
}

/**
 * Sends a personalized welcome email and creates an in-app platform notification
 * for newly created staff/cashier accounts containing credentials and direct POS Terminal link (F9).
 */
export async function sendStaffWelcomeNotification(
  params: SendStaffWelcomeParams
): Promise<SendStaffWelcomeResult> {
  const cleanTenantId = Number(params.tenantId) || 1;
  const staffRole = String(params.role || 'CASHIER').toUpperCase();
  const roleDisplay = staffRole === 'ADMIN' ? 'Administrator' : 'Cashier';

  // 1. Fetch store name if not provided
  let storeName = params.storeName;
  if (!storeName) {
    try {
      const res = await pgClient.query<{ name: string }>(
        'SELECT name FROM tenants WHERE id = $1 LIMIT 1',
        [cleanTenantId]
      );
      storeName = res.rows[0]?.name || 'Shoe Store';
    } catch {
      storeName = 'Shoe Store';
    }
  }

  // 2. Prepare terminal and login URLs
  const baseUrl = getApplicationBaseUrl(params.origin);
  const terminalPath = `/pos?tenantId=${cleanTenantId}`;
  const loginPath = `/?tenantId=${cleanTenantId}&mode=login`;
  const terminalUrl = `${baseUrl}${terminalPath}`;
  const loginUrl = `${baseUrl}${loginPath}`;

  const notifTitle = `Welcome to ${storeName}, ${params.staffName}!`;
  const notifMessage = `Your ${roleDisplay} account has been activated. Press F9 anytime to launch the POS Terminal counter and begin ringing up footwear sales.`;

  // 3. Ensure platform notifications table and record in-app notification
  let notificationId: number | undefined;
  try {
    await ensurePlatformNotificationsSchema();
    const notifRes = await pgClient.query<{ id: number; created_at: string }>(
      `INSERT INTO platform_notifications (
         tenant_id, target_role, title, message, type, action_url, action_label, expires_at, created_at
       ) VALUES ($1, $2, $3, $4, 'SUCCESS', $5, 'Launch POS Terminal (F9)', NOW() + INTERVAL '14 days', NOW())
       RETURNING id, created_at`,
      [
        cleanTenantId,
        staffRole === 'ADMIN' ? 'ADMIN' : 'CASHIER',
        notifTitle,
        notifMessage,
        terminalPath,
      ]
    );
    notificationId = notifRes.rows[0]?.id;

    // 4. Dispatch real-time SSE & Web Push announcement
    await notifyPlatformAnnouncement({
      id: notificationId,
      tenantId: cleanTenantId,
      targetRole: staffRole === 'ADMIN' ? 'ADMIN' : 'CASHIER',
      title: notifTitle,
      message: notifMessage,
      type: 'SUCCESS',
      actionUrl: terminalPath,
      actionLabel: 'Launch POS Terminal (F9)',
      timestamp: notifRes.rows[0]?.created_at,
    }).catch((err) => console.warn('Could not dispatch staff welcome push/SSE announcement:', err));
  } catch (dbErr) {
    console.warn('Could not persist staff platform notification:', dbErr);
  }

  // 5. Send personalized welcome email with credentials & terminal link
  let emailDelivered = false;
  let emailPreviewUrl: string | null = null;
  let provider: string | undefined;

  const targetEmail = (params.email || '').trim().toLowerCase();
  if (targetEmail && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(targetEmail)) {
    try {
      const mailRes = await sendStaffWelcomeEmail({
        to: targetEmail,
        staffName: params.staffName,
        role: staffRole,
        storeName,
        loginEmail: targetEmail,
        initialPassword: params.password,
        loginUrl,
        terminalUrl,
      });
      emailDelivered = mailRes.delivered;
      emailPreviewUrl = mailRes.previewUrl || null;
      provider = mailRes.provider;
      if (!mailRes.delivered) {
        console.warn(`[welcomeService.ts] Staff welcome email delivery notice for ${targetEmail}: ${mailRes.error}`);
      }
    } catch (mailErr: any) {
      console.warn(`[welcomeService.ts] Staff welcome email dispatch notice for ${targetEmail}:`, mailErr?.message || mailErr);
    }
  }

  return {
    success: true,
    notificationId,
    emailDelivered,
    emailPreviewUrl,
    provider,
    terminalUrl,
    loginUrl,
  };
}
