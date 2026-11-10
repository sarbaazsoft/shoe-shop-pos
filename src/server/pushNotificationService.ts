import { initializeApp, cert, getApps, deleteApp, type App } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import type { Response } from 'express';
import { pgClient } from '../db/index.ts';
import { ensureFcmTokensSchema } from '../db/schemaInit.ts';
import { getCachedAppSetting, getAppSetting, loadAppSettingsCache, registerSettingsUpdateListener } from './services/appSettingsService.ts';
import { sendTelegramMessage, dispatchPosTelegramAlert } from './services/telegramService.ts';
import { dispatchPosEmailAlert } from './services/emailAlertService.ts';

// ============================================================================
// FIREBASE ADMIN SDK SINGLETON & DYNAMIC INITIALIZATION
// ============================================================================

let firebaseApp: App | null = null;
let lastCredentialSignature = '';

/**
 * Initializes or retrieves the Firebase Admin App instance.
 * Reads FCM_PROJECT_ID, FCM_CLIENT_EMAIL, and FCM_PRIVATE_KEY from app_settings or process.env.
 */
export function getFirebaseAdmin(): App | null {
  const projectId = (getCachedAppSetting('FCM_PROJECT_ID', '') || process.env.FCM_PROJECT_ID || '').trim();
  const clientEmail = (getCachedAppSetting('FCM_CLIENT_EMAIL', '') || process.env.FCM_CLIENT_EMAIL || '').trim();
  let privateKey = (getCachedAppSetting('FCM_PRIVATE_KEY', '') || process.env.FCM_PRIVATE_KEY || '').trim();

  if (privateKey) {
    // Format PEM newlines properly whether stored as literal \n or escaped \\n
    privateKey = privateKey.replace(/\\n/g, '\n');
  }

  if (!projectId || !clientEmail || !privateKey) {
    return null;
  }

  const sig = `${projectId}:${clientEmail}:${privateKey.slice(0, 32)}`;
  if (firebaseApp && lastCredentialSignature === sig) {
    return firebaseApp;
  }

  try {
    const existingApps = getApps();
    if (existingApps.length > 0) {
      for (const app of existingApps) {
        if (app) {
          deleteApp(app).catch(() => {});
        }
      }
    }

    firebaseApp = initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
      projectId,
    });
    lastCredentialSignature = sig;
    console.log(`🔥 [FCM] Firebase Admin SDK initialized successfully for project: ${projectId}`);
    return firebaseApp;
  } catch (err: any) {
    console.warn('⚠️ [FCM] Could not initialize Firebase Admin SDK:', err?.message || err);
    return null;
  }
}

// Initial configuration attempt
getFirebaseAdmin();

// Re-configure whenever FCM credentials are saved dynamically via the settings API
registerSettingsUpdateListener((key) => {
  if (['FCM_PROJECT_ID', 'FCM_CLIENT_EMAIL', 'FCM_PRIVATE_KEY'].includes(key)) {
    getFirebaseAdmin();
  }
});

// Asynchronously hydrate once PostgreSQL app_settings cache is loaded
getAppSetting('FCM_PROJECT_ID').then(() => {
  getFirebaseAdmin();
}).catch(() => {});

// ============================================================================
// ACTIVE SSE BROWSER CLIENTS (REAL-TIME DASHBOARD SYNC)
// ============================================================================

export interface SseClientRecord {
  res: Response;
  tenantId: number;
  userId: number;
  role: string; // 'SUPERADMIN' | 'ADMIN' | 'CASHIER'
}

const sseClients = new Set<SseClientRecord>();

export function registerSseClient(
  tenantId: number,
  userId: number,
  role: string,
  res: Response
): () => void {
  const cleanTenantId = Number(tenantId) || 0;
  const cleanUserId = Number(userId) || 0;
  const cleanRole = String(role || (cleanTenantId === 0 ? 'SUPERADMIN' : 'CASHIER')).trim().toUpperCase();

  const client: SseClientRecord = {
    res,
    tenantId: cleanTenantId,
    userId: cleanUserId,
    role: cleanRole,
  };
  sseClients.add(client);

  return () => {
    sseClients.delete(client);
  };
}

// ============================================================================
// FCM DEVICE TOKEN PERSISTENCE
// ============================================================================

export async function saveFcmToken(
  tenantId: number,
  userId: number,
  userRole: string,
  token: string,
  userAgent: string = '',
  deviceName: string = ''
): Promise<boolean> {
  try {
    await ensureFcmTokensSchema();
    const cleanToken = String(token || '').trim();
    if (!cleanToken) return false;

    const cleanRole = String(userRole || (tenantId === 0 ? 'SUPERADMIN' : 'ADMIN')).trim().toUpperCase();
    const cleanTenantId = Number(tenantId) || 1;
    const cleanUserId = Number(userId) || 0;

    await pgClient.query(
      `INSERT INTO public.fcm_tokens (
        token, tenant_id, user_id, user_role, user_agent, device_name, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (token) DO UPDATE SET
        tenant_id = EXCLUDED.tenant_id,
        user_id = EXCLUDED.user_id,
        user_role = EXCLUDED.user_role,
        user_agent = EXCLUDED.user_agent,
        device_name = EXCLUDED.device_name,
        updated_at = NOW()`,
      [cleanToken, cleanTenantId, cleanUserId, cleanRole, userAgent, deviceName]
    );

    return true;
  } catch (err) {
    console.error('Failed to save FCM token:', err);
    return false;
  }
}

export async function removeFcmToken(token: string): Promise<boolean> {
  try {
    await ensureFcmTokensSchema();
    await pgClient.query('DELETE FROM public.fcm_tokens WHERE token = $1', [String(token).trim()]);
    return true;
  } catch (err) {
    console.error('Failed to remove FCM token:', err);
    return false;
  }
}

export async function getFcmStats(): Promise<{
  configured: boolean;
  projectId: string;
  totalTokens: number;
  tokensByRole: Record<string, number>;
}> {
  try {
    await ensureFcmTokensSchema();
    await loadAppSettingsCache();
    const app = getFirebaseAdmin();
    const projectId = (await getAppSetting('FCM_PROJECT_ID', '')) || process.env.FCM_PROJECT_ID || '';

    const countRes = await pgClient.query<{ count: string; user_role: string }>(`
      SELECT user_role, COUNT(*) as count 
      FROM public.fcm_tokens 
      GROUP BY user_role
    `);

    const tokensByRole: Record<string, number> = {};
    let totalTokens = 0;
    for (const row of countRes.rows) {
      const c = parseInt(row.count, 10) || 0;
      tokensByRole[row.user_role] = c;
      totalTokens += c;
    }

    return {
      configured: Boolean(app),
      projectId,
      totalTokens,
      tokensByRole,
    };
  } catch {
    return {
      configured: false,
      projectId: '',
      totalTokens: 0,
      tokensByRole: {},
    };
  }
}

// Backward-compatible stubs for legacy web-push endpoints if any client probes them
export function getVapidPublicKey(): string {
  return getCachedAppSetting('FCM_VAPID_KEY', '') || process.env.FCM_VAPID_KEY || '';
}

export async function savePushSubscription(
  tenantId: number,
  userId: number,
  userRole: string,
  subscription: any,
  userAgent: string = ''
): Promise<boolean> {
  // If a client sends an endpoint as a token, save it as an FCM token
  if (subscription?.endpoint) {
    return saveFcmToken(tenantId, userId, userRole, subscription.endpoint, userAgent, 'Web Client');
  }
  return false;
}

export async function removePushSubscription(endpoint: string): Promise<boolean> {
  return removeFcmToken(endpoint);
}

// ============================================================================
// FCM MULTICAST DISPATCH ENGINE
// ============================================================================

export interface FcmDispatchResult {
  success: boolean;
  sentCount: number;
  failureCount: number;
  error?: string;
}

export async function sendFcmPushToTokens(
  tokens: string[],
  payload: {
    title: string;
    body: string;
    deepLinkUrl?: string;
    icon?: string;
    tag?: string;
    data?: Record<string, string>;
  }
): Promise<FcmDispatchResult> {
  await loadAppSettingsCache();
  const app = getFirebaseAdmin();
  if (!app) {
    return {
      success: false,
      sentCount: 0,
      failureCount: tokens.length,
      error: 'Firebase Admin SDK credentials (FCM_PROJECT_ID, FCM_CLIENT_EMAIL, FCM_PRIVATE_KEY) are not configured in SuperAdmin settings.',
    };
  }

  const uniqueTokens = Array.from(new Set(tokens.map((t) => String(t || '').trim()).filter(Boolean)));
  if (uniqueTokens.length === 0) {
    return {
      success: true,
      sentCount: 0,
      failureCount: 0,
    };
  }

  try {
    const messaging = getMessaging(app);
    const linkUrl = payload.deepLinkUrl || '/';

    const stringData: Record<string, string> = {
      url: linkUrl,
      title: payload.title,
      body: payload.body,
      tag: payload.tag || `pos-${Date.now()}`,
    };
    if (payload.data) {
      for (const [k, v] of Object.entries(payload.data)) {
        stringData[k] = String(v ?? '');
      }
    }

    const response = await messaging.sendEachForMulticast({
      tokens: uniqueTokens,
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: stringData,
      android: {
        priority: 'high',
        notification: {
          title: payload.title,
          body: payload.body,
          channelId: 'pos_alerts',
          priority: 'max',
          defaultSound: true,
          defaultVibrateTimings: true,
          visibility: 'public',
        },
      },
      webpush: {
        notification: {
          title: payload.title,
          body: payload.body,
          icon: payload.icon || '/pwa-192x192.png',
          badge: '/pwa-192x192.png',
          tag: payload.tag || `pos-${Date.now()}`,
          vibrate: [200, 100, 200],
        },
        fcmOptions: {
          link: linkUrl,
        },
      },
    });

    // Cleanup expired or uninstalled tokens automatically
    const tokensToRemove: string[] = [];
    response.responses.forEach((resp: any, idx: number) => {
      if (!resp.success && resp.error) {
        const errCode = resp.error.code;
        if (
          errCode === 'messaging/invalid-registration-token' ||
          errCode === 'messaging/registration-token-not-registered'
        ) {
          tokensToRemove.push(uniqueTokens[idx]);
        }
      }
    });

    if (tokensToRemove.length > 0) {
      await pgClient.query('DELETE FROM public.fcm_tokens WHERE token = ANY($1::text[])', [tokensToRemove]).catch(() => {});
    }

    return {
      success: response.successCount > 0 || response.failureCount === 0,
      sentCount: response.successCount,
      failureCount: response.failureCount,
    };
  } catch (err: any) {
    console.error('[FCM] Error dispatching push notification:', err);
    return {
      success: false,
      sentCount: 0,
      failureCount: uniqueTokens.length,
      error: err?.message || 'Failed to dispatch FCM push notification',
    };
  }
}

// ============================================================================
// POS ACTION NOTIFICATION (SALES, RETURNS, EXCHANGES, LOW STOCK)
// ============================================================================

export interface PosActionNotification {
  type: 'SALE' | 'RETURN' | 'EXCHANGE' | 'STOCK' | 'PURCHASE';
  title: string;
  message: string;
  invoiceNumber: string;
  orderId?: number;
  saleId?: number;
  returnNumber?: string;
  returnId?: number;
  totalAmount?: number;
  refundAmount?: number;
  netDifference?: number;
  customerName?: string;
  cashierName?: string;
  cashierId?: number;
  itemsSummary?: string;
  exchangeDetails?: {
    oldItems: string;
    newItems: string;
    netDifference: number;
  };
  deepLinkUrl: string;
  timestamp: string;
  triggeredBy?: string;
  targetRole?: 'ALL' | 'ADMIN' | 'CASHIER';
  targetRoles?: ('ADMIN' | 'CASHIER')[];
}

/**
 * Broadcasts real-time POS transactional alerts:
 * 1. Active Web dashboard sessions via Server-Sent Events (SSE)
 * 2. Mobile and desktop devices via Firebase Cloud Messaging (FCM)
 *
 * Routing rules:
 * - Store Owners (ADMIN / OWNER) ALWAYS receive all transactional sales, returns, and low stock alerts.
 * - Cashiers only receive alerts for their own counter transactions.
 * - SuperAdmin does not receive individual store POS counter alerts.
 */
export async function notifyPosAction(
  tenantId: number,
  payload: PosActionNotification
): Promise<void> {
  const cleanTenantId = Number(tenantId) || 1;
  const allowedRoles = payload.targetRoles || ['ADMIN', 'CASHIER'];
  const enrichedPayload: PosActionNotification = {
    ...payload,
    targetRole: payload.targetRole || 'ALL',
    targetRoles: allowedRoles,
  };

  // 1. Deliver to active browser dashboard sessions via Server-Sent Events (SSE)
  const sseMessage = `event: pos_action\ndata: ${JSON.stringify(enrichedPayload)}\n\n`;
  for (const client of sseClients) {
    if (
      client.tenantId === cleanTenantId &&
      client.role !== 'SUPERADMIN' &&
      allowedRoles.includes(client.role as any)
    ) {
      if (client.role === 'CASHIER' && enrichedPayload.cashierId && client.userId !== enrichedPayload.cashierId) {
        continue;
      }
      try {
        client.res.write(sseMessage);
      } catch {
        sseClients.delete(client);
      }
    }
  }

  // 2. Deliver via Firebase Cloud Messaging (FCM) to all registered mobile and desktop devices
  try {
    await ensureFcmTokensSchema();
    const tokensRes = await pgClient.query<{
      token: string;
      user_role: string;
      user_id: number;
    }>(
      `SELECT token, user_role, user_id
       FROM public.fcm_tokens
       WHERE tenant_id = $1
         AND (UPPER(user_role) IN ('ADMIN', 'OWNER') OR UPPER(user_role) = ANY($2::text[]))
         AND tenant_id != 0`,
      [cleanTenantId, allowedRoles]
    );

    if (tokensRes.rows.length === 0) {
      return;
    }

    const targetTokens: string[] = [];
    for (const row of tokensRes.rows) {
      const uRole = String(row.user_role || '').toUpperCase();
      // Store Owners receive all transactional alerts; cashiers only receive their own
      if (uRole === 'CASHIER' && enrichedPayload.cashierId && Number(row.user_id) !== Number(enrichedPayload.cashierId)) {
        continue;
      }
      targetTokens.push(row.token);
    }

    if (targetTokens.length > 0) {
      await sendFcmPushToTokens(targetTokens, {
        title: enrichedPayload.title,
        body: enrichedPayload.message,
        deepLinkUrl: enrichedPayload.deepLinkUrl || '/pos',
        icon: '/pwa-192x192.png',
        tag: `pos-${enrichedPayload.type.toLowerCase()}-${enrichedPayload.invoiceNumber || Date.now()}`,
        data: {
          type: enrichedPayload.type,
          invoiceNumber: enrichedPayload.invoiceNumber || '',
          orderId: String(enrichedPayload.orderId || ''),
          totalAmount: String(enrichedPayload.totalAmount || ''),
          timestamp: enrichedPayload.timestamp,
        },
      });
    }
  } catch (err) {
    console.error('Error during FCM POS push dispatch:', err);
  }

  // 3. Multi-channel store owner alerts: Telegram & Email
  dispatchPosTelegramAlert(cleanTenantId, enrichedPayload).catch((err) => {
    console.warn('[pushNotificationService] Error in dispatchPosTelegramAlert:', err?.message || err);
  });
  dispatchPosEmailAlert(cleanTenantId, enrichedPayload).catch((err) => {
    console.warn('[pushNotificationService] Error in dispatchPosEmailAlert:', err?.message || err);
  });
}

// ============================================================================
// PLATFORM ANNOUNCEMENTS (SUPERADMIN TO STORES)
// ============================================================================

export interface PlatformAnnouncementNotification {
  id?: number;
  tenantId?: number | null;
  targetRole?: 'ALL' | 'ADMIN' | 'CASHIER' | 'SUPERADMIN';
  title: string;
  message: string;
  type?: 'INFO' | 'WARNING' | 'SUCCESS' | 'URGENT' | string;
  actionUrl?: string;
  actionLabel?: string;
  timestamp?: string;
}

export async function notifyPlatformAnnouncement(
  payload: PlatformAnnouncementNotification
): Promise<void> {
  const isGlobal = payload.tenantId === null || payload.tenantId === undefined || Number(payload.tenantId) === 0;
  const cleanTenantId = isGlobal ? null : (Number(payload.tenantId) || null);
  const targetRole = String(payload.targetRole || 'ALL').toUpperCase();

  // 0. If target is SUPERADMIN, enforce granular event trigger toggles
  if (targetRole === 'SUPERADMIN') {
    const titleLower = (payload.title || '').toLowerCase();
    const typeUpper = (payload.type || '').toUpperCase();

    const isNewTrial = titleLower.includes('new free trial') || titleLower.includes('free tier store registered') || titleLower.includes('trial activation');
    const isRenewal = titleLower.includes('renewal request') || titleLower.includes('subscription renewal') || titleLower.includes('upgrade request') || titleLower.includes('upgrade');
    const isExpired = titleLower.includes('expired') || typeUpper === 'EXPIRED';
    const isSale = typeUpper === 'SALE' || titleLower.includes('sale') || titleLower.includes('invoice');
    const isSecurity = typeUpper === 'SECURITY' || typeUpper === 'SYSTEM' || titleLower.includes('security') || titleLower.includes('backup') || titleLower.includes('critical');

    if (isNewTrial && getCachedAppSetting('SUPERADMIN_PUSH_ON_NEW_TRIAL', 'true').toLowerCase() === 'false') {
      return; // Suppressed by SuperAdmin push event settings
    }
    if (isRenewal && getCachedAppSetting('SUPERADMIN_PUSH_ON_RENEWAL', 'true').toLowerCase() === 'false') {
      return; // Suppressed by SuperAdmin push event settings
    }
    if (isExpired && getCachedAppSetting('SUPERADMIN_PUSH_ON_EXPIRED_STORE', 'true').toLowerCase() === 'false') {
      return; // Suppressed by SuperAdmin push event settings
    }
    if (isSale && getCachedAppSetting('SUPERADMIN_PUSH_ON_SALES', 'false').toLowerCase() === 'false') {
      return; // Suppressed by SuperAdmin push event settings
    }
    if (isSecurity && !isRenewal && !isNewTrial && getCachedAppSetting('SUPERADMIN_PUSH_ON_SECURITY_ALERT', 'true').toLowerCase() === 'false') {
      return; // Suppressed by SuperAdmin push event settings
    }
  }

  const eventPayload = {
    id: payload.id,
    type: payload.type || 'INFO',
    title: payload.title,
    message: payload.message,
    actionUrl: payload.actionUrl || '',
    actionLabel: payload.actionLabel || '',
    tenantId: cleanTenantId,
    targetRole,
    timestamp: payload.timestamp || new Date().toISOString(),
  };

  // 1. Deliver to active browser sessions via SSE
  const sseMessage = `event: platform_announcement\ndata: ${JSON.stringify(eventPayload)}\n\n`;
  for (const client of sseClients) {
    const isTenantMatch = isGlobal ? true : (client.tenantId === cleanTenantId);
    if (!isTenantMatch) continue;

    if (targetRole === 'SUPERADMIN' && client.role !== 'SUPERADMIN') continue;
    if (targetRole === 'ADMIN' && client.role !== 'ADMIN') continue;
    if (targetRole === 'CASHIER' && client.role !== 'CASHIER') continue;
    if (targetRole === 'ALL' && cleanTenantId !== null && client.role === 'SUPERADMIN') continue;

    try {
      client.res.write(sseMessage);
    } catch {
      sseClients.delete(client);
    }
  }

  // 2. Deliver via Firebase Cloud Messaging (FCM)
  try {
    await ensureFcmTokensSchema();
    let query = '';
    let params: any[] = [];

    if (targetRole === 'SUPERADMIN') {
      query = `SELECT token FROM public.fcm_tokens WHERE UPPER(user_role) = 'SUPERADMIN'`;
      params = [];
    } else if (targetRole === 'ADMIN') {
      query = isGlobal
        ? `SELECT token FROM public.fcm_tokens WHERE UPPER(user_role) IN ('ADMIN', 'OWNER') AND tenant_id != 0`
        : `SELECT token FROM public.fcm_tokens WHERE tenant_id = $1 AND UPPER(user_role) IN ('ADMIN', 'OWNER')`;
      params = isGlobal ? [] : [cleanTenantId];
    } else if (targetRole === 'CASHIER') {
      query = isGlobal
        ? `SELECT token FROM public.fcm_tokens WHERE UPPER(user_role) = 'CASHIER' AND tenant_id != 0`
        : `SELECT token FROM public.fcm_tokens WHERE tenant_id = $1 AND UPPER(user_role) = 'CASHIER'`;
      params = isGlobal ? [] : [cleanTenantId];
    } else {
      query = isGlobal
        ? `SELECT token FROM public.fcm_tokens`
        : `SELECT token FROM public.fcm_tokens WHERE tenant_id = $1 AND UPPER(user_role) IN ('ADMIN', 'OWNER', 'CASHIER')`;
      params = isGlobal ? [] : [cleanTenantId];
    }

    const tokensRes = await pgClient.query<{ token: string }>(query, params);
    if (tokensRes.rows.length === 0) return;

    const tokens = tokensRes.rows.map((r) => r.token);
    await sendFcmPushToTokens(tokens, {
      title: payload.title,
      body: payload.message,
      deepLinkUrl: payload.actionUrl || '/',
      icon: '/pwa-192x192.png',
      tag: `platform-${payload.id || Date.now()}`,
      data: {
        type: payload.type || 'INFO',
        notificationId: String(payload.id || ''),
      },
    });
  } catch (err) {
    console.error('Error during FCM announcement push dispatch:', err);
  }

  // 3. Deliver via Telegram to SuperAdmin if configured
  if (targetRole === 'SUPERADMIN') {
    try {
      const botToken = getCachedAppSetting('TELEGRAM_BOT_TOKEN', '').trim();
      const superAdminChatId = getCachedAppSetting('TELEGRAM_SUPERADMIN_CHAT_ID', '').trim();
      const telegramAlertsEnabled = getCachedAppSetting('TELEGRAM_ALERTS_ENABLED', 'true').toLowerCase() !== 'false';

      if (botToken && superAdminChatId && telegramAlertsEnabled) {
        const cleanTitle = (payload.title || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const cleanMsg = (payload.message || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const actionText = payload.actionUrl ? `\n\n🔗 <i>Action: ${payload.actionLabel || 'Open Dashboard'} (${payload.actionUrl})</i>` : '';
        const text = `<b>🔔 SuperAdmin Alert: ${cleanTitle}</b>\n\n${cleanMsg}${actionText}\n\n<i>Time: ${new Date().toLocaleString()}</i>`;
        sendTelegramMessage(botToken, superAdminChatId, text).catch(() => {});
      }
    } catch (err) {
      console.warn('Error during Telegram SuperAdmin announcement dispatch:', err);
    }
  }
}

// ============================================================================
// TEST FCM ALERT DISPATCH
// ============================================================================

export async function testFcmPush(
  tenantId: number,
  customTitle?: string,
  customMessage?: string
): Promise<{ success: boolean; message: string; sentCount: number; failureCount: number; error?: string }> {
  const isSuperAdminTest = tenantId === 0;
  const alertTitle = customTitle || (isSuperAdminTest ? '🔔 SuperAdmin Test Push Alert' : '🔔 POS Test Push Alert');
  const alertBody = customMessage || (isSuperAdminTest
    ? `SuperAdmin Push Alert received successfully at ${new Date().toLocaleTimeString()}! Device notifications are fully operational.`
    : `Push Alert received successfully at ${new Date().toLocaleTimeString()}! Device notifications are fully operational.`);

  // 1. Deliver real-time alert to active browser sessions via SSE stream immediately
  await notifyPlatformAnnouncement({
    title: alertTitle,
    message: alertBody,
    type: 'INFO',
    targetRole: isSuperAdminTest ? 'SUPERADMIN' : 'ALL',
    tenantId: isSuperAdminTest ? null : tenantId,
  }).catch(() => {});

  await loadAppSettingsCache();
  const app = getFirebaseAdmin();
  if (!app) {
    return {
      success: true,
      message: '✓ Test alert dispatched to your open browser session(s)! (Configure Firebase Admin SDK in Settings to enable background push while the app is closed.)',
      sentCount: 1,
      failureCount: 0,
    };
  }

  await ensureFcmTokensSchema();

  // Query tokens: if tenantId is 0 or SuperAdmin, send to all tokens; otherwise filter by tenantId
  let query = 'SELECT token FROM public.fcm_tokens';
  let params: any[] = [];
  if (tenantId && tenantId > 0) {
    query = 'SELECT token FROM public.fcm_tokens WHERE tenant_id = $1';
    params = [tenantId];
  }

  const tokensRes = await pgClient.query<{ token: string }>(query, params);
  const tokens = tokensRes.rows.map((r) => r.token);

  if (tokens.length === 0) {
    return {
      success: true,
      message: '✓ Test alert delivered to your open session! Tap "Enable Push" to register this device for background alerts when the app is closed.',
      sentCount: 0,
      failureCount: 0,
    };
  }

  const result = await sendFcmPushToTokens(tokens, {
    title: alertTitle,
    body: alertBody,
    deepLinkUrl: isSuperAdminTest ? '/admin' : '/pos',
    icon: '/pwa-192x192.png',
    tag: `fcm-test-${Date.now()}`,
    data: {
      type: 'TEST_PUSH',
      timestamp: new Date().toISOString(),
    },
  });

  return {
    success: result.success,
    message: result.success
      ? `✓ Test notification successfully dispatched to ${result.sentCount} device(s)!`
      : `Test alert sent to active session, but FCM delivery reported: ${result.error || 'Unknown error'}`,
    sentCount: result.sentCount,
    failureCount: result.failureCount,
    error: result.error,
  };
}
