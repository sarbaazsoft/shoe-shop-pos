import webpush from 'web-push';
import type { Response } from 'express';
import { pgClient } from '../db/index.ts';
import { ensurePushSubscriptionsSchema } from '../db/schemaInit.ts';
import { getCachedAppSetting, getAppSetting, updateAppSettings, registerSettingsUpdateListener } from './services/appSettingsService.ts';
import { dispatchPosTelegramAlert } from './services/telegramService.ts';
import { dispatchPosEmailAlert } from './services/emailAlertService.ts';

// Deterministic or PostgreSQL-configured VAPID Keys for Web Push API
let vapidPublicKey = getCachedAppSetting('VAPID_PUBLIC_KEY', '');
let vapidPrivateKey = getCachedAppSetting('VAPID_PRIVATE_KEY', '');
let vapidSubject = getCachedAppSetting('VAPID_SUBJECT', 'mailto:support@sarbaazsoft.com');
let fallbackKeysGenerated = false;

export function configureVapidDetails() {
  const customPub = getCachedAppSetting('VAPID_PUBLIC_KEY', '').trim();
  const customPriv = getCachedAppSetting('VAPID_PRIVATE_KEY', '').trim();
  vapidSubject = getCachedAppSetting('VAPID_SUBJECT', 'mailto:support@sarbaazsoft.com').trim() || 'mailto:support@sarbaazsoft.com';

  if (customPub && customPriv) {
    vapidPublicKey = customPub;
    vapidPrivateKey = customPriv;
  } else if (!fallbackKeysGenerated) {
    try {
      const generated = webpush.generateVAPIDKeys();
      vapidPublicKey = generated.publicKey;
      vapidPrivateKey = generated.privateKey;
      fallbackKeysGenerated = true;
      // Persist generated VAPID keys into app_settings so all client devices stay subscribed across server restarts
      updateAppSettings({
        VAPID_PUBLIC_KEY: generated.publicKey,
        VAPID_PRIVATE_KEY: generated.privateKey,
      }).catch((err) => console.warn('Could not persist VAPID keys to database:', err));
    } catch (err) {
      console.warn('⚠️ Could not generate fallback VAPID keys:', err);
    }
  }

  if (vapidPublicKey && vapidPrivateKey) {
    try {
      webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
      console.log('🔔 Web Push VAPID details configured successfully');
    } catch (err) {
      console.warn('⚠️ Error setting VAPID details:', err);
    }
  }
}

// Initial configuration
configureVapidDetails();

// Asynchronous hydration once PostgreSQL settings cache is ready
getAppSetting('VAPID_PUBLIC_KEY').then(() => {
  configureVapidDetails();
}).catch(() => {});

// Re-configure whenever settings are updated dynamically via API
registerSettingsUpdateListener((key) => {
  if (key === 'VAPID_PUBLIC_KEY' || key === 'VAPID_PRIVATE_KEY' || key === 'VAPID_SUBJECT') {
    configureVapidDetails();
  }
});

export function getVapidPublicKey(): string {
  if (!vapidPublicKey) {
    configureVapidDetails();
  }
  return vapidPublicKey;
}

// Active SSE client connections with user ID, tenant ID and role metadata for role isolation
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

  const cleanup = () => {
    sseClients.delete(client);
  };

  return cleanup;
}

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
 * Saves a browser or PWA Web Push subscription scoped to tenant, user, and role.
 */
export async function savePushSubscription(
  tenantId: number,
  userId: number,
  userRole: string,
  subscription: {
    endpoint: string;
    keys?: {
      p256dh?: string;
      auth?: string;
    };
  },
  userAgent: string = ''
): Promise<boolean> {
  try {
    await ensurePushSubscriptionsSchema();
    const endpoint = String(subscription?.endpoint || '').trim();
    const p256dh = String(subscription?.keys?.p256dh || '').trim();
    const auth = String(subscription?.keys?.auth || '').trim();
    const cleanRole = String(userRole || (tenantId === 0 ? 'SUPERADMIN' : 'ADMIN')).trim().toUpperCase();

    if (!endpoint || !p256dh || !auth) {
      return false;
    }

    await pgClient.query(
      `INSERT INTO public.push_subscriptions (
        tenant_id, user_id, user_role, endpoint, p256dh, auth, user_agent, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT (endpoint) DO UPDATE SET
        tenant_id = EXCLUDED.tenant_id,
        user_id = EXCLUDED.user_id,
        user_role = EXCLUDED.user_role,
        p256dh = EXCLUDED.p256dh,
        auth = EXCLUDED.auth,
        user_agent = EXCLUDED.user_agent,
        updated_at = NOW()`,
      [tenantId, userId, cleanRole, endpoint, p256dh, auth, userAgent]
    );

    return true;
  } catch (err) {
    console.error('Failed to save push subscription:', err);
    return false;
  }
}

/**
 * Removes a Web Push subscription by its unique endpoint URL.
 */
export async function removePushSubscription(endpoint: string): Promise<boolean> {
  try {
    await ensurePushSubscriptionsSchema();
    await pgClient.query(
      'DELETE FROM public.push_subscriptions WHERE endpoint = $1',
      [String(endpoint).trim()]
    );
    return true;
  } catch (err) {
    console.error('Failed to remove push subscription:', err);
    return false;
  }
}

/**
 * Dispatches instant real-time notifications to:
 * 1. Active Web browser sessions via Server-Sent Events (SSE) with strict role isolation
 * 2. Mobile Android/Apple installed PWAs and background web sessions via Web Push API with role filtering
 * 
 * CRITICAL ROUTING RULES:
 * - Store Owners (ADMIN / OWNER) MUST ALWAYS receive transactional sale & invoice alerts across all cashiers.
 * - Cashiers ONLY receive real-time alerts for operations they performed themselves.
 * - SuperAdmin NEVER receives store POS notifications.
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
  // Store Owner (ADMIN) receives all store counter actions. Cashiers only receive their own.
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

  // 2. Deliver via Web Push API to installed PWAs (Android/iOS) and subscribed web browsers
  if (!vapidPublicKey || !vapidPrivateKey) {
    configureVapidDetails();
  }
  if (!vapidPublicKey || !vapidPrivateKey) {
    console.warn('⚠️ Web Push cannot dispatch: VAPID keys not configured.');
    return;
  }

  try {
    await ensurePushSubscriptionsSchema();
    const subsRes = await pgClient.query<{
      endpoint: string;
      p256dh: string;
      auth: string;
      user_role: string;
      user_id: number;
    }>(
      `SELECT endpoint, p256dh, auth, user_role, user_id
       FROM public.push_subscriptions
       WHERE tenant_id = $1
         AND (UPPER(user_role) IN ('ADMIN', 'OWNER') OR UPPER(user_role) = ANY($2::text[]))
         AND tenant_id != 0`,
      [cleanTenantId, allowedRoles]
    );

    if (subsRes.rows.length === 0) {
      return;
    }

    const pushData = JSON.stringify({
      title: enrichedPayload.title,
      body: enrichedPayload.message,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag: `pos-${enrichedPayload.type.toLowerCase()}-${enrichedPayload.invoiceNumber || Date.now()}`,
      data: {
        url: enrichedPayload.deepLinkUrl,
        type: enrichedPayload.type,
        invoiceNumber: enrichedPayload.invoiceNumber,
        orderId: enrichedPayload.orderId,
        saleId: enrichedPayload.saleId,
        returnNumber: enrichedPayload.returnNumber,
        timestamp: enrichedPayload.timestamp,
        targetRole: enrichedPayload.targetRole,
        targetRoles: enrichedPayload.targetRoles,
      },
      actions: [
        { action: 'open_receipt', title: 'View Receipt / Details' },
      ],
    });

    const sendPromises = subsRes.rows.map(async (row) => {
      const uRole = String(row.user_role || '').toUpperCase();
      // Store Owners (ADMIN / OWNER) MUST ALWAYS receive transactional sale & invoice alerts!
      // Cashiers only receive Web Push notifications for their own transactions.
      if (uRole === 'CASHIER' && enrichedPayload.cashierId && Number(row.user_id) !== Number(enrichedPayload.cashierId)) {
        return;
      }

      const pushSub: webpush.PushSubscription = {
        endpoint: row.endpoint,
        keys: {
          p256dh: row.p256dh,
          auth: row.auth,
        },
      };

      try {
        await webpush.sendNotification(pushSub, pushData, {
          TTL: 60 * 60 * 24, // 24 hours
          urgency: 'high',
        });
      } catch (pushErr: any) {
        const code = pushErr?.statusCode;
        // RFC 8292: ONLY HTTP 404 (Not Found) or 410 (Gone) indicates that subscription is dead.
        // Never delete subscription on 401/403 (server auth issues).
        if (code === 404 || code === 410) {
          await removePushSubscription(row.endpoint).catch(() => {});
        } else {
          console.warn(`Web push delivery notice for endpoint: ${pushErr?.message || pushErr}`);
        }
      }
    });

    await Promise.allSettled(sendPromises);
  } catch (err) {
    console.error('Error during Web Push dispatch:', err);
  }

  // 3. Deliver instant push alert to Store Owner's Telegram (runs even when app/browser is completely closed)
  try {
    await dispatchPosTelegramAlert(cleanTenantId, enrichedPayload);
  } catch (tgErr) {
    console.warn('⚠️ Telegram dispatch notice:', tgErr);
  }

  // 4. Deliver instant email notification to Store Owner & SuperAdmin (runs via Gmail SMTP to mobile Mail app)
  try {
    await dispatchPosEmailAlert(cleanTenantId, enrichedPayload);
  } catch (emailErr) {
    console.warn('⚠️ Email alert dispatch notice:', emailErr);
  }
}

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

/**
 * Dispatches a custom announcement from SuperAdmin to all stores (global broadcast)
 * or to a targeted store, via real-time SSE stream and background Web Push, with strict role isolation.
 */
export async function notifyPlatformAnnouncement(
  payload: PlatformAnnouncementNotification
): Promise<void> {
  const isGlobal = payload.tenantId === null || payload.tenantId === undefined || Number(payload.tenantId) === 0;
  const cleanTenantId = isGlobal ? null : (Number(payload.tenantId) || null);
  const targetRole = String(payload.targetRole || 'ALL').toUpperCase();

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

  const sseMessage = `event: platform_announcement\ndata: ${JSON.stringify(eventPayload)}\n\n`;

  // 1. Deliver to active browser sessions via SSE respecting strict role isolation
  for (const client of sseClients) {
    const isTenantMatch = isGlobal ? true : (client.tenantId === cleanTenantId);
    if (!isTenantMatch) continue;

    // Strict role isolation:
    if (targetRole === 'SUPERADMIN' && client.role !== 'SUPERADMIN') continue;
    if (targetRole === 'ADMIN' && client.role !== 'ADMIN') continue;
    if (targetRole === 'CASHIER' && client.role !== 'CASHIER') continue;
    if (targetRole === 'ALL') {
      // Store-specific alerts should not bleed into superadmin
      if (cleanTenantId !== null && client.role === 'SUPERADMIN') continue;
    }

    try {
      client.res.write(sseMessage);
    } catch {
      sseClients.delete(client);
    }
  }

  // 2. Deliver via Web Push API
  if (!vapidPublicKey || !vapidPrivateKey) {
    return;
  }

  try {
    await ensurePushSubscriptionsSchema();
    let query: string;
    let params: any[];

    if (targetRole === 'SUPERADMIN') {
      query = `SELECT endpoint, p256dh, auth FROM public.push_subscriptions WHERE UPPER(user_role) = 'SUPERADMIN'`;
      params = [];
    } else if (targetRole === 'ADMIN') {
      query = isGlobal
        ? `SELECT endpoint, p256dh, auth FROM public.push_subscriptions WHERE UPPER(user_role) = 'ADMIN' AND tenant_id != 0`
        : `SELECT endpoint, p256dh, auth FROM public.push_subscriptions WHERE tenant_id = $1 AND UPPER(user_role) = 'ADMIN'`;
      params = isGlobal ? [] : [cleanTenantId];
    } else if (targetRole === 'CASHIER') {
      query = isGlobal
        ? `SELECT endpoint, p256dh, auth FROM public.push_subscriptions WHERE UPPER(user_role) = 'CASHIER' AND tenant_id != 0`
        : `SELECT endpoint, p256dh, auth FROM public.push_subscriptions WHERE tenant_id = $1 AND UPPER(user_role) = 'CASHIER'`;
      params = isGlobal ? [] : [cleanTenantId];
    } else {
      // 'ALL'
      query = isGlobal
        ? `SELECT endpoint, p256dh, auth FROM public.push_subscriptions`
        : `SELECT endpoint, p256dh, auth FROM public.push_subscriptions WHERE tenant_id = $1 AND UPPER(user_role) IN ('ADMIN', 'CASHIER')`;
      params = isGlobal ? [] : [cleanTenantId];
    }

    const subsRes = await pgClient.query<{
      endpoint: string;
      p256dh: string;
      auth: string;
    }>(query, params);

    if (subsRes.rows.length === 0) return;

    const pushData = JSON.stringify({
      title: payload.title,
      body: payload.message,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag: `platform-${payload.id || Date.now()}`,
      data: {
        url: payload.actionUrl || '/',
        type: payload.type || 'INFO',
        notificationId: payload.id,
        targetRole,
        timestamp: eventPayload.timestamp,
      },
      actions: payload.actionUrl
        ? [{ action: 'open_announcement', title: payload.actionLabel || 'View Notice' }]
        : undefined,
    });

    const sendPromises = subsRes.rows.map(async (row) => {
      const pushSub: webpush.PushSubscription = {
        endpoint: row.endpoint,
        keys: {
          p256dh: row.p256dh,
          auth: row.auth,
        },
      };

      try {
        await webpush.sendNotification(pushSub, pushData, {
          TTL: 60 * 60 * 24 * 7, // 7 days
          urgency: payload.type === 'URGENT' ? 'high' : 'normal',
        });
      } catch (pushErr: any) {
        const code = pushErr?.statusCode;
        if (code === 404 || code === 410 || code === 401 || code === 403) {
          await removePushSubscription(row.endpoint).catch(() => {});
        }
      }
    });

    await Promise.allSettled(sendPromises);
  } catch (err) {
    console.error('Error during Platform Announcement Web Push dispatch:', err);
  }
}
