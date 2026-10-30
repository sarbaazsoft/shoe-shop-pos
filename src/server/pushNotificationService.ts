import webpush from 'web-push';
import type { Response } from 'express';
import { pgClient } from '../db/index.ts';
import { ensurePushSubscriptionsSchema } from '../db/schemaInit.ts';
import { getCachedAppSetting, getAppSetting, registerSettingsUpdateListener } from './services/appSettingsService.ts';

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

// Active SSE client connections keyed by tenant_id for real-time dashboard session push
const sseClientsByTenant = new Map<number, Set<Response>>();

export function registerSseClient(tenantId: number, res: Response): () => void {
  const cleanTenantId = Number(tenantId) || 1;
  let clientSet = sseClientsByTenant.get(cleanTenantId);
  if (!clientSet) {
    clientSet = new Set<Response>();
    sseClientsByTenant.set(cleanTenantId, clientSet);
  }
  clientSet.add(res);

  const cleanup = () => {
    const set = sseClientsByTenant.get(cleanTenantId);
    if (set) {
      set.delete(res);
      if (set.size === 0) {
        sseClientsByTenant.delete(cleanTenantId);
      }
    }
  };

  return cleanup;
}

export interface PosActionNotification {
  type: 'SALE' | 'RETURN' | 'EXCHANGE';
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
  itemsSummary?: string;
  exchangeDetails?: {
    oldItems: string;
    newItems: string;
    netDifference: number;
  };
  deepLinkUrl: string;
  timestamp: string;
  triggeredBy?: string;
}

/**
 * Saves a browser or PWA Web Push subscription scoped to tenant and user.
 */
export async function savePushSubscription(
  tenantId: number,
  userId: number,
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

    if (!endpoint || !p256dh || !auth) {
      return false;
    }

    await pgClient.query(
      `INSERT INTO public.push_subscriptions (
        tenant_id, user_id, endpoint, p256dh, auth, user_agent, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (endpoint) DO UPDATE SET
        tenant_id = EXCLUDED.tenant_id,
        user_id = EXCLUDED.user_id,
        p256dh = EXCLUDED.p256dh,
        auth = EXCLUDED.auth,
        user_agent = EXCLUDED.user_agent,
        updated_at = NOW()`,
      [tenantId, userId, endpoint, p256dh, auth, userAgent]
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
 * 1. Active Web browser sessions via Server-Sent Events (SSE)
 * 2. Mobile Android/Apple installed PWAs and background web sessions via Web Push API
 */
export async function notifyPosAction(
  tenantId: number,
  payload: PosActionNotification
): Promise<void> {
  const cleanTenantId = Number(tenantId) || 1;

  // 1. Deliver to active browser dashboard sessions via Server-Sent Events (SSE)
  const clientSet = sseClientsByTenant.get(cleanTenantId);
  if (clientSet && clientSet.size > 0) {
    const sseMessage = `event: pos_action\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const clientRes of clientSet) {
      try {
        clientRes.write(sseMessage);
      } catch (writeErr) {
        // Closed socket, remove
        clientSet.delete(clientRes);
      }
    }
  }

  // Also notify SuperAdmin dashboard if connected
  const superAdminSet = sseClientsByTenant.get(0);
  if (superAdminSet && superAdminSet.size > 0 && cleanTenantId !== 0) {
    const sseMessage = `event: pos_action\ndata: ${JSON.stringify({ ...payload, storeTenantId: cleanTenantId })}\n\n`;
    for (const clientRes of superAdminSet) {
      try {
        clientRes.write(sseMessage);
      } catch {
        superAdminSet.delete(clientRes);
      }
    }
  }

  // 2. Deliver via Web Push API to installed PWAs and subscribed web browsers
  if (!vapidPublicKey || !vapidPrivateKey) {
    return;
  }

  try {
    await ensurePushSubscriptionsSchema();
    const subsRes = await pgClient.query<{
      endpoint: string;
      p256dh: string;
      auth: string;
    }>(
      `SELECT endpoint, p256dh, auth
       FROM public.push_subscriptions
       WHERE tenant_id = $1 OR tenant_id = 0`,
      [cleanTenantId]
    );

    if (subsRes.rows.length === 0) {
      return;
    }

    const pushData = JSON.stringify({
      title: payload.title,
      body: payload.message,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag: `pos-${payload.type.toLowerCase()}-${payload.invoiceNumber || Date.now()}`,
      data: {
        url: payload.deepLinkUrl,
        type: payload.type,
        invoiceNumber: payload.invoiceNumber,
        orderId: payload.orderId,
        saleId: payload.saleId,
        returnNumber: payload.returnNumber,
        timestamp: payload.timestamp,
      },
      actions: [
        { action: 'open_receipt', title: 'View Receipt / Details' },
      ],
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
          TTL: 60 * 60 * 24, // 24 hours
          urgency: 'high',
        });
      } catch (pushErr: any) {
        // Prune expired or invalid subscriptions (404 Not Found or 410 Gone)
        // 401/403 = subscription was created with a different VAPID key (e.g. keys regenerated); it can never work again.
        const code = pushErr?.statusCode;
        if (code === 404 || code === 410 || code === 401 || code === 403) {
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
}

export interface PlatformAnnouncementNotification {
  id?: number;
  tenantId?: number | null;
  title: string;
  message: string;
  type?: 'INFO' | 'WARNING' | 'SUCCESS' | 'URGENT' | string;
  actionUrl?: string;
  actionLabel?: string;
  timestamp?: string;
}

/**
 * Dispatches a custom announcement from SuperAdmin to all stores (global broadcast)
 * or to a targeted store, via real-time SSE stream and background Web Push.
 */
export async function notifyPlatformAnnouncement(
  payload: PlatformAnnouncementNotification
): Promise<void> {
  const isGlobal = payload.tenantId === null || payload.tenantId === undefined || Number(payload.tenantId) === 0;
  const cleanTenantId = isGlobal ? null : (Number(payload.tenantId) || null);

  const eventPayload = {
    id: payload.id,
    type: payload.type || 'INFO',
    title: payload.title,
    message: payload.message,
    actionUrl: payload.actionUrl || '',
    actionLabel: payload.actionLabel || '',
    tenantId: cleanTenantId,
    timestamp: payload.timestamp || new Date().toISOString(),
  };

  const sseMessage = `event: platform_announcement\ndata: ${JSON.stringify(eventPayload)}\n\n`;

  // 1. Deliver to active browser sessions via SSE
  if (isGlobal) {
    for (const [, clientSet] of sseClientsByTenant.entries()) {
      for (const clientRes of clientSet) {
        try {
          clientRes.write(sseMessage);
        } catch {
          clientSet.delete(clientRes);
        }
      }
    }
  } else if (cleanTenantId !== null) {
    const targetSet = sseClientsByTenant.get(cleanTenantId);
    if (targetSet) {
      for (const clientRes of targetSet) {
        try {
          clientRes.write(sseMessage);
        } catch {
          targetSet.delete(clientRes);
        }
      }
    }
  }

  // Also deliver to superadmin sessions (tenant_id = 0)
  const superAdminSet = sseClientsByTenant.get(0);
  if (superAdminSet && (!cleanTenantId || cleanTenantId !== 0)) {
    for (const clientRes of superAdminSet) {
      try {
        clientRes.write(sseMessage);
      } catch {
        superAdminSet.delete(clientRes);
      }
    }
  }

  // 2. Deliver via Web Push API
  if (!vapidPublicKey || !vapidPrivateKey) {
    return;
  }

  try {
    await ensurePushSubscriptionsSchema();
    const query = isGlobal
      ? `SELECT endpoint, p256dh, auth FROM public.push_subscriptions`
      : `SELECT endpoint, p256dh, auth FROM public.push_subscriptions WHERE tenant_id = $1 OR tenant_id = 0`;
    const params = isGlobal ? [] : [cleanTenantId];

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
