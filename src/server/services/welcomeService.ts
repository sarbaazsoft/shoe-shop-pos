import { pgClient } from '../../db/index.ts';
import { ensurePlatformNotificationsSchema } from '../../db/schemaInit.ts';
import { notifyPlatformAnnouncement } from '../pushNotificationService.ts';
import { sendWelcomeEmail } from '../mailer.ts';

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

  // 2. Ensure platform notifications schema and create in-app notification in platform_notifications
  await ensurePlatformNotificationsSchema();
  const notifRes = await pgClient.query<{ id: number; created_at: string }>(
    `INSERT INTO platform_notifications (
       tenant_id, title, message, type, action_url, action_label, created_at
     ) VALUES ($1, $2, $3, 'SUCCESS', $4, 'Open POS Terminal', NOW())
     RETURNING id, created_at`,
    [
      cleanTenantId,
      welcomeTitle,
      welcomeText,
      `/?tenantId=${cleanTenantId}`,
    ]
  );
  const notificationId = notifRes.rows[0]?.id;

  // 3. Broadcast real-time SSE event & Web Push
  await notifyPlatformAnnouncement({
    id: notificationId,
    tenantId: cleanTenantId,
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
