import { Router } from 'express';
import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { getVapidPublicKey, registerSseClient, savePushSubscription, removePushSubscription, notifyPosAction } from '../pushNotificationService.ts';
import { extractTokenFromRequest } from '../auth.ts';
import { pgClient } from '../../db/index.ts';
import { ensurePlatformNotificationsSchema } from '../../db/schemaInit.ts';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'shoe-pos-super-secure-jwt-secret-key-2026';

function resolveRequestIdentity(req: Request): { tenantId: number; userId: number; role: string } {
  const token = extractTokenFromRequest(req);
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      const tid = Number(decoded?.tenantId || 0);
      return {
        tenantId: Number.isInteger(tid) && tid > 0 ? tid : 1,
        userId: Number(decoded?.id || decoded?.userId || 0),
        role: String(decoded?.role || 'CASHIER').toUpperCase(),
      };
    } catch {}
  }

  const queryToken = typeof req.query.__token === 'string' ? req.query.__token : '';
  if (queryToken) {
    try {
      const decoded = jwt.verify(queryToken, JWT_SECRET) as any;
      const tid = Number(decoded?.tenantId || 0);
      return {
        tenantId: Number.isInteger(tid) && tid > 0 ? tid : 1,
        userId: Number(decoded?.id || decoded?.userId || 0),
        role: String(decoded?.role || 'CASHIER').toUpperCase(),
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

/**
 * 1. GROUPED DROPDOWN ENDPOINT (GET /api/notifications/grouped)
 * Returns capped arrays (e.g. max 5 per tab) for the quick-access bell menu
 * to prevent UI overflow.
 * - Tab 1: Notices (SuperAdmin announcements, system notices, subscription alerts)
 * - Tab 2: Notifications (POS operational counter events, sales, returns)
 */
router.get('/grouped', async (req: Request, res: Response) => {
  try {
    await ensurePlatformNotificationsSchema();
    const { tenantId, userId, role } = resolveRequestIdentity(req);
    const cleanTenantId = tenantId || 1;
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || '5'), 10) || 5, 1), 10);

    // 1. Fetch active Platform Notices: (expires_at IS NULL OR expires_at > NOW()) and NOT dismissed
    const noticesRes = await pgClient.query<{
      id: number;
      tenant_id: number | null;
      target_role: string;
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
         COALESCE(pn.target_role, 'ALL') AS target_role,
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
       WHERE (pn.expires_at IS NULL OR pn.expires_at > NOW())
         AND NOT EXISTS (
           SELECT 1 FROM platform_notification_reads pnr
           WHERE pnr.notification_id = pn.id
             AND (pnr.tenant_id = $1 OR pnr.user_id = $2)
         )
         AND (
           CASE
             WHEN $3 = 'SUPERADMIN' THEN (
               COALESCE(pn.target_role, 'ALL') IN ('ALL', 'SUPERADMIN')
               AND pn.title NOT ILIKE 'Welcome to SarbaazSoft%'
             )
             WHEN $3 = 'ADMIN' THEN (
               (pn.tenant_id IS NULL OR pn.tenant_id = $1)
               AND COALESCE(pn.target_role, 'ALL') IN ('ALL', 'ADMIN')
               AND COALESCE(pn.target_role, 'ALL') != 'SUPERADMIN'
               AND pn.title NOT ILIKE 'New Free Trial%'
               AND pn.title NOT ILIKE 'Renewal Request%'
               AND pn.action_url NOT ILIKE '%/superadmin%'
             )
             WHEN $3 = 'CASHIER' THEN (
               (pn.tenant_id IS NULL OR pn.tenant_id = $1)
               AND COALESCE(pn.target_role, 'ALL') IN ('ALL', 'CASHIER')
               AND COALESCE(pn.target_role, 'ALL') != 'SUPERADMIN'
               AND pn.title NOT ILIKE 'Welcome to SarbaazSoft%'
               AND pn.title NOT ILIKE 'New Free Trial%'
               AND pn.title NOT ILIKE 'Renewal Request%'
               AND pn.action_url NOT ILIKE '%/superadmin%'
             )
             ELSE (
               (pn.tenant_id IS NULL OR pn.tenant_id = $1)
               AND COALESCE(pn.target_role, 'ALL') = 'ALL'
               AND COALESCE(pn.target_role, 'ALL') != 'SUPERADMIN'
               AND pn.title NOT ILIKE 'New Free Trial%'
               AND pn.title NOT ILIKE 'Renewal Request%'
               AND pn.action_url NOT ILIKE '%/superadmin%'
             )
           END
         )
       ORDER BY pn.created_at DESC
       LIMIT $4`,
      [cleanTenantId, userId, role, limit]
    ).catch(() => ({ rows: [] }));

    const notices = noticesRes.rows.map((r) => ({
      id: r.id,
      tenantId: r.tenant_id,
      targetRole: r.target_role,
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

    // 2. Fetch active POS Operational Notifications (Sales & Returns)
    // Strictly enforces a 48-hour sliding window (created_at >= NOW() - INTERVAL '48 HOURS')
    // Excludes records present in pos_notification_dismissals
    // Cashiers ONLY receive notifications for their own operations
    let operationalNotifications: any[] = [];
    if (role !== 'SUPERADMIN') {
      const salesRes = await pgClient.query(
        `SELECT
           s.id,
           s.invoice_number,
           s.total_amount,
           s.sale_date,
           s.created_at,
           'SALE' AS item_type
         FROM sales s
         WHERE s.tenant_id = $1
           AND s.created_at >= NOW() - INTERVAL '48 HOURS'
           AND (CASE WHEN $4 = 'CASHIER' THEN s.created_by = $2 ELSE TRUE END)
           AND NOT EXISTS (
             SELECT 1 FROM pos_notification_dismissals pnd
             WHERE pnd.tenant_id = $1
               AND (pnd.user_id = $2 OR pnd.user_id = 0)
               AND pnd.item_type = 'SALE'
               AND pnd.item_id = s.id
           )
         ORDER BY s.created_at DESC
         LIMIT $3`,
        [cleanTenantId, userId, limit, role]
      ).catch(() => ({ rows: [] }));

      const returnsRes = await pgClient.query(
        `SELECT
           r.id,
           r.return_number,
           r.total_refund_amount,
           r.reason,
           r.return_date,
           r.created_at,
           'RETURN' AS item_type
         FROM returns r
         WHERE r.tenant_id = $1
           AND r.created_at >= NOW() - INTERVAL '48 HOURS'
           AND (CASE WHEN $4 = 'CASHIER' THEN r.created_by = $2 ELSE TRUE END)
           AND NOT EXISTS (
             SELECT 1 FROM pos_notification_dismissals pnd
             WHERE pnd.tenant_id = $1
               AND (pnd.user_id = $2 OR pnd.user_id = 0)
               AND pnd.item_type = 'RETURN'
               AND pnd.item_id = r.id
           )
         ORDER BY r.created_at DESC
         LIMIT $3`,
        [cleanTenantId, userId, limit, role]
      ).catch(() => ({ rows: [] }));

      const mappedSales = salesRes.rows.map((row: any) => ({
        id: `sale-${row.id}`,
        rawId: row.id,
        itemType: 'SALE',
        type: 'SALE',
        title: `Sale Confirmed #${row.invoice_number || row.id}`,
        message: `Invoice for Rs. ${Number(row.total_amount || 0).toLocaleString()} completed at counter.`,
        totalAmount: Number(row.total_amount || 0),
        invoiceNumber: row.invoice_number || String(row.id),
        deepLinkUrl: '/reports',
        actionTab: 'reports',
        createdAt: row.created_at || row.sale_date || new Date().toISOString(),
        timestamp: row.created_at || row.sale_date || new Date().toISOString(),
        isRead: false,
      }));

      const mappedReturns = returnsRes.rows.map((row: any) => ({
        id: `return-${row.id}`,
        rawId: row.id,
        itemType: 'RETURN',
        type: 'RETURN',
        title: `Customer Return #${row.return_number || row.id}`,
        message: `Refund of Rs. ${Number(row.total_refund_amount || 0).toLocaleString()} processed (${row.reason || 'Customer refund'}).`,
        totalAmount: Number(row.total_refund_amount || 0),
        returnNumber: row.return_number || String(row.id),
        deepLinkUrl: '/returns',
        actionTab: 'returns',
        createdAt: row.created_at || row.return_date || new Date().toISOString(),
        timestamp: row.created_at || row.return_date || new Date().toISOString(),
        isRead: false,
      }));

      // Combine and cap at limit (max 5)
      operationalNotifications = [...mappedSales, ...mappedReturns]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, limit);
    }

    const unreadNoticesCount = notices.length;
    const unreadNotificationsCount = operationalNotifications.length;
    const totalUnread = unreadNoticesCount + unreadNotificationsCount;

    return res.json({
      notices,
      notifications: operationalNotifications,
      unreadNoticesCount,
      unreadNotificationsCount,
      totalUnread,
      limit,
    });
  } catch (err: any) {
    return res.status(500).json({
      error: 'Failed to retrieve grouped notifications: ' + err.message,
      notices: [],
      notifications: [],
      unreadNoticesCount: 0,
      unreadNotificationsCount: 0,
      totalUnread: 0,
      limit: 5,
    });
  }
});

/**
 * 2. DEDICATED HISTORY ENDPOINT (GET /api/notifications/all)
 * Supports pagination, search filters, category filters, and sorting for a full historical view.
 */
router.get('/all', async (req: Request, res: Response) => {
  try {
    await ensurePlatformNotificationsSchema();
    const { tenantId, userId, role } = resolveRequestIdentity(req);
    const cleanTenantId = tenantId || 1;

    const page = Math.max(parseInt(String(req.query.page || '1'), 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || '15'), 10) || 15, 1), 100);
    const tabFilter = String(req.query.tab || req.query.category || 'all').toLowerCase();
    const search = String(req.query.search || '').trim().toLowerCase();
    const sortOrder = String(req.query.sortOrder || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
    const unreadOnly = String(req.query.unreadOnly || 'false') === 'true';

    // 1. Fetch historical Platform Notices
    let noticeItems: any[] = [];
    if (tabFilter === 'all' || tabFilter === 'notices' || tabFilter === 'urgent') {
      const noticesQuery = await pgClient.query<{
        id: number;
        tenant_id: number | null;
        target_role: string;
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
           COALESCE(pn.target_role, 'ALL') AS target_role,
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
         WHERE (
           CASE
             WHEN $3 = 'SUPERADMIN' THEN (
               COALESCE(pn.target_role, 'ALL') IN ('ALL', 'SUPERADMIN')
               AND pn.title NOT ILIKE 'Welcome to SarbaazSoft%'
             )
             WHEN $3 = 'ADMIN' THEN (
               (pn.tenant_id IS NULL OR pn.tenant_id = $1)
               AND COALESCE(pn.target_role, 'ALL') IN ('ALL', 'ADMIN')
               AND COALESCE(pn.target_role, 'ALL') != 'SUPERADMIN'
               AND pn.title NOT ILIKE 'New Free Trial%'
               AND pn.title NOT ILIKE 'Renewal Request%'
               AND pn.action_url NOT ILIKE '%/superadmin%'
             )
             WHEN $3 = 'CASHIER' THEN (
               (pn.tenant_id IS NULL OR pn.tenant_id = $1)
               AND COALESCE(pn.target_role, 'ALL') IN ('ALL', 'CASHIER')
               AND COALESCE(pn.target_role, 'ALL') != 'SUPERADMIN'
               AND pn.title NOT ILIKE 'Welcome to SarbaazSoft%'
               AND pn.title NOT ILIKE 'New Free Trial%'
               AND pn.title NOT ILIKE 'Renewal Request%'
               AND pn.action_url NOT ILIKE '%/superadmin%'
             )
             ELSE (
               (pn.tenant_id IS NULL OR pn.tenant_id = $1)
               AND COALESCE(pn.target_role, 'ALL') = 'ALL'
               AND COALESCE(pn.target_role, 'ALL') != 'SUPERADMIN'
               AND pn.title NOT ILIKE 'New Free Trial%'
               AND pn.title NOT ILIKE 'Renewal Request%'
               AND pn.action_url NOT ILIKE '%/superadmin%'
             )
           END
         )
         ORDER BY pn.created_at DESC
         LIMIT 300`,
        [cleanTenantId, userId, role]
      ).catch(() => ({ rows: [] }));

      noticeItems = noticesQuery.rows.map((r) => ({
        id: `notice-${r.id}`,
        rawId: r.id,
        kind: 'NOTICE',
        itemType: 'NOTICE',
        type: r.type,
        title: r.title,
        message: r.message,
        actionUrl: r.action_url,
        actionLabel: r.action_label,
        deepLinkUrl: r.action_url,
        tenantId: r.tenant_id,
        targetRole: r.target_role,
        createdAt: r.created_at,
        expiresAt: r.expires_at,
        isRead: Boolean(r.is_read),
      }));
    }

    // 2. Fetch historical POS Operational Activity (Sales & Returns)
    // Cashiers ONLY view historical notifications for their own operations
    let operationalItems: any[] = [];
    if (role !== 'SUPERADMIN' && (tabFilter === 'all' || tabFilter === 'notifications' || tabFilter === 'operational' || tabFilter === 'sales' || tabFilter === 'returns')) {
      const salesRes = await pgClient.query(
        `SELECT
           s.id,
           s.invoice_number,
           s.total_amount,
           s.sale_date,
           s.created_at,
           EXISTS (
             SELECT 1 FROM pos_notification_dismissals pnd
             WHERE pnd.tenant_id = $1
               AND (pnd.user_id = $2 OR pnd.user_id = 0)
               AND pnd.item_type = 'SALE'
               AND pnd.item_id = s.id
           ) AS is_dismissed
         FROM sales s
         WHERE s.tenant_id = $1
           AND (CASE WHEN $3 = 'CASHIER' THEN s.created_by = $2 ELSE TRUE END)
         ORDER BY s.created_at DESC
         LIMIT 200`,
        [cleanTenantId, userId, role]
      ).catch(() => ({ rows: [] }));

      const returnsRes = await pgClient.query(
        `SELECT
           r.id,
           r.return_number,
           r.total_refund_amount,
           r.reason,
           r.return_date,
           r.created_at,
           EXISTS (
             SELECT 1 FROM pos_notification_dismissals pnd
             WHERE pnd.tenant_id = $1
               AND (pnd.user_id = $2 OR pnd.user_id = 0)
               AND pnd.item_type = 'RETURN'
               AND pnd.item_id = r.id
           ) AS is_dismissed
         FROM returns r
         WHERE r.tenant_id = $1
           AND (CASE WHEN $3 = 'CASHIER' THEN r.created_by = $2 ELSE TRUE END)
         ORDER BY r.created_at DESC
         LIMIT 200`,
        [cleanTenantId, userId, role]
      ).catch(() => ({ rows: [] }));

      const mappedSales = salesRes.rows.map((row: any) => ({
        id: `sale-${row.id}`,
        rawId: row.id,
        kind: 'OPERATIONAL',
        itemType: 'SALE',
        type: 'SALE',
        title: `Sale Confirmed #${row.invoice_number || row.id}`,
        message: `Invoice for Rs. ${Number(row.total_amount || 0).toLocaleString()} recorded at checkout.`,
        totalAmount: Number(row.total_amount || 0),
        invoiceNumber: row.invoice_number || String(row.id),
        deepLinkUrl: '/reports',
        createdAt: row.created_at || row.sale_date || new Date().toISOString(),
        expiresAt: null,
        isRead: Boolean(row.is_dismissed),
      }));

      const mappedReturns = returnsRes.rows.map((row: any) => ({
        id: `return-${row.id}`,
        rawId: row.id,
        kind: 'OPERATIONAL',
        itemType: 'RETURN',
        type: 'RETURN',
        title: `Customer Return #${row.return_number || row.id}`,
        message: `Refund of Rs. ${Number(row.total_refund_amount || 0).toLocaleString()} completed (${row.reason || 'Customer Return'}).`,
        totalAmount: Number(row.total_refund_amount || 0),
        returnNumber: row.return_number || String(row.id),
        deepLinkUrl: '/returns',
        createdAt: row.created_at || row.return_date || new Date().toISOString(),
        expiresAt: null,
        isRead: Boolean(row.is_dismissed),
      }));

      if (tabFilter === 'sales') {
        operationalItems = mappedSales;
      } else if (tabFilter === 'returns') {
        operationalItems = mappedReturns;
      } else {
        operationalItems = [...mappedSales, ...mappedReturns];
      }
    }

    // Calculate aggregate stats across all loaded items
    const totalNotices = noticeItems.length;
    const totalOperational = operationalItems.length;
    const unreadNotices = noticeItems.filter((i) => !i.isRead).length;
    const unreadOperational = operationalItems.filter((i) => !i.isRead).length;

    let combined = [...noticeItems, ...operationalItems];

    // Filter by type if specific tab was selected
    if (tabFilter === 'urgent') {
      combined = combined.filter((i) => i.type === 'URGENT');
    }

    // Filter by search keyword
    if (search) {
      combined = combined.filter(
        (i) =>
          (i.title || '').toLowerCase().includes(search) ||
          (i.message || '').toLowerCase().includes(search) ||
          (i.invoiceNumber || '').toLowerCase().includes(search) ||
          (i.returnNumber || '').toLowerCase().includes(search)
      );
    }

    // Filter by unread
    if (unreadOnly) {
      combined = combined.filter((i) => !i.isRead);
    }

    // Sorting
    combined.sort((a, b) => {
      const timeA = new Date(a.createdAt).getTime();
      const timeB = new Date(b.createdAt).getTime();
      return sortOrder === 'asc' ? timeA - timeB : timeB - timeA;
    });

    const total = combined.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const offset = (page - 1) * limit;
    const pagedItems = combined.slice(offset, offset + limit);

    return res.json({
      items: pagedItems,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
      stats: {
        totalNotices,
        totalOperational,
        unreadNotices,
        unreadOperational,
      },
    });
  } catch (err: any) {
    return res.status(500).json({
      error: 'Failed to retrieve notification history: ' + err.message,
      items: [],
      pagination: { page: 1, limit: 15, total: 0, totalPages: 1 },
      stats: { totalNotices: 0, totalOperational: 0, unreadNotices: 0, unreadOperational: 0 },
    });
  }
});

/**
 * 3. DISMISS MUTATION ENDPOINT (POST /api/notifications/:id/dismiss & /dismiss)
 * Instantly records user dismissal to remove the notice or operational item from active drawers.
 */
router.post(['/:id/dismiss', '/dismiss'], async (req: Request, res: Response) => {
  try {
    await ensurePlatformNotificationsSchema();
    const { tenantId, userId } = resolveRequestIdentity(req);
    const cleanTenantId = tenantId || 1;

    const rawIdParam = req.params.id || req.body?.id || '';
    const itemType = String(req.body?.itemType || '').toUpperCase();
    const cleanIdStr = String(rawIdParam).trim();

    if (!cleanIdStr) {
      return res.status(400).json({ error: 'Notification ID is required.' });
    }

    if (cleanIdStr.startsWith('notice-') || itemType === 'NOTICE' || /^\d+$/.test(cleanIdStr)) {
      const numericId = parseInt(cleanIdStr.replace(/^notice-/, ''), 10);
      if (Number.isInteger(numericId) && numericId > 0) {
        await pgClient.query(
          `INSERT INTO platform_notification_reads (notification_id, tenant_id, user_id, read_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (notification_id, tenant_id, user_id) DO UPDATE SET read_at = NOW()`,
          [numericId, cleanTenantId, userId]
        );
      }
    } else if (cleanIdStr.startsWith('sale-') || itemType === 'SALE') {
      const saleId = parseInt(cleanIdStr.replace(/^sale-/, ''), 10);
      if (Number.isInteger(saleId) && saleId > 0) {
        await pgClient.query(
          `INSERT INTO pos_notification_dismissals (tenant_id, user_id, item_type, item_id, dismissed_at)
           VALUES ($1, $2, 'SALE', $3, NOW())
           ON CONFLICT (tenant_id, user_id, item_type, item_id) DO UPDATE SET dismissed_at = NOW()`,
          [cleanTenantId, userId, saleId]
        );
      }
    } else if (cleanIdStr.startsWith('return-') || itemType === 'RETURN') {
      const returnId = parseInt(cleanIdStr.replace(/^return-/, ''), 10);
      if (Number.isInteger(returnId) && returnId > 0) {
        await pgClient.query(
          `INSERT INTO pos_notification_dismissals (tenant_id, user_id, item_type, item_id, dismissed_at)
           VALUES ($1, $2, 'RETURN', $3, NOW())
           ON CONFLICT (tenant_id, user_id, item_type, item_id) DO UPDATE SET dismissed_at = NOW()`,
          [cleanTenantId, userId, returnId]
        );
      }
    }

    return res.json({ success: true, message: 'Notification dismissed successfully.' });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to dismiss notification: ' + err.message });
  }
});

/**
 * 4. READ MUTATION ENDPOINT (POST /api/notifications/:id/read)
 * Marks item as read in state/backend.
 */
router.post('/:id/read', async (req: Request, res: Response) => {
  try {
    await ensurePlatformNotificationsSchema();
    const { tenantId, userId } = resolveRequestIdentity(req);
    const cleanTenantId = tenantId || 1;
    const cleanIdStr = String(req.params.id || '').trim();
    const itemType = String(req.body?.itemType || '').toUpperCase();

    if (cleanIdStr.startsWith('notice-') || itemType === 'NOTICE' || /^\d+$/.test(cleanIdStr)) {
      const numericId = parseInt(cleanIdStr.replace(/^notice-/, ''), 10);
      if (Number.isInteger(numericId) && numericId > 0) {
        await pgClient.query(
          `INSERT INTO platform_notification_reads (notification_id, tenant_id, user_id, read_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (notification_id, tenant_id, user_id) DO UPDATE SET read_at = NOW()`,
          [numericId, cleanTenantId, userId]
        );
      }
    } else if (cleanIdStr.startsWith('sale-') || itemType === 'SALE') {
      const saleId = parseInt(cleanIdStr.replace(/^sale-/, ''), 10);
      if (Number.isInteger(saleId) && saleId > 0) {
        await pgClient.query(
          `INSERT INTO pos_notification_dismissals (tenant_id, user_id, item_type, item_id, dismissed_at)
           VALUES ($1, $2, 'SALE', $3, NOW())
           ON CONFLICT (tenant_id, user_id, item_type, item_id) DO UPDATE SET dismissed_at = NOW()`,
          [cleanTenantId, userId, saleId]
        );
      }
    } else if (cleanIdStr.startsWith('return-') || itemType === 'RETURN') {
      const returnId = parseInt(cleanIdStr.replace(/^return-/, ''), 10);
      if (Number.isInteger(returnId) && returnId > 0) {
        await pgClient.query(
          `INSERT INTO pos_notification_dismissals (tenant_id, user_id, item_type, item_id, dismissed_at)
           VALUES ($1, $2, 'RETURN', $3, NOW())
           ON CONFLICT (tenant_id, user_id, item_type, item_id) DO UPDATE SET dismissed_at = NOW()`,
          [cleanTenantId, userId, returnId]
        );
      }
    }

    return res.json({ success: true, message: 'Notification marked as read.' });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to mark notification as read: ' + err.message });
  }
});

/**
 * 5. DISMISS ALL MUTATION (POST /api/notifications/dismiss-all & /mark-all-read)
 */
router.post(['/dismiss-all', '/mark-all-read'], async (req: Request, res: Response) => {
  try {
    await ensurePlatformNotificationsSchema();
    const { tenantId, userId, role } = resolveRequestIdentity(req);
    const cleanTenantId = tenantId || 1;

    // 1. Dismiss/read all eligible platform notices
    await pgClient.query(
      `INSERT INTO platform_notification_reads (notification_id, tenant_id, user_id, read_at)
       SELECT pn.id, $1, $2, NOW()
       FROM platform_notifications pn
       WHERE (pn.tenant_id IS NULL OR pn.tenant_id = $1)
         AND (pn.expires_at IS NULL OR pn.expires_at > NOW())
         AND (
           CASE
             WHEN $3 = 'SUPERADMIN' THEN COALESCE(pn.target_role, 'ALL') IN ('ALL', 'SUPERADMIN')
             ELSE COALESCE(pn.target_role, 'ALL') != 'SUPERADMIN'
           END
         )
       ON CONFLICT (notification_id, tenant_id, user_id) DO UPDATE SET read_at = NOW()`,
      [cleanTenantId, userId, role]
    ).catch(() => {});

    // 2. Dismiss/read all recent 48-hour sales & returns (scoped to cashier's own if role is CASHIER)
    if (role !== 'SUPERADMIN') {
      await pgClient.query(
        `INSERT INTO pos_notification_dismissals (tenant_id, user_id, item_type, item_id, dismissed_at)
         SELECT $1, $2, 'SALE', s.id, NOW()
         FROM sales s
         WHERE s.tenant_id = $1
           AND s.created_at >= NOW() - INTERVAL '48 HOURS'
           AND (CASE WHEN $3 = 'CASHIER' THEN s.created_by = $2 ELSE TRUE END)
         ON CONFLICT (tenant_id, user_id, item_type, item_id) DO UPDATE SET dismissed_at = NOW()`,
        [cleanTenantId, userId, role]
      ).catch(() => {});

      await pgClient.query(
        `INSERT INTO pos_notification_dismissals (tenant_id, user_id, item_type, item_id, dismissed_at)
         SELECT $1, $2, 'RETURN', r.id, NOW()
         FROM returns r
         WHERE r.tenant_id = $1
           AND r.created_at >= NOW() - INTERVAL '48 HOURS'
           AND (CASE WHEN $3 = 'CASHIER' THEN r.created_by = $2 ELSE TRUE END)
         ON CONFLICT (tenant_id, user_id, item_type, item_id) DO UPDATE SET dismissed_at = NOW()`,
        [cleanTenantId, userId, role]
      ).catch(() => {});
    }

    return res.json({ success: true, message: 'All notifications dismissed/marked as read.' });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to dismiss all notifications: ' + err.message });
  }
});

// GET /api/notifications - Legacy endpoint maintaining compatibility
router.get('/', async (req: Request, res: Response) => {
  try {
    await ensurePlatformNotificationsSchema();
    const { tenantId, userId, role } = resolveRequestIdentity(req);
    const cleanTenantId = tenantId || 1;

    let posNotifications: any[] = [];
    if (role !== 'SUPERADMIN') {
      const salesRes = await pgClient.query(
        `SELECT id, invoice_number, total_amount, sale_date, created_at
         FROM sales
         WHERE tenant_id = $1
           AND created_at >= NOW() - INTERVAL '48 HOURS'
           AND (CASE WHEN $2 = 'CASHIER' THEN created_by = $3 ELSE TRUE END)
         ORDER BY id DESC
         LIMIT 15`,
        [cleanTenantId, role, userId]
      ).catch(() => ({ rows: [] }));

      posNotifications = salesRes.rows.map((row: any) => ({
        id: `sale-${row.id}`,
        rawId: row.id,
        type: 'SALE',
        title: `Sale Confirmed #${row.invoice_number || row.id}`,
        message: `Invoice for Rs. ${Number(row.total_amount || 0).toLocaleString()} completed.`,
        timestamp: row.created_at || row.sale_date || new Date().toISOString(),
        deepLinkUrl: '/reports',
      }));
    }

    const announcementsRes = await pgClient.query<{
      id: number;
      tenant_id: number | null;
      target_role: string;
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
         COALESCE(pn.target_role, 'ALL') AS target_role,
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
       WHERE (pn.expires_at IS NULL OR pn.expires_at > NOW())
         AND (
           CASE
             WHEN $3 = 'SUPERADMIN' THEN (
               COALESCE(pn.target_role, 'ALL') IN ('ALL', 'SUPERADMIN')
               AND pn.title NOT ILIKE 'Welcome to SarbaazSoft%'
             )
             WHEN $3 = 'ADMIN' THEN (
               (pn.tenant_id IS NULL OR pn.tenant_id = $1)
               AND COALESCE(pn.target_role, 'ALL') IN ('ALL', 'ADMIN')
               AND COALESCE(pn.target_role, 'ALL') != 'SUPERADMIN'
               AND pn.title NOT ILIKE 'New Free Trial%'
               AND pn.title NOT ILIKE 'Renewal Request%'
               AND pn.action_url NOT ILIKE '%/superadmin%'
             )
             WHEN $3 = 'CASHIER' THEN (
               (pn.tenant_id IS NULL OR pn.tenant_id = $1)
               AND COALESCE(pn.target_role, 'ALL') IN ('ALL', 'CASHIER')
               AND COALESCE(pn.target_role, 'ALL') != 'SUPERADMIN'
               AND pn.title NOT ILIKE 'Welcome to SarbaazSoft%'
               AND pn.title NOT ILIKE 'New Free Trial%'
               AND pn.title NOT ILIKE 'Renewal Request%'
               AND pn.action_url NOT ILIKE '%/superadmin%'
             )
             ELSE (
               (pn.tenant_id IS NULL OR pn.tenant_id = $1)
               AND COALESCE(pn.target_role, 'ALL') = 'ALL'
               AND COALESCE(pn.target_role, 'ALL') != 'SUPERADMIN'
               AND pn.title NOT ILIKE 'New Free Trial%'
               AND pn.title NOT ILIKE 'Renewal Request%'
               AND pn.action_url NOT ILIKE '%/superadmin%'
             )
           END
         )
       ORDER BY pn.created_at DESC
       LIMIT 30`,
      [cleanTenantId, userId, role]
    ).catch(() => ({ rows: [] }));

    const announcements = announcementsRes.rows.map((r) => ({
      id: r.id,
      tenantId: r.tenant_id,
      targetRole: r.target_role,
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

// GET /api/notifications/platform - List platform announcements for store tenant with role isolation
router.get('/platform', async (req: Request, res: Response) => {
  try {
    await ensurePlatformNotificationsSchema();
    const { tenantId, userId, role } = resolveRequestIdentity(req);
    const cleanTenantId = tenantId || 1;

    const announcementsRes = await pgClient.query<{
      id: number;
      tenant_id: number | null;
      target_role: string;
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
         COALESCE(pn.target_role, 'ALL') AS target_role,
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
       WHERE (pn.expires_at IS NULL OR pn.expires_at > NOW())
         AND (
           CASE
             WHEN $3 = 'SUPERADMIN' THEN (
               COALESCE(pn.target_role, 'ALL') IN ('ALL', 'SUPERADMIN')
               AND pn.title NOT ILIKE 'Welcome to SarbaazSoft%'
             )
             WHEN $3 = 'ADMIN' THEN (
               (pn.tenant_id IS NULL OR pn.tenant_id = $1)
               AND COALESCE(pn.target_role, 'ALL') IN ('ALL', 'ADMIN')
               AND COALESCE(pn.target_role, 'ALL') != 'SUPERADMIN'
               AND pn.title NOT ILIKE 'New Free Trial%'
               AND pn.title NOT ILIKE 'Renewal Request%'
               AND pn.action_url NOT ILIKE '%/superadmin%'
             )
             WHEN $3 = 'CASHIER' THEN (
               (pn.tenant_id IS NULL OR pn.tenant_id = $1)
               AND COALESCE(pn.target_role, 'ALL') IN ('ALL', 'CASHIER')
               AND COALESCE(pn.target_role, 'ALL') != 'SUPERADMIN'
               AND pn.title NOT ILIKE 'Welcome to SarbaazSoft%'
               AND pn.title NOT ILIKE 'New Free Trial%'
               AND pn.title NOT ILIKE 'Renewal Request%'
               AND pn.action_url NOT ILIKE '%/superadmin%'
             )
             ELSE (
               (pn.tenant_id IS NULL OR pn.tenant_id = $1)
               AND COALESCE(pn.target_role, 'ALL') = 'ALL'
               AND COALESCE(pn.target_role, 'ALL') != 'SUPERADMIN'
               AND pn.title NOT ILIKE 'New Free Trial%'
               AND pn.title NOT ILIKE 'Renewal Request%'
               AND pn.action_url NOT ILIKE '%/superadmin%'
             )
           END
         )
       ORDER BY pn.created_at DESC
       LIMIT 30`,
      [cleanTenantId, userId, role]
    ).catch(() => ({ rows: [] }));

    const announcements = announcementsRes.rows.map((r) => ({
      id: r.id,
      tenantId: r.tenant_id,
      targetRole: r.target_role,
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
         AND (pn.expires_at IS NULL OR pn.expires_at > NOW())
         AND COALESCE(pn.target_role, 'ALL') != 'SUPERADMIN'
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

// POST /api/notifications/subscribe - Save device push subscription scoped by role
router.post('/subscribe', async (req: Request, res: Response) => {
  try {
    const { tenantId, userId, role } = resolveRequestIdentity(req);
    const subscription = req.body?.subscription || req.body;
    const userAgent = req.headers['user-agent'] || '';

    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ success: false, error: 'Invalid subscription object' });
    }

    const success = await savePushSubscription(tenantId, userId, role, subscription, userAgent);
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

// GET /api/notifications/stream - Server-Sent Events (SSE) real-time stream with role isolation
router.get('/stream', (req: Request, res: Response) => {
  const { tenantId, userId, role } = resolveRequestIdentity(req);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  // Immediately acknowledge connection with role metadata
  res.write(`event: connected\ndata: ${JSON.stringify({ type: 'CONNECTED', tenantId, role, timestamp: new Date().toISOString() })}\n\n`);

  const unregister = registerSseClient(tenantId, userId, role, res);

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
