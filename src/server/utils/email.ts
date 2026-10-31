// Centralized transactional email service powered exclusively by the Resend SDK
import { Resend } from 'resend';
import { getAllAppSettings } from '../services/appSettingsService.ts';

export const DEFAULT_FROM_ADDRESS = 'SarbaazSoft Shoe POS <noreply@sarbaazsoft.com>';

export function isValidResendApiKey(key?: string | null): boolean {
  const clean = (key || '').trim();
  if (!clean) return false;
  return clean.startsWith('re_') && clean.length >= 20;
}

export function sanitizeError(err: unknown): string {
  if (!err) return 'An unknown error occurred during email transmission.';
  const str = typeof err === 'string' ? err : (err as any)?.message || String(err);
  return str
    .replace(/re_[A-Za-z0-9_]+/g, '[REDACTED_API_KEY]')
    .replace(/Bearer\s+[A-Za-z0-9_.-]+/gi, 'Bearer [REDACTED_TOKEN]');
}

export function resolveSenderAddress(
  customFrom?: string,
  settings?: Record<string, string>
): string {
  const fromCandidate = (
    customFrom ||
    process.env.RESEND_FROM ||
    settings?.RESEND_FROM ||
    ''
  ).trim();

  if (!fromCandidate) {
    return DEFAULT_FROM_ADDRESS;
  }

  // Resend requires a verified domain or onboarding@resend.dev; free/public webmails cannot be sender
  if (/@(gmail|yahoo|hotmail|outlook|ethereal)\./i.test(fromCandidate)) {
    return DEFAULT_FROM_ADDRESS;
  }

  // If provided as plain email (e.g. noreply@sarbaazsoft.com), wrap with friendly brand title
  if (!fromCandidate.includes('<') && fromCandidate.includes('@')) {
    return `SarbaazSoft Shoe POS <${fromCandidate}>`;
  }

  return fromCandidate;
}

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string | string[];
  tags?: { name: string; value: string }[];
}

export interface SendEmailResult {
  delivered: boolean;
  provider: 'resend' | 'webhook';
  messageId?: string;
  previewUrl?: string | null;
  error?: string;
}

export async function sendEmail(opts: SendEmailOptions): Promise<SendEmailResult> {
  const settings = (await getAllAppSettings().catch(() => ({ byKey: {} as Record<string, string> }))).byKey;
  const apiKey = (process.env.RESEND_API_KEY || settings.RESEND_API_KEY || '').trim();
  const fromAddress = resolveSenderAddress(opts.from, settings);
  const recipients = Array.isArray(opts.to) ? opts.to : [opts.to];

  // 1. Send via Resend SDK when API key is provided
  if (isValidResendApiKey(apiKey)) {
    try {
      const resend = new Resend(apiKey);
      const { data, error } = await resend.emails.send({
        from: fromAddress,
        to: recipients,
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
        replyTo: opts.replyTo,
        tags: opts.tags,
      });

      if (error) {
        const sanitized = sanitizeError(error.message || error);
        console.error(`[Resend API Error] Failed to send email to ${recipients.join(', ')}: ${sanitized}`);
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
      console.error(`[Resend Exception] Error sending to ${recipients.join(', ')}: ${sanitized}`);
      return {
        delivered: false,
        provider: 'resend',
        error: sanitized,
      };
    }
  }

  // 2. Optional secondary webhook dispatcher if configured
  const webhookUrl = (
    process.env.EMAIL_WEBHOOK_URL ||
    settings.EMAIL_WEBHOOK_URL ||
    settings.RESEND_WEBHOOK_URL ||
    ''
  ).trim();

  if (webhookUrl) {
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
        }),
      });

      if (resp.ok) {
        return {
          delivered: true,
          provider: 'webhook',
        };
      }
    } catch (hookErr: any) {
      console.warn('[Email Webhook Warning] Delivery failed:', sanitizeError(hookErr));
    }
  }

  const unconfiguredMsg = 'Email delivery unavailable: RESEND_API_KEY is not configured or is invalid.';
  console.warn(`[Resend] ${unconfiguredMsg}`);
  return {
    delivered: false,
    provider: 'resend',
    error: unconfiguredMsg,
  };
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
  provider: 'resend' | 'webhook';
  messageId?: string;
  previewUrl?: string | null;
  error?: string;
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
  const subject = `Password Reset Token & Link — ${opts.storeName || 'SarbaazSoft Shoe POS'}`;
  const html = buildResetEmailHtml(opts);
  const text = buildResetEmailText(opts);

  return sendEmail({
    to: opts.to,
    subject,
    html,
    text,
    tags: [{ name: 'category', value: 'password_reset' }],
  });
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
}

export interface SendWelcomeEmailResult {
  delivered: boolean;
  provider: 'resend' | 'webhook';
  messageId?: string;
  previewUrl?: string | null;
  error?: string;
}

function buildWelcomeEmailHtml(opts: SendWelcomeEmailOptions): string {
  const displayName = opts.ownerName || opts.to;
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
              <p style="margin:0 0 20px;color:#cbd5e1;">
                ${opts.welcomeMessage}
              </p>

              <div style="text-align:center;margin:28px 0;">
                <a href="${opts.loginUrl}" style="display:inline-block;padding:13px 28px;background:linear-gradient(135deg,#2563eb 0%,#7c3aed 100%);color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;border-radius:10px;">
                  Open Store Workspace
                </a>
              </div>

              <div style="background-color:#0f172a;border:1px solid #334155;border-radius:12px;padding:16px;margin:24px 0;">
                <div style="font-size:12px;font-weight:700;color:#94a3b8;margin-bottom:8px;">Workspace Details:</div>
                <div style="font-size:13px;color:#cbd5e1;line-height:1.6;">
                  • <strong>Store:</strong> ${opts.storeName}<br/>
                  • <strong>Account Email:</strong> ${opts.to}<br/>
                  • <strong>Direct Portal:</strong> <a href="${opts.loginUrl}" style="color:#60a5fa;text-decoration:underline;">${opts.loginUrl}</a>
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
  const subject = `Welcome to ${opts.storeName} — Your Store Workspace is Ready`;
  const html = buildWelcomeEmailHtml(opts);
  const text = `Welcome to ${opts.storeName}!\n\nHello ${opts.ownerName || opts.to},\n\n${opts.welcomeMessage}\n\nAccess your workspace at: ${opts.loginUrl}`;

  return sendEmail({
    to: opts.to,
    subject,
    html,
    text,
    tags: [{ name: 'category', value: 'store_welcome' }],
  });
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
  provider: 'resend' | 'webhook';
  messageId?: string;
  previewUrl?: string | null;
  error?: string;
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
  const subject = `Your Staff Account at ${opts.storeName} is Ready`;
  const html = buildStaffWelcomeEmailHtml(opts);
  const text = `Staff Account Created — ${opts.storeName}\n\nHello ${opts.staffName},\n\nYou have been assigned the role: ${opts.role}.\nLogin Email: ${opts.loginEmail}\n${opts.initialPassword ? `Temporary Password: ${opts.initialPassword}\n` : ''}Sign in at: ${opts.loginUrl}`;

  return sendEmail({
    to: opts.to,
    subject,
    html,
    text,
    tags: [{ name: 'category', value: 'staff_invitation' }],
  });
}
