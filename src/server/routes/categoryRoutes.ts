import { Router } from 'express';
import type { Response } from 'express';
import { pgClient } from '../../db/index.ts';
import { requireAuth } from '../auth.ts';
import type { AuthenticatedRequest as AuthRequest } from '../auth.ts';
import { STANDARD_FOOTWEAR_CATEGORIES } from '../../utils/footwear.ts';

const router = Router();

// ==========================================
// CATEGORIES ROUTES (/api/categories)
// Categories are global for every store (no tenant_id)
// ==========================================

// Ensure categories table exists without tenant_id and is seeded with pre-saved footwear categories
async function ensureGlobalCategoriesTable(): Promise<void> {
  await pgClient
    .exec(`
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      DO $$
      BEGIN
        BEGIN
          DROP INDEX IF EXISTS categories_tenant_idx;
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
        BEGIN
          DROP INDEX IF EXISTS categories_tenant_name_lower_idx;
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
        BEGIN
          ALTER TABLE categories DROP COLUMN IF EXISTS tenant_id CASCADE;
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
        BEGIN
          CREATE UNIQUE INDEX IF NOT EXISTS categories_name_lower_unique_idx ON categories (LOWER(TRIM(name)));
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
      END $$;

      -- Clean any duplicate categories if present
      DELETE FROM categories a USING categories b
      WHERE a.id > b.id
        AND LOWER(TRIM(a.name)) = LOWER(TRIM(b.name));
    `)
    .catch(() => {});

  // Pre-saved categories are global for every store: Men, Women, Kids, Toddler, Infant
  for (const stdCat of STANDARD_FOOTWEAR_CATEGORIES) {
    await pgClient
      .query(
        `INSERT INTO categories (name)
         SELECT $1
         WHERE NOT EXISTS (
           SELECT 1 FROM categories WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))
         )`,
        [stdCat]
      )
      .catch(() => {});
  }
}

// GET /api/categories - Fetch global pre-saved categories for all stores
router.get('/categories', requireAuth, async (_req: AuthRequest, res: Response) => {
  try {
    await ensureGlobalCategoriesTable();

    const result = await pgClient.query<any>(
      `SELECT DISTINCT ON (LOWER(TRIM(name))) id, name, created_at FROM categories
       ORDER BY LOWER(TRIM(name)), id ASC`
    );

    // Order strictly: Men, Women, Kids, Toddler, Infant first, then other categories
    const orderMap: Record<string, number> = {
      men: 1,
      women: 2,
      kids: 3,
      toddler: 4,
      infant: 5,
    };

    const sorted = result.rows.sort((a, b) => {
      const aRank = orderMap[a.name.trim().toLowerCase()] || 99;
      const bRank = orderMap[b.name.trim().toLowerCase()] || 99;
      if (aRank !== bRank) return aRank - bRank;
      return a.name.localeCompare(b.name);
    });

    res.json({ categories: sorted });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch categories: ' + err.message });
  }
});

// POST /api/categories - Create a new global category
router.post('/categories', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    await ensureGlobalCategoriesTable();
    const name = (req.body.name || '').trim();
    if (!name) {
      return res.status(400).json({ error: 'Category name is required' });
    }

    const existing = await pgClient.query<any>(
      `SELECT id, name, created_at FROM categories WHERE LOWER(TRIM(name)) = LOWER($1) LIMIT 1`,
      [name]
    );

    if (existing.rows.length > 0) {
      return res.status(200).json({ category: existing.rows[0], message: 'Category already exists' });
    }

    const result = await pgClient.query<any>(
      `INSERT INTO categories (name) VALUES ($1) RETURNING id, name, created_at`,
      [name]
    );

    res.status(201).json({ category: result.rows[0], message: 'Category created successfully' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to create category: ' + err.message });
  }
});

// DELETE /api/categories/:id - Delete a global category
router.delete('/categories/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    await ensureGlobalCategoriesTable();
    const { id } = req.params;
    await pgClient.query(`DELETE FROM categories WHERE id = $1`, [id]);
    res.json({ message: 'Category deleted successfully' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to delete category: ' + err.message });
  }
});

export default router;
