// Centralized transactional email service supporting multiple providers (Resend and Gmail SMTP)
import { Resend } from 'resend';
import nodemailer from 'nodemailer';
import { pgClient } from '../../db/index.ts';
import { getAllAppSettings, getCachedAppSetting } from '../services/appSettingsService.ts';

export type EmailProvider = 'resend' | 'gmail';

export const DEFAULT_FROM_ADDRESS = 'SarbaazSoft Shoe POS Security <onboarding@resend.dev>';

export function isValidResendApiKey(key?: string | null): boolean {
  const clean = (key || '').trim();
  if (!clean) return false;
  return clean.startsWith('re_') && clean.length >= 20;
}

export function isValidHttpUrl(candidate?: string | null): boolean {
  if (!candidate || typeof candidate !== 'string') return false;
  const clean = candidate.trim();
  if (!clean || clean.length < 8) return false;
  try {
    const parsed = new URL(clean);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function sanitizeError(err: unknown): string {
  if (!err) return 'An unknown error occurred during email transmission.';
  const str = typeof err === 'string' ? err : (err as any)?.message || String(err);
  return str
    .replace(/re_[A-Za-z0-9_]+/g, '[REDACTED_API_KEY]')
    .replace(/Bearer\s+[A-Za-z0-9_.-]+/gi, 'Bearer [REDACTED_TOKEN]')
    .replace(/(?:pass(?:word)?[:=]\s*)[^\s,]+/gi, 'password=[REDACTED]');
}

export interface ParsedSenderAddress {
  displayName: string;
  email: string;
  isPublicWebmail: boolean;
  cleanAddress: string;
  resendFrom: string;
  replyTo: string;
}

export function parseSenderAddress(rawCandidate?: string | null): ParsedSenderAddress {
  const raw = (rawCandidate || '').trim();
  let displayName = 'SarbaazSoft Shoe POS Security';
  let email = '';

  if (!raw) {
    return {
      displayName,
      email: 'onboarding@resend.dev',
      isPublicWebmail: false,
      cleanAddress: DEFAULT_FROM_ADDRESS,
      resendFrom: DEFAULT_FROM_ADDRESS,
      replyTo: 'onboarding@resend.dev',
    };
  }

  // Format: "Display Name <email@example.com>"
  const match = raw.match(/^(.*?)\s*<([^\s<>]+@[^\s<>]+)>$/);
  if (match) {
    const extractedName = match[1].replace(/["']/g, '').trim();
    if (extractedName) displayName = extractedName;
    email = match[2].trim().toLowerCase();
  } else if (raw.includes('@')) {
    email = raw.replace(/["']/g, '').trim().toLowerCase();
  } else {
    displayName = raw;
    email = 'onboarding@resend.dev';
  }

  // Check if email domain is a public webmail domain that Resend strictly blocks from being the SPF/envelope sender
  const isPublicWebmail = /@(gmail|googlemail|yahoo|ymail|hotmail|outlook|live|msn|icloud|me|mac|aol|proton|protonmail|zoho|mail|yandex|gmx)\./i.test(email);

  // If public webmail (e.g. sarbaazsoft@gmail.com), Resend API requires using onboarding@resend.dev as envelope
  // while preserving user's email in Reply-To and personal display name.
  const resendFrom = isPublicWebmail || !email || email === 'noreply@sarbaazsoft.com'
    ? `${displayName} <onboarding@resend.dev>`
    : `${displayName} <${email}>`;

  const replyTo = email && email !== 'onboarding@resend.dev' ? email : (process.env.RESEND_REPLY_TO || 'noreply@sarbaazsoft.com');

  return {
    displayName,
    email,
    isPublicWebmail,
    cleanAddress: displayName ? `${displayName} <${email}>` : email,
    resendFrom,
    replyTo,
  };
}

export function resolveSenderAddress(
  customFrom?: string,
  settings?: Record<string, string>
): string {
  // CRITICAL REQUIREMENT: Database root app_settings table is the single source of truth
  const candidate = (
    customFrom ||
    settings?.RESEND_FROM ||
    settings?.RESEND_FROM_EMAIL ||
    getCachedAppSetting('RESEND_FROM') ||
    getCachedAppSetting('RESEND_FROM_EMAIL') ||
    process.env.RESEND_FROM ||
    process.env.RESEND_FROM_EMAIL ||
    DEFAULT_FROM_ADDRESS
  ).trim();

  const parsed = parseSenderAddress(candidate);
  return parsed.resendFrom;
}

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string | string[];
  tags?: { name: string; value: string }[];
  disableFallbackReroute?: boolean;
}

export interface SendEmailResult {
  delivered: boolean;
  provider: 'resend' | 'gmail' | 'webhook';
  messageId?: string;
  previewUrl?: string | null;
  error?: string;
  sandbox?: boolean;
  intendedRecipient?: string;
  sandboxRecipient?: string;
}

/**
 * Dynamically queries the active email provider ('resend' | 'gmail') from database app_settings.
 */
export async function getActiveEmailProvider(): Promise<'resend' | 'gmail'> {
  try {
    const res = await pgClient.query<{ key: string; value: string }>(
      `SELECT value FROM public.app_settings WHERE UPPER(key) IN ('ACTIVE_EMAIL_PROVIDER', 'ACTIVE_PROVIDER') LIMIT 1`
    ).catch(async () => {
      return await pgClient.query<{ key: string; value: string }>(
        `SELECT value FROM public.app_setting WHERE UPPER(key) IN ('ACTIVE_EMAIL_PROVIDER', 'ACTIVE_PROVIDER') LIMIT 1`
      );
    });
    if (res.rows.length > 0 && res.rows[0].value) {
      const val = res.rows[0].value.trim().toLowerCase();
      if (val === 'gmail') return 'gmail';
      if (val === 'resend') return 'resend';
    }
  } catch (err) {
    console.warn('[email.ts] Notice querying active email provider from database:', err);
  }

  const cached = (getCachedAppSetting('ACTIVE_EMAIL_PROVIDER') || process.env.ACTIVE_EMAIL_PROVIDER || 'resend').trim().toLowerCase();
  return cached === 'gmail' ? 'gmail' : 'resend';
}

/**
 * Dynamically retrieves Gmail SMTP credentials directly from the database app_setting / app_settings table.
 */
export async function getDynamicGmailCredentials(): Promise<{ user: string; pass: string; fromName: string }> {
  let user = '';
  let pass = '';
  let fromName = '';
  try {
    const res = await pgClient.query<{ key: string; value: string }>(
      `SELECT key, value FROM public.app_settings WHERE UPPER(key) IN ('GMAIL_USER', 'GMAIL_APP_PASSWORD', 'GMAIL_FROM_NAME', 'GMAIL_SENDER_NAME')`
    ).catch(async () => {
      return await pgClient.query<{ key: string; value: string }>(
        `SELECT key, value FROM public.app_setting WHERE UPPER(key) IN ('GMAIL_USER', 'GMAIL_APP_PASSWORD', 'GMAIL_FROM_NAME', 'GMAIL_SENDER_NAME')`
      );
    });
    for (const row of res.rows) {
      const k = row.key.toUpperCase();
      if (k === 'GMAIL_USER') user = (row.value || '').trim();
      else if (k === 'GMAIL_APP_PASSWORD') pass = (row.value || '').trim();
      else if (k === 'GMAIL_FROM_NAME' || k === 'GMAIL_SENDER_NAME') fromName = (row.value || '').trim();
    }
  } catch (err) {
    console.warn('[email.ts] Notice querying Gmail credentials from database:', err);
  }

  if (!user) user = (getCachedAppSetting('GMAIL_USER') || process.env.GMAIL_USER || 'sarbaazsoft@gmail.com').trim();
  if (!pass) pass = (getCachedAppSetting('GMAIL_APP_PASSWORD') || process.env.GMAIL_APP_PASSWORD || '').trim();
  if (!fromName) fromName = (getCachedAppSetting('GMAIL_FROM_NAME') || process.env.GMAIL_FROM_NAME || 'superadmin').trim();

  return { user, pass, fromName };
}

/**
 * Dynamically retrieves the Resend API key directly from the database app_setting / app_settings table.
 * Strictly adheres to requirement: Do NOT use .env for resend_api_key.
 */
export async function getDynamicResendApiKey(): Promise<string> {
  try {
    const res = await pgClient.query<{ key: string; value: string }>(
      `SELECT key, value FROM public.app_settings WHERE UPPER(key) = 'RESEND_API_KEY' LIMIT 1`
    ).catch(async () => {
      return await pgClient.query<{ key: string; value: string }>(
        `SELECT key, value FROM public.app_setting WHERE UPPER(key) = 'RESEND_API_KEY' LIMIT 1`
      );
    });
    if (res.rows.length > 0 && res.rows[0].value) {
      return res.rows[0].value.trim();
    }
  } catch (dbErr) {
    console.error('[email.ts] Error dynamically querying app_setting table for resend_api_key:', dbErr);
  }

  // Fallback to database-synced cache only (never process.env / .env)
  return (getCachedAppSetting('RESEND_API_KEY') || '').trim();
}

async function sendViaWebhookFallback(
  webhookUrl: string,
  fromAddress: string,
  recipients: string[],
  opts: SendEmailOptions,
  replyToAddress?: string | string[]
): Promise<SendEmailResult> {
  try {
    const resp = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: fromAddress,
        to: recipients,
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
        replyTo: replyToAddress,
      }),
    });

    if (resp.ok) {
      return {
        delivered: true,
        provider: 'webhook',
      };
    }
    console.warn(`[Webhook Dispatch Notice] Server returned ${resp.status} ${resp.statusText}`);
  } catch (whErr: any) {
    console.warn('[Webhook Email Dispatch Notice]:', whErr?.message || whErr);
  }

  return {
    delivered: false,
    provider: 'webhook',
    error: 'Webhook dispatch attempt failed.',
  };
}

export async function sendEmail(opts: SendEmailOptions): Promise<SendEmailResult> {
  const activeProvider = await getActiveEmailProvider();
  let resendFrom = '';
  let resendFromEmail = '';
  let emailWebhookUrl = '';
  let resendWebhookUrl = '';

  try {
    const res = await pgClient.query<{ key: string; value: string }>(
      `SELECT key, value FROM public.app_settings 
       WHERE key IN ('RESEND_FROM', 'RESEND_FROM_EMAIL', 'EMAIL_WEBHOOK_URL', 'RESEND_WEBHOOK_URL')`
    ).catch(async () => {
      return await pgClient.query<{ key: string; value: string }>(
        `SELECT key, value FROM public.app_setting 
         WHERE key IN ('RESEND_FROM', 'RESEND_FROM_EMAIL', 'EMAIL_WEBHOOK_URL', 'RESEND_WEBHOOK_URL')`
      );
    });
    for (const row of res.rows) {
      if (row.key === 'RESEND_FROM' && row.value?.trim()) resendFrom = row.value.trim();
      else if (row.key === 'RESEND_FROM_EMAIL' && row.value?.trim()) resendFromEmail = row.value.trim();
      else if (row.key === 'EMAIL_WEBHOOK_URL') emailWebhookUrl = (row.value || '').trim();
      else if (row.key === 'RESEND_WEBHOOK_URL') resendWebhookUrl = (row.value || '').trim();
    }
  } catch (dbErr) {
    console.error('[email.ts] Error querying app_settings table for email configuration:', dbErr);
    resendFrom = (getCachedAppSetting('RESEND_FROM') || '').trim();
    resendFromEmail = (getCachedAppSetting('RESEND_FROM_EMAIL') || '').trim();
    emailWebhookUrl = (getCachedAppSetting('EMAIL_WEBHOOK_URL') || '').trim();
    resendWebhookUrl = (getCachedAppSetting('RESEND_WEBHOOK_URL') || '').trim();
  }

  // Cross-fallback between RESEND_FROM and RESEND_FROM_EMAIL
  if (!resendFrom && resendFromEmail) {
    resendFrom = `SarbaazSoft Shoe POS Security <${resendFromEmail}>`;
  }
  if (!resendFrom) {
    resendFrom = (process.env.RESEND_FROM || process.env.RESEND_FROM_EMAIL || '').trim();
  }

  const rawFromCandidate = (
    opts.from ||
    resendFrom ||
    DEFAULT_FROM_ADDRESS
  ).trim();

  const parsedSender = parseSenderAddress(rawFromCandidate);
  let fromAddress = parsedSender.resendFrom;
  const replyToAddress = opts.replyTo || parsedSender.replyTo;
  const recipients = Array.isArray(opts.to) ? opts.to : [opts.to];

  // Optional secondary webhook URL
  const candidateWebhook = (emailWebhookUrl || resendWebhookUrl || '').trim();
  const webhookUrl = isValidHttpUrl(candidateWebhook) ? candidateWebhook : '';

  // -------------------------------------------------------------------------
  // PROVIDER 1: GMAIL SMTP RELAY (via nodemailer)
  // -------------------------------------------------------------------------
  if (activeProvider === 'gmail') {
    const { user: rawUser, pass: rawPass, fromName: rawFromName } = await getDynamicGmailCredentials();
    const cleanUser = (rawUser || 'sarbaazsoft@gmail.com').trim();
    const cleanPass = rawPass.replace(/\s+/g, ''); // Strip spaces from Google 16-character App Password

    if (!cleanUser || !cleanPass) {
      const missingFields = !cleanUser && !cleanPass
        ? 'both gmail_user and gmail_app_password are not configured'
        : !cleanUser
        ? 'gmail_user is not configured'
        : 'gmail_app_password is not configured';
      const errorMsg = `Active email provider is set to Gmail, but ${missingFields}. Please configure your Gmail credentials in SuperAdmin Settings > Email Configuration > Gmail tab.`;
      
      console.warn(`[Gmail SMTP Warning] ${errorMsg}`);

      if (webhookUrl && !opts.disableFallbackReroute) {
        return await sendViaWebhookFallback(webhookUrl, fromAddress, recipients, opts, replyToAddress);
      }

      return {
        delivered: false,
        provider: 'gmail',
        error: errorMsg,
      };
    }

    try {
      // Determine sender display name and email with environment variable fallbacks and hardcoded default
      // Priority:
      // 1. Configured GMAIL_FROM_NAME from SuperAdmin settings (e.g. 'superadmin' or customized)
      // 2. Caller-specified opts.from display name (if explicitly passed and not default generic fallback)
      // 3. Environment fallbacks: process.env.GMAIL_FROM_NAME || 'superadmin', process.env.GMAIL_USER || 'sarbaazsoft@gmail.com'
      // 4. Hardcoded fallback: 'superadmin <sarbaazsoft@gmail.com>'
      const fallbackFromName = (process.env.GMAIL_FROM_NAME || 'superadmin').trim();
      const fallbackFromEmail = (process.env.GMAIL_USER || 'sarbaazsoft@gmail.com').trim();
      const hardcodedFrom = 'superadmin <sarbaazsoft@gmail.com>';

      const senderDisplayName = (rawFromName || '').trim() ||
        (parsedSender.displayName && parsedSender.displayName !== 'SarbaazSoft Shoe POS Security' ? parsedSender.displayName : '') ||
        fallbackFromName ||
        'superadmin';
      const senderEmail = (cleanUser || fallbackFromEmail || 'sarbaazsoft@gmail.com').trim();

      const senderFrom = (senderDisplayName && senderEmail)
        ? (senderDisplayName.includes(' ') ? `"${senderDisplayName}" <${senderEmail}>` : `${senderDisplayName} <${senderEmail}>`)
        : hardcodedFrom;

      // Construct the active sender address (dynamic settings > env vars > hardcoded fallback)
      const mailFrom = senderFrom || 'superadmin <sarbaazsoft@gmail.com>';

      // Update the transporter configuration with the dynamic sender address
      const transporter = nodemailer.createTransport(
        {
          host: 'smtp.gmail.com',
          port: 465,
          secure: true, // SSL
          auth: {
            user: cleanUser,
            pass: cleanPass,
          },
          from: mailFrom,
        } as any,
        {
          from: mailFrom,
        }
      );

      const info = await transporter.sendMail({
        from: mailFrom,
        to: recipients,
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
        replyTo: replyToAddress || mailFrom,
      });

      console.log(`[Gmail SMTP Email Sent] ID: ${info.messageId} | To: ${recipients.join(', ')} | From: ${mailFrom}`);
      return {
        delivered: true,
        provider: 'gmail',
        messageId: info.messageId,
      };
    } catch (err: any) {
      const sanitized = sanitizeError(err);
      console.warn(`[Gmail SMTP Transmission Error] Failed sending to ${recipients.join(', ')}:`, sanitized);

      if (webhookUrl && !opts.disableFallbackReroute) {
        console.warn('[Gmail SMTP] Retrying transmission via backup webhook...');
        const whResult = await sendViaWebhookFallback(webhookUrl, fromAddress, recipients, opts, replyToAddress);
        if (whResult.delivered) return whResult;
      }

      return {
        delivered: false,
        provider: 'gmail',
        error: `Gmail SMTP transmission error: ${sanitized}`,
      };
    }
  }

  // -------------------------------------------------------------------------
  // PROVIDER 2: RESEND SDK (HTTPS API)
  // -------------------------------------------------------------------------
  const apiKey = await getDynamicResendApiKey();

  if (!isValidResendApiKey(apiKey)) {
    const unconfiguredMsg = !apiKey
      ? 'Active email provider is set to Resend, but RESEND_API_KEY is not configured in SuperAdmin Settings.'
      : 'Active email provider is set to Resend, but RESEND_API_KEY format is invalid (must start with re_ and be >= 20 characters).';

    console.warn(`[Resend Warning] ${unconfiguredMsg}`);

    if (webhookUrl && !opts.disableFallbackReroute) {
      return await sendViaWebhookFallback(webhookUrl, fromAddress, recipients, opts, replyToAddress);
    }

    return {
      delivered: false,
      provider: 'resend',
      error: `${unconfiguredMsg} Please navigate to SuperAdmin Settings > Email Configuration > Resend tab to configure your credentials.`,
    };
  }

  try {
    const resend = new Resend(apiKey);

    // Verify sender domain in Resend if using a custom non-resend domain
    const senderDomain = parsedSender.email.split('@')[1]?.toLowerCase();
    if (senderDomain && senderDomain !== 'resend.dev' && !parsedSender.isPublicWebmail) {
      try {
        const domainsRes = await resend.domains.list();
        if (domainsRes && Array.isArray(domainsRes.data)) {
          const domainEntry = domainsRes.data.find(
            (d: any) => d.name?.toLowerCase() === senderDomain
          );
          if (!domainEntry || domainEntry.status !== 'verified') {
            console.warn(
              `[Resend Sender Domain Warning] Sender domain "${senderDomain}" is not verified in Resend (status: ${domainEntry?.status || 'unregistered'}). Proactively falling back to onboarding@resend.dev to ensure delivery.`
            );
            fromAddress = `${parsedSender.displayName} <onboarding@resend.dev>`;
          }
        }
      } catch (domainCheckErr) {
        console.warn('[Resend Domain Verification Notice] Could not query domain list from Resend API:', domainCheckErr);
      }
    }

    const payload: any = {
      from: fromAddress,
      to: recipients,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
      replyTo: replyToAddress,
      tags: opts.tags,
    };

    let { data, error } = await resend.emails.send(payload);

    // Automatic fallback: If custom domain fails domain verification on Resend, retry once via onboarding@resend.dev
    if (error) {
      console.warn('[Resend API Notice]: Initial send attempt returned notice:', error?.message || (error as any)?.name || error);
      const errorMsg = String(error.message || (error as any)?.name || error || '');
      const isSenderDomainError = /domain.*not.*verified|domain_not_found|cannot send from.*domain|invalid from address|verify a domain.*resend\.com\/domains.*change the `from` address|does not match any verified domain/i.test(errorMsg);

      if (isSenderDomainError && fromAddress !== `${parsedSender.displayName} <onboarding@resend.dev>`) {
        const fallbackFrom = `${parsedSender.displayName} <onboarding@resend.dev>`;
        console.warn(`[Resend Auto-Fallback] Sender domain failed verification (${errorMsg}). Retrying via ${fallbackFrom}...`);

        const retryPayload = {
          ...payload,
          from: fallbackFrom,
          replyTo: replyToAddress,
        };

        try {
          const retryResult = await resend.emails.send(retryPayload);
          if (!retryResult.error) {
            console.log(`[Resend Email Sent via Fallback] ID: ${retryResult.data?.id} | To: ${recipients.join(', ')} | From: ${fallbackFrom}`);
            return {
              delivered: true,
              provider: 'resend',
              messageId: retryResult.data?.id,
            };
          }
          console.warn('[Resend Auto-Fallback Notice]: Fallback attempt unsuccessful:', retryResult.error?.message || retryResult.error);
          error = retryResult.error;
        } catch (retryErr) {
          console.warn('[Resend Auto-Fallback Exception]:', retryErr);
          error = retryErr as any;
        }
      }

      const sanitized = sanitizeError(error?.message || error || 'Unknown email error');
      console.warn(`[Resend Direct Delivery Notice] Resend delivery notice for ${recipients.join(', ')}:`, sanitized);
      return {
        delivered: false,
        provider: 'resend',
        error: sanitized,
      };
    }

    console.log(`[Resend Email Sent] ID: ${data?.id} | To: ${recipients.join(', ')} | From: ${fromAddress}`);
    return {
      delivered: true,
      provider: 'resend',
      messageId: data?.id,
    };
  } catch (err: any) {
    const sanitized = sanitizeError(err);
    console.warn(`[Resend Notice in sendEmail] Delivery notice for ${recipients.join(', ')}:`, sanitized);
    return {
      delivered: false,
      provider: 'resend',
      error: sanitized,
    };
  }
}

// ---------------------------------------------------------------------------
// 1. Password Reset Email
// ---------------------------------------------------------------------------

export interface SendResetEmailOptions {
  to: string;
  userName?: string;
  storeName?: string;
  resetToken: string;
  resetLink: string;
  expiresAt: Date;
}

export interface SendResetEmailResult {
  delivered: boolean;
  provider: 'resend' | 'gmail' | 'webhook';
  messageId?: string;
  previewUrl?: string | null;
  error?: string;
  sandbox?: boolean;
  intendedRecipient?: string;
  sandboxRecipient?: string;
}

function buildResetEmailHtml(opts: SendResetEmailOptions): string {
  const displayStore = opts.storeName || 'SarbaazSoft Shoe POS';
  const displayName = opts.userName || opts.to;
  const shortCode = opts.resetToken.toUpperCase();

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Password Reset — ${displayStore}</title>
</head>
<body style="margin:0;padding:0;background-color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#0f172a;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:540px;background-color:#1e293b;border:1px solid #334155;border-radius:16px;overflow:hidden;box-shadow:0 20px 25px -5px rgba(0,0,0,0.4);">
          <tr>
            <td style="background:linear-gradient(135deg,#7c3aed 0%,#4f46e5 100%);padding:28px 32px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:800;letter-spacing:-0.02em;">
                ${displayStore}
              </h1>
              <p style="margin:6px 0 0;color:#e0e7ff;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;">
                Password Reset Verification
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;color:#e2e8f0;font-size:14px;line-height:1.6;">
              <p style="margin:0 0 16px;">Hello <strong style="color:#ffffff;">${displayName}</strong>,</p>
              <p style="margin:0 0 20px;color:#cbd5e1;">
                We received a request to reset the password for your account (<strong style="color:#ffffff;">${opts.to}</strong>). Click the button below to choose a new password, or copy and paste your verification reset token into the terminal sign-in screen.
              </p>

              <div style="text-align:center;margin:28px 0;">
                <a href="${opts.resetLink}" style="display:inline-block;padding:13px 28px;background:linear-gradient(135deg,#7c3aed 0%,#4f46e5 100%);color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;border-radius:10px;">
                  Reset Password Now
                </a>
              </div>

              <div style="background-color:#0f172a;border:1px solid #475569;border-radius:12px;padding:16px;margin:24px 0;text-align:center;">
                <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">
                  Verification Reset Token
                </div>
                <div style="font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:14px;font-weight:800;color:#c4b5fd;word-break:break-all;letter-spacing:0.04em;">
                  ${shortCode}
                </div>
              </div>

              <p style="margin:0 0 8px;font-size:12px;color:#94a3b8;">
                Or open this reset link directly in your browser:
              </p>
              <p style="margin:0 0 20px;font-size:12px;word-break:break-all;">
                <a href="${opts.resetLink}" style="color:#a78bfa;text-decoration:underline;">${opts.resetLink}</a>
              </p>

              <p style="margin:0;font-size:12px;color:#64748b;border-top:1px solid #334155;padding-top:16px;">
                This password reset token expires in 60 minutes (${opts.expiresAt.toUTCString()}). If you did not request a password reset, you can safely ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

function buildResetEmailText(opts: SendResetEmailOptions): string {
  const displayStore = opts.storeName || 'SarbaazSoft Shoe POS';
  const displayName = opts.userName || opts.to;
  return [
    `Password Reset Request — ${displayStore}`,
    ``,
    `Hello ${displayName},`,
    ``,
    `We received a request to reset the password for your account (${opts.to}).`,
    ``,
    `1. Reset Link:`,
    opts.resetLink,
    ``,
    `2. Verification Reset Token:`,
    opts.resetToken,
    ``,
    `This token expires at ${opts.expiresAt.toUTCString()}.`,
  ].join('\n');
}

export async function sendPasswordResetEmail(
  opts: SendResetEmailOptions
): Promise<SendResetEmailResult> {
  try {
    const subject = `Password Reset Token & Link — ${opts.storeName || 'SarbaazSoft Shoe POS'}`;
    const html = buildResetEmailHtml(opts);
    const text = buildResetEmailText(opts);

    return await sendEmail({
      to: opts.to,
      subject,
      html,
      text,
      tags: [{ name: 'category', value: 'password_reset' }],
    });
  } catch (err: any) {
    console.warn(`[sendPasswordResetEmail Notice] Could not send reset email to ${opts.to}:`, err?.message || err);
    return {
      delivered: false,
      provider: 'resend',
      error: err?.message || String(err),
    };
  }
}

// ---------------------------------------------------------------------------
// 2. Store Owner Welcome Email
// ---------------------------------------------------------------------------

export interface SendWelcomeEmailOptions {
  to: string;
  ownerName?: string;
  storeName: string;
  welcomeMessage: string;
  loginUrl: string;
  storeUrl?: string;
  portalUrl?: string;
}

export interface SendWelcomeEmailResult {
  delivered: boolean;
  provider: 'resend' | 'gmail' | 'webhook';
  messageId?: string;
  previewUrl?: string | null;
  error?: string;
  sandbox?: boolean;
  intendedRecipient?: string;
  sandboxRecipient?: string;
}

function buildWelcomeEmailHtml(opts: SendWelcomeEmailOptions): string {
  const displayName = opts.ownerName || opts.to;
  const storeUrl = opts.storeUrl || opts.loginUrl;
  const portalUrl = opts.portalUrl || opts.loginUrl;

  // Convert raw URLs into clickable styled links and replace newlines with line breaks
  const formattedMessage = opts.welcomeMessage
    .replace(/(https?:\/\/[^\s<>"{}|\\^`[\]]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer" style="color:#60a5fa;text-decoration:underline;font-weight:600;">$1</a>')
    .replace(/\n/g, '<br/>');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Welcome to ${opts.storeName}</title>
</head>
<body style="margin:0;padding:0;background-color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#0f172a;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:560px;background-color:#1e293b;border:1px solid #334155;border-radius:16px;overflow:hidden;box-shadow:0 20px 25px -5px rgba(0,0,0,0.4);">
          <tr>
            <td style="background:linear-gradient(135deg,#2563eb 0%,#7c3aed 100%);padding:32px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:800;letter-spacing:-0.02em;">
                ${opts.storeName}
              </h1>
              <p style="margin:6px 0 0;color:#dbeafe;font-size:13px;font-weight:600;letter-spacing:0.04em;">
                Store Onboarding &amp; Workspace Ready
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;color:#e2e8f0;font-size:14px;line-height:1.6;">
              <p style="margin:0 0 16px;">Hello <strong style="color:#ffffff;">${displayName}</strong>,</p>
              <div style="margin:0 0 20px;color:#cbd5e1;line-height:1.7;">
                ${formattedMessage}
              </div>

              <div style="text-align:center;margin:28px 0;">
                <a href="${storeUrl || portalUrl}" style="display:inline-block;padding:13px 28px;background:linear-gradient(135deg,#2563eb 0%,#7c3aed 100%);color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;border-radius:10px;">
                  Open Store Workspace
                </a>
              </div>

              <div style="background-color:#0f172a;border:1px solid #334155;border-radius:12px;padding:16px;margin:24px 0;">
                <div style="font-size:12px;font-weight:700;color:#94a3b8;margin-bottom:8px;">Workspace Details:</div>
                <div style="font-size:13px;color:#cbd5e1;line-height:1.8;">
                  • <strong>Store:</strong> ${opts.storeName}<br/>
                  • <strong>Account Email:</strong> ${opts.to}<br/>
                  • <strong>Store Link:</strong> <a href="${storeUrl}" target="_blank" rel="noopener noreferrer" style="color:#60a5fa;text-decoration:underline;word-break:break-all;">${storeUrl}</a><br/>
                  • <strong>Direct Portal Link:</strong> <a href="${portalUrl}" target="_blank" rel="noopener noreferrer" style="color:#60a5fa;text-decoration:underline;word-break:break-all;">${portalUrl}</a>
                </div>
              </div>

              <p style="margin:0;font-size:12px;color:#64748b;border-top:1px solid #334155;padding-top:16px;">
                Powered by SarbaazSoft Shoe POS. For assistance or questions, contact platform support.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

export async function sendWelcomeEmail(
  opts: SendWelcomeEmailOptions
): Promise<SendWelcomeEmailResult> {
  try {
    const storeUrl = opts.storeUrl || opts.loginUrl;
    const portalUrl = opts.portalUrl || opts.loginUrl;
    const subject = `Welcome to ${opts.storeName} — Your Store Workspace is Ready`;
    const html = buildWelcomeEmailHtml(opts);
    const text = `Welcome to ${opts.storeName}!\n\nHello ${opts.ownerName || opts.to},\n\n${opts.welcomeMessage}\n\n• Store Link: ${storeUrl}\n• Direct Portal Link: ${portalUrl}\n\nAccess your workspace at: ${portalUrl}`;

    return await sendEmail({
      to: opts.to,
      subject,
      html,
      text,
      tags: [{ name: 'category', value: 'store_welcome' }],
    });
  } catch (err: any) {
    console.warn(`[sendWelcomeEmail Notice] Could not send welcome email to ${opts.to}:`, err?.message || err);
    return {
      delivered: false,
      provider: 'resend',
      error: err?.message || String(err),
    };
  }
}

// ---------------------------------------------------------------------------
// 3. Staff Account Welcome / Invitation Email
// ---------------------------------------------------------------------------

export interface SendStaffWelcomeEmailOptions {
  to: string;
  staffName: string;
  role: string;
  storeName: string;
  loginEmail: string;
  initialPassword?: string;
  loginUrl: string;
  terminalUrl?: string;
}

export interface SendStaffWelcomeEmailResult {
  delivered: boolean;
  provider: 'resend' | 'gmail' | 'webhook';
  messageId?: string;
  previewUrl?: string | null;
  error?: string;
  sandbox?: boolean;
  intendedRecipient?: string;
  sandboxRecipient?: string;
}

function buildStaffWelcomeEmailHtml(opts: SendStaffWelcomeEmailOptions): string {
  const roleLabel = opts.role === 'CASHIER' ? 'Cashier / Counter Staff' : 'Store Administrator';
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Staff Account Invitation — ${opts.storeName}</title>
</head>
<body style="margin:0;padding:0;background-color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#0f172a;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:560px;background-color:#1e293b;border:1px solid #334155;border-radius:16px;overflow:hidden;box-shadow:0 20px 25px -5px rgba(0,0,0,0.4);">
          <tr>
            <td style="background:linear-gradient(135deg,#059669 0%,#2563eb 100%);padding:28px 32px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:800;letter-spacing:-0.02em;">
                ${opts.storeName}
              </h1>
              <p style="margin:6px 0 0;color:#d1fae5;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;">
                New Staff Account Created
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;color:#e2e8f0;font-size:14px;line-height:1.6;">
              <p style="margin:0 0 16px;">Hello <strong style="color:#ffffff;">${opts.staffName}</strong>,</p>
              <p style="margin:0 0 20px;color:#cbd5e1;">
                Your staff account has been set up at <strong>${opts.storeName}</strong> as a <strong>${roleLabel}</strong>. Use your credentials below to sign in.
              </p>

              <div style="background-color:#0f172a;border:1px solid #334155;border-radius:12px;padding:16px;margin:20px 0;">
                <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">Account Credentials:</div>
                <div style="font-size:13px;color:#cbd5e1;line-height:1.8;">
                  • <strong>Role:</strong> ${roleLabel}<br/>
                  • <strong>Login Email:</strong> <span style="font-family:monospace;color:#6ee7b7;">${opts.loginEmail}</span><br/>
                  ${opts.initialPassword ? `• <strong>Temporary Password:</strong> <span style="font-family:monospace;color:#93c5fd;">${opts.initialPassword}</span><br/>` : ''}
                </div>
              </div>

              <div style="text-align:center;margin:28px 0;">
                <a href="${opts.terminalUrl || opts.loginUrl}" style="display:inline-block;padding:13px 28px;background:linear-gradient(135deg,#059669 0%,#2563eb 100%);color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;border-radius:10px;">
                  Sign In to POS
                </a>
              </div>

              <p style="margin:0;font-size:12px;color:#64748b;border-top:1px solid #334155;padding-top:16px;">
                Security Notice: Please update your password after your initial login from the User Profile modal.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

export async function sendStaffWelcomeEmail(
  opts: SendStaffWelcomeEmailOptions
): Promise<SendStaffWelcomeEmailResult> {
  try {
    const subject = `Your Staff Account at ${opts.storeName} is Ready`;
    const html = buildStaffWelcomeEmailHtml(opts);
    const text = `Staff Account Created — ${opts.storeName}\n\nHello ${opts.staffName},\n\nYou have been assigned the role: ${opts.role}.\nLogin Email: ${opts.loginEmail}\n${opts.initialPassword ? `Temporary Password: ${opts.initialPassword}\n` : ''}Sign in at: ${opts.loginUrl}`;

    return await sendEmail({
      to: opts.to,
      subject,
      html,
      text,
      tags: [{ name: 'category', value: 'staff_invitation' }],
    });
  } catch (err: any) {
    console.warn(`[sendStaffWelcomeEmail Notice] Could not send staff welcome email to ${opts.to}:`, err?.message || err);
    return {
      delivered: false,
      provider: 'resend',
      error: err?.message || String(err),
    };
  }
}

// ---------------------------------------------------------------------------
// 4. Free Trial Email Verification & Activation Email
// ---------------------------------------------------------------------------

export interface SendTrialActivationEmailOptions {
  to: string;
  userName?: string;
  storeName?: string;
  activationToken: string;
  activationLink: string;
  expiresAt: Date;
}

export async function sendTrialActivationEmail(
  opts: SendTrialActivationEmailOptions
): Promise<SendEmailResult> {
  try {
    const store = opts.storeName || 'SarbaazSoft Shoe POS';
    const name = opts.userName || opts.to;
    const subject = `Activate your Free Trial Store — ${store}`;
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Activate Your Free Trial Account</title>
</head>
<body style="margin:0;padding:0;background-color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#0f172a;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:560px;background-color:#1e293b;border:1px solid #334155;border-radius:16px;overflow:hidden;box-shadow:0 20px 25px -5px rgba(0,0,0,0.4);">
          <tr>
            <td style="background:linear-gradient(135deg,#7e22ce 0%,#2563eb 100%);padding:28px 32px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:800;">SarbaazSoft Shoe POS</h1>
              <p style="margin:6px 0 0;color:#e9d5ff;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;">
                Free Trial Email Verification
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h2 style="margin:0 0 12px;color:#f8fafc;font-size:18px;">Hello, ${name}!</h2>
              <p style="margin:0 0 20px;color:#94a3b8;font-size:14px;line-height:1.6;">
                Thank you for signing up for a 30-day free trial on <strong>${store}</strong>. Please verify your email address to activate your account and start using your Point of Sale terminal.
              </p>
              <div style="text-align:center;margin:28px 0;">
                <a href="${opts.activationLink}" style="display:inline-block;background:linear-gradient(135deg,#9333ea 0%,#4f46e5 100%);color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:14px 32px;border-radius:12px;box-shadow:0 4px 14px rgba(147,51,234,0.4);">
                  Activate Free Trial Account
                </a>
              </div>
              <div style="background-color:#0f172a;border:1px solid #334155;border-radius:10px;padding:14px 16px;margin:24px 0;">
                <p style="margin:0 0 6px;color:#cbd5e1;font-size:11px;font-weight:600;text-transform:uppercase;">
                  Instant Activation Token:
                </p>
                <code style="color:#a855f7;font-family:monospace;font-size:13px;word-break:break-all;">
                  ${opts.activationToken}
                </code>
              </div>
              <p style="margin:0;color:#64748b;font-size:12px;">
                This link expires in 24 hours. If you did not create this account, you can safely ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

    const text = `Hello ${name}!\n\nPlease activate your free trial account on ${store} by opening the following link:\n\n${opts.activationLink}\n\nActivation Token: ${opts.activationToken}\n\nExpires in 24 hours.`;

    return await sendEmail({
      to: opts.to,
      subject,
      html,
      text,
      tags: [{ name: 'category', value: 'free_trial_activation' }],
    });
  } catch (err: any) {
    console.warn(`[sendTrialActivationEmail Notice] Could not send activation email to ${opts.to}:`, err?.message || err);
    return {
      delivered: false,
      provider: 'resend',
      error: err?.message || String(err),
    };
  }
}

// ---------------------------------------------------------------------------
// 5. Test Email Configuration Utility
// ---------------------------------------------------------------------------

export interface TestEmailDiagnostics {
  success: boolean;
  delivered: boolean;
  provider: 'resend' | 'gmail' | 'webhook';
  messageId?: string;
  from: string;
  to: string;
  error?: string;
  info?: string;
  sandbox?: boolean;
  sandboxRecipient?: string;
}

export async function testEmailConfiguration(testRecipient?: string): Promise<TestEmailDiagnostics> {
  const activeProvider = await getActiveEmailProvider();
  let resendFrom = '';
  let resendFromEmail = '';

  try {
    const res = await pgClient.query<{ key: string; value: string }>(
      "SELECT key, value FROM public.app_settings WHERE key IN ('RESEND_FROM', 'RESEND_FROM_EMAIL')"
    );
    for (const row of res.rows) {
      if (row.key === 'RESEND_FROM' && row.value?.trim()) {
        resendFrom = row.value.trim();
      } else if (row.key === 'RESEND_FROM_EMAIL' && row.value?.trim()) {
        resendFromEmail = row.value.trim();
      }
    }
  } catch (dbErr) {
    console.error('[testEmailConfiguration] Error querying app_settings table for sender email:', dbErr);
    resendFrom = (getCachedAppSetting('RESEND_FROM') || '').trim();
    resendFromEmail = (getCachedAppSetting('RESEND_FROM_EMAIL') || '').trim();
  }

  // Cross-fallback between RESEND_FROM and RESEND_FROM_EMAIL
  if (!resendFrom && resendFromEmail) {
    resendFrom = `SarbaazSoft Shoe POS Security <${resendFromEmail}>`;
  }
  if (!resendFrom) {
    resendFrom = (process.env.RESEND_FROM || process.env.RESEND_FROM_EMAIL || DEFAULT_FROM_ADDRESS).trim();
  }

  const rawFromCandidate = (resendFrom || DEFAULT_FROM_ADDRESS).trim();
  const parsedSender = parseSenderAddress(rawFromCandidate);
  const targetRecipient = (testRecipient || '').trim().toLowerCase();

  const providerLabel = activeProvider === 'gmail' ? 'Gmail SMTP' : 'Resend';
  const gmailCreds = activeProvider === 'gmail' ? await getDynamicGmailCredentials() : null;
  const activeFromDisplay = activeProvider === 'gmail'
    ? `"${gmailCreds?.fromName || 'superadmin'}" <${gmailCreds?.user || 'sarbaazsoft@gmail.com'}>`
    : parsedSender.resendFrom;
  const activeReplyTo = activeProvider === 'gmail'
    ? `"${gmailCreds?.fromName || 'superadmin'}" <${gmailCreds?.user || 'sarbaazsoft@gmail.com'}>`
    : parsedSender.replyTo;

  if (!targetRecipient || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(targetRecipient)) {
    return {
      success: false,
      delivered: false,
      provider: activeProvider,
      from: activeFromDisplay,
      to: targetRecipient,
      error: 'A valid recipient email address is required to dispatch the test email.',
      info: 'Recipient email address is required.',
      sandbox: false,
    };
  }

  const timestamp = new Date().toLocaleString();
  const subject = `Test Delivery via ${providerLabel} — SarbaazSoft Shoe POS (${timestamp})`;
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><title>${providerLabel} Test Email</title></head>
<body style="font-family:sans-serif;background-color:#0f172a;color:#f8fafc;padding:32px 16px;">
  <div style="max-width:520px;margin:0 auto;background:#1e293b;border-radius:12px;padding:24px;border:1px solid #334155;">
    <h2 style="color:#38bdf8;margin-top:0;">SarbaazSoft Shoe POS ${providerLabel} Test</h2>
    <p>This is a live test email confirming that your <strong>${providerLabel}</strong> transactional email integration is operational.</p>
    <div style="background:#0f172a;padding:12px;border-radius:8px;font-family:monospace;font-size:13px;line-height:1.6;margin:16px 0;">
      <div><strong>Active Provider:</strong> ${providerLabel}</div>
      <div><strong>Sender (From):</strong> ${activeFromDisplay}</div>
      <div><strong>Recipient (To):</strong> ${targetRecipient}</div>
      <div><strong>Reply-To:</strong> ${activeReplyTo}</div>
      <div><strong>Timestamp:</strong> ${timestamp}</div>
    </div>
    <p style="color:#94a3b8;font-size:12px;">If you received this message, password reset tokens and store onboarding notifications will deliver successfully to ${targetRecipient}.</p>
  </div>
</body>
</html>
  `.trim();

  try {
    const result = await sendEmail({
      to: targetRecipient,
      subject,
      html,
      text: `SarbaazSoft Shoe POS ${providerLabel} Test Email\n\nSent to: ${targetRecipient}\nProvider: ${providerLabel}\nFrom: ${activeFromDisplay}\nTimestamp: ${timestamp}`,
      disableFallbackReroute: true,
    });

    const infoMsg = result.delivered
      ? `Test email delivered successfully to ${targetRecipient} via ${result.provider.toUpperCase()} (ID: ${result.messageId || 'ok'}).`
      : `Test email delivery to ${targetRecipient} failed: ${result.error || 'Unknown error'}`;

    if (!result.delivered) {
      console.warn(`[testEmailConfiguration] Test email delivery notice for ${targetRecipient}:`, result.error);
    }

    return {
      success: result.delivered,
      delivered: result.delivered,
      provider: result.provider,
      messageId: result.messageId,
      from: parsedSender.resendFrom,
      to: targetRecipient,
      error: result.error,
      info: infoMsg,
      sandbox: false,
    };
  } catch (err: any) {
    console.warn(`[testEmailConfiguration Notice] Could not send test email to ${targetRecipient}:`, err?.message || err);
    return {
      success: false,
      delivered: false,
      provider: activeProvider,
      from: parsedSender.resendFrom,
      to: targetRecipient,
      error: err?.message || String(err),
      info: `Test email notice: ${err?.message || String(err)}`,
    };
  }
}

// Backward-compatible export alias for testResendConfiguration
export const testResendConfiguration = testEmailConfiguration;
