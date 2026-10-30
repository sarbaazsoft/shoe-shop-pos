import { Router } from 'express';
import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { getVapidPublicKey, registerSseClient, savePushSubscription, removePushSubscription, notifyPosAction } from '../pushNotificationService.ts';
import { extractTokenFromRequest } from '../auth.ts';
import { pgClient } from '../../db/index.ts';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'shoe-pos-super-secure-jwt-secret-key-2026';

function resolveRequestIdentity(req: Request): { tenantId: number; userId: number; role: string } {
  const token = extractTokenFromRequest(req);
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      return {
        tenantId: Number(decoded?.tenantId || 0) || 1,
        userId: Number(decoded?.id || decoded?.userId || 0),
        role: String(decoded?.role || 'CASHIER'),
      };
    } catch {}
  }

  const queryToken = typeof req.query.__token === 'string' ? req.query.__token : '';
  if (queryToken) {
    try {
      const decoded = jwt.verify(queryToken, JWT_SECRET) as any;
      return {
        tenantId: Number(decoded?.tenantId || 0) || 1,
        userId: Number(decoded?.id || decoded?.userId || 0),
        role: String(decoded?.role || 'CASHIER'),
      };
    } catch {}
  }

  const headerTenantId = Number(
    req.headers['x-tenant-id'] ||
    (req as any).tenantResolution?.tenant?.id ||
    req.query.__tenantId ||
    req.query.tenantId ||
    1
  );

  return {
    tenantId: Number.isInteger(headerTenantId) && headerTenantId > 0 ? headerTenantId : 1,
    userId: 0,
    role: 'ANONYMOUS',
  };
}

import { ensurePlatformNotificationsSchema } from '../../db/schemaInit.ts';

// GET /api/notifications - List recent notification alerts or transactions plus platform announcements
router.get('/', async (req: Request, res: Response) => {
  try {
    await ensurePlatformNotificationsSchema();
    const { tenantId, userId } = resolveRequestIdentity(req);
    const cleanTenantId = tenantId || 1;

    // 1. Fetch recent sales activities
    const salesRes = await pgClient.query(
      `SELECT id, invoice_number, total_amount, sale_date, created_at
       FROM sales
       WHERE tenant_id = $1
       ORDER BY id DESC
       LIMIT 15`,
      [cleanTenantId]
    ).catch(() => ({ rows: [] }));

    const posNotifications = salesRes.rows.map((row: any) => ({
      id: row.id,
      type: 'SALE',
      title: `Sale Confirmed #${row.invoice_number || row.id}`,
      message: `Invoice for Rs. ${Number(row.total_amount || 0).toLocaleString()} completed.`,
      timestamp: row.created_at || row.sale_date || new Date().toISOString(),
      deepLinkUrl: '/reports',
    }));

    // 2. Fetch active platform announcements from SuperAdmin
    const announcementsRes = await pgClient.query<{
      id: number;
      tenant_id: number | null;
      title: string;
      message: string;
      type: string;
      action_url: string;
      action_label: string;
      created_by: number | null;
      created_by_name: string | null;
      expires_at: string | null;
      created_at: string;
      is_read: boolean;
    }>(
      `SELECT
         pn.id,
         pn.tenant_id,
         pn.title,
         pn.message,
         pn.type,
         pn.action_url,
         pn.action_label,
         pn.created_by,
         COALESCE(u.name, 'Platform SuperAdmin') AS created_by_name,
         pn.expires_at,
         pn.created_at,
         EXISTS (
           SELECT 1 FROM platform_notification_reads pnr
           WHERE pnr.notification_id = pn.id
             AND (pnr.tenant_id = $1 OR pnr.user_id = $2)
         ) AS is_read
       FROM platform_notifications pn
       LEFT JOIN users u ON u.id = pn.created_by
       WHERE (pn.tenant_id IS NULL OR pn.tenant_id = $1)
         AND (pn.expires_at IS NULL OR pn.expires_at > NOW())
       ORDER BY pn.created_at DESC
       LIMIT 30`,
      [cleanTenantId, userId]
    ).catch(() => ({ rows: [] }));

    const announcements = announcementsRes.rows.map((r) => ({
      id: r.id,
      tenantId: r.tenant_id,
      title: r.title,
      message: r.message,
      type: r.type,
      actionUrl: r.action_url,
      actionLabel: r.action_label,
      createdBy: r.created_by,
      createdByName: r.created_by_name,
      expiresAt: r.expires_at,
      createdAt: r.created_at,
      isRead: Boolean(r.is_read),
    }));

    const unreadAnnouncementsCount = announcements.filter((a) => !a.isRead).length;

    res.json({
      notifications: posNotifications,
      announcements,
      unreadAnnouncementsCount,
    });
  } catch (err: any) {
    res.json({
      notifications: [],
      announcements: [],
      unreadAnnouncementsCount: 0,
    });
  }
});

// GET /api/notifications/platform - List platform announcements for store tenant
router.get('/platform', async (req: Request, res: Response) => {
  try {
    await ensurePlatformNotificationsSchema();
    const { tenantId, userId } = resolveRequestIdentity(req);
    const cleanTenantId = tenantId || 1;

    const announcementsRes = await pgClient.query<{
      id: number;
      tenant_id: number | null;
      title: string;
      message: string;
      type: string;
      action_url: string;
      action_label: string;
      created_by: number | null;
      created_by_name: string | null;
      expires_at: string | null;
      created_at: string;
      is_read: boolean;
    }>(
      `SELECT
         pn.id,
         pn.tenant_id,
         pn.title,
         pn.message,
         pn.type,
         pn.action_url,
         pn.action_label,
         pn.created_by,
         COALESCE(u.name, 'Platform SuperAdmin') AS created_by_name,
         pn.expires_at,
         pn.created_at,
         EXISTS (
           SELECT 1 FROM platform_notification_reads pnr
           WHERE pnr.notification_id = pn.id
             AND (pnr.tenant_id = $1 OR pnr.user_id = $2)
         ) AS is_read
       FROM platform_notifications pn
       LEFT JOIN users u ON u.id = pn.created_by
       WHERE (pn.tenant_id IS NULL OR pn.tenant_id = $1)
         AND (pn.expires_at IS NULL OR pn.expires_at > NOW())
       ORDER BY pn.created_at DESC
       LIMIT 30`,
      [cleanTenantId, userId]
    ).catch(() => ({ rows: [] }));

    const announcements = announcementsRes.rows.map((r) => ({
      id: r.id,
      tenantId: r.tenant_id,
      title: r.title,
      message: r.message,
      type: r.type,
      actionUrl: r.action_url,
      actionLabel: r.action_label,
      createdBy: r.created_by,
      createdByName: r.created_by_name,
      expiresAt: r.expires_at,
      createdAt: r.created_at,
      isRead: Boolean(r.is_read),
    }));

    const unreadCount = announcements.filter((a) => !a.isRead).length;

    res.json({ announcements, unreadCount });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve announcements: ' + err.message });
  }
});

// POST /api/notifications/platform/:id/dismiss - Mark announcement as read/dismissed
router.post('/platform/:id/dismiss', async (req: Request, res: Response) => {
  try {
    await ensurePlatformNotificationsSchema();
    const { tenantId, userId } = resolveRequestIdentity(req);
    const cleanTenantId = tenantId || 1;
    const notificationId = parseInt(req.params.id, 10);

    if (!Number.isInteger(notificationId) || notificationId <= 0) {
      return res.status(400).json({ error: 'Invalid notification ID' });
    }

    await pgClient.query(
      `INSERT INTO platform_notification_reads (notification_id, tenant_id, user_id, read_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (notification_id, tenant_id, user_id) DO UPDATE SET read_at = NOW()`,
      [notificationId, cleanTenantId, userId]
    );

    res.json({ success: true, message: 'Notification dismissed.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to dismiss notification: ' + err.message });
  }
});

// POST /api/notifications/platform/dismiss-all - Mark all announcements as read for this store
router.post('/platform/dismiss-all', async (req: Request, res: Response) => {
  try {
    await ensurePlatformNotificationsSchema();
    const { tenantId, userId } = resolveRequestIdentity(req);
    const cleanTenantId = tenantId || 1;

    await pgClient.query(
      `INSERT INTO platform_notification_reads (notification_id, tenant_id, user_id, read_at)
       SELECT pn.id, $1, $2, NOW()
       FROM platform_notifications pn
       WHERE (pn.tenant_id IS NULL OR pn.tenant_id = $1)
       ON CONFLICT (notification_id, tenant_id, user_id) DO UPDATE SET read_at = NOW()`,
      [cleanTenantId, userId]
    );

    res.json({ success: true, message: 'All notifications dismissed.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to dismiss all notifications: ' + err.message });
  }
});

// GET /api/notifications/vapid-public-key - Return Web Push VAPID public key
router.get('/vapid-public-key', (_req: Request, res: Response) => {
  try {
    const publicKey = getVapidPublicKey();
    res.json({ publicKey });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve VAPID key' });
  }
});

// POST /api/notifications/subscribe - Save device push subscription
router.post('/subscribe', async (req: Request, res: Response) => {
  try {
    const { tenantId, userId } = resolveRequestIdentity(req);
    const subscription = req.body?.subscription || req.body;
    const userAgent = req.headers['user-agent'] || '';

    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ success: false, error: 'Invalid subscription object' });
    }

    const success = await savePushSubscription(tenantId, userId, subscription, userAgent);
    res.json({ success });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to save subscription' });
  }
});

// POST /api/notifications/unsubscribe - Delete push subscription endpoint
router.post('/unsubscribe', async (req: Request, res: Response) => {
  try {
    const endpoint = req.body?.endpoint || req.query?.endpoint;
    if (!endpoint) {
      return res.status(400).json({ success: false, error: 'Endpoint is required' });
    }

    const success = await removePushSubscription(String(endpoint));
    res.json({ success });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to remove subscription' });
  }
});

// POST /api/notifications/test-push - Send test push alert
router.post('/test-push', async (req: Request, res: Response) => {
  try {
    const { tenantId } = resolveRequestIdentity(req);
    await notifyPosAction(tenantId, {
      type: 'SALE',
      title: 'POS Test Alert',
      message: 'Web Push and real-time alerts are operational on this device.',
      invoiceNumber: 'TEST-001',
      totalAmount: 1000,
      timestamp: new Date().toISOString(),
      deepLinkUrl: '/pos',
    });
    res.json({ success: true, message: 'Test notification triggered successfully.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to send test alert' });
  }
});

// GET /api/notifications/stream - Server-Sent Events (SSE) real-time stream
router.get('/stream', (req: Request, res: Response) => {
  const { tenantId } = resolveRequestIdentity(req);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  // Immediately acknowledge connection
  res.write(`event: connected\ndata: ${JSON.stringify({ type: 'CONNECTED', tenantId, timestamp: new Date().toISOString() })}\n\n`);

  const unregister = registerSseClient(tenantId, res);

  // Heartbeat to keep connection open across reverse proxies and firewalls
  const heartbeatInterval = setInterval(() => {
    try {
      res.write(': keepalive\n\n');
    } catch {
      clearInterval(heartbeatInterval);
      unregister();
    }
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeatInterval);
    unregister();
  });
});

export default router;
