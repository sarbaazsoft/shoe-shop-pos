// IndexedDB + LocalStorage Persistent Queue & Tenant-Scoped Product Cache for Offline POS Billing

export interface QueuedSaleItem {
  productId: number;
  article?: string;
  name?: string;
  barcode?: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  subtotal?: number;
  totalStock?: number;
}

export interface QueuedSale {
  clientTxId: string; // Unique local identifier e.g. "OFFLINE-1726578000-abcd"
  tenantId?: number | null;
  createdAt: string; // ISO date string when cashier pressed Complete Sale
  items: QueuedSaleItem[];
  customerId: number | null;
  customerName?: string;
  customerPhone?: string;
  paymentMethod: 'CASH' | 'CARD' | 'SPLIT' | 'BANK_TRANSFER' | 'ONLINE' | 'KHATA' | string;
  transactionId?: string;
  cashReceived: number;
  changeGiven: number;
  subtotal?: number;
  totalDiscount?: number;
  totalAmount: number;
  notes: string;
  cashierName?: string;
  cashierId?: number;
  authToken?: string;
  isMinPriceOverridden?: boolean;
  adminOverrideEmail?: string;
  adminOverridePassword?: string;
  exchange?: any | null;
  status: 'PENDING' | 'SYNCING' | 'SYNCED' | 'FAILED';
  errorMessage?: string;
  syncedInvoiceNumber?: string;
  syncedAt?: string;
}

const DB_NAME = 'ShoePosOfflineDB';
const DB_VERSION = 3;
const STORE_SALES = 'offline_sales_queue';
const STORE_CATALOG_LEGACY = 'cached_products';
const STORE_CATALOG = 'cached_products_by_store';

function decodeJwtPayload(token: string): any | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function parseValidTenantId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string' && /^[0-9]+$/.test(value.trim())) {
    const num = Number(value.trim());
    if (Number.isSafeInteger(num) && num > 0) {
      return num;
    }
  }
  return null;
}

/**
 * Resolves the current authenticated tenantId for offline product cache isolation.
 */
export function resolveActiveTenantId(explicitTenantId?: number | string | null): number | null {
  const explicit = parseValidTenantId(explicitTenantId);

  if (typeof localStorage !== 'undefined') {
    const token =
      localStorage.getItem('pos_auth_token') ||
      localStorage.getItem('shoe_pos_jwt_token');
    const payload = token ? decodeJwtPayload(token) : null;
    const tokenRole = String(payload?.role || '').toUpperCase();
    const tokenTenantId = parseValidTenantId(payload?.tenantId ?? payload?.tenant_id);

    if (tokenRole && tokenRole !== 'SUPERADMIN' && tokenRole !== 'SUPER_ADMIN' && tokenTenantId) {
      return explicit ?? tokenTenantId;
    }

    const userRaw =
      localStorage.getItem('pos_current_user') ||
      localStorage.getItem('shoe_pos_user');
    if (userRaw) {
      try {
        const parsed = JSON.parse(userRaw);
        const userRole = String(parsed?.originalRole || parsed?.role || '').toUpperCase();
        const userTenantId = parseValidTenantId(parsed?.tenantId ?? parsed?.tenant_id);
        if (userRole !== 'SUPERADMIN' && userRole !== 'SUPER_ADMIN' && userTenantId) {
          return explicit ?? userTenantId;
        }
        if ((userRole === 'SUPERADMIN' || userRole === 'SUPER_ADMIN') && explicit) {
          return explicit;
        }
      } catch {}
    }

    if (explicit) {
      return explicit;
    }

    const selectedTenantId = parseValidTenantId(localStorage.getItem('shoe_pos_active_tenant_id'));
    if (selectedTenantId) {
      return selectedTenantId;
    }
  }

  return explicit;
}

/**
 * Verifies that the current authenticated store user is allowed to access/modify
 * the offline product cache for the target tenantId. Prevents cross-tenant access.
 */
export function verifyOfflineTenantId(explicitTenantId?: number | string | null): number {
  const activeTenantId = resolveActiveTenantId(explicitTenantId);

  if (typeof localStorage !== 'undefined') {
    const token =
      localStorage.getItem('pos_auth_token') ||
      localStorage.getItem('shoe_pos_jwt_token');
    const payload = token ? decodeJwtPayload(token) : null;
    const tokenRole = String(payload?.role || '').toUpperCase();
    const tokenTenantId = parseValidTenantId(payload?.tenantId ?? payload?.tenant_id);

    if (
      tokenRole &&
      tokenRole !== 'SUPERADMIN' &&
      tokenRole !== 'SUPER_ADMIN' &&
      tokenTenantId &&
      activeTenantId &&
      tokenTenantId !== activeTenantId
    ) {
      throw new Error(
        `Cross-tenant offline cache access blocked: authenticated for tenant ${tokenTenantId}, cannot access tenant ${activeTenantId}.`
      );
    }

    const userRaw =
      localStorage.getItem('pos_current_user') ||
      localStorage.getItem('shoe_pos_user');
    if (userRaw) {
      try {
        const parsed = JSON.parse(userRaw);
        const userRole = String(parsed?.originalRole || parsed?.role || '').toUpperCase();
        const userTenantId = parseValidTenantId(parsed?.tenantId ?? parsed?.tenant_id);
        if (
          parsed &&
          userRole !== 'SUPERADMIN' &&
          userRole !== 'SUPER_ADMIN' &&
          userTenantId &&
          activeTenantId &&
          userTenantId !== activeTenantId
        ) {
          throw new Error(
            `Cross-tenant offline cache access blocked: authenticated for tenant ${userTenantId}, cannot access tenant ${activeTenantId}.`
          );
        }
      } catch (err: any) {
        if (err?.message?.includes('Cross-tenant offline cache access blocked')) {
          throw err;
        }
      }
    }
  }

  if (!activeTenantId) {
    throw new Error('No active tenantId available for offline product cache.');
  }

  return activeTenantId;
}

/**
 * Normalizes any product object from online catalog or API into a consistent
 * tenant-scoped POS product structure for offline billing using Product.tenantId.
 */
export function normalizeCachedProduct(p: any, tenantId: number): any {
  if (!p || p.id === undefined || p.id === null) return null;
  const resolvedTenantId = parseValidTenantId(tenantId);
  if (!resolvedTenantId) return null;

  const rawProductTenantId = p.tenantId ?? p.tenant_id;
  if (rawProductTenantId !== undefined && rawProductTenantId !== null) {
    const productTenantId = parseValidTenantId(rawProductTenantId);
    if (!productTenantId || productTenantId !== resolvedTenantId) {
      return null;
    }
  }

  const productId = Number(p.id);
  if (!Number.isSafeInteger(productId) || productId <= 0) return null;

  const costPrice = Math.max(
    0,
    Math.round(Number(p.costPrice ?? p.cost_price ?? 0) || 0)
  );
  const rawSelling = Math.max(
    0,
    Math.round(Number(p.sellingPrice ?? p.selling_price ?? p.salePrice ?? p.sale_price ?? p.price ?? 0) || 0)
  );
  const rawMax = Math.max(
    0,
    Math.round(Number(p.maxPrice ?? p.max_price ?? p.maxSalePrice ?? p.max_sale_price ?? rawSelling) || 0)
  );
  const rawMin = Math.max(
    0,
    Math.round(Number(p.minPrice ?? p.min_price ?? p.minSalePrice ?? p.min_sale_price ?? rawSelling) || 0)
  );
  const retailPrice = rawSelling > 0 ? rawSelling : rawMax;
  const totalStock = Math.max(
    0,
    Math.round(Number(p.totalStock ?? p.total_stock ?? 0) || 0)
  );

  const article = String(p.article || p.name || '').trim();
  const name = String(p.name || p.article || '').trim();
  const barcode = String(p.barcode || '').trim();

  const normalized = {
    ...p,
    id: productId,
    tenantId: resolvedTenantId,
    cacheKey: `${resolvedTenantId}:${productId}`,
    article,
    name,
    barcode,
    brandName: String(p.brandName || p.brand_name || p.brand || '').trim(),
    brand_name: String(p.brand_name || p.brandName || p.brand || '').trim(),
    brandLogo: p.brandLogo || p.brand_logo || '',
    categoryName: String(p.categoryName || p.category_name || p.category || 'General').trim(),
    category_name: String(p.category_name || p.categoryName || p.category || 'General').trim(),
    primaryImageUrl: p.primaryImageUrl || p.primary_image_url || '',
    costPrice,
    cost_price: costPrice,
    sellingPrice: retailPrice,
    selling_price: retailPrice,
    price: retailPrice,
    salePrice: retailPrice,
    sale_price: retailPrice,
    minPrice: rawMin > 0 ? rawMin : retailPrice,
    min_price: rawMin > 0 ? rawMin : retailPrice,
    minSalePrice: rawMin > 0 ? rawMin : retailPrice,
    min_sale_price: rawMin > 0 ? rawMin : retailPrice,
    maxPrice: rawMax > 0 ? rawMax : retailPrice,
    max_price: rawMax > 0 ? rawMax : retailPrice,
    maxSalePrice: rawMax > 0 ? rawMax : retailPrice,
    max_sale_price: rawMax > 0 ? rawMax : retailPrice,
    totalStock,
    total_stock: totalStock,
    lowStockLimit: Number(p.lowStockLimit ?? p.low_stock_limit ?? 5) || 5,
    active: p.active !== false,
    cachedAt: new Date().toISOString(),
  };
  return normalized;
}

function getLocalStorageCatalogKey(tenantId: number): string {
  return `pos_offline_catalog_tenant:${tenantId}`;
}

function saveCatalogMirrorToLocalStorage(tenantId: number, products: any[]): void {
  if (typeof localStorage === 'undefined') return;
  const validTenantId = parseValidTenantId(tenantId);
  if (!validTenantId) return;
  try {
    const key = getLocalStorageCatalogKey(validTenantId);
    const existingRaw = localStorage.getItem(key);
    const existingMap = new Map<number, any>();
    if (existingRaw) {
      const parsed = JSON.parse(existingRaw);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (
            item &&
            item.id !== undefined &&
            parseValidTenantId(item.tenantId) === validTenantId
          ) {
            existingMap.set(Number(item.id), item);
          }
        }
      }
    }
    for (const prod of products) {
      if (
        prod &&
        prod.id !== undefined &&
        parseValidTenantId(prod.tenantId) === validTenantId
      ) {
        existingMap.set(Number(prod.id), prod);
      }
    }
    const merged = Array.from(existingMap.values()).slice(0, 600);
    localStorage.setItem(key, JSON.stringify(merged));
  } catch {
    // Ignore storage quota warnings
  }
}

function readCatalogMirrorFromLocalStorage(tenantId: number): any[] {
  if (typeof localStorage === 'undefined') return [];
  const validTenantId = parseValidTenantId(tenantId);
  if (!validTenantId) return [];
  try {
    const raw = localStorage.getItem(getLocalStorageCatalogKey(validTenantId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p) =>
        p &&
        parseValidTenantId(p.tenantId) === validTenantId &&
        p.cacheKey === `${validTenantId}:${Number(p.id)}`
    );
  } catch {
    return [];
  }
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_SALES)) {
        const salesStore = db.createObjectStore(STORE_SALES, { keyPath: 'clientTxId' });
        salesStore.createIndex('status', 'status', { unique: false });
        salesStore.createIndex('createdAt', 'createdAt', { unique: false });
      }
      // Remove legacy unscoped product store if present
      if (db.objectStoreNames.contains(STORE_CATALOG_LEGACY)) {
        db.deleteObjectStore(STORE_CATALOG_LEGACY);
      }
      // On upgrade to v3 (tenantId-scoped product cache), recreate STORE_CATALOG
      if (event.oldVersion < 3 && db.objectStoreNames.contains(STORE_CATALOG)) {
        db.deleteObjectStore(STORE_CATALOG);
      }
      if (!db.objectStoreNames.contains(STORE_CATALOG)) {
        const catalogStore = db.createObjectStore(STORE_CATALOG, { keyPath: 'cacheKey' });
        catalogStore.createIndex('tenantId', 'tenantId', { unique: false });
        catalogStore.createIndex('barcode', 'barcode', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Save an offline sale to IndexedDB
 */
export async function queueOfflineSale(sale: QueuedSale, explicitTenantId?: number | null): Promise<void> {
  const resolvedTenantId = resolveActiveTenantId(sale.tenantId ?? explicitTenantId);
  const scopedSale: QueuedSale = {
    ...sale,
    ...(resolvedTenantId ? { tenantId: resolvedTenantId } : {}),
  };
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_SALES, 'readwrite');
    const store = tx.objectStore(STORE_SALES);
    const req = store.put(scopedSale);

    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });

  // Also deduct local cached stock for this tenant so subsequent offline bills have accurate stock
  if (Array.isArray(sale.items) && sale.items.length > 0 && resolvedTenantId) {
    await deductCachedProductStockOffline(sale.items, resolvedTenantId).catch(() => {});
  }
}

/**
 * Get all queued offline sales for the active store tenantId
 */
export async function getOfflineSales(explicitTenantId?: number | null): Promise<QueuedSale[]> {
  const activeTenantId = resolveActiveTenantId(explicitTenantId);

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SALES, 'readonly');
    const store = tx.objectStore(STORE_SALES);
    const req = store.getAll();

    req.onsuccess = () => {
      const allResults = (req.result as QueuedSale[]) || [];
      const results = allResults.filter((s) => {
        if (activeTenantId && s.tenantId) {
          return Number(s.tenantId) === activeTenantId;
        }
        return !s.tenantId;
      });
      results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      resolve(results);
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Get count of pending offline sales for the active store tenantId
 */
export async function getPendingOfflineSalesCount(explicitTenantId?: number | null): Promise<number> {
  const all = await getOfflineSales(explicitTenantId);
  return all.filter((s) => s.status === 'PENDING' || s.status === 'FAILED').length;
}

/**
 * Update an offline sale status
 */
export async function updateOfflineSaleStatus(
  clientTxId: string,
  status: QueuedSale['status'],
  extra?: { syncedInvoiceNumber?: string; errorMessage?: string; syncedAt?: string }
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SALES, 'readwrite');
    const store = tx.objectStore(STORE_SALES);
    const getReq = store.get(clientTxId);

    getReq.onsuccess = () => {
      const item: QueuedSale = getReq.result;
      if (!item) {
        resolve();
        return;
      }
      item.status = status;
      if (extra?.syncedInvoiceNumber) item.syncedInvoiceNumber = extra.syncedInvoiceNumber;
      if (extra?.errorMessage !== undefined) item.errorMessage = extra.errorMessage;
      if (extra?.syncedAt) item.syncedAt = extra.syncedAt;

      const putReq = store.put(item);
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

/**
 * Delete a synced or rejected offline sale from IndexedDB
 */
export async function deleteOfflineSale(clientTxId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SALES, 'readwrite');
    const store = tx.objectStore(STORE_SALES);
    const req = store.delete(clientTxId);

    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Cache products list into tenantId-scoped IndexedDB & LocalStorage mirror
 * for offline product search, catalog browsing, and barcode/article billing.
 */
export async function cacheCatalogOffline(
  products: any[],
  explicitTenantId?: number | string | null
): Promise<void> {
  if (!Array.isArray(products) || products.length === 0) return;

  let tenantId: number;
  try {
    const candidateTenantId =
      parseValidTenantId(explicitTenantId) ??
      parseValidTenantId(products[0]?.tenantId ?? products[0]?.tenant_id);
    tenantId = verifyOfflineTenantId(candidateTenantId);
  } catch {
    return;
  }

  const normalizedList = products
    .map((p) => normalizeCachedProduct(p, tenantId))
    .filter(Boolean);

  if (normalizedList.length === 0) return;

  // 1. Instant synchronous mirror in tenant-scoped localStorage
  saveCatalogMirrorToLocalStorage(tenantId, normalizedList);

  // 2. Persistent tenant-scoped IndexedDB write
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_CATALOG, 'readwrite');
      const store = tx.objectStore(STORE_CATALOG);
      for (const item of normalizedList) {
        store.put(item);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // LocalStorage mirror still serves offline catalog if IndexedDB is blocked
  }
}

/**
 * Deduct stock locally in the tenant-scoped offline catalog cache when an offline bill is created
 */
export async function deductCachedProductStockOffline(
  items: Array<{ productId: number; quantity: number }>,
  explicitTenantId?: number | string | null
): Promise<void> {
  if (!Array.isArray(items) || items.length === 0) return;
  let tenantId: number;
  try {
    tenantId = verifyOfflineTenantId(explicitTenantId);
  } catch {
    return;
  }

  const qtyByProduct = new Map<number, number>();
  for (const item of items) {
    const pid = Number(item.productId);
    const qty = Number(item.quantity) || 0;
    if (pid && qty > 0) {
      qtyByProduct.set(pid, (qtyByProduct.get(pid) || 0) + qty);
    }
  }
  if (qtyByProduct.size === 0) return;

  const currentMirror = readCatalogMirrorFromLocalStorage(tenantId);
  const updatedItems: any[] = [];
  for (const prod of currentMirror) {
    if (parseValidTenantId(prod.tenantId) !== tenantId) continue;
    const deduct = qtyByProduct.get(Number(prod.id));
    if (deduct) {
      const newStock = Math.max(0, (Number(prod.totalStock ?? prod.total_stock ?? 0) || 0) - deduct);
      updatedItems.push({
        ...prod,
        tenantId,
        cacheKey: `${tenantId}:${Number(prod.id)}`,
        totalStock: newStock,
        total_stock: newStock,
      });
    }
  }
  if (updatedItems.length > 0) {
    saveCatalogMirrorToLocalStorage(tenantId, updatedItems);
  }

  try {
    const db = await openDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_CATALOG, 'readwrite');
      const store = tx.objectStore(STORE_CATALOG);
      for (const [pid, deduct] of qtyByProduct.entries()) {
        const cacheKey = `${tenantId}:${pid}`;
        const getReq = store.get(cacheKey);
        getReq.onsuccess = () => {
          const existing = getReq.result;
          if (existing && parseValidTenantId(existing.tenantId) === tenantId) {
            const newStock = Math.max(0, (Number(existing.totalStock ?? existing.total_stock ?? 0) || 0) - deduct);
            existing.totalStock = newStock;
            existing.total_stock = newStock;
            store.put(existing);
          }
        };
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Ignore IDB errors
  }
}

/**
 * Delete a single cached product strictly within the active tenant's offline catalog cache
 */
export async function deleteCachedProductOffline(
  productId: number,
  explicitTenantId?: number | string | null
): Promise<void> {
  const pid = Number(productId);
  if (!Number.isSafeInteger(pid) || pid <= 0) return;

  let tenantId: number;
  try {
    tenantId = verifyOfflineTenantId(explicitTenantId);
  } catch {
    return;
  }

  if (typeof localStorage !== 'undefined') {
    try {
      const key = getLocalStorageCatalogKey(tenantId);
      const existing = readCatalogMirrorFromLocalStorage(tenantId);
      const filtered = existing.filter(
        (p) => parseValidTenantId(p.tenantId) === tenantId && Number(p.id) !== pid
      );
      localStorage.setItem(key, JSON.stringify(filtered));
    } catch {}
  }

  try {
    const db = await openDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_CATALOG, 'readwrite');
      const store = tx.objectStore(STORE_CATALOG);
      const cacheKey = `${tenantId}:${pid}`;
      const getReq = store.get(cacheKey);
      getReq.onsuccess = () => {
        const existing = getReq.result;
        if (existing && parseValidTenantId(existing.tenantId) === tenantId) {
          store.delete(cacheKey);
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {}
}

/**
 * Retrieve all cached catalog products strictly belonging to the active tenantId
 */
export async function getAllCachedProductsOffline(
  explicitTenantId?: number | string | null
): Promise<any[]> {
  let tenantId: number;
  try {
    tenantId = verifyOfflineTenantId(explicitTenantId);
  } catch {
    return [];
  }

  const byId = new Map<number, any>();

  // 1. Load fast localStorage mirror for this tenantId
  for (const item of readCatalogMirrorFromLocalStorage(tenantId)) {
    const norm = normalizeCachedProduct(item, tenantId);
    if (norm) byId.set(norm.id, norm);
  }

  // 2. Load IndexedDB tenant-scoped catalog
  try {
    const db = await openDB();
    const idbItems = await new Promise<any[]>((resolve) => {
      const tx = db.transaction(STORE_CATALOG, 'readonly');
      const store = tx.objectStore(STORE_CATALOG);
      const req = store.indexNames.contains('tenantId')
        ? store.index('tenantId').getAll(IDBKeyRange.only(tenantId))
        : store.getAll();
      req.onsuccess = () => {
        const all = (req.result as any[]) || [];
        resolve(
          all.filter(
            (p) =>
              p &&
              parseValidTenantId(p.tenantId) === tenantId &&
              p.cacheKey === `${tenantId}:${Number(p.id)}`
          )
        );
      };
      req.onerror = () => resolve([]);
    });

    for (const item of idbItems) {
      const norm = normalizeCachedProduct(item, tenantId);
      if (norm) byId.set(norm.id, norm);
    }
  } catch {
    // Fallback to localStorage mirror already populated in byId
  }

  return Array.from(byId.values());
}

/**
 * Lookup a cached product by barcode or article name in the tenant's offline catalog
 */
export async function lookupCachedProductOffline(
  barcodeOrArticle: string,
  explicitTenantId?: number | string | null
): Promise<any | null> {
  const clean = String(barcodeOrArticle || '').trim().toLowerCase();
  if (!clean) return null;

  const allStoreProducts = await getAllCachedProductsOffline(explicitTenantId);
  if (allStoreProducts.length === 0) return null;

  // 1. Exact match on barcode, article, or product name
  const exactMatch = allStoreProducts.find(
    (p: any) =>
      (p.barcode && String(p.barcode).trim().toLowerCase() === clean) ||
      (p.article && String(p.article).trim().toLowerCase() === clean) ||
      (p.name && String(p.name).trim().toLowerCase() === clean)
  );
  if (exactMatch) return exactMatch;

  // 2. Prefix or partial match on article, name, or barcode (so typing an article in offline mode finds it)
  const partialMatch = allStoreProducts.find(
    (p: any) =>
      (p.article && String(p.article).toLowerCase().includes(clean)) ||
      (p.name && String(p.name).toLowerCase().includes(clean)) ||
      (p.barcode && String(p.barcode).toLowerCase().includes(clean))
  );

  return partialMatch || null;
}

/**
 * Search cached products in IndexedDB/LocalStorage when offline (strictly scoped by tenantId)
 */
export async function searchCachedProductsOffline(
  query: string,
  explicitTenantId?: number | string | null,
  limit = 50
): Promise<any[]> {
  const all = await getAllCachedProductsOffline(explicitTenantId);
  const q = String(query || '').toLowerCase().trim();
  if (!q) {
    return all.slice(0, limit);
  }

  // Score matches so exact/prefix article matches appear first
  const matched = all.filter((p) => {
    return (
      (p.article && String(p.article).toLowerCase().includes(q)) ||
      (p.name && String(p.name).toLowerCase().includes(q)) ||
      (p.barcode && String(p.barcode).toLowerCase().includes(q)) ||
      (p.brandName && String(p.brandName).toLowerCase().includes(q)) ||
      (p.brand_name && String(p.brand_name).toLowerCase().includes(q)) ||
      (p.categoryName && String(p.categoryName).toLowerCase().includes(q))
    );
  });

  matched.sort((a, b) => {
    const aExact =
      String(a.article || '').toLowerCase() === q ||
      String(a.barcode || '').toLowerCase() === q;
    const bExact =
      String(b.article || '').toLowerCase() === q ||
      String(b.barcode || '').toLowerCase() === q;
    if (aExact && !bExact) return -1;
    if (!aExact && bExact) return 1;
    return 0;
  });

  return matched.slice(0, limit);
}

