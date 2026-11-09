import { Router } from 'express';
import type { Response } from 'express';
import { requireAuth, requireAdmin } from '../auth.ts';
import type { AuthenticatedRequest } from '../auth.ts';
import { getTenantDb } from '../../db/tenantDb.ts';

const router = Router();

// GET /api/inventory/ledger - Stock Movements Audit Trail (Strictly scoped to req.user.tenantId)
router.get('/ledger', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantDb = getTenantDb(req);
    const { productId, movementType, limit = 100 } = req.query;
    const movements = await tenantDb.inventory.getLedger({
      productId: productId ? Number(productId) : undefined,
      movementType: typeof movementType === 'string' ? movementType : undefined,
      limit: Number(limit) || 100,
    });
    res.json({ movements });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch stock movements: ' + err.message });
  }
});

// POST /api/inventory/adjust - Manual Stock Adjustment (Admin Only, Strictly scoped to req.user.tenantId)
router.post('/adjust', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantDb = getTenantDb(req);
    const { productId, newStock, notes, reason } = req.body;

    if (!productId) {
      return res.status(400).json({ error: 'Product ID is required.' });
    }
    if (newStock === undefined || isNaN(Number(newStock)) || Number(newStock) < 0) {
      return res.status(400).json({ error: 'Valid non-negative new stock count is required.' });
    }
    const rawNotes = notes || reason;
    const finalNotes = (typeof rawNotes === 'string' && rawNotes.trim()) ? rawNotes.trim() : 'Inline inventory quantity update';

    const targetStock = parseInt(newStock, 10);
    const result = await tenantDb.inventory.adjustStock({
      productId: Number(productId),
      newStock: targetStock,
      notes: finalNotes,
      userId: req.user!.id,
    });

    const prodIdentifier = result.product.article || result.product.name;
    res.json({
      success: true,
      message: `Stock for "${prodIdentifier}" successfully adjusted from ${result.prevStock} to ${result.newStock}.`,
      prevStock: result.prevStock,
      newStock: result.newStock,
      qtyChange: result.qtyChange,
      productId: Number(productId),
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to adjust stock.' });
  }
});

// PATCH /api/inventory/inline-stock - Fast Inline Stock Quantity Update for Store Admins
router.patch('/inline-stock', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantDb = getTenantDb(req);
    const { productId, newStock, reason } = req.body;

    if (!productId) {
      return res.status(400).json({ error: 'Product ID is required.' });
    }
    const parsedStock = parseInt(String(newStock), 10);
    if (isNaN(parsedStock) || parsedStock < 0) {
      return res.status(400).json({ error: 'Stock quantity must be a non-negative number.' });
    }

    const auditNotes = typeof reason === 'string' && reason.trim()
      ? reason.trim()
      : 'Inline inventory table update by Store Admin';

    const result = await tenantDb.inventory.adjustStock({
      productId: Number(productId),
      newStock: parsedStock,
      notes: auditNotes,
      userId: req.user!.id,
    });

    res.json({
      success: true,
      message: `Stock updated to ${result.newStock} pairs.`,
      productId: Number(productId),
      prevStock: result.prevStock,
      newStock: result.newStock,
      qtyChange: result.qtyChange,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to update stock.' });
  }
});

export default router;
