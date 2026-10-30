import { Router } from 'express';
import type { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import { Type, type FunctionDeclaration } from '@google/genai';
import { getGeminiClient } from '../gemini.ts';
import { pgClient } from '../../db/index.ts';
import { extractTokenFromRequest } from '../auth.ts';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'shoe-pos-super-secure-jwt-secret-key-2026';

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

const CODEBASE_TOPIC_MAP: Array<{
  keywords: string[];
  files: string[];
}> = [
  {
    keywords: ['csv', 'import', 'bulk', 'upload', 'excel', 'spreadsheet', 'sample', 'duplicate', 'merge', 'overwrite', 'skip', 'column', 'header'],
    files: [
      'src/components/inventory/CsvImportModal.tsx',
      'src/utils/csvImport.ts',
      'src/schemas/productSchema.ts',
    ],
  },
  {
    keywords: ['product', 'inventory', 'catalog', 'add product', 'edit product', 'article', 'stock', 'adjust', 'ledger', 'damage', 'audit'],
    files: [
      'src/components/inventory/ProductManagement.tsx',
      'src/components/inventory/ProductFormModal.tsx',
      'src/components/inventory/StockAdjustModal.tsx',
      'src/components/inventory/StockLedgerView.tsx',
      'src/utils/footwear.ts',
    ],
  },
  {
    keywords: ['barcode', 'sticker', 'label', 'side-end', 'box label', 'tspl', 'code-128', 'code128', 'ean', 'scan'],
    files: [
      'src/components/inventory/BarcodeStickerModal.tsx',
      'src/components/inventory/SideEndBoxLabelModal.tsx',
      'src/utils/barcode.ts',
      'src/utils/printer/tspl.ts',
    ],
  },
  {
    keywords: ['pos', 'terminal', 'billing', 'checkout', 'invoice', 'receipt', 'exchange', 'return', 'refund', 'cart', 'discount', 'bargain'],
    files: [
      'src/components/pos/PosTerminal.tsx',
      'src/components/pos/ShoeExchangeModal.tsx',
      'src/components/returns/SalesReturnView.tsx',
      'src/components/pos/InvoicePrintModal.tsx',
    ],
  },
  {
    keywords: ['purchase', 'supplier', 'khata', 'payable', 'payment', 'vendor', 'supplier return', 'debit'],
    files: [
      'src/components/purchases/PurchaseManagement.tsx',
      'src/components/suppliers/SupplierManagement.tsx',
      'src/components/suppliers/SupplierPaymentModal.tsx',
      'src/components/purchases/SupplierReturnModal.tsx',
    ],
  },
  {
    keywords: ['customer', 'walk-in', 'loyalty', 'client'],
    files: [
      'src/components/customers/CustomerManagement.tsx',
      'src/components/customers/CustomerDetailsModal.tsx',
    ],
  },
  {
    keywords: ['printer', 'hardware', 'silent', 'thermal', 'escpos', 'webusb', 'webserial', 'backup', 'restore', 'setting', 'staff', 'cashier', 'admin', 'profile', 'email', 'password'],
    files: [
      'src/components/settings/SettingsView.tsx',
      'src/components/settings/PrinterHardwareSettings.tsx',
      'src/components/settings/DataBackupRestore.tsx',
      'src/components/settings/CreateStaffModal.tsx',
      'src/components/auth/UserProfileModal.tsx',
    ],
  },
  {
    keywords: ['report', 'profit', 'revenue', 'financial', 'analytics', 'dashboard', 'summary'],
    files: [
      'src/components/reports/ReportsDashboard.tsx',
      'src/components/dashboard/DashboardOverview.tsx',
    ],
  },
  {
    keywords: ['offline', 'pwa', 'sync', 'internet', 'cache'],
    files: [
      'src/services/offlineQueueService.ts',
      'src/utils/offlineDb.ts',
      'src/components/pos/OfflineSyncModal.tsx',
    ],
  },
];

function safeReadCodebaseFile(relativeFilePath: string, maxChars = 6500): { filePath: string; content: string } | null {
  try {
    const cleanRel = String(relativeFilePath || '')
      .replace(/^\/+/, '')
      .replace(/\.\./g, '')
      .trim();

    // Security guard: Only allow reading source files inside src/, never .env or config secrets
    if (
      !cleanRel.startsWith('src/') ||
      cleanRel.includes('.env') ||
      cleanRel.endsWith('auth.ts')
    ) {
      return null;
    }

    const fullPath = path.resolve(process.cwd(), cleanRel);
    if (!fullPath.startsWith(path.resolve(process.cwd(), 'src')) || !fs.existsSync(fullPath)) {
      return null;
    }

    const raw = fs.readFileSync(fullPath, 'utf8');
    const truncated = raw.length > maxChars ? `${raw.slice(0, maxChars)}\n/* ... [truncated for context] ... */` : raw;
    return { filePath: cleanRel, content: truncated };
  } catch {
    return null;
  }
}

function inspectCodebaseForQuery(queryText: string): {
  inspectedFiles: string[];
  codebaseContextText: string;
} {
  const lower = String(queryText || '').toLowerCase();
  const matchedFiles = new Set<string>();

  for (const entry of CODEBASE_TOPIC_MAP) {
    if (entry.keywords.some((kw) => lower.includes(kw))) {
      for (const file of entry.files) {
        matchedFiles.add(file);
      }
    }
  }

  // Always include CSV import & Product Management if no specific keyword matched or if general operation question
  if (matchedFiles.size === 0) {
    matchedFiles.add('src/components/inventory/ProductManagement.tsx');
    matchedFiles.add('src/components/inventory/CsvImportModal.tsx');
    matchedFiles.add('src/utils/csvImport.ts');
  }

  const selectedFiles = Array.from(matchedFiles).slice(0, 4);
  const loadedSnippets: string[] = [];
  const inspectedFiles: string[] = [];

  for (const file of selectedFiles) {
    const res = safeReadCodebaseFile(file, 5500);
    if (res) {
      inspectedFiles.push(res.filePath);
      loadedSnippets.push(`--- LIVE CODEBASE FILE: ${res.filePath} ---\n${res.content}`);
    }
  }

  return {
    inspectedFiles,
    codebaseContextText: loadedSnippets.join('\n\n'),
  };
}

function resolveRequestTenantId(req: Request): number {
  const token = extractTokenFromRequest(req);
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      if (Number(decoded?.tenantId) > 0) {
        return Number(decoded.tenantId);
      }
    } catch {}
  }

  const headerTid = Number(req.headers['x-tenant-id'] || (req as any).tenantResolution?.tenant?.id || req.body?.tenantId);
  if (Number.isInteger(headerTid) && headerTid > 0) {
    return headerTid;
  }
  return 1;
}

async function queryLiveStoreDatabase(
  tenantId: number,
  entity: string,
  search = '',
  limit = 10
): Promise<any> {
  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 25);
  const cleanSearch = String(search || '').trim().toLowerCase();
  const cleanEntity = String(entity || 'summary').trim().toLowerCase();

  try {
    if (cleanEntity === 'products' || cleanEntity === 'inventory') {
      const params: any[] = [tenantId];
      let sql = `SELECT id, tenant_product_no, article, name, brand, category, barcode, cost_price, min_price, max_price, total_stock, low_stock_limit
                 FROM products WHERE tenant_id = $1 AND active = true`;
      if (cleanSearch) {
        params.push(`%${cleanSearch}%`);
        sql += ` AND (LOWER(article) LIKE $2 OR LOWER(name) LIKE $2 OR LOWER(brand) LIKE $2 OR LOWER(category) LIKE $2 OR barcode LIKE $2)`;
      }
      sql += ` ORDER BY id DESC LIMIT ${safeLimit}`;
      const res = await pgClient.query(sql, params);
      return { entity: 'products', count: res.rows.length, items: res.rows };
    }

    if (cleanEntity === 'low_stock') {
      const res = await pgClient.query(
        `SELECT id, article, name, brand, category, barcode, total_stock, low_stock_limit, min_price, max_price
         FROM products
         WHERE tenant_id = $1 AND active = true AND total_stock <= COALESCE(low_stock_limit, 5)
         ORDER BY total_stock ASC, id DESC LIMIT ${safeLimit}`,
        [tenantId]
      );
      return { entity: 'low_stock', count: res.rows.length, items: res.rows };
    }

    if (cleanEntity === 'sales' || cleanEntity === 'invoices') {
      const res = await pgClient.query(
        `SELECT id, invoice_number, sale_date, subtotal, discount, total_amount, payment_method
         FROM sales
         WHERE tenant_id = $1
         ORDER BY id DESC LIMIT ${safeLimit}`,
        [tenantId]
      );
      return { entity: 'sales', count: res.rows.length, items: res.rows };
    }

    if (cleanEntity === 'purchases') {
      const res = await pgClient.query(
        `SELECT id, purchase_number, supplier_name, purchase_date, total_amount, paid_amount, payment_status
         FROM purchases
         WHERE tenant_id = $1
         ORDER BY id DESC LIMIT ${safeLimit}`,
        [tenantId]
      );
      return { entity: 'purchases', count: res.rows.length, items: res.rows };
    }

    if (cleanEntity === 'suppliers') {
      const res = await pgClient.query(
        `SELECT id, name, phone, email, balance
         FROM suppliers
         WHERE tenant_id = $1
         ORDER BY id DESC LIMIT ${safeLimit}`,
        [tenantId]
      );
      return { entity: 'suppliers', count: res.rows.length, items: res.rows };
    }

    if (cleanEntity === 'customers') {
      const res = await pgClient.query(
        `SELECT id, name, phone, email, address
         FROM customers
         WHERE tenant_id = $1
         ORDER BY id DESC LIMIT ${safeLimit}`,
        [tenantId]
      );
      return { entity: 'customers', count: res.rows.length, items: res.rows };
    }

    if (cleanEntity === 'brands_categories') {
      const [brandsRes, catsRes] = await Promise.all([
        pgClient.query(`SELECT DISTINCT brand as name FROM products WHERE tenant_id = $1 AND brand IS NOT NULL AND TRIM(brand) != '' ORDER BY brand ASC`, [tenantId]),
        pgClient.query(`SELECT id, name FROM categories ORDER BY name ASC`),
      ]);
      return {
        entity: 'brands_categories',
        brands: brandsRes.rows.map((b: any) => b.name),
        categories: catsRes.rows.map((c: any) => c.name),
      };
    }

    return { entity: cleanEntity, message: 'No matching entity found.' };
  } catch (err: any) {
    return { entity: cleanEntity, error: err?.message || 'Database query error' };
  }
}

const assistantTools: FunctionDeclaration[] = [
  {
    name: 'readCodebaseFile',
    description:
      'Reads a real-time source file from the POS application codebase (under src/) to verify UI components, CSV import validation logic, barcode generators, keyboard shortcuts, or backend routes.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        filePath: {
          type: Type.STRING,
          description:
            'Relative path inside src/, e.g. "src/components/inventory/CsvImportModal.tsx", "src/utils/csvImport.ts", "src/components/pos/PosTerminal.tsx", "src/components/inventory/ProductFormModal.tsx"',
        },
      },
      required: ['filePath'],
    },
  },
  {
    name: 'queryStoreDatabase',
    description:
      'Queries the active store tenant PostgreSQL database in real-time for products, low_stock items, sales/invoices, purchases, suppliers, customers, or brands_categories.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        entity: {
          type: Type.STRING,
          description: 'One of: "products", "low_stock", "sales", "purchases", "suppliers", "customers", "brands_categories"',
        },
        search: {
          type: Type.STRING,
          description: 'Optional search keyword (article number, product name, barcode, brand)',
        },
        limit: {
          type: Type.NUMBER,
          description: 'Maximum rows to return (1 to 25)',
        },
      },
      required: ['entity'],
    },
  },
];

router.post('/', async (req: Request, res: Response) => {
  try {
    const { messages = [], model: requestedModel, storeName: customStoreName } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required.' });
    }

    const tenantId = resolveRequestTenantId(req);
    const latestUserMessage = String(messages[messages.length - 1]?.text || '');

    // 1. REAL-TIME CODEBASE INSPECTION FOR USER QUERY
    const { inspectedFiles, codebaseContextText } = inspectCodebaseForQuery(latestUserMessage);
    const allInspectedFiles = new Set<string>(inspectedFiles);

    // 2. REAL-TIME TENANT-SCOPED DATABASE STATE INSPECTION
    let storeName = customStoreName?.trim() || '';
    let pricingMode = 'FIXED';
    let isPolicyLocked = true;
    let isInstalled = true;
    let currencySymbol = 'Rs.';
    let lowStockLimit = 5;
    let totalProductsCount = 0;
    let totalStockPairs = 0;
    let lowStockCount = 0;
    let totalCustomersCount = 0;
    let totalSuppliersCount = 0;
    let totalSalesCount = 0;
    let totalSalesRevenue = 0;
    let recentProductsSample: any[] = [];
    let lowStockSample: any[] = [];
    let storeBrands: string[] = [];
    let storeCategories: string[] = [];

    try {
      const settingsRes = await pgClient.query<any>(
        `SELECT cs.*, t.name AS name
         FROM company_settings cs
         LEFT JOIN tenants t ON t.id = cs.tenant_id
         WHERE cs.tenant_id = $1
         ORDER BY cs.id ASC
         LIMIT 1`,
        [tenantId]
      );

      if (settingsRes.rows.length > 0) {
        const row = settingsRes.rows[0];
        if (!storeName) {
          storeName = row.name || row.company_name || 'Retail Store';
        }
        pricingMode =
          String(row.pricing_mode || 'FIXED').toUpperCase() === 'NEGOTIABLE'
            ? 'NEGOTIABLE'
            : 'FIXED';
        isPolicyLocked = Boolean(
          row.pricing_policy_locked ?? row.pricingPolicyLocked ?? true
        );
        isInstalled = Boolean(row.pricing_policy_locked ?? row.pricingPolicyLocked ?? true);
        currencySymbol = row.currency_symbol || row.currencySymbol || 'Rs.';
        lowStockLimit = Number(row.low_stock_limit || row.lowStockLimit || 5);
      } else if (!storeName) {
        storeName = 'Retail Store';
      }
    } catch {
      if (!storeName) storeName = 'Retail Store';
    }

    try {
      const [prodListRes, custRes, suppRes, salesRes, brandsRes, catsRes] = await Promise.all([
        pgClient
          .query<any>(
            `SELECT id, tenant_product_no, article, name, brand, category, barcode, cost_price, min_price, max_price, total_stock, low_stock_limit
             FROM products WHERE tenant_id = $1 AND active = true ORDER BY id DESC`,
            [tenantId]
          )
          .catch(() => ({ rows: [] })),
        pgClient
          .query<{ count: string | number }>('SELECT COUNT(*) as count FROM customers WHERE tenant_id = $1', [tenantId])
          .catch(() => ({ rows: [{ count: 0 }] })),
        pgClient
          .query<{ count: string | number }>('SELECT COUNT(*) as count FROM suppliers WHERE tenant_id = $1', [tenantId])
          .catch(() => ({ rows: [{ count: 0 }] })),
        pgClient
          .query<any>('SELECT id, invoice_number, total_amount, sale_date FROM sales WHERE tenant_id = $1 ORDER BY id DESC', [tenantId])
          .catch(() => ({ rows: [] })),
        pgClient
          .query<any>(
            `SELECT DISTINCT brand as name FROM products WHERE tenant_id = $1 AND brand IS NOT NULL AND TRIM(brand) != '' ORDER BY brand ASC`,
            [tenantId]
          )
          .catch(() => ({ rows: [] })),
        pgClient
          .query<any>('SELECT name FROM categories ORDER BY name ASC')
          .catch(() => ({ rows: [] })),
      ]);

      const allProds = prodListRes.rows || [];
      totalProductsCount = allProds.length;
      totalStockPairs = allProds.reduce((acc: number, p: any) => acc + (Number(p.total_stock) || 0), 0);
      const lowItems = allProds.filter(
        (p: any) => (Number(p.total_stock) || 0) <= (Number(p.low_stock_limit) || lowStockLimit)
      );
      lowStockCount = lowItems.length;
      lowStockSample = lowItems.slice(0, 8);
      recentProductsSample = allProds.slice(0, 8);

      totalCustomersCount = Number(custRes.rows[0]?.count || 0);
      totalSuppliersCount = Number(suppRes.rows[0]?.count || 0);

      const allSales = salesRes.rows || [];
      totalSalesCount = allSales.length;
      totalSalesRevenue = allSales.reduce((acc: number, s: any) => acc + (Number(s.total_amount) || 0), 0);

      storeBrands = (brandsRes.rows || []).map((b: any) => b.name).filter(Boolean);
      storeCategories = (catsRes.rows || []).map((c: any) => c.name).filter(Boolean);
    } catch {}

    // Model selection based on user mode preference
    let chosenModel = 'gemini-3.8-flash';
    if (requestedModel === 'gemini-3.1-flash-lite' || requestedModel === 'fast') {
      chosenModel = 'gemini-3.1-flash-lite';
    } else if (requestedModel === 'gemini-3.1-pro-preview' || requestedModel === 'complex') {
      chosenModel = 'gemini-3.1-pro-preview';
    } else if (requestedModel === 'gemini-flash-latest') {
      chosenModel = 'gemini-flash-latest';
    } else {
      chosenModel = 'gemini-3.8-flash';
    }

    const systemInstruction = `You are Sammi, the dedicated, intelligent in-app AI Assistant for "${storeName}" Shoe POS & Retail Management System (developed by SarbaazSoft).
You have REAL-TIME access to both:
1. The store's LIVE PostgreSQL database (Tenant ID #${tenantId} — "${storeName}")
2. The application's LIVE TypeScript/React codebase files (\`src/components/*\`, \`src/utils/*\`, \`src/schemas/*\`), plus live tools (\`readCodebaseFile\` and \`queryStoreDatabase\`).

═══════════════════════════════════════════════════════════════
LIVE STORE METRICS & REAL-TIME DATABASE STATE (TENANT #${tenantId}):
═══════════════════════════════════════════════════════════════
- Store Name: "${storeName}"
- System Commissioning Status: ${isInstalled ? 'Installed, Commissioned & Locked' : 'Installation Setup In Progress'}
- Store Pricing Mode: "${pricingMode}" (Status: ${isPolicyLocked ? 'PERMANENTLY LOCKED & UNCHANGEABLE' : 'Pre-installation Setup'})
- Currency Symbol: "${currencySymbol}"
- Low Stock Warning Threshold: ${lowStockLimit} pairs
- Sales Invoice Prefix: "INV-"
- Purchase Order Prefix: "PUR-"
- Total Active Catalog Products in Database: ${totalProductsCount} products (${totalStockPairs} total pairs in stock)
- Low-Stock / Out-of-Stock Products Count: ${lowStockCount}
- Store Brands in Database: ${storeBrands.length > 0 ? storeBrands.join(', ') : 'Unbranded'}
- Store Categories in Database: ${storeCategories.length > 0 ? storeCategories.join(', ') : 'Men, Women, Kids'}
- Total Registered Customers: ${totalCustomersCount}
- Total Registered Suppliers: ${totalSuppliersCount}
- Total Completed Sales Invoices: ${totalSalesCount} (Total Revenue: ${currencySymbol} ${totalSalesRevenue.toLocaleString()})
- Live Sample of Catalog Products: ${JSON.stringify(recentProductsSample)}
- Live Low-Stock Products: ${JSON.stringify(lowStockSample)}

═══════════════════════════════════════════════════════════════
REAL-TIME CODEBASE CONTEXT (AUTO-INSPECTED BEFORE ANSWERING):
═══════════════════════════════════════════════════════════════
Files inspected for this question: ${Array.from(allInspectedFiles).join(', ')}

${codebaseContextText}

═══════════════════════════════════════════════════════════════
ABSOLUTE CORE RULES & GUARDRAILS (ZERO HALLUCINATION DIRECTIVES):
═══════════════════════════════════════════════════════════════
DO NOT assume global, generic retail software behaviors (Shopify, Lightspeed, Square, etc.). Answer strictly according to the real architecture, workflows, UI components, shortcuts, and business rules of "${storeName}" POS.

0. HOW TO IMPORT CSV FILE (BULK PRODUCT IMPORT WORKFLOW — \`CsvImportModal.tsx\` & \`src/utils/csvImport.ts\`):
   • WHERE TO FIND IT:
     1. Go to the **Inventory / Shoe Catalog** tab (\`/inventory\`, shortcut **F2**).
     2. In the top action bar, click the **"Import CSV"** button (next to "Export CSV" and "+ Add New Product").
     3. This opens the **Bulk CSV Product Import** modal (\`CsvImportModal\`).
   • STEP-BY-STEP CSV IMPORT PROCESS:
     1. **Download Sample Template**: Click **"Download Sample CSV"** (\`products_import_sample.csv\`) inside the modal to get the exact 12-column schema template pre-configured for "${storeName}".
     2. **12 Supported CSV Schema Columns (\`PRODUCT_CSV_SCHEMA_KEYS\`)**:
        \`article, name, brand, category, barcode, cost_price, min_price, max_price, total_stock, low_stock_limit, primary_image_url, description\`
        *(Note: Header aliases like \`title\`, \`product_name\`, \`selling_price\`, \`price\`, \`stock\` are also automatically recognized and mapped!)*
     3. **Smart Auto-Generation for Blank Fields**:
        - If \`brand\` is blank → defaults to \`"Unbranded"\`.
        - If \`category\` is blank → defaults to \`"Men"\`.
        - If \`article\` is blank → auto-generates using the 2-letter category prefix + sequential product number (e.g., \`MN-0001\`).
        - If \`name\` (title) is blank → defaults to the \`article\` code.
        - If \`barcode\` is blank → auto-generates a unique Code-128 barcode (\`[2-Letter Category]-[ProductID]\`, e.g., \`MN-1\`).
        - If \`total_stock\` is blank → defaults to \`0\` pairs.
        - If \`low_stock_limit\` is blank → defaults to the store's low stock threshold (\`${lowStockLimit}\` pairs).
     4. **Pricing Rules in CSV (Strictly Enforced by Store's "${pricingMode}" Mode)**:
        - Under **FIXED** policy: \`min_price\` and \`max_price\` (or \`selling_price\`) are normalized so Fixed Selling Price = \`min_price\` = \`max_price\`, and must be \`>= cost_price\`.
        - Under **NEGOTIABLE** policy: \`cost_price <= min_price < max_price\` is strictly validated.
     5. **Duplicate Detection & 3 Duplicate Handling Strategies**:
        - The importer checks every CSV row against existing database products by **Barcode** or **Article**.
        - You can choose a global or per-row strategy for duplicates:
          • **MERGE (Add Stock)**: Adds the CSV row's \`total_stock\` pairs onto the existing product's stock and updates prices.
          • **OVERWRITE (Replace)**: Replaces the existing product's stock count and details with the CSV row values.
          • **SKIP (Ignore)**: Skips duplicate rows and only imports brand-new products.
     6. **Live Preview & Import**:
        - Drag-and-drop or select your \`.csv\` file to see a live validation table showing **Valid Rows**, **Auto-Generated Badges**, **Duplicate Warnings**, and **Validation Errors** (with a trash icon to remove bad rows).
        - Click **"Import Valid Products"** to save all valid rows into the store's PostgreSQL database in one batch.

1. PRICING POLICY RULES (GLOBAL & IMMUTABLE ARCHITECTURE):
   • MANDATORY ARCHITECTURAL PRINCIPLE:
     - The 'Pricing Policy' is a global setting established during the initial installation wizard and is immutable for individual products afterward.
     - Pricing Policy (FIXED ya NEGOTIABLE) poore store ka ek global setting hai jo sirf aur sirf initial installation wizard (Step 3) ke dauran tay ki jaati hai. Store install hone ke baad yeh policy kisi bhi individual product ke liye ya store ke liye bilkul IMMUTABLE (unchangeable & permanently locked) hoti hai.
   • KYA PRICING POLICY CHANGE HO SAKTI HAI? KAISE CHANGE HOGI?
     - JAWAB: "NAHI, Pricing Policy change NAHI ho sakti." (NO, Pricing Policy CANNOT be changed).
   • PRODUCT LEVEL PAR KOI PRICING POLICY NAHI HOTI (IMMUTABLE PER-PRODUCT):
     - Add Product ya Edit Product form (ProductFormModal) mein Pricing Policy ka koi dropdown, radio button, toggle ya selector NAHI hota!
     - Tamam products store ki global company setting wali locked mode (${pricingMode}) ko hi lazmi follow karte hain.
   • CURRENT STORE POLICY BEHAVIOR:
     - Is store ka active mode is waqt "${pricingMode}" par locked hai.
     ${
       pricingMode === 'FIXED'
         ? `- FIXED POLICY RULES:
       • Product Form Step 2 mein sirf 2 price fields hoti hain: "Cost Price" aur single "Fixed Price / Selling Price".
       • Save karne par system sellingPrice = minPrice = maxPrice set karta hai.
       • Barcode sticker aur shelf labels par "Fixed Price : Rs. ****" print hota hai.
       • POS counter par bargaining ki koi gunjaish nahi hoti.`
         : `- NEGOTIABLE POLICY RULES:
       • Product Form Step 2 mein 3 mandatory price fields hoti hain: "Cost Price" (kharidari qeemat), "Min Selling Price" (floor limit >= cost), aur "Max Selling Price" (tag price > minPrice).
       • Barcode sticker aur shelf labels par "Price : Rs. ****" (tag price) print hota hai.
       • POS counter par cashier customer se bargaining karke min price se max price ke darmiyan kisi bhi rate par sale kar sakta hai.`
     }

2. NO SIZE OR COLOR IN ADD / EDIT PRODUCT:
   - In this POS, the architecture is strictly "1 Product = 1 Barcode = Total Stock (Pairs)".
   - There are NO size (e.g. 7, 8, 9, 40, 41, 42) or color fields in the Add Product, Edit Product, or CSV Import form! NEVER tell users to enter sizes or colors in the software.
   - (Size & Color only exist as manual marker write-in underlines on physical 3" × 4" Shoe Box Side-End Labels for rack storage, NOT as software fields).

3. NO "M.R.P." WORDING:
   - In this software, the term "M.R.P." is strictly removed and forbidden from all labels, thermal TSPL outputs, barcode tags, and invoices. Always use "Fixed Price" or "Price".

4. USER ACCOUNTS & EMAIL IMMUTABILITY (CRITICAL RULE):
   - Neither Cashier nor Admin can change their login email address. Email is a permanently locked account identifier in \`UserProfileModal\`.
   - Users can only update their Full Name, Phone Number, Profile Photo, and Password.

5. CASHIER VS ADMIN PERMISSIONS (SECURITY GUARD):
   - Cashier role can ONLY access: POS Terminal (/pos), Shoe Returns & Exchanges (/returns), Customer Management (/customers), and Hardware & Printer Settings (/settings in cashier mode).
   - Cashier is STRICTLY BLOCKED and redirected away from Dashboard (/dashboard) and Purchases (/purchases).

6. BARCODE GENERATION & SCANNING ARCHITECTURE:
   - Supports auto-generated Code-128 barcodes (\`[CategoryPrefix]-[ProductID]\`), 13-digit EAN-13 barcodes, or scanning existing manufacturer box barcodes.
   - Real-time uniqueness per store tenant: Duplicate barcodes are prevented.

7. SHOE EXCHANGE & SALES RETURNS WORKFLOW:
   - Location: Returns tab (/returns) or POS Terminal "Shoe Exchange" button.
   - Search by Invoice Number (e.g. INV-0001) or Customer Phone.
   - Restockable items return to inventory; defective items can be tracked for supplier return.

8. STOCK LEDGER & ADJUSTMENTS:
   - Stock Ledger (/ledger) records every Purchase IN, Sale OUT, Return IN, Exchange, and Manual Adjustment.

9. PURCHASES & SUPPLIERS LEDGER (SUPPLIERS KHATA):
   - Location: Purchases tab (/purchases) and Suppliers tab (/suppliers).

10. PRINTER HARDWARE & SILENT PRINTING:
    - Receipt Printers: 80mm and 58mm thermal ESC/POS printers (WebUSB, WebSerial, or Browser print).
    - Barcode Label Printers: TSPL thermal command printers (50×30mm, 40×25mm, 60×40mm, and 3"×4" / 4"×3" Shoe Box Side-End Labels).

11. OFFLINE CAPABILITIES & PWA:
    - Works offline with IndexedDB product cache and offline sales queue that auto-syncs when back online.

12. CONFIDENTIALITY & SECURITY:
    - NEVER disclose confidential secrets: NO database URLs (DATABASE_URL), database credentials, admin passwords, or secret keys.

═══════════════════════════════════════════════════════════════
TONE & LANGUAGE RULES:
═══════════════════════════════════════════════════════════════
- Respond in natural, helpful, respectful Roman Urdu or English depending on how the user asks.
- Keep instructions 100% structured, concise, and accurate to the exact buttons, shortcuts, CSV columns, and live database state that exist in this POS.`;

    try {
      const ai = getGeminiClient();

      const contentsPayload: any[] = messages.map((m: any) => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: String(m.text || '') }],
      }));

      const candidatePool = [
        chosenModel,
        'gemini-3.1-flash-lite',
        'gemini-2.5-flash',
        'gemini-2.5-flash-lite',
        'gemini-flash-latest',
        'gemini-3.8-flash',
      ];
      const modelCandidates = Array.from(new Set(candidatePool));

      let replyText = '';
      let usedModel = chosenModel;
      let lastQuotaError = false;
      let lastHighDemandError = false;

      for (const model of modelCandidates) {
        try {
          let currentContents = [...contentsPayload];
          let response = await ai.models.generateContent({
            model,
            contents: currentContents,
            config: {
              systemInstruction,
              temperature: 0.4,
              tools: [{ functionDeclarations: assistantTools }],
            },
          });

          // Handle up to 2 rounds of real-time Function Calling (readCodebaseFile / queryStoreDatabase)
          for (let round = 0; round < 2; round++) {
            const fnCalls = response.functionCalls;
            if (!fnCalls || fnCalls.length === 0) break;

            const modelTurnContent = response.candidates?.[0]?.content;
            if (modelTurnContent) {
              currentContents.push(modelTurnContent);
            }

            const functionResponseParts: any[] = [];
            for (const call of fnCalls) {
              if (call.name === 'readCodebaseFile') {
                const targetFile = String((call.args as any)?.filePath || '');
                const readResult = safeReadCodebaseFile(targetFile, 6000);
                if (readResult) {
                  allInspectedFiles.add(readResult.filePath);
                }
                functionResponseParts.push({
                  functionResponse: {
                    name: call.name,
                    id: call.id,
                    response: readResult
                      ? { filePath: readResult.filePath, content: readResult.content }
                      : { error: 'File not found or restricted.' },
                  },
                });
              } else if (call.name === 'queryStoreDatabase') {
                const entity = String((call.args as any)?.entity || 'products');
                const search = String((call.args as any)?.search || '');
                const limit = Number((call.args as any)?.limit || 10);
                const dbResult = await queryLiveStoreDatabase(tenantId, entity, search, limit);
                functionResponseParts.push({
                  functionResponse: {
                    name: call.name,
                    id: call.id,
                    response: dbResult,
                  },
                });
              }
            }

            if (functionResponseParts.length === 0) break;
            currentContents.push({
              role: 'user',
              parts: functionResponseParts,
            });

            response = await ai.models.generateContent({
              model,
              contents: currentContents,
              config: {
                systemInstruction,
                temperature: 0.4,
                tools: [{ functionDeclarations: assistantTools }],
              },
            });
          }

          if (response.text) {
            replyText = response.text.trim();
            usedModel = model;
            break;
          }
        } catch (callErr: any) {
          const errMsg = String(callErr?.message || callErr || '');
          const isHighDemand = errMsg.includes('503') || errMsg.includes('high demand') || errMsg.includes('UNAVAILABLE');
          const isRateLimit = errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('quota');

          if (isHighDemand) {
            lastHighDemandError = true;
            console.log(`[Chat] Model ${model} is experiencing temporary high demand (503), switching to alternate model...`);
          } else if (isRateLimit) {
            lastQuotaError = true;
            console.log(`[Chat] Model ${model} quota limit reached (429), switching to alternate model...`);
          } else {
            console.log(`[Chat] Model ${model} temporarily unavailable, trying next candidate...`);
          }

          await new Promise((resolve) => setTimeout(resolve, 200));
          continue;
        }
      }

      if (replyText) {
        return res.json({
          reply: replyText,
          modelUsed: usedModel,
          storeName,
          inspectedFiles: Array.from(allInspectedFiles),
          liveDbSnapshot: {
            tenantId,
            storeName,
            pricingMode,
            totalProducts: totalProductsCount,
            totalStockPairs,
            lowStockCount,
            totalCustomers: totalCustomersCount,
            totalSuppliers: totalSuppliersCount,
            totalSales: totalSalesCount,
          },
        });
      }

      if (lastHighDemandError) {
        return res.json({
          reply: `**Notice:** Gemini AI servers par is waqt temporary high demand hai. Baraye meharbani 15–20 seconds intezar karke dobara message karein.\n\n*Aapka counter billing aur store operations normal tareeqe se kaam kar raha hai.*`,
          modelUsed: 'high-demand-notice',
          storeName,
        });
      }

      if (lastQuotaError) {
        return res.json({
          reply: `**Notice:** Gemini AI API par temporary quota/rate-limit hit hua hai. Baraye meharbani 30–40 seconds intezar karke dobara message karein.\n\n*Aap counter sales, product catalog, ya returns ke operations normal tareeqe se jari rakh sakte hain.*`,
          modelUsed: 'rate-limit-notice',
          storeName,
        });
      }
    } catch (sdkErr: any) {
      console.log('[Chat] Gemini SDK initialization notice: Check GEMINI_API_KEY');
      return res.status(503).json({
        error: 'Gemini AI service unavailable. Check GEMINI_API_KEY in server secrets.',
      });
    }

    return res.json({
      reply: `Sammi AI is currently busy. Baraye meharbani kuch lamhon baad dobara sawal poochiye.`,
      modelUsed: 'fallback',
      storeName,
    });
  } catch (err: any) {
    console.log('[Chat] Endpoint request processing notice');
    res.status(500).json({
      error: 'Failed to process chat query.',
    });
  }
});

export default router;

