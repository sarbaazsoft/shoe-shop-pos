import { Router } from 'express';
import type { Response } from 'express';
import { pgClient } from '../../db/index.ts';
import { requireAuth, requireAdmin } from '../auth.ts';
import type { AuthenticatedRequest } from '../auth.ts';
import { extractStrictTenantId } from '../../db/tenantDb.ts';
import { generateCode128Barcode, analyzeBarcode } from '../../utils/barcode.ts';
import { parseCategoryPrefix, generateSuggestedArticle, buildArticleInfo, normalizeFootwearCategory } from '../../utils/footwear.ts';
import { validateAndNormalizeProductPricing, validateProductBrand } from '../../schemas/productSchema.ts';

const router = Router();

/** Normalize legacy 6/8-pair lot payloads to the current 12/16-pair lot sizes. */
function normalizePairsPerCarton(value: unknown): number | null {
  const parsed = Number(value);
  if (parsed === 12 || parsed === 6) return 12;
  if (parsed === 16 || parsed === 8) return 16;
  return null;
}

// Helper to get next per-store product number (1..99999):
// 1. First checks tenants.deleted_product_ids array for this tenant (recycles deleted numbers first).
// 2. If deleted_product_ids is empty, uses COUNT(*) + 1 (or first available gap if legacy gap exists) for this tenant.
export async function getNextProductId(tenantId: number = 1): Promise<number> {
  try {
    await ensureProductAndSettingsColumns();

    // 1. Check recycled deleted_product_ids array in tenants for this store
    const tenantRes = await pgClient.query<{ deleted_product_ids: number[] | null }>(
      'SELECT deleted_product_ids FROM tenants WHERE id = $1 LIMIT 1',
      [tenantId]
    );
    const rawDeleted = tenantRes.rows[0]?.deleted_product_ids;
    if (Array.isArray(rawDeleted) && rawDeleted.length > 0) {
      const sortedCandidates = [...new Set(rawDeleted.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 1))].sort(
        (a, b) => a - b
      );
      if (sortedCandidates.length > 0) {
        // Verify which candidates are genuinely free in this store
        const occupiedRes = await pgClient.query<{ tenant_product_no: number }>(
          'SELECT tenant_product_no FROM products WHERE COALESCE(tenant_id, 1) = $1 AND tenant_product_no = ANY($2::int[])',
          [tenantId, sortedCandidates]
        );
        const occupiedSet = new Set(occupiedRes.rows.map((r) => Number(r.tenant_product_no)));
        const validFree = sortedCandidates.filter((n) => !occupiedSet.has(n));

        if (validFree.length !== rawDeleted.length) {
          // Clean up stale occupied entries from tenants.deleted_product_ids
          await pgClient.query(
            'UPDATE tenants SET deleted_product_ids = $1::int[], updated_at = NOW() WHERE id = $2',
            [validFree, tenantId]
          );
        }

        if (validFree.length > 0) {
          return validFree[0];
        }
      }
    }

    // 2. When deleted_product_ids is empty, check store product count & max
    const statsRes = await pgClient.query<{ cnt: number; max_no: number }>(
      `SELECT COUNT(*)::int AS cnt,
              COALESCE(MAX(tenant_product_no), 0)::int AS max_no
       FROM products
       WHERE COALESCE(tenant_id, 1) = $1`,
      [tenantId]
    );
    const cnt = Number(statsRes.rows[0]?.cnt || 0);
    const maxNo = Number(statsRes.rows[0]?.max_no || 0);

    // Fast path: No gaps (or empty store) -> COUNT(*) + 1
    if (cnt === 0) return 1;
    if (cnt === maxNo) return cnt + 1;

    // Fallback if any legacy gap exists before deleted_product_ids tracking: find first missing number in index
    const gapRes = await pgClient.query<{ next_no: number }>(
      `SELECT COALESCE(
        CASE WHEN NOT EXISTS (
          SELECT 1 FROM products WHERE COALESCE(tenant_id, 1) = $1 AND tenant_product_no = 1
        ) THEN 1 END,
        (SELECT p1.tenant_product_no + 1
         FROM products p1
         LEFT JOIN products p2
           ON COALESCE(p2.tenant_id, 1) = COALESCE(p1.tenant_id, 1)
          AND p2.tenant_product_no = p1.tenant_product_no + 1
         WHERE COALESCE(p1.tenant_id, 1) = $1
           AND p1.tenant_product_no IS NOT NULL
           AND p2.id IS NULL
         ORDER BY p1.tenant_product_no ASC
         LIMIT 1),
        $2::int
      ) AS next_no`,
      [tenantId, Math.max(cnt, maxNo) + 1]
    );
    return Number(gapRes.rows[0]?.next_no || cnt + 1);
  } catch (_) {
    const fallbackRes = await pgClient.query<{ cnt: string }>(
      'SELECT (COUNT(*) + 1)::text AS cnt FROM products WHERE COALESCE(tenant_id, 1) = $1',
      [tenantId]
    );
    return parseInt(fallbackRes.rows[0]?.cnt || '1', 10);
  }
}

// Removes a recycled product number from tenants.deleted_product_ids once consumed
async function consumeDeletedProductNo(tenantId: number, usedNo: number): Promise<void> {
  if (!usedNo || usedNo < 1) return;
  try {
    await pgClient.query(
      `UPDATE tenants
       SET deleted_product_ids = array_remove(COALESCE(deleted_product_ids, '{}'), $1::int),
           updated_at = NOW()
       WHERE id = $2`,
      [usedNo, tenantId]
    );
  } catch (_) {}
}

// Saves a deleted product's number into tenants.deleted_product_ids for reuse
async function recordDeletedProductNo(tenantId: number, deletedNo: number): Promise<void> {
  if (!deletedNo || deletedNo < 1) return;
  try {
    await pgClient.query(
      `UPDATE tenants
       SET deleted_product_ids = (
         SELECT COALESCE(array_agg(DISTINCT x ORDER BY x ASC), '{}')
         FROM unnest(array_append(COALESCE(deleted_product_ids, '{}'), $1::int)) AS x
         WHERE x >= 1
       ),
       updated_at = NOW()
       WHERE id = $2`,
      [deletedNo, tenantId]
    );
  } catch (_) {}
}

/**
 * Generates short store Code-128 barcode (no barcode prefix, no zero-padding):
 * Format: [2-Letter Category Code]-[Exact Store Product ID] (e.g. SN-9, BO-7, TD-12, CA-129)
 */
export async function generateProductEan13(
  productId?: number | string,
  tenantId: number = 1,
  categoryHint?: string
): Promise<{
  barcode: string;
  prefix: string;
  paddedProductId: string;
  checkDigit: number;
  formula: string;
}> {
  // 1. Determine Per-Store Product ID (recycled deleted ID first, else store COUNT(*) + 1)
  let targetProductId = productId ? parseInt(String(productId).replace(/\D/g, ''), 10) : 0;
  if (!targetProductId || isNaN(targetProductId) || targetProductId < 1) {
    targetProductId = await getNextProductId(tenantId);
  }

  // 2. Generate short Code-128 barcode, guaranteeing no collision with existing products in this store
  let candidate = generateCode128Barcode(targetProductId, categoryHint || 'CA');
  let attempts = 0;
  while (attempts < 1000) {
    const existing = await pgClient.query(
      'SELECT id FROM products WHERE LOWER(barcode) = LOWER($1) AND COALESCE(tenant_id, 1) = $2',
      [candidate.barcode, tenantId]
    );
    if (existing.rows.length === 0) {
      return candidate;
    }
    targetProductId++;
    candidate = generateCode128Barcode(targetProductId, categoryHint || 'CA');
    attempts++;
  }
  return candidate;
}

// Backward compatibility alias
export async function generateNumericBarcode(
  productId?: number | string,
  tenantId: number = 1,
  categoryHint?: string
): Promise<string> {
  const res = await generateProductEan13(productId, tenantId, categoryHint);
  return res.barcode;
}

// Generate new unique Code-128 store barcode API (supports both GET and POST)
const handleGenerateBarcode = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = extractStrictTenantId(req);
    const rawProductId =
      req.query?.productId ??
      (typeof req.body === 'number' || typeof req.body === 'string'
        ? req.body
        : req.body?.productId ?? req.body?.value);
    const rawCategory =
      (req.query?.category as string | undefined) ||
      (req.body && typeof req.body === 'object' ? req.body.category : undefined) ||
      'CA';
    const result = await generateProductEan13(
      rawProductId !== undefined && rawProductId !== null && rawProductId !== '' ? String(rawProductId) : undefined,
      tenantId,
      String(rawCategory)
    );
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to generate barcode' });
  }
};
router.get('/generate-barcode', requireAuth, handleGenerateBarcode);
router.post('/generate-barcode', requireAuth, handleGenerateBarcode);

// Get next per-store product ID (recycled deleted ID or COUNT(*) + 1)
router.get('/next-id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = extractStrictTenantId(req);
    const nextProductId = await getNextProductId(tenantId);
    res.json({ nextProductId });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve next product ID: ' + err.message });
  }
});

// Calculate Brand Prefix, Category Prefix, Suggested Article API
// Query params: ?brand=Nike&category=Shoes&article=SH-0001&productId=1
router.get('/suggest-article', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await ensureProductAndSettingsColumns();
    const tenantId = extractStrictTenantId(req);
    const { brand, category, categoryId, categoryName, article, productId, excludeId } = req.query;

    const targetBrandName = String(brand || '').trim() || 'Unbranded';
    const targetCategoryName = String(category || categoryName || categoryId || '').trim();
    const parsedExcludeId = excludeId ? parseInt(String(excludeId), 10) : null;

    let targetProductId = productId ? parseInt(String(productId).replace(/\D/g, ''), 10) : 0;
    if (!targetProductId || isNaN(targetProductId)) {
      targetProductId = await getNextProductId(tenantId);
    }

    let articleInfo = buildArticleInfo(
      targetBrandName,
      targetCategoryName,
      article ? String(article) : undefined,
      targetProductId
    );

    if (!article) {
      let attempts = 0;
      let candidateId = targetProductId;
      while (attempts < 1000) {
        articleInfo = buildArticleInfo(targetBrandName, targetCategoryName, undefined, candidateId);
        const artDup = await pgClient.query(
          'SELECT id FROM products WHERE LOWER(TRIM(article)) = LOWER(TRIM($1)) AND COALESCE(tenant_id, 1) = $2 AND ($3::int IS NULL OR id != $3) LIMIT 1',
          [articleInfo.suggestedArticle, tenantId, parsedExcludeId]
        );
        if (artDup.rows.length === 0) {
          break;
        }
        candidateId++;
        attempts++;
      }
    }

    res.json(articleInfo);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to suggest article: ' + err.message });
  }
});

// Real-time Barcode Validation & Uniqueness Check API (supports both GET and POST)
const handleValidateBarcode = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = extractStrictTenantId(req);
    const rawBarcodeVal = req.query?.barcode ?? req.body?.barcode ?? '';
    const rawBarcode = rawBarcodeVal ? String(rawBarcodeVal).trim() : '';
    const rawExcludeId = req.query?.excludeId ?? req.body?.excludeId;
    const excludeId = rawExcludeId ? parseInt(String(rawExcludeId), 10) : null;

    if (!rawBarcode) {
      return res.json({
        valid: false,
        error: 'Barcode is required.',
      });
    }

    const analysis = analyzeBarcode(rawBarcode);

    if (!analysis.isValid) {
      return res.json({
        valid: false,
        isDuplicate: false,
        standard: analysis.standard,
        standardLabel: analysis.standardLabel,
        expectedCheckDigit: analysis.expectedCheckDigit,
        actualCheckDigit: analysis.actualCheckDigit,
        suggestedFix: analysis.suggestedFix,
        error: analysis.error,
      });
    }

    // Check duplicate in database strictly under this store (tenant_id)
    const duplicateRes = await pgClient.query<any>(
      'SELECT id, tenant_product_no, name, article FROM products WHERE LOWER(TRIM(barcode)) = LOWER(TRIM($1)) AND COALESCE(tenant_id, 1) = $2 AND ($3::int IS NULL OR id != $3) LIMIT 1',
      [rawBarcode, tenantId, excludeId]
    );

    if (duplicateRes.rows.length > 0) {
      const existing = duplicateRes.rows[0];
      return res.json({
        valid: false,
        isDuplicate: true,
        standard: analysis.standard,
        standardLabel: analysis.standardLabel,
        existingProduct: {
          id: existing.id,
          tenantProductNo: existing.tenant_product_no || existing.id,
          name: existing.name,
          article: existing.article,
        },
        error: `Barcode is already in use in this store by product: "${existing.name}".`,
      });
    }

    return res.json({
      valid: true,
      isDuplicate: false,
      standard: analysis.standard,
      standardLabel: analysis.standardLabel,
      suggestedFix: analysis.suggestedFix,
      message: `Valid ${analysis.standardLabel} and available in this store.`,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to validate barcode: ' + err.message });
  }
};
router.get('/validate-barcode', requireAuth, handleValidateBarcode);
router.post('/validate-barcode', requireAuth, handleValidateBarcode);

// Real-time Article Uniqueness Validation API (supports both GET and POST)
const handleValidateArticle = async (req: AuthenticatedRequest, res: Response) => {
  try {
    await ensureProductAndSettingsColumns();
    const tenantId = extractStrictTenantId(req);
    const rawArticleVal = req.query?.article ?? req.body?.article ?? '';
    const rawArticle = String(rawArticleVal || '').trim().toUpperCase();
    const rawExcludeId = req.query?.excludeId ?? req.body?.excludeId;
    const excludeId = rawExcludeId ? parseInt(String(rawExcludeId), 10) : null;

    if (!rawArticle) {
      return res.json({
        valid: false,
        duplicateField: 'article',
        articleError: 'Article code is required.',
        error: 'Article code is required.',
      });
    }

    // Check Article uniqueness strictly under this store's products (tenant_id)
    const articleDupRes = await pgClient.query<any>(
      'SELECT id, tenant_product_no, name, article, barcode FROM products WHERE LOWER(TRIM(article)) = LOWER(TRIM($1)) AND COALESCE(tenant_id, 1) = $2 AND ($3::int IS NULL OR id != $3) LIMIT 1',
      [rawArticle, tenantId, excludeId]
    );

    if (articleDupRes.rows.length > 0) {
      const existing = articleDupRes.rows[0];
      const msg = `Article "${rawArticle}" already exists in this store.`;
      return res.json({
        valid: false,
        isDuplicate: true,
        duplicateField: 'article',
        articleError: msg,
        existingProduct: {
          id: existing.id,
          tenantProductNo: existing.tenant_product_no || existing.id,
          name: existing.name,
          article: existing.article,
          barcode: existing.barcode,
        },
        error: msg,
      });
    }

    return res.json({
      valid: true,
      isDuplicate: false,
      article: rawArticle,
      message: 'Article is unique under this store.',
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to validate article: ' + err.message });
  }
};
router.get('/validate-article', requireAuth, handleValidateArticle);
router.post('/validate-article', requireAuth, handleValidateArticle);

let productColumnsVerified = false;
let productColumnsPromise: Promise<void> | null = null;

async function ensureProductAndSettingsColumns() {
  if (productColumnsVerified) return;
  if (productColumnsPromise) return productColumnsPromise;

  productColumnsPromise = (async () => {
    try {
      const reg = await pgClient.query<{ has_products: boolean; has_settings: boolean; has_tenants: boolean }>(
        "SELECT (to_regclass('public.products') IS NOT NULL) as has_products, (to_regclass('public.company_settings') IS NOT NULL) as has_settings, (to_regclass('public.tenants') IS NOT NULL) as has_tenants"
      );
      if (reg.rows[0]?.has_tenants) {
        await pgClient.query("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS deleted_product_ids INTEGER[] NOT NULL DEFAULT '{}'");
      }
      if (reg.rows[0]?.has_settings) {
        await pgClient.query("ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS pricing_mode VARCHAR(30) NOT NULL DEFAULT 'FIXED'");
        await pgClient.query("ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS pricing_policy_locked BOOLEAN NOT NULL DEFAULT false");
        await pgClient.query("UPDATE company_settings SET pricing_policy_locked = false");
        await pgClient.exec(`
          DO $$
          BEGIN
            IF EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'company_settings' AND column_name = 'deleted_product_ids'
            ) THEN
              EXECUTE 'UPDATE tenants t
                       SET deleted_product_ids = (
                         SELECT COALESCE(array_agg(DISTINCT x ORDER BY x ASC), ''{}'')
                         FROM unnest(array_cat(COALESCE(t.deleted_product_ids, ''{}''), COALESCE(cs.deleted_product_ids, ''{}''))) AS x
                         WHERE x >= 1
                       )
                       FROM company_settings cs
                       WHERE cs.tenant_id = t.id
                         AND cs.deleted_product_ids IS NOT NULL
                         AND cardinality(cs.deleted_product_ids) > 0';
              EXECUTE 'ALTER TABLE company_settings DROP COLUMN IF EXISTS deleted_product_ids';
            END IF;
          END $$;
        `).catch(() => {});
      }
      if (reg.rows[0]?.has_products) {
        await pgClient.query("ALTER TABLE products DROP COLUMN IF EXISTS size");
        await pgClient.query("ALTER TABLE products DROP COLUMN IF EXISTS color");
        await pgClient.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS tenant_product_no INTEGER");
        await pgClient.query("ALTER TABLE products DROP CONSTRAINT IF EXISTS products_barcode_key");
        await pgClient.query("ALTER TABLE products DROP CONSTRAINT IF EXISTS products_article_key");
        await pgClient.query("ALTER TABLE products DROP CONSTRAINT IF EXISTS products_barcode_unique");
        await pgClient.query("ALTER TABLE products DROP CONSTRAINT IF EXISTS products_article_unique");
        await pgClient.exec(`
          DO $$
          DECLARE
            c RECORD;
            idx RECORD;
          BEGIN
            FOR c IN
              SELECT con.conname
              FROM pg_constraint con
              JOIN pg_class rel ON rel.oid = con.conrelid
              JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
              WHERE nsp.nspname = 'public'
                AND rel.relname = 'products'
                AND con.contype = 'u'
                AND NOT EXISTS (
                  SELECT 1
                  FROM unnest(con.conkey) AS k(col_attnum)
                  JOIN pg_attribute attr ON attr.attrelid = rel.oid AND attr.attnum = k.col_attnum
                  WHERE attr.attname = 'tenant_id'
                )
            LOOP
              EXECUTE format('ALTER TABLE public.products DROP CONSTRAINT IF EXISTS %I CASCADE', c.conname);
            END LOOP;

            FOR idx IN
              SELECT i.relname AS index_name
              FROM pg_index ix
              JOIN pg_class t ON t.oid = ix.indrelid
              JOIN pg_class i ON i.oid = ix.indexrelid
              JOIN pg_namespace nsp ON nsp.oid = t.relnamespace
              WHERE nsp.nspname = 'public'
                AND t.relname = 'products'
                AND ix.indisunique = true
                AND ix.indisprimary = false
                AND NOT EXISTS (
                  SELECT 1
                  FROM unnest(ix.indkey) AS k(col_attnum)
                  JOIN pg_attribute attr ON attr.attrelid = t.oid AND attr.attnum = k.col_attnum
                  WHERE attr.attname = 'tenant_id'
                )
            LOOP
              EXECUTE format('DROP INDEX IF EXISTS public.%I CASCADE', idx.index_name);
            END LOOP;
          END $$;
        `).catch(() => {});
        await pgClient.query("CREATE INDEX IF NOT EXISTS products_tenant_product_no_idx ON products(tenant_id, tenant_product_no)");
        await pgClient.query("ALTER TABLE products DROP COLUMN IF EXISTS sku");
        await pgClient.query("CREATE INDEX IF NOT EXISTS products_tenant_article_idx ON products(tenant_id, article)");
        await pgClient.query("CREATE INDEX IF NOT EXISTS products_tenant_barcode_idx ON products(tenant_id, barcode)");
        await pgClient.exec(`
          CREATE UNIQUE INDEX IF NOT EXISTS products_tenant_barcode_unique_idx
            ON products (COALESCE(tenant_id, 1), LOWER(BTRIM(barcode)))
            WHERE barcode IS NOT NULL AND BTRIM(barcode) <> '';
          CREATE UNIQUE INDEX IF NOT EXISTS products_tenant_article_unique_idx
            ON products (COALESCE(tenant_id, 1), LOWER(BTRIM(article)))
            WHERE article IS NOT NULL AND BTRIM(article) <> '';
        `).catch(() => {});
        await pgClient.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS min_price INTEGER NOT NULL DEFAULT 0");
        await pgClient.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS max_price INTEGER NOT NULL DEFAULT 0");
        await pgClient.query("ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS business_type TEXT NOT NULL DEFAULT 'RETAIL'");
        await pgClient.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS pairs_per_carton INTEGER");
        await pgClient.query(`DO $$ BEGIN
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='minimum_pairs') THEN
            UPDATE products SET pairs_per_carton = minimum_pairs WHERE (pairs_per_carton IS NULL OR pairs_per_carton <= 0 OR (pairs_per_carton = 12 AND minimum_pairs = 16)) AND minimum_pairs IN (6, 8, 12, 16);
          END IF;
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='store_lot_size') THEN
            UPDATE products SET pairs_per_carton = store_lot_size WHERE store_lot_size IN (6, 8, 12, 16);
          END IF;
        END $$`);
        await pgClient.query("UPDATE products SET pairs_per_carton = CASE pairs_per_carton WHEN 6 THEN 12 WHEN 8 THEN 16 ELSE pairs_per_carton END");
        await pgClient.query("UPDATE products SET pairs_per_carton = 12 WHERE pairs_per_carton IS NULL OR pairs_per_carton <= 0");
        await pgClient.query("ALTER TABLE products ALTER COLUMN pairs_per_carton SET DEFAULT 12");
        await pgClient.query("ALTER TABLE products ALTER COLUMN pairs_per_carton SET NOT NULL");
        await pgClient.query("ALTER TABLE products DROP COLUMN IF EXISTS min_order_cartons");
        await pgClient.query("ALTER TABLE products DROP COLUMN IF EXISTS carton_price");
        await pgClient.query("ALTER TABLE products DROP COLUMN IF EXISTS carton_barcode");
        await pgClient.query("ALTER TABLE products DROP COLUMN IF EXISTS store_lot_size");
        await pgClient.query("ALTER TABLE products DROP COLUMN IF EXISTS minimum_pairs");
        await pgClient.query("ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS business_type TEXT NOT NULL DEFAULT 'RETAIL'");
        await pgClient.query("ALTER TABLE company_settings DROP COLUMN IF EXISTS default_pairs_per_carton");
        await pgClient.query("ALTER TABLE company_settings DROP COLUMN IF EXISTS wholesale_invoice_format");
        await pgClient.query("ALTER TABLE tenants DROP COLUMN IF EXISTS business_type CASCADE");
        await pgClient.query("ALTER TABLE tenants DROP COLUMN IF EXISTS pricing_mode CASCADE");
        await pgClient.query(`DO $$ BEGIN
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'selling_price') THEN
            EXECUTE 'UPDATE products SET max_price = CASE WHEN COALESCE(max_price, 0) = 0 THEN COALESCE(selling_price, 0) ELSE max_price END, min_price = CASE WHEN COALESCE(min_price, 0) = 0 THEN COALESCE(selling_price, 0) ELSE min_price END';
            EXECUTE 'ALTER TABLE products DROP COLUMN selling_price';
          END IF;
        END $$`);
        await pgClient.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS allow_half_carton BOOLEAN NOT NULL DEFAULT true");
        await pgClient.query("ALTER TABLE products DROP COLUMN IF EXISTS min_selling_quantity");
        await pgClient.query(`
          UPDATE products p
          SET allow_half_carton = false
          FROM company_settings cs
          WHERE p.tenant_id = cs.tenant_id
            AND UPPER(cs.business_type::text) = 'WHOLESALE'
            AND (cs.allow_half_carton = false)
        `).catch(() => {});
      }
      if (reg.rows[0]?.has_settings && reg.rows[0]?.has_products) {
        productColumnsVerified = true;
      }
    } catch (_) {
    } finally {
      productColumnsPromise = null;
    }
  })();

  return productColumnsPromise;
}

// Company pricing settings helper
export async function getCompanyPricingSettings(tenantId: number = 1): Promise<{
  pricingMode: 'FIXED' | 'NEGOTIABLE';
  pricingPolicyLocked: boolean;
  businessType?: 'RETAIL' | 'WHOLESALE';
  allowHalfCarton?: boolean;
  allow_half_carton?: boolean;
  currencySymbol: string;
}> {
  try {
    await ensureProductAndSettingsColumns();
    const res = await pgClient.query<any>(
      'SELECT pricing_mode, pricing_policy_locked, currency_symbol, business_type, allow_half_carton FROM company_settings WHERE COALESCE(tenant_id, 1) = $1 LIMIT 1',
      [tenantId]
    );
    const row = res.rows[0];
    const mode = String(row?.pricing_mode || 'FIXED').toUpperCase() === 'NEGOTIABLE' ? 'NEGOTIABLE' : 'FIXED';
    const bType = String(row?.business_type || 'RETAIL').toUpperCase() === 'WHOLESALE' ? 'WHOLESALE' : 'RETAIL';
    const halfAllowed = row?.allow_half_carton !== undefined ? Boolean(row.allow_half_carton) : true;
    return {
      pricingMode: mode,
      pricingPolicyLocked: false,
      businessType: bType,
      allowHalfCarton: halfAllowed,
      allow_half_carton: halfAllowed,
      currencySymbol: row?.currency_symbol || 'Rs.',
    };
  } catch {
    return {
      pricingMode: 'FIXED',
      pricingPolicyLocked: false,
      businessType: 'RETAIL',
      allowHalfCarton: true,
      allow_half_carton: true,
      currencySymbol: 'Rs.',
    };
  }
}

function mapProductRow(row: any, settings: {
  pricingMode: 'FIXED' | 'NEGOTIABLE';
  businessType?: 'RETAIL' | 'WHOLESALE';
  allowHalfCarton?: boolean;
  allow_half_carton?: boolean;
}) {
  const costPrice = Math.round(parseFloat(row.cost_price) || 0);
  const rawMin = Math.round(Number(row.min_price ?? 0));
  const rawMax = Math.round(Number(row.max_price ?? 0));

  const effectivePolicy: 'FIXED' | 'NEGOTIABLE' = settings.businessType === 'WHOLESALE'
    ? 'FIXED'
    : settings.pricingMode;

  let sellingPrice: number;
  let minPrice: number;
  let maxPrice: number;

  if (effectivePolicy === 'FIXED') {
    const resolvedFixed = rawMax > 0 ? rawMax : rawMin > 0 ? rawMin : costPrice;
    sellingPrice = resolvedFixed;
    minPrice = resolvedFixed;
    maxPrice = resolvedFixed;
  } else {
    minPrice = rawMin > 0 ? rawMin : costPrice;
    maxPrice = Math.max(minPrice, rawMax > 0 ? rawMax : minPrice);
    sellingPrice = maxPrice;
  }

  const rawPairsPerCarton = Number(row.pairs_per_carton ?? row.store_lot_size ?? 12);
  const pairsPerCarton = rawPairsPerCarton === 16 ? 16 : 12;
  const allowHalfCarton = row.allow_half_carton !== false;

  // Determination: Half-cartons are allowed if either the store setting is enabled
  // (company_setting.allow_half_carton == true) OR the specific product override is enabled
  // (product.allow_half_carton == true).
  const storeAllowsHalf = settings.allowHalfCarton === true || settings.allow_half_carton === true;
  const isHalfAllowed = storeAllowsHalf || allowHalfCarton;

  // Calculation:
  // If half-cartons are allowed: min_sale_quantity = pairs_per_ctn / 2
  // Otherwise (not allowed): min_sale_quantity = pairs_per_ctn
  const minSaleQuantity = isHalfAllowed ? (pairsPerCarton / 2) : pairsPerCarton;

  return {
    id: row.id,
    tenantId: Number(row.tenant_id || 1),
    tenantProductNo: row.tenant_product_no || row.id,
    name: row.name,
    brand: row.brand || 'Unbranded',
    brandName: row.brand || 'Unbranded',
    brandLogo: '',
    category: row.category || 'Men',
    categoryName: row.category || 'Men',
    article: row.article || '',
    barcode: row.barcode,
    primaryImageUrl: row.primary_image_url,
    description: row.description,
    costPrice,
    sellingPrice,
    minPrice,
    maxPrice,
    pairsPerCarton,
    allowHalfCarton,
    allow_half_carton: allowHalfCarton,
    minSaleQuantity,
    min_sale_quantity: minSaleQuantity,
    // Backward-compatible aliases for POS / Sticker / Catalog components
    salePrice: sellingPrice,
    minSalePrice: minPrice,
    maxSalePrice: maxPrice,
    totalStock: row.total_stock,
    lowStockLimit: row.low_stock_limit,
    lowStockAlert: row.low_stock_limit,
    low_stock_limit: row.low_stock_limit,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Fast POS Scanner Lookup by Barcode / Article (strictly scoped by req.user.tenantId)
router.get(['/lookup/:barcode', '/barcode/:barcode', '/scan/:barcode'], requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await ensureProductAndSettingsColumns();
    const tenantId = extractStrictTenantId(req);
    const barcode = req.params.barcode.trim();
    const [result, settings] = await Promise.all([
      pgClient.query(
        `SELECT p.id, p.tenant_id, p.tenant_product_no, p.name, p.brand, p.category, p.article, p.barcode,
                p.pairs_per_carton, p.allow_half_carton,
                p.primary_image_url, p.description, COALESCE(p.cost_price, 0) as cost_price,
                COALESCE(p.min_price, 0) as min_price,
                COALESCE(p.max_price, 0) as max_price,
                p.total_stock, COALESCE(p.low_stock_limit, 5) as low_stock_limit, p.active, p.created_at, p.updated_at
         FROM products p
         WHERE COALESCE(p.tenant_id, 1) = $2
           AND (
             p.barcode = $1
             OR LOWER(p.barcode) = LOWER($1)
             OR LOWER(COALESCE(p.article, '')) = LOWER($1)
             OR LOWER(COALESCE(p.name, '')) = LOWER($1)
           )
           AND p.active = true
         LIMIT 1`,
        [barcode, tenantId]
      ),
      getCompanyPricingSettings(tenantId),
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: `Product with barcode or article "${barcode}" not found in this store.` });
    }

    const product = mapProductRow(result.rows[0], settings);
    res.json({ product });
  } catch (err: any) {
    res.status(500).json({ error: 'Lookup failed: ' + err.message });
  }
});

// List Products (Strictly scoped by req.user.tenantId)
router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await ensureProductAndSettingsColumns();
    const tenantId = extractStrictTenantId(req);
    const { search, brand, category, categoryId, lowStockOnly, limit } = req.query;

    let query = `
      SELECT p.id, p.tenant_id, p.tenant_product_no, p.name, p.brand, p.category, p.article, p.barcode,
             p.pairs_per_carton, p.allow_half_carton, p.primary_image_url, p.description, COALESCE(p.cost_price, 0) as cost_price,
             COALESCE(p.min_price, 0) as min_price,
             COALESCE(p.max_price, 0) as max_price,
             p.total_stock, COALESCE(p.low_stock_limit, 5) as low_stock_limit, p.active, p.created_at, p.updated_at
      FROM products p
      WHERE COALESCE(p.tenant_id, 1) = $1
    `;
    const params: any[] = [tenantId];

    if (search && typeof search === 'string') {
      params.push(`%${search.trim().toLowerCase()}%`);
      query += ` AND (LOWER(COALESCE(p.article, '')) LIKE $${params.length} OR p.barcode LIKE $${params.length} OR LOWER(p.name) LIKE $${params.length} OR LOWER(p.brand) LIKE $${params.length} OR LOWER(p.category) LIKE $${params.length})`;
    }

    const brandFilter = brand ? String(brand).trim() : '';
    if (brandFilter) {
      params.push(brandFilter.toLowerCase());
      query += ` AND LOWER(p.brand) = $${params.length}`;
    }

    const catFilter = (category || categoryId) ? String(category || categoryId).trim() : '';
    if (catFilter) {
      params.push(catFilter.toLowerCase());
      query += ` AND LOWER(p.category) = $${params.length}`;
    }

    if (lowStockOnly === 'true') {
      query += ` AND p.total_stock <= COALESCE(p.low_stock_limit, 5)`;
    }

    query += ` ORDER BY p.id DESC`;

    if (limit && !isNaN(Number(limit))) {
      query += ` LIMIT ${Math.max(1, Number(limit))}`;
    }

    const [result, settings] = await Promise.all([
      pgClient.query(query, params),
      getCompanyPricingSettings(tenantId),
    ]);

    const products = result.rows.map((row: any) => mapProductRow(row, settings));
    res.json({ products });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch products: ' + err.message });
  }
});

// Single Product Details (Strictly scoped by req.user.tenantId)
router.get('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await ensureProductAndSettingsColumns();
    const tenantId = extractStrictTenantId(req);
    const id = parseInt(req.params.id, 10);
    const [result, settings] = await Promise.all([
      pgClient.query(
        `SELECT p.*, COALESCE(p.cost_price, 0) as cost_price
         FROM products p
         WHERE p.id = $1 AND COALESCE(p.tenant_id, 1) = $2`,
        [id, tenantId]
      ),
      getCompanyPricingSettings(tenantId),
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found in your store.' });
    }

    res.json({
      product: mapProductRow(result.rows[0], settings),
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch product: ' + err.message });
  }
});

// Create Product (Admin Only, Strictly scoped by req.user.tenantId)
router.post('/', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await ensureProductAndSettingsColumns();
    const tenantId = extractStrictTenantId(req);
    const settings = await getCompanyPricingSettings(tenantId);
    const {
      name,
      brand,
      category,
      categoryName,
      categoryId,
      article,
      barcode,
      primaryImageUrl,
      description,
      costPrice,
      cost_price,
      sellingPrice,
      selling_price,
      salePrice,
      sale_price,
      minPrice,
      min_price,
      minSalePrice,
      min_sale_price,
      maxPrice,
      max_price,
      maxSalePrice,
      max_sale_price,
      totalStock = 0,
      initialStock,
      lowStockLimit,
    } = req.body;

    const rawPairsPerCarton = req.body.pairsPerCarton ?? req.body.pairs_per_carton ?? req.body.lotSize;
    const hasPairsPerCarton = rawPairsPerCarton !== undefined && rawPairsPerCarton !== null && rawPairsPerCarton !== '';
    const normalizedPairsPerCarton = hasPairsPerCarton ? normalizePairsPerCarton(rawPairsPerCarton) : 12;
    if (normalizedPairsPerCarton === null) {
      return res.status(400).json({ error: 'Pairs per carton must be 12 or 16 for this store.' });
    }
    const finalPairsPerCarton = normalizedPairsPerCarton;

    if (brand !== undefined) {
      if (typeof brand !== 'string') {
        return res.status(400).json({ error: 'Brand must be a text string.' });
      }
      const brandValidation = validateProductBrand(brand);
      if (!brandValidation.success) {
        return res.status(400).json({ error: brandValidation.error });
      }
    }

    if (!article || !article.trim()) {
      return res.status(400).json({ error: 'Article is a mandatory field.' });
    }
    const cleanArticle = article.trim().toUpperCase();
    const cleanName = (name && name.trim()) ? name.trim() : cleanArticle;

    const rawCost = costPrice ?? cost_price;
    const rawMin = minPrice ?? min_price ?? minSalePrice ?? min_sale_price;
    const rawMax = maxPrice ?? max_price ?? maxSalePrice ?? max_sale_price ?? sellingPrice ?? selling_price ?? salePrice ?? sale_price;

    // Pricing behavior is configured at store level; ignore any policy in a product payload.
    const chosenPolicy = settings.businessType === 'WHOLESALE' ? 'FIXED' : settings.pricingMode;

    // Validate with strict Zod schema based on product's chosen pricing policy
    const validation = validateAndNormalizeProductPricing({
      pricingMode: chosenPolicy,
      costPrice: rawCost,
      minPrice: rawMin,
      maxPrice: rawMax,
    });

    if (!validation.success || !validation.data) {
      return res.status(400).json({
        error: validation.errors.general || 'Invalid product pricing.',
        fieldErrors: validation.errors,
      });
    }

    const {
      costPrice: finalCostPrice,
      minPrice: finalMinPrice,
      maxPrice: finalMaxPrice,
    } = validation.data;

    // Brand and Category strings
    const finalBrand = (typeof brand === 'string' ? brand.trim() : '') || 'Unbranded';
    const finalCategory = normalizeFootwearCategory(
      category || categoryName || (typeof categoryId === 'string' ? categoryId : '') || 'Men'
    );

    // Get next per-store product number (recycled deleted ID first, else COUNT(*) + 1)
    // Note: Changing Article or Barcode manually NEVER alters the other product identifiers
    // and NEVER pushes predictedId into deleted_product_ids.
    const predictedId = await getNextProductId(tenantId);

    // 1. Validate Article uniqueness within this store (tenant_id)
    const articleCheck = await pgClient.query<any>(
      'SELECT id, name, article, barcode FROM products WHERE LOWER(TRIM(article)) = LOWER(TRIM($1)) AND COALESCE(tenant_id, 1) = $2 LIMIT 1',
      [cleanArticle, tenantId]
    );
    if (articleCheck.rows.length > 0) {
      return res.status(400).json({
        error: `A product with Article "${cleanArticle}" already exists in this store.`,
        duplicateField: 'article',
      });
    }

    // 2. Barcode: Store Standard Code-128 (no prefix, no zero-padding) or Manufacturer Box Barcode Override
    let finalBarcode = barcode ? String(barcode).trim() : '';
    if (!finalBarcode) {
      const generated = await generateProductEan13(predictedId, tenantId, finalCategory);
      finalBarcode = generated.barcode;
    } else {
      const analysis = analyzeBarcode(finalBarcode);
      if (!analysis.isValid) {
        return res.status(400).json({ error: analysis.error || 'Barcode validation failed.', duplicateField: 'barcode' });
      }
    }

    // Check barcode uniqueness strictly within this store (tenant_id)
    const barcodeCheck = await pgClient.query<any>(
      'SELECT id, name, article, barcode FROM products WHERE LOWER(TRIM(barcode)) = LOWER(TRIM($1)) AND COALESCE(tenant_id, 1) = $2 LIMIT 1',
      [finalBarcode, tenantId]
    );
    if (barcodeCheck.rows.length > 0) {
      const existing = barcodeCheck.rows[0];
      return res.status(400).json({
        error: `A product with Barcode "${finalBarcode}" already exists in this store: "${existing.name}".`,
        duplicateField: 'barcode',
      });
    }

    const physicalStock = parseInt(String(totalStock ?? initialStock ?? 0), 10) || 0;

    // Calculate store-type-aware low stock limit
    const rawLowStock = lowStockLimit ?? req.body.low_stock_limit ?? req.body.lowStockAlert ?? req.body.low_stock_alert;
    const cartonThresholdInput = req.body.lowStockThresholdCartons ?? req.body.lowStockCartons ?? req.body.low_stock_cartons;
    let finalLowStockLimit: number = 5;

    if (cartonThresholdInput !== undefined && cartonThresholdInput !== null && String(cartonThresholdInput).trim() !== '') {
      const parsedCartons = parseInt(String(cartonThresholdInput), 10);
      if (!isNaN(parsedCartons) && parsedCartons > 0) {
        finalLowStockLimit = parsedCartons * finalPairsPerCarton;
      }
    } else if (rawLowStock !== undefined && rawLowStock !== null && String(rawLowStock).trim() !== '') {
      const parsed = parseInt(String(rawLowStock), 10);
      if (!isNaN(parsed) && parsed > 0) finalLowStockLimit = parsed;
    } else {
      const setRes = await pgClient.query<{ low_stock_limit: number; business_type?: string }>(
        'SELECT low_stock_limit, business_type FROM company_settings WHERE COALESCE(tenant_id, 1) = $1 LIMIT 1',
        [tenantId]
      );
      const isStoreWholesale = String(setRes.rows[0]?.business_type || '').toUpperCase() === 'WHOLESALE';
      const defaultLimit = Number(setRes.rows[0]?.low_stock_limit) || (isStoreWholesale ? finalPairsPerCarton : 5);
      finalLowStockLimit = defaultLimit;
    }

    const rawAllowHalf = req.body.allowHalfCarton ?? req.body.allow_half_carton;
    const finalAllowHalfCarton = rawAllowHalf !== undefined ? Boolean(rawAllowHalf) : true;

    // ATOMIC TRANSACTION: Create product with refined pricing fields and initial stock movement
    await pgClient.query('BEGIN');
    try {
      const productRes = await pgClient.query<{ id: number }>(
        `INSERT INTO products (
          tenant_id, tenant_product_no, name, brand, category, article, barcode, primary_image_url,
          description, cost_price, min_price, max_price, pairs_per_carton,
          total_stock, low_stock_limit, active, allow_half_carton
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, true, $16)
        RETURNING id`,
        [
          tenantId,
          predictedId,
          cleanName,
          finalBrand,
          finalCategory,
          cleanArticle,
          finalBarcode,
          primaryImageUrl || '',
          description || '',
          finalCostPrice,
          finalMinPrice,
          finalMaxPrice,
          finalPairsPerCarton,
          physicalStock,
          finalLowStockLimit,
          finalAllowHalfCarton,
        ]
      );

      const productId = productRes.rows[0].id;

      // Consume the recycled number from tenants.deleted_product_ids if it was in the deleted pool
      await consumeDeletedProductNo(tenantId, predictedId);

      if (physicalStock > 0) {
        await pgClient.query(
          `INSERT INTO stock_movements (
            tenant_id, product_id, qty_change, prev_stock, new_stock, movement_type, reference_id, user_id, notes
          ) VALUES ($1, $2, $3, 0, $3, 'PURCHASE', 'INITIAL-STOCK', $4, 'Initial product inventory creation')`,
          [tenantId, productId, physicalStock, req.user!.id]
        );
      }

      await pgClient.query('COMMIT');
      try {
        await pgClient.query("SELECT setval('products_id_seq', (SELECT GREATEST(MAX(id), 1) FROM products))");
      } catch (_) {}

      res.status(201).json({
        message: 'Product created successfully.',
        productId,
        barcode: finalBarcode,
      });
    } catch (txErr: any) {
      await pgClient.query('ROLLBACK');
      throw txErr;
    }
  } catch (err: any) {
    console.error('Error creating product:', err);
    res.status(500).json({ error: 'Failed to create product: ' + err.message });
  }
});

// Update Product (Admin Only, Strictly scoped by req.user.tenantId)
router.put('/:id', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await ensureProductAndSettingsColumns();
    const tenantId = extractStrictTenantId(req);
    const id = parseInt(req.params.id, 10);
    const {
      name,
      brand,
      category,
      categoryName,
      article,
      barcode,
      primaryImageUrl,
      description,
      costPrice,
      cost_price,
      sellingPrice,
      selling_price,
      salePrice,
      sale_price,
      minPrice,
      min_price,
      minSalePrice,
      min_sale_price,
      maxPrice,
      max_price,
      maxSalePrice,
      max_sale_price,
      totalStock,
      lowStockLimit,
      active,
    } = req.body;

    if (brand !== undefined) {
      if (typeof brand !== 'string') {
        return res.status(400).json({ error: 'Brand must be a text string.' });
      }
      const brandValidation = validateProductBrand(brand);
      if (!brandValidation.success) {
        return res.status(400).json({ error: brandValidation.error });
      }
    }

    const currentRes = await pgClient.query('SELECT * FROM products WHERE id = $1 AND COALESCE(tenant_id, 1) = $2', [id, tenantId]);
    if (currentRes.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found in your store.' });
    }
    const current: any = currentRes.rows[0];
    const settings = await getCompanyPricingSettings(tenantId);

    const finalBrand = brand !== undefined
      ? (typeof brand === 'string' ? brand.trim() || 'Unbranded' : 'Unbranded')
      : (current.brand || 'Unbranded');
    const finalCategory = category !== undefined
      ? normalizeFootwearCategory(String(category))
      : (categoryName !== undefined ? normalizeFootwearCategory(String(categoryName)) : normalizeFootwearCategory(current.category || 'Men'));

    if (article !== undefined && !article.trim()) {
      return res.status(400).json({ error: 'Article is a mandatory field.' });
    }
    const finalArticle = article !== undefined && article.trim()
      ? article.trim().toUpperCase()
      : (current.article || '');
    const finalName = name !== undefined && name.trim()
      ? name.trim()
      : (article !== undefined && article.trim() ? article.trim().toUpperCase() : current.name);

    // Check Article uniqueness within this store (tenant_id, excluding current product id)
    if (finalArticle) {
      const articleCheck = await pgClient.query<any>(
        'SELECT id, name, article, barcode FROM products WHERE LOWER(TRIM(article)) = LOWER(TRIM($1)) AND COALESCE(tenant_id, 1) = $2 AND ($3::int IS NULL OR id != $3) LIMIT 1',
        [finalArticle, tenantId, id]
      );
      if (articleCheck.rows.length > 0) {
        const existingArt = articleCheck.rows[0];
        return res.status(400).json({
          error: `Article "${finalArticle}" is already in use by another product in this store ("${existingArt.name || existingArt.article}").`,
          duplicateField: 'article',
        });
      }
    }

    // Check barcode conflict & validation within this store (tenant_id, excluding current product id)
    if (barcode !== undefined && !String(barcode).trim()) {
      return res.status(400).json({ error: 'Barcode is a mandatory field.', duplicateField: 'barcode' });
    }
    const finalBarcode = barcode !== undefined && String(barcode).trim()
      ? String(barcode).trim()
      : String(current.barcode || '').trim();
    if (finalBarcode) {
      const analysis = analyzeBarcode(finalBarcode);
      if (!analysis.isValid) {
        return res.status(400).json({ error: analysis.error || 'Barcode validation failed.', duplicateField: 'barcode' });
      }
      const barcodeCheck = await pgClient.query<any>(
        'SELECT id, name, article, barcode FROM products WHERE LOWER(TRIM(barcode)) = LOWER(TRIM($1)) AND COALESCE(tenant_id, 1) = $2 AND ($3::int IS NULL OR id != $3) LIMIT 1',
        [finalBarcode, tenantId, id]
      );
      if (barcodeCheck.rows.length > 0) {
        const existing = barcodeCheck.rows[0];
        return res.status(400).json({
          error: `Barcode "${finalBarcode}" is already in use in this store by product: "${existing.name}".`,
          duplicateField: 'barcode',
        });
      }
    }

    const updatedStock = totalStock !== undefined ? parseInt(String(totalStock), 10) : current.total_stock;

    const rawCost = costPrice ?? cost_price ?? current.cost_price ?? 0;
    const rawMax = maxPrice ?? max_price ?? maxSalePrice ?? max_sale_price ?? sellingPrice ?? selling_price ?? salePrice ?? sale_price ?? current.max_price ?? 0;
    const rawMin = minPrice ?? min_price ?? minSalePrice ?? min_sale_price ?? current.min_price ?? rawMax;

    // Pricing behavior is configured at store level; ignore any policy in a product payload.
    const chosenPolicy = settings.businessType === 'WHOLESALE' ? 'FIXED' : settings.pricingMode;

    // Validate with strict Zod schema based on product's chosen pricing policy
    const validation = validateAndNormalizeProductPricing({
      pricingMode: chosenPolicy,
      costPrice: rawCost,
      minPrice: rawMin,
      maxPrice: rawMax,
    });

    if (!validation.success || !validation.data) {
      return res.status(400).json({
        error: validation.errors.general || 'Invalid product pricing.',
        fieldErrors: validation.errors,
      });
    }

    const {
      costPrice: finalCostPrice,
      minPrice: finalMinPrice,
      maxPrice: finalMaxPrice,
    } = validation.data;

    const rawPairsPerCarton = req.body.pairsPerCarton ?? req.body.pairs_per_carton ?? req.body.lotSize;
    const hasPairsPerCarton = rawPairsPerCarton !== undefined && rawPairsPerCarton !== null && rawPairsPerCarton !== '';
    const normalizedPairsPerCarton = hasPairsPerCarton ? normalizePairsPerCarton(rawPairsPerCarton) : null;
    if (hasPairsPerCarton && normalizedPairsPerCarton === null) {
      return res.status(400).json({ error: 'Pairs per carton must be 12 or 16 for this store.' });
    }
    const currentPairsPerCarton = Number(current.pairs_per_carton);
    const finalPairsPerCarton = normalizedPairsPerCarton ?? (currentPairsPerCarton === 16 ? 16 : 12);

    const rawLowStock = req.body.lowStockLimit ?? req.body.low_stock_limit ?? req.body.lowStockAlert ?? req.body.low_stock_alert;
    const cartonThresholdInput = req.body.lowStockThresholdCartons ?? req.body.lowStockCartons ?? req.body.low_stock_cartons;
    let finalLowStockLimitToUpdate: number = current.low_stock_limit;

    if (cartonThresholdInput !== undefined && cartonThresholdInput !== null && String(cartonThresholdInput).trim() !== '') {
      const parsedCartons = parseInt(String(cartonThresholdInput), 10);
      if (!isNaN(parsedCartons) && parsedCartons > 0) {
        finalLowStockLimitToUpdate = parsedCartons * finalPairsPerCarton;
      }
    } else if (rawLowStock !== undefined && rawLowStock !== null && String(rawLowStock).trim() !== '') {
      const parsed = parseInt(String(rawLowStock), 10);
      if (!isNaN(parsed) && parsed > 0) {
        finalLowStockLimitToUpdate = parsed;
      }
    }

    const rawAllowHalf = req.body.allowHalfCarton ?? req.body.allow_half_carton;
    const finalAllowHalfCarton = rawAllowHalf !== undefined ? Boolean(rawAllowHalf) : (current.allow_half_carton !== false);

    await pgClient.query(
      `UPDATE products SET
        name = $1, brand = $2, category = $3, article = $4, barcode = $5,
        pairs_per_carton = $6,
        primary_image_url = $7, description = $8, cost_price = $9, total_stock = $10,
        low_stock_limit = $11, active = $12,
        min_price = $13, max_price = $14,
        allow_half_carton = $15,
        updated_at = NOW()
      WHERE id = $16 AND COALESCE(tenant_id, 1) = $17`,
      [
        finalName,
        finalBrand,
        finalCategory,
        finalArticle,
        finalBarcode,
        finalPairsPerCarton,
        primaryImageUrl !== undefined ? primaryImageUrl : current.primary_image_url,
        description !== undefined ? description : current.description,
        finalCostPrice,
        updatedStock,
        finalLowStockLimitToUpdate,
        active !== undefined ? Boolean(active) : current.active,
        finalMinPrice,
        finalMaxPrice,
        finalAllowHalfCarton,
        id,
        tenantId,
      ]
    );

    res.json({ message: 'Product updated successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update product: ' + err.message });
  }
});

// Delete Product (Admin Only, Strictly scoped by req.user.tenantId)
router.delete('/:id', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await ensureProductAndSettingsColumns();
    const tenantId = extractStrictTenantId(req);
    const id = parseInt(req.params.id, 10);

    const prodRes = await pgClient.query<{
      id: number;
      tenant_product_no: number | null;
      barcode: string;
    }>(
      'SELECT id, tenant_product_no, barcode FROM products WHERE id = $1 AND COALESCE(tenant_id, 1) = $2 LIMIT 1',
      [id, tenantId]
    );
    if (prodRes.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found in your store.' });
    }
    const targetProd = prodRes.rows[0];

    const salesCheck = await pgClient.query(
      'SELECT id FROM sale_items WHERE product_id = $1 AND COALESCE(tenant_id, 1) = $2 LIMIT 1',
      [id, tenantId]
    );
    if (salesCheck.rows.length > 0) {
      await pgClient.query(
        'UPDATE products SET active = false, updated_at = NOW() WHERE id = $1 AND COALESCE(tenant_id, 1) = $2',
        [id, tenantId]
      );
      return res.json({ message: 'Product has historic sales records; it has been deactivated instead of deleted.' });
    }

    // Resolve the per-store product number being freed ONLY when the product itself is deleted
    const freedProductNo = Number(targetProd.tenant_product_no || 0);

    await pgClient.query('DELETE FROM products WHERE id = $1 AND COALESCE(tenant_id, 1) = $2', [id, tenantId]);

    // Save the deleted product number into tenants.deleted_product_ids for future reuse
    if (freedProductNo >= 1) {
      await recordDeletedProductNo(tenantId, freedProductNo);
    }

    res.json({ message: 'Product deleted successfully.', recycledProductNo: freedProductNo || null });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to delete product: ' + err.message });
  }
});

// Bulk CSV Import Products (Admin Only)
// Supports duplicateStrategy: 'MERGE' | 'OVERWRITE' | 'SKIP'
router.post('/bulk-import', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await ensureProductAndSettingsColumns();
    const tenantId = extractStrictTenantId(req);
    const { items, duplicateStrategy = 'MERGE' } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'No product rows provided for import.' });
    }

    const settings = await getCompanyPricingSettings(tenantId);
    const settingsRes = await pgClient.query<{ low_stock_limit: number }>(
      'SELECT low_stock_limit FROM company_settings WHERE COALESCE(tenant_id, 1) = $1 LIMIT 1',
      [tenantId]
    );
    const defaultLowStockLimit = settingsRes.rows[0]?.low_stock_limit || 5;

    let createdCount = 0;
    let mergedCount = 0;
    let overwrittenCount = 0;
    let skippedCount = 0;

    await pgClient.query('BEGIN');
    try {
      for (const rawItem of items) {
        const rowStrategy: 'MERGE' | 'OVERWRITE' | 'SKIP' =
          rawItem.duplicateAction || duplicateStrategy || 'MERGE';

        const rawBrand = String(rawItem.brand ?? '').trim();
        const finalBrand = rawBrand || 'Unbranded';

        const rawCategory = String(rawItem.category ?? rawItem.categoryName ?? '').trim();
        const finalCategory = rawCategory || 'Men';

        const rawBarcode = String(rawItem.barcode ?? '').trim();
        const rawArticle = String(rawItem.article ?? '').trim().toUpperCase();

        // Check if this row matches an existing product in this store by barcode or article
        let existingProduct: any = null;
        if (rawBarcode) {
          const byBarcode = await pgClient.query(
            'SELECT * FROM products WHERE barcode = $1 AND COALESCE(tenant_id, 1) = $2 LIMIT 1',
            [rawBarcode, tenantId]
          );
          if (byBarcode.rows.length > 0) existingProduct = byBarcode.rows[0];
        }
        if (!existingProduct && rawArticle) {
          const byArticle = await pgClient.query(
            'SELECT * FROM products WHERE LOWER(article) = LOWER($1) AND COALESCE(tenant_id, 1) = $2 LIMIT 1',
            [rawArticle, tenantId]
          );
          if (byArticle.rows.length > 0) existingProduct = byArticle.rows[0];
        }

        // Resolve pricing
        const rawCost = rawItem.cost_price ?? rawItem.costPrice ?? (existingProduct ? existingProduct.cost_price : 0);
        const rawMin =
          rawItem.min_price ??
          rawItem.minPrice ??
          rawItem.min_sale_price ??
          rawItem.minSalePrice ??
          (existingProduct ? existingProduct.min_price : undefined);
        const rawMax =
          rawItem.max_price ??
          rawItem.maxPrice ??
          rawItem.max_sale_price ??
          rawItem.maxSalePrice ??
          (existingProduct ? existingProduct.max_price : undefined) ??
          rawItem.selling_price ?? rawItem.sellingPrice ?? rawItem.sale_price ?? rawItem.salePrice;

        const costNum = Number(rawCost) || 0;
        const legacyPrice = rawItem.selling_price ?? rawItem.sellingPrice ?? rawItem.sale_price ?? rawItem.salePrice;
        let effSelling = legacyPrice !== undefined && legacyPrice !== '' ? Number(legacyPrice) : undefined;
        let effMin = rawMin !== undefined && rawMin !== '' ? Number(rawMin) : undefined;
        let effMax = rawMax !== undefined && rawMax !== '' ? Number(rawMax) : undefined;

        // Imports also use the store's configured pricing behavior, never a row-level policy.
        const chosenItemPolicy = settings.businessType === 'WHOLESALE' ? 'FIXED' : settings.pricingMode;

        if (chosenItemPolicy === 'FIXED') {
          effMax = effMax ?? effSelling ?? effMin ?? costNum;
        } else {
          if (effMin === undefined) {
            effMin = effSelling ?? costNum;
          }
          if (effMax === undefined) {
            effMax = effSelling ?? effMin ?? costNum;
          }
        }

        const validation = validateAndNormalizeProductPricing({
          pricingMode: chosenItemPolicy,
          costPrice: costNum,
          minPrice: effMin,
          maxPrice: effMax,
        });

        if (!validation.success || !validation.data) {
          throw new Error(
            `Row (${rawArticle || rawBarcode || 'New Product'}): ${
              validation.errors.general || 'Invalid pricing.'
            }`
          );
        }

        const {
          costPrice: finalCostPrice,
          minPrice: finalMinPrice,
          maxPrice: finalMaxPrice,
        } = validation.data;

        const importedStock = Math.max(
          0,
          parseInt(String(rawItem.total_stock ?? rawItem.totalStock ?? 0), 10) || 0
        );
        const importedLowStock =
          rawItem.low_stock_limit !== undefined &&
          rawItem.low_stock_limit !== null &&
          String(rawItem.low_stock_limit).trim() !== ''
            ? parseInt(String(rawItem.low_stock_limit), 10) || defaultLowStockLimit
            : rawItem.lowStockLimit !== undefined &&
              rawItem.lowStockLimit !== null &&
              String(rawItem.lowStockLimit).trim() !== ''
            ? parseInt(String(rawItem.lowStockLimit), 10) || defaultLowStockLimit
            : defaultLowStockLimit;

        const rawImageUrl = String(rawItem.primary_image_url ?? rawItem.primaryImageUrl ?? '').trim();
        const rawDesc = String(rawItem.description ?? '').trim();

        if (existingProduct) {
          if (rowStrategy === 'SKIP') {
            skippedCount++;
            continue;
          }

          const prevStock = Number(existingProduct.total_stock) || 0;

          if (rowStrategy === 'MERGE') {
            const newStock = prevStock + importedStock;
            const mergedName =
              String(rawItem.name ?? '').trim() || existingProduct.name || existingProduct.article;
            await pgClient.query(
              `UPDATE products SET
                name = $1,
                brand = $2,
                category = $3,
                cost_price = $4,
                min_price = $5,
                max_price = $6,
                total_stock = $7,
                low_stock_limit = $8,
                primary_image_url = $9,
                description = $10,
                active = true,
                updated_at = NOW()
              WHERE id = $11`,
              [
                mergedName,
                rawBrand ? finalBrand : existingProduct.brand,
                rawCategory ? finalCategory : existingProduct.category,
                finalCostPrice,
                finalMinPrice,
                finalMaxPrice,
                newStock,
                importedLowStock,
                rawImageUrl || existingProduct.primary_image_url || '',
                rawDesc || existingProduct.description || '',
                existingProduct.id,
              ]
            );

            if (importedStock > 0) {
              await pgClient.query(
                `INSERT INTO stock_movements (
                  product_id, qty_change, prev_stock, new_stock, movement_type, reference_id, user_id, notes
                ) VALUES ($1, $2, $3, $4, 'PURCHASE', 'CSV-IMPORT-MERGE', $5, 'CSV bulk import stock addition')`,
                [existingProduct.id, importedStock, prevStock, newStock, req.user!.id]
              );
            }
            mergedCount++;
            continue;
          }

          if (rowStrategy === 'OVERWRITE') {
            const finalArticle = rawArticle || existingProduct.article;
            const finalName = String(rawItem.name ?? '').trim() || finalArticle;
            await pgClient.query(
              `UPDATE products SET
                name = $1,
                brand = $2,
                category = $3,
                article = $4,
                cost_price = $5,
                min_price = $6,
                max_price = $7,
                total_stock = $8,
                low_stock_limit = $9,
                primary_image_url = $10,
                description = $11,
                active = true,
                updated_at = NOW()
              WHERE id = $12`,
              [
                finalName,
                finalBrand,
                finalCategory,
                finalArticle,
                finalCostPrice,
                finalMinPrice,
                finalMaxPrice,
                importedStock,
                importedLowStock,
                rawImageUrl,
                rawDesc,
                existingProduct.id,
              ]
            );

            const stockDiff = importedStock - prevStock;
            if (stockDiff !== 0) {
              await pgClient.query(
                `INSERT INTO stock_movements (
                  product_id, qty_change, prev_stock, new_stock, movement_type, reference_id, user_id, notes
                ) VALUES ($1, $2, $3, $4, 'ADJUSTMENT', 'CSV-IMPORT-OVERWRITE', $5, 'CSV bulk import record overwrite')`,
                [existingProduct.id, stockDiff, prevStock, importedStock, req.user!.id]
              );
            }
            overwrittenCount++;
            continue;
          }
        }

        // Creating a NEW Product using per-store sequence (recycled deleted ID or COUNT(*) + 1)
        const predictedId = await getNextProductId(tenantId);

        const catPrefix = parseCategoryPrefix(finalCategory);

        const storeStandardArticle = generateSuggestedArticle(catPrefix, predictedId);
        const cleanArticle = rawArticle || storeStandardArticle;
        const cleanName = String(rawItem.name ?? '').trim() || cleanArticle;

        // Validate Article uniqueness before inserting new product
        const articleConflict = await pgClient.query<{ id: number; name: string }>(
          'SELECT id, name FROM products WHERE LOWER(TRIM(article)) = LOWER($1) AND COALESCE(tenant_id, 1) = $2 LIMIT 1',
          [cleanArticle, tenantId]
        );
        if (articleConflict.rows.length > 0) {
          throw new Error(
            `Row (${cleanArticle}): Article "${cleanArticle}" already exists in this store ("${articleConflict.rows[0].name}").`
          );
        }

        let finalBarcode = rawBarcode;
        if (!finalBarcode) {
          const generated = await generateProductEan13(predictedId, tenantId, finalCategory);
          finalBarcode = generated.barcode;
        } else {
          const analysis = analyzeBarcode(finalBarcode);
          if (!analysis.isValid) {
            throw new Error(`Row (${cleanArticle}): ${analysis.error || 'Invalid barcode'}`);
          }
          const bCheck = await pgClient.query(
            'SELECT id FROM products WHERE barcode = $1 AND COALESCE(tenant_id, 1) = $2',
            [finalBarcode, tenantId]
          );
          if (bCheck.rows.length > 0) {
            const generated = await generateProductEan13(predictedId, tenantId, finalCategory);
            finalBarcode = generated.barcode;
          }
        }

        const insertRes = await pgClient.query<{ id: number }>(
          `INSERT INTO products (
            tenant_id, tenant_product_no, name, brand, category, article, barcode, primary_image_url,
            description, cost_price, min_price, max_price,
            total_stock, low_stock_limit, active
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, true)
          RETURNING id`,
          [
            tenantId,
            predictedId,
            cleanName,
            finalBrand,
            finalCategory,
            cleanArticle,
            finalBarcode,
            rawImageUrl,
            rawDesc,
            finalCostPrice,
            finalMinPrice,
            finalMaxPrice,
            importedStock,
            importedLowStock,
          ]
        );

        const actualId = insertRes.rows[0].id;
        await consumeDeletedProductNo(tenantId, predictedId);

        if (importedStock > 0) {
          await pgClient.query(
            `INSERT INTO stock_movements (
              tenant_id, product_id, qty_change, prev_stock, new_stock, movement_type, reference_id, user_id, notes
            ) VALUES ($1, $2, $3, 0, $3, 'PURCHASE', 'CSV-IMPORT-NEW', $4, 'Initial product inventory via CSV import')`,
            [tenantId, actualId, importedStock, req.user!.id]
          );
        }

        createdCount++;
      }

      await pgClient.query('COMMIT');
      try {
        await pgClient.query(
          "SELECT setval('products_id_seq', (SELECT GREATEST(MAX(id), 1) FROM products))"
        );
      } catch (_) {}

      res.status(200).json({
        success: true,
        message: `CSV Import complete: ${createdCount} created, ${mergedCount} merged, ${overwrittenCount} overwritten, ${skippedCount} skipped.`,
        summary: {
          createdCount,
          mergedCount,
          overwrittenCount,
          skippedCount,
          totalProcessed: items.length,
        },
      });
    } catch (txErr: any) {
      await pgClient.query('ROLLBACK');
      throw txErr;
    }
  } catch (err: any) {
    console.error('Bulk CSV Import error:', err);
    res.status(400).json({ error: err.message || 'Failed to import CSV products.' });
  }
});

export default router;
