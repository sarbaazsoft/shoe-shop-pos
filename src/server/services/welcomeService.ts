import { pgClient } from '../../db/index.ts';
import { ensurePlatformNotificationsSchema } from '../../db/schemaInit.ts';
import { notifyPlatformAnnouncement } from '../pushNotificationService.ts';
import { sendWelcomeEmail, sendStaffWelcomeEmail } from '../utils/email.ts';

export interface SendWelcomeMsgResult {
  success: boolean;
  tenantId: number;
  message: string;
  notificationId?: number;
  ownerEmail?: string;
  ownerName?: string;
  emailDelivered: boolean;
  emailPreviewUrl?: string | null;
}

/**
 * Triggers sending the welcome notification to the tenant and emailing the exact
 * same welcome message to the store owner's email address.
 *
 * CRITICAL: Does NOT add any new database columns, including to track whether the user has been welcomed.
 */
export async function sendWelcomeMsg(
  tenantId: number,
  msg: string,
  explicitOwnerEmail?: string
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

  const defaultWelcomeText = `Thank you for choosing SarbaazSoft to power your footwear business. We are thrilled to partner with ${storeName} and help you streamline your inventory, accelerate counter checkouts, and scale your retail operations seamlessly.`;
  const welcomeTitle = `Welcome to SarbaazSoft Shoe POS, ${storeName}!`;
  // Keep the prominent notification title as the only welcome heading. Older callers
  // may include the same heading in the message body, so strip it before saving/sending.
  const suppliedMessage = String(msg || '').trim();
  const messageWithoutDuplicateHeading = suppliedMessage
    .replace(/^Welcome\s+to\s+SarbaazSoft\s+Shoe\s+POS,?\s+[^!\n]+!\s*/i, '')
    .trim();
  const welcomeText = messageWithoutDuplicateHeading || defaultWelcomeText;

  // 2. Ensure platform notifications schema and create in-app notification in platform_notifications (strictly targeted to store owner ADMIN)
  await ensurePlatformNotificationsSchema();
  const notifRes = await pgClient.query<{ id: number; created_at: string }>(
    `INSERT INTO platform_notifications (
       tenant_id, target_role, title, message, type, action_url, action_label, expires_at, created_at
     ) VALUES ($1, 'ADMIN', $2, $3, 'SUCCESS', $4, 'Open POS Terminal', NOW() + INTERVAL '14 days', NOW())
     RETURNING id, created_at`,
    [
      cleanTenantId,
      welcomeTitle,
      welcomeText,
      `/?tenantId=${cleanTenantId}`,
    ]
  );
  const notificationId = notifRes.rows[0]?.id;

  // 3. Broadcast real-time SSE event & Web Push strictly to store owner (ADMIN)
  await notifyPlatformAnnouncement({
    id: notificationId,
    tenantId: cleanTenantId,
    targetRole: 'ADMIN',
    title: welcomeTitle,
    message: welcomeText,
    type: 'SUCCESS',
    actionUrl: `/?tenantId=${cleanTenantId}`,
    actionLabel: 'Open POS Terminal',
    timestamp: notifRes.rows[0]?.created_at,
  }).catch((err) => console.warn('Could not dispatch welcome push/SSE announcement:', err));

  // 4. Email the same welcome message to the owner's email address
  let emailDelivered = false;
  let emailPreviewUrl: string | null = null;
  if (targetEmail && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(targetEmail)) {
    try {
      const mailRes = await sendWelcomeEmail({
        to: targetEmail,
        ownerName,
        storeName,
        welcomeMessage: welcomeText,
        loginUrl: `/?tenantId=${cleanTenantId}`,
      });
      emailDelivered = mailRes.delivered;
      emailPreviewUrl = mailRes.previewUrl || null;
    } catch (mailErr) {
      console.warn('Welcome email error:', mailErr);
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
  const baseUrl = (params.origin || '').replace(/\/+$/, '');
  const terminalPath = `/pos?tenantId=${cleanTenantId}`;
  const loginPath = `/?tenantId=${cleanTenantId}&mode=login`;
  const terminalUrl = baseUrl ? `${baseUrl}${terminalPath}` : terminalPath;
  const loginUrl = baseUrl ? `${baseUrl}${loginPath}` : loginPath;

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
    } catch (mailErr: any) {
      console.warn('Staff welcome email error:', mailErr?.message || mailErr);
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
