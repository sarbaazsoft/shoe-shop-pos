import nodemailer from 'nodemailer';
import { getAllAppSettings } from './services/appSettingsService.ts';

function isValidResendApiKey(key: string): boolean {
  const clean = (key || '').trim();
  if (!clean) return false;
  return clean.startsWith('re_') && clean.length >= 24;
}

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
  provider: 'smtp' | 'resend' | 'webhook' | 'ethereal' | 'fallback';
  messageId?: string;
  previewUrl?: string | null;
  error?: string;
}

let cachedEtherealAccount: { user: string; pass: string; smtp: { host: string; port: number; secure: boolean } } | null = null;

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
                Or open this reset link in your browser:
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
  return [
    `${displayStore} — Password Reset Request`,
    ``,
    `Hello ${opts.userName || opts.to},`,
    ``,
    `A password reset was requested for your account (${opts.to}).`,
    ``,
    `1. Reset Password Link:`,
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
  const settings = (await getAllAppSettings()).byKey;
  const configuredFrom = (settings.SMTP_FROM || settings.SMTP_USER || settings.GMAIL_USER || '').trim();
  const fromAddress = configuredFrom || '"SarbaazSoft Shoe POS Security" <no-reply@sarbaazsoft.com>';
  const subject = `Password Reset Token & Link — ${opts.storeName || 'SarbaazSoft Shoe POS'}`;
  const html = buildResetEmailHtml(opts);
  const text = buildResetEmailText(opts);

  // 1. Real SMTP / Gmail Transport (runs first when non-Ethereal SMTP or GMAIL_USER + GMAIL_APP_PASSWORD is provided)
  const smtpHost = (settings.SMTP_HOST || (settings.GMAIL_USER ? 'smtp.gmail.com' : '')).trim();
  const smtpUser = (settings.SMTP_USER || settings.GMAIL_USER || '').trim();
  const rawSmtpPass = (settings.SMTP_PASS || settings.GMAIL_APP_PASSWORD || '').trim();
  const isGmailHost = /gmail\.com/i.test(smtpHost) || /@gmail\.com$/i.test(smtpUser);
  // Google 16-character App Passwords are often copied with spaces ("xxxx xxxx xxxx xxxx"); strip spaces for Gmail
  const smtpPass = isGmailHost ? rawSmtpPass.replace(/\s+/g, '') : rawSmtpPass;
  const smtpPort = Number(settings.SMTP_PORT || 587);
  const smtpSecure =
    String(settings.SMTP_SECURE || '').toLowerCase() === 'true' || smtpPort === 465;
  const isEtherealHost = /ethereal\.email/i.test(smtpHost) || /ethereal\.email/i.test(smtpUser);

  if (smtpHost && smtpUser && smtpPass && !isEtherealHost) {
    try {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure,
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });

      const info = await transporter.sendMail({
        from: isGmailHost ? `"ShoePOS Security" <${smtpUser}>` : fromAddress,
        to: opts.to,
        subject,
        text,
        html,
      });

      return {
        delivered: true,
        provider: 'smtp',
        messageId: info.messageId,
      };
    } catch (smtpErr: any) {
      console.warn('SMTP/Gmail send warning, falling back to Resend/secondary transport:', smtpErr?.message || smtpErr);
    }
  }

  // 2. Resend API Transport (delivers directly over HTTPS)
  const resendApiKey = (settings.RESEND_API_KEY || '').trim();
  if (isValidResendApiKey(resendApiKey)) {
    // Resend requires a verified custom domain or onboarding@resend.dev (cannot send from @gmail.com/@yahoo.com/@ethereal.email)
    const customResendFrom = (settings.RESEND_FROM || '').trim();
    const isCustomDomainFrom =
      customResendFrom &&
      !/@(gmail|yahoo|hotmail|outlook|ethereal)\./i.test(customResendFrom);
    const resendFrom = isCustomDomainFrom
      ? customResendFrom
      : 'SarbaazSoft Shoe POS Security <onboarding@resend.dev>';

    try {
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: resendFrom,
          to: [opts.to],
          subject,
          html,
          text,
        }),
      });

      if (resp.ok) {
        const data = (await resp.json().catch(() => ({}))) as any;
        return {
          delivered: true,
          provider: 'resend',
          messageId: data?.id,
        };
      }

      if (resp.status === 401 || resp.status === 403) {
        // Invalid Resend credentials: skip Resend and allow the configured secondary transport.
      } else {
        // If Resend is in sandbox/testing mode and opts.to is a store demo email (e.g. admin@store.com),
        // forward the reset email to the verified owner inbox (settings.SMTP_FROM, e.g. sarbaazsoft@gmail.com)
        const fallbackOwnerEmail =
          configuredFrom && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(configuredFrom)
            ? configuredFrom
            : '';

        if (
          fallbackOwnerEmail &&
          fallbackOwnerEmail.toLowerCase() !== opts.to.toLowerCase()
        ) {
          const forwardResp = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${resendApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: resendFrom,
              to: [fallbackOwnerEmail],
              subject: `${subject} (Account: ${opts.to})`,
              html,
              text,
            }),
          });
          if (forwardResp.ok) {
            const forwardData = (await forwardResp.json().catch(() => ({}))) as any;
            return {
              delivered: true,
              provider: 'resend',
              messageId: forwardData?.id,
            };
          }
        }
      }
    } catch {
      // Gracefully fall through to Webhook or Ethereal test inbox
    }
  }

  // 3. Check if custom EMAIL_WEBHOOK_URL is configured
  const webhookUrl = (settings.EMAIL_WEBHOOK_URL || settings.RESEND_WEBHOOK_URL || '').trim();
  if (webhookUrl) {
    try {
      const resp = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: opts.to,
          subject,
          html,
          text,
          resetToken: opts.resetToken,
          resetLink: opts.resetLink,
          expiresAt: opts.expiresAt.toISOString(),
        }),
      });
      if (resp.ok) {
        return {
          delivered: true,
          provider: 'webhook',
        };
      }
    } catch {}
  }

  // 4. Automatic Ethereal SMTP test inbox delivery so emails can be inspected via webmail preview URL
  try {
    const etherealAuth =
      isEtherealHost && smtpHost && smtpUser && smtpPass
        ? {
            host: smtpHost,
            port: smtpPort,
            secure: smtpSecure,
            user: smtpUser,
            pass: smtpPass,
          }
        : null;

    if (!etherealAuth && !cachedEtherealAccount) {
      cachedEtherealAccount = await nodemailer.createTestAccount();
    }

    const activeEthereal = etherealAuth || {
      host: cachedEtherealAccount!.smtp.host,
      port: cachedEtherealAccount!.smtp.port,
      secure: cachedEtherealAccount!.smtp.secure,
      user: cachedEtherealAccount!.user,
      pass: cachedEtherealAccount!.pass,
    };

    const testTransporter = nodemailer.createTransport({
      host: activeEthereal.host,
      port: activeEthereal.port,
      secure: activeEthereal.secure,
      auth: {
        user: activeEthereal.user,
        pass: activeEthereal.pass,
      },
    });

    const info = await testTransporter.sendMail({
      from: '"SarbaazSoft Shoe POS Security" <no-reply@sarbaazsoft.com>',
      to: opts.to,
      subject,
      text,
      html,
    });

    const previewUrl = nodemailer.getTestMessageUrl(info) || null;
    return {
      delivered: true,
      provider: 'ethereal',
      messageId: info.messageId,
      previewUrl: typeof previewUrl === 'string' ? previewUrl : null,
    };
  } catch (ethErr: any) {
    return {
      delivered: false,
      provider: 'fallback',
      error: ethErr?.message || 'SMTP not configured',
    };
  }
}

export interface SendWelcomeEmailOptions {
  to: string;
  userName?: string;
  ownerName?: string;
  storeName?: string;
  welcomeMessage: string;
  loginUrl?: string;
}

export interface SendWelcomeEmailResult {
  delivered: boolean;
  provider: 'smtp' | 'resend' | 'webhook' | 'ethereal' | 'fallback';
  messageId?: string;
  previewUrl?: string | null;
  error?: string;
}

function buildWelcomeEmailHtml(opts: SendWelcomeEmailOptions): string {
  const displayStore = opts.storeName || 'SarbaazSoft Shoe POS';
  const displayName = opts.ownerName || opts.userName || opts.to;
  const loginUrl = opts.loginUrl || '/';
  const cleanMessage = opts.welcomeMessage
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Welcome to SarbaazSoft Shoe POS, ${displayStore}!</title>
</head>
<body style="margin:0;padding:0;background-color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#0f172a;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:540px;background-color:#1e293b;border:1px solid #334155;border-radius:16px;overflow:hidden;box-shadow:0 20px 25px -5px rgba(0,0,0,0.4);">
          <tr>
            <td style="background:linear-gradient(135deg,#7c3aed 0%,#4f46e5 100%);padding:28px 32px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:800;letter-spacing:-0.02em;">
                Welcome to SarbaazSoft Shoe POS, ${displayStore}!
              </h1>
              <p style="margin:6px 0 0;color:#e0e7ff;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;">
                Footwear Retail Platform
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;color:#e2e8f0;font-size:14px;line-height:1.6;">
              <p style="margin:0 0 16px;">Hello <strong style="color:#ffffff;">${displayName}</strong>,</p>
              <p style="margin:0 0 20px;color:#cbd5e1;">
                Thank you for choosing SarbaazSoft to power your footwear business. We are thrilled to partner with <strong style="color:#ffffff;">${displayStore}</strong> and help you streamline your inventory, accelerate counter checkouts, and scale your retail operations seamlessly.
              </p>

              <div style="background-color:#0f172a;border-left:4px solid #8b5cf6;border-radius:8px;padding:18px 20px;margin:24px 0;color:#f1f5f9;font-size:14px;line-height:1.6;">
                <div style="font-size:11px;font-weight:700;color:#a78bfa;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">
                  Official Welcome Message
                </div>
                <div style="color:#e2e8f0;">
                  ${cleanMessage}
                </div>
              </div>

              <p style="margin:0 0 24px;color:#cbd5e1;">
                Your POS terminal, thermal receipt printers, barcode generation, inventory records, and financial reports are now fully operational.
              </p>

              <div style="text-align:center;margin:28px 0;">
                <a href="${loginUrl}" style="display:inline-block;padding:13px 28px;background:linear-gradient(135deg,#7c3aed 0%,#4f46e5 100%);color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;border-radius:10px;box-shadow:0 10px 15px -3px rgba(124,58,237,0.3);">
                  Open Store POS Terminal
                </a>
              </div>

              <p style="margin:0;font-size:12px;color:#64748b;border-top:1px solid #334155;padding-top:16px;">
                If you have any questions or require hardware printer integration, please contact our support desk. Thank you for choosing SarbaazSoft Shoe POS.
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

function buildWelcomeEmailText(opts: SendWelcomeEmailOptions): string {
  const displayStore = opts.storeName || 'SarbaazSoft Shoe POS';
  return [
    `Welcome to SarbaazSoft Shoe POS, ${displayStore}!`,
    ``,
    `Hello ${opts.ownerName || opts.userName || opts.to},`,
    ``,
    `Thank you for choosing SarbaazSoft to power your footwear business. We are thrilled to partner with ${displayStore} and help you streamline your inventory, accelerate counter checkouts, and scale your retail operations seamlessly.`,
    ``,
    `--- Official Welcome Message ---`,
    opts.welcomeMessage,
    `--------------------------------`,
    ``,
    `Access your POS counter anytime at:`,
    opts.loginUrl || '/',
    ``,
    `SarbaazSoft Shoe POS Support`,
  ].join('\n');
}

export async function sendWelcomeEmail(
  opts: SendWelcomeEmailOptions
): Promise<SendWelcomeEmailResult> {
  const settings = (await getAllAppSettings()).byKey;
  const configuredFrom = (settings.SMTP_FROM || settings.SMTP_USER || settings.GMAIL_USER || '').trim();
  const fromAddress = configuredFrom || '"SarbaazSoft Shoe POS" <no-reply@sarbaazsoft.com>';
  const subject = `Welcome to SarbaazSoft Shoe POS, ${opts.storeName || 'Your Store'}!`;
  const html = buildWelcomeEmailHtml(opts);
  const text = buildWelcomeEmailText(opts);

  // 1. Real SMTP / Gmail Transport
  const smtpHost = (settings.SMTP_HOST || (settings.GMAIL_USER ? 'smtp.gmail.com' : '')).trim();
  const smtpUser = (settings.SMTP_USER || settings.GMAIL_USER || '').trim();
  const rawSmtpPass = (settings.SMTP_PASS || settings.GMAIL_APP_PASSWORD || '').trim();
  const isGmailHost = /gmail\.com/i.test(smtpHost) || /@gmail\.com$/i.test(smtpUser);
  const smtpPass = isGmailHost ? rawSmtpPass.replace(/\s+/g, '') : rawSmtpPass;
  const smtpPort = Number(settings.SMTP_PORT || 587);
  const smtpSecure =
    String(settings.SMTP_SECURE || '').toLowerCase() === 'true' || smtpPort === 465;
  const isEtherealHost = /ethereal\.email/i.test(smtpHost) || /ethereal\.email/i.test(smtpUser);

  if (smtpHost && smtpUser && smtpPass && !isEtherealHost) {
    try {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure,
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });

      const info = await transporter.sendMail({
        from: isGmailHost ? `"ShoePOS" <${smtpUser}>` : fromAddress,
        to: opts.to,
        subject,
        text,
        html,
      });

      return {
        delivered: true,
        provider: 'smtp',
        messageId: info.messageId,
      };
    } catch (smtpErr: any) {
      console.warn('Welcome email SMTP warning, trying secondary transport:', smtpErr?.message || smtpErr);
    }
  }

  // 2. Resend API Transport
  const resendApiKey = (settings.RESEND_API_KEY || '').trim();
  if (isValidResendApiKey(resendApiKey)) {
    const customResendFrom = (settings.RESEND_FROM || '').trim();
    const isCustomDomainFrom =
      customResendFrom &&
      !/@(gmail|yahoo|hotmail|outlook|ethereal)\./i.test(customResendFrom);
    const resendFrom = isCustomDomainFrom
      ? customResendFrom
      : 'SarbaazSoft Shoe POS <onboarding@resend.dev>';

    try {
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: resendFrom,
          to: [opts.to],
          subject,
          html,
          text,
        }),
      });

      if (resp.ok) {
        const data = (await resp.json().catch(() => ({}))) as any;
        return {
          delivered: true,
          provider: 'resend',
          messageId: data?.id,
        };
      }

      if (resp.status === 401 || resp.status === 403) {
        console.warn('Resend rejected the configured API key; trying the next configured email transport.');
      }
    } catch {
      // Gracefully fall through to Webhook or Ethereal test inbox
    }
  }

  // 3. Webhook Transport
  const webhookUrl = (settings.EMAIL_WEBHOOK_URL || settings.RESEND_WEBHOOK_URL || '').trim();
  if (webhookUrl) {
    try {
      const resp = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: opts.to,
          subject,
          html,
          text,
          type: 'welcome',
          welcomeMessage: opts.welcomeMessage,
        }),
      });
      if (resp.ok) {
        return {
          delivered: true,
          provider: 'webhook',
        };
      }
    } catch {}
  }

  // 4. Automatic Ethereal SMTP test inbox delivery for preview
  try {
    const etherealAuth =
      isEtherealHost && smtpHost && smtpUser && smtpPass
        ? {
            host: smtpHost,
            port: smtpPort,
            secure: smtpSecure,
            user: smtpUser,
            pass: smtpPass,
          }
        : null;

    if (!etherealAuth && !cachedEtherealAccount) {
      cachedEtherealAccount = await nodemailer.createTestAccount();
    }

    const activeEthereal = etherealAuth || {
      host: cachedEtherealAccount!.smtp.host,
      port: cachedEtherealAccount!.smtp.port,
      secure: cachedEtherealAccount!.smtp.secure,
      user: cachedEtherealAccount!.user,
      pass: cachedEtherealAccount!.pass,
    };

    const testTransporter = nodemailer.createTransport({
      host: activeEthereal.host,
      port: activeEthereal.port,
      secure: activeEthereal.secure,
      auth: {
        user: activeEthereal.user,
        pass: activeEthereal.pass,
      },
    });

    const info = await testTransporter.sendMail({
      from: '"SarbaazSoft Shoe POS" <no-reply@sarbaazsoft.com>',
      to: opts.to,
      subject,
      text,
      html,
    });

    const previewUrl = nodemailer.getTestMessageUrl(info) || null;
    return {
      delivered: true,
      provider: 'ethereal',
      messageId: info.messageId,
      previewUrl: typeof previewUrl === 'string' ? previewUrl : null,
    };
  } catch (ethErr: any) {
    return {
      delivered: false,
      provider: 'fallback',
      error: ethErr?.message || 'SMTP not configured',
    };
  }
}

export interface SendStaffWelcomeEmailOptions {
  to: string;
  staffName: string;
  role: 'ADMIN' | 'CASHIER' | string;
  storeName?: string;
  loginEmail: string;
  initialPassword: string;
  loginUrl?: string;
  terminalUrl?: string;
}

export interface SendStaffWelcomeEmailResult {
  delivered: boolean;
  provider: 'smtp' | 'resend' | 'webhook' | 'ethereal' | 'fallback';
  messageId?: string;
  previewUrl?: string | null;
  error?: string;
}

function buildStaffWelcomeEmailHtml(opts: SendStaffWelcomeEmailOptions): string {
  const displayStore = opts.storeName || 'SarbaazSoft Shoe POS';
  const roleTitle = opts.role === 'ADMIN' ? 'Store Administrator' : 'Cashier & POS Operator';
  const loginUrl = opts.loginUrl || '/';
  const terminalUrl = opts.terminalUrl || loginUrl;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Welcome to ${displayStore} — Account Credentials</title>
</head>
<body style="margin:0;padding:0;background-color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#0f172a;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:560px;background-color:#1e293b;border:1px solid #334155;border-radius:16px;overflow:hidden;box-shadow:0 20px 25px -5px rgba(0,0,0,0.4);">
          <tr>
            <td style="background:linear-gradient(135deg,#2563eb 0%,#7c3aed 100%);padding:28px 32px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:800;letter-spacing:-0.02em;">
                ${displayStore}
              </h1>
              <p style="margin:6px 0 0;color:#dbeafe;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;">
                Staff Account Authorization &amp; POS Setup
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;color:#e2e8f0;font-size:14px;line-height:1.6;">
              <p style="margin:0 0 16px;font-size:16px;">
                Hello <strong style="color:#ffffff;">${opts.staffName}</strong>,
              </p>
              <p style="margin:0 0 20px;color:#cbd5e1;">
                An authorized store account has been created for you at <strong style="color:#ffffff;">${displayStore}</strong>. Below are your secure login credentials to sign in and access the retail point-of-sale system.
              </p>

              <!-- Credentials Box -->
              <div style="background-color:#0f172a;border:1px solid #3b82f6;border-radius:12px;padding:20px;margin:24px 0;">
                <div style="font-size:11px;font-weight:800;color:#60a5fa;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:12px;">
                  Your Secure Login Credentials
                </div>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:13px;">
                  <tr>
                    <td style="padding:6px 0;color:#94a3b8;width:130px;font-weight:600;">Role / Access:</td>
                    <td style="padding:6px 0;color:#ffffff;font-weight:700;">
                      <span style="background-color:#1e3a8a;color:#93c5fd;padding:2px 8px;border-radius:4px;font-size:12px;">
                        ${roleTitle}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;color:#94a3b8;font-weight:600;">Login Email:</td>
                    <td style="padding:6px 0;color:#38bdf8;font-weight:700;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;">
                      ${opts.loginEmail}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;color:#94a3b8;font-weight:600;">Initial Password:</td>
                    <td style="padding:6px 0;color:#34d399;font-weight:800;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;letter-spacing:0.04em;">
                      ${opts.initialPassword}
                    </td>
                  </tr>
                </table>
              </div>

              <!-- POS Terminal Quick Launch & F9 Shortcut Banner -->
              <div style="background:linear-gradient(135deg,rgba(37,99,235,0.15) 0%,rgba(124,58,237,0.15) 100%);border:1px solid rgba(99,102,241,0.4);border-radius:12px;padding:20px;margin:24px 0;text-align:center;">
                <div style="font-size:11px;font-weight:800;color:#a5b4fc;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">
                  Fast Counter Checkout Ready
                </div>
                <p style="margin:0 0 14px;color:#e2e8f0;font-size:13px;">
                  Press <kbd style="background:#1e293b;border:1px solid #475569;border-bottom-width:2px;border-radius:4px;padding:3px 8px;font-family:monospace;font-weight:700;color:#f8fafc;font-size:12px;">F9</kbd> anywhere in the application to instantly launch the POS Terminal counter!
                </p>
                <div style="margin-top:12px;">
                  <a href="${terminalUrl}" style="display:inline-block;padding:12px 28px;background:linear-gradient(135deg,#2563eb 0%,#7c3aed 100%);color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;border-radius:10px;box-shadow:0 10px 15px -3px rgba(37,99,235,0.4);">
                    Launch POS Terminal (F9)
                  </a>
                </div>
              </div>

              <p style="margin:0 0 8px;font-size:12px;color:#94a3b8;">
                Direct sign-in portal link:
              </p>
              <p style="margin:0 0 20px;font-size:12px;word-break:break-all;">
                <a href="${loginUrl}" style="color:#60a5fa;text-decoration:underline;">${loginUrl}</a>
              </p>

              <p style="margin:0;font-size:12px;color:#64748b;border-top:1px solid #334155;padding-top:16px;">
                Security Note: Please change your password after logging in for the first time via your profile menu. If you did not expect this account creation, please contact your store manager.
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

function buildStaffWelcomeEmailText(opts: SendStaffWelcomeEmailOptions): string {
  const displayStore = opts.storeName || 'SarbaazSoft Shoe POS';
  const roleTitle = opts.role === 'ADMIN' ? 'Store Administrator' : 'Cashier & POS Operator';
  return [
    `Welcome to ${displayStore}! Your account is ready.`,
    ``,
    `Hello ${opts.staffName},`,
    ``,
    `An authorized store account has been created for you at ${displayStore}.`,
    ``,
    `--- Your Login Credentials ---`,
    `Role: ${roleTitle}`,
    `Email: ${opts.loginEmail}`,
    `Initial Password: ${opts.initialPassword}`,
    `------------------------------`,
    ``,
    `POS Terminal Shortcut:`,
    `Press F9 at any time in the app to instantly launch the POS Terminal!`,
    ``,
    `Launch POS Terminal: ${opts.terminalUrl || opts.loginUrl || '/'}`,
    `Store Sign-in: ${opts.loginUrl || '/'}`,
    ``,
    `SarbaazSoft Shoe POS`,
  ].join('\n');
}

export async function sendStaffWelcomeEmail(
  opts: SendStaffWelcomeEmailOptions
): Promise<SendStaffWelcomeEmailResult> {
  const settings = (await getAllAppSettings()).byKey;
  const configuredFrom = (settings.SMTP_FROM || settings.SMTP_USER || settings.GMAIL_USER || '').trim();
  const fromAddress = configuredFrom || '"SarbaazSoft Shoe POS" <no-reply@sarbaazsoft.com>';
  const displayStore = opts.storeName || 'SarbaazSoft Shoe POS';
  const subject = `Welcome to ${displayStore} — Account Credentials & POS Terminal`;
  const html = buildStaffWelcomeEmailHtml(opts);
  const text = buildStaffWelcomeEmailText(opts);

  // 1. Real SMTP / Gmail Transport
  const smtpHost = (settings.SMTP_HOST || (settings.GMAIL_USER ? 'smtp.gmail.com' : '')).trim();
  const smtpUser = (settings.SMTP_USER || settings.GMAIL_USER || '').trim();
  const rawSmtpPass = (settings.SMTP_PASS || settings.GMAIL_APP_PASSWORD || '').trim();
  const isGmailHost = /gmail\.com/i.test(smtpHost) || /@gmail\.com$/i.test(smtpUser);
  const smtpPass = isGmailHost ? rawSmtpPass.replace(/\s+/g, '') : rawSmtpPass;
  const smtpPort = Number(settings.SMTP_PORT || 587);
  const smtpSecure =
    String(settings.SMTP_SECURE || '').toLowerCase() === 'true' || smtpPort === 465;
  const isEtherealHost = /ethereal\.email/i.test(smtpHost) || /ethereal\.email/i.test(smtpUser);

  if (smtpHost && smtpUser && smtpPass && !isEtherealHost) {
    try {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure,
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });

      const info = await transporter.sendMail({
        from: isGmailHost ? `"ShoePOS" <${smtpUser}>` : fromAddress,
        to: opts.to,
        subject,
        text,
        html,
      });

      return {
        delivered: true,
        provider: 'smtp',
        messageId: info.messageId,
      };
    } catch (smtpErr: any) {
      console.warn('Staff welcome email SMTP warning, trying secondary transport:', smtpErr?.message || smtpErr);
    }
  }

  // 2. Resend API Transport
  const resendApiKey = (settings.RESEND_API_KEY || '').trim();
  if (isValidResendApiKey(resendApiKey)) {
    const customResendFrom = (settings.RESEND_FROM || '').trim();
    const isCustomDomainFrom =
      customResendFrom &&
      !/@(gmail|yahoo|hotmail|outlook|ethereal)\./i.test(customResendFrom);
    const resendFrom = isCustomDomainFrom
      ? customResendFrom
      : 'SarbaazSoft Shoe POS <onboarding@resend.dev>';

    try {
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: resendFrom,
          to: [opts.to],
          subject,
          html,
          text,
        }),
      });

      if (resp.ok) {
        const data = (await resp.json().catch(() => ({}))) as any;
        return {
          delivered: true,
          provider: 'resend',
          messageId: data?.id,
        };
      }

      if (resp.status === 401 || resp.status === 403) {
        console.warn('Resend rejected the configured API key; trying the next configured email transport.');
      }
    } catch {
      // Gracefully fall through to Webhook or Ethereal test inbox
    }
  }

  // 3. Webhook Transport
  const webhookUrl = (settings.EMAIL_WEBHOOK_URL || settings.RESEND_WEBHOOK_URL || '').trim();
  if (webhookUrl) {
    try {
      const resp = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: opts.to,
          subject,
          html,
          text,
          type: 'staff_welcome',
          role: opts.role,
          staffName: opts.staffName,
          loginEmail: opts.loginEmail,
          terminalUrl: opts.terminalUrl,
        }),
      });
      if (resp.ok) {
        return {
          delivered: true,
          provider: 'webhook',
        };
      }
    } catch {}
  }

  // 4. Automatic Ethereal SMTP test inbox delivery for preview
  try {
    const etherealAuth =
      isEtherealHost && smtpHost && smtpUser && smtpPass
        ? {
            host: smtpHost,
            port: smtpPort,
            secure: smtpSecure,
            user: smtpUser,
            pass: smtpPass,
          }
        : null;

    if (!etherealAuth && !cachedEtherealAccount) {
      cachedEtherealAccount = await nodemailer.createTestAccount();
    }

    const activeEthereal = etherealAuth || {
      host: cachedEtherealAccount!.smtp.host,
      port: cachedEtherealAccount!.smtp.port,
      secure: cachedEtherealAccount!.smtp.secure,
      user: cachedEtherealAccount!.user,
      pass: cachedEtherealAccount!.pass,
    };

    const testTransporter = nodemailer.createTransport({
      host: activeEthereal.host,
      port: activeEthereal.port,
      secure: activeEthereal.secure,
      auth: {
        user: activeEthereal.user,
        pass: activeEthereal.pass,
      },
    });

    const info = await testTransporter.sendMail({
      from: '"SarbaazSoft Shoe POS" <no-reply@sarbaazsoft.com>',
      to: opts.to,
      subject,
      text,
      html,
    });

    const previewUrl = nodemailer.getTestMessageUrl(info) || null;
    return {
      delivered: true,
      provider: 'ethereal',
      messageId: info.messageId,
      previewUrl: typeof previewUrl === 'string' ? previewUrl : null,
    };
  } catch (ethErr: any) {
    return {
      delivered: false,
      provider: 'fallback',
      error: ethErr?.message || 'SMTP not configured',
    };
  }
}
