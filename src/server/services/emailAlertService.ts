import { pgClient } from '../../db/index.ts';
import { getCachedAppSetting } from './appSettingsService.ts';
import { sendEmail } from '../utils/email.ts';
import type { PosActionNotification } from '../pushNotificationService.ts';

function escapeHtml(str: string): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Dispatches an instant transactional email alert to the Store Owner
 * (and optionally SuperAdmin) whenever a cashier processes a sale, return, or exchange.
 */
export async function dispatchPosEmailAlert(
  tenantId: number,
  payload: PosActionNotification
): Promise<boolean> {
  const cleanTenantId = Number(tenantId) || 1;

  // 1. Check global master switch
  const masterEnabled = getCachedAppSetting('EMAIL_POS_ALERTS_ENABLED', 'true').toLowerCase() !== 'false';
  if (!masterEnabled) return false;

  try {
    // 2. Fetch store settings and store owner email addresses
    const [csRes, usersRes] = await Promise.all([
      pgClient.query<{
        company_name: string | null;
        email: string | null;
        email_alerts_enabled: boolean | null;
      }>(
        `SELECT cs.company_name, cs.email, cs.email_alerts_enabled
         FROM company_settings cs
         WHERE cs.tenant_id = $1 LIMIT 1`,
        [cleanTenantId]
      ),
      pgClient.query<{ email: string }>(
        `SELECT email FROM users
         WHERE tenant_id = $1 AND role = 'ADMIN' AND status = 'ACTIVE'`,
        [cleanTenantId]
      ),
    ]);

    const cs = csRes.rows[0];
    if (cs && cs.email_alerts_enabled === false) {
      return false; // Owner disabled email alerts for this store
    }

    const recipients = new Set<string>();

    if (cs?.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cs.email.trim())) {
      recipients.add(cs.email.trim().toLowerCase());
    }

    for (const u of usersRes.rows) {
      if (u.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u.email.trim())) {
        recipients.add(u.email.trim().toLowerCase());
      }
    }

    // Optional SuperAdmin CC
    const notifySuperAdmin = getCachedAppSetting('EMAIL_SUPERADMIN_ON_SALES', 'false').toLowerCase() === 'true';
    if (notifySuperAdmin) {
      const superAdminEmail = (getCachedAppSetting('GMAIL_USER', '') || '').trim().toLowerCase();
      if (superAdminEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(superAdminEmail)) {
        recipients.add(superAdminEmail);
      }
    }

    if (recipients.size === 0) {
      return false;
    }

    const recipientList = Array.from(recipients);
    const storeName = cs?.company_name || 'SarbaazSoft Shoe Store';
    const invoiceNum = payload.invoiceNumber || payload.returnNumber || 'N/A';
    const cashier = payload.cashierName || 'Counter Cashier';
    const customer = payload.customerName || 'Walk-in Customer';
    const amountVal = payload.totalAmount ?? payload.refundAmount ?? payload.netDifference ?? 0;
    const formattedAmount = Number(amountVal).toLocaleString();

    const isSale = payload.type === 'SALE';
    const isExchange = payload.type === 'EXCHANGE';
    const isReturn = payload.type === 'RETURN';

    const actionTitle = isSale
      ? `🛍️ New Sale #${invoiceNum} (Rs. ${formattedAmount})`
      : isExchange
      ? `🔁 Shoe Exchange #${invoiceNum}`
      : isReturn
      ? `↩️ Customer Return #${invoiceNum} (Refund Rs. ${formattedAmount})`
      : `📦 Inventory Alert #${invoiceNum}`;

    const dateFormatted = new Date().toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(actionTitle)}</title>
</head>
<body style="margin: 0; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; color: #1e293b;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
    <!-- Header -->
    <tr>
      <td style="background: linear-gradient(135deg, #1e1b4b 0%, #312e81 100%); padding: 24px; color: #ffffff;">
        <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; opacity: 0.8; font-weight: 700;">SarbaazSoft Shoe POS</div>
        <div style="font-size: 20px; font-weight: 800; margin-top: 4px;">${escapeHtml(storeName)}</div>
        <div style="font-size: 13px; color: #cbd5e1; margin-top: 2px;">Instant Transaction Receipt &amp; Owner Alert</div>
      </td>
    </tr>

    <!-- Main Card -->
    <tr>
      <td style="padding: 24px;">
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px; text-align: center; margin-bottom: 20px;">
          <div style="font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">${isReturn ? 'Total Refund' : isExchange ? 'Net Difference' : 'Total Amount Received'}</div>
          <div style="font-size: 32px; font-weight: 800; color: ${isReturn ? '#dc2626' : '#16a34a'}; margin: 4px 0;">Rs. ${formattedAmount}</div>
          <div style="font-size: 12px; color: #64748b;">Invoice <strong>#${escapeHtml(invoiceNum)}</strong> • ${escapeHtml(dateFormatted)}</div>
        </div>

        <!-- Details Grid -->
        <table width="100%" border="0" cellspacing="0" cellpadding="6" style="font-size: 13px; margin-bottom: 16px; border-bottom: 1px solid #f1f5f9; padding-bottom: 12px;">
          <tr>
            <td style="color: #64748b; width: 35%;">Processed By (Cashier):</td>
            <td style="font-weight: 600; color: #0f172a;">${escapeHtml(cashier)}</td>
          </tr>
          <tr>
            <td style="color: #64748b;">Customer:</td>
            <td style="font-weight: 600; color: #0f172a;">${escapeHtml(customer)}</td>
          </tr>
          ${payload.itemsSummary ? `
          <tr>
            <td style="color: #64748b; vertical-align: top;">Items:</td>
            <td style="color: #334155; line-height: 1.4;">${escapeHtml(payload.itemsSummary)}</td>
          </tr>
          ` : ''}
          ${payload.exchangeDetails ? `
          <tr>
            <td style="color: #64748b;">Returned Items:</td>
            <td style="color: #dc2626;">${escapeHtml(payload.exchangeDetails.oldItems)}</td>
          </tr>
          <tr>
            <td style="color: #64748b;">New Issued Items:</td>
            <td style="color: #16a34a;">${escapeHtml(payload.exchangeDetails.newItems)}</td>
          </tr>
          ` : ''}
        </table>

        <div style="text-align: center; margin-top: 24px;">
          <p style="font-size: 11px; color: #94a3b8; margin: 0;">This is an automated real-time transaction alert from your SarbaazSoft Point of Sale system.</p>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const sendRes = await sendEmail({
      to: recipientList,
      subject: `[${storeName}] ${actionTitle}`,
      html: htmlBody,
    });

    if (sendRes.delivered) {
      console.log(`✉️ POS transaction email alert delivered to ${recipientList.join(', ')} via ${sendRes.provider}`);
      return true;
    } else {
      console.warn(`[emailAlertService] Delivery notice: ${sendRes.error}`);
      return false;
    }
  } catch (err: any) {
    console.warn('[emailAlertService] Exception during POS email dispatch:', err?.message || err);
    return false;
  }
}
