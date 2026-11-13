import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Database & Seed
import { pgClient, dbInfo, txStorage } from './src/db/index.ts';
import {
  ensureSaasControlPlane,
  isSaasControlPlaneInitialized,
  migrateLegacyWholesaleProductPrices,
  dropLegacyDocumentPrefixColumns,
} from './src/db/schemaInit.ts';

// Shared-Domain Multi-Tenant Routing Middleware
import { tenantRoutingMiddleware } from './src/server/middleware/tenantMiddleware.ts';

// Routes
import installRoutes, { checkInstallationStatus } from './src/server/routes/installRoutes.ts';
import authRoutes from './src/server/routes/authRoutes.ts';
import productRoutes from './src/server/routes/productRoutes.ts';
import categoryRoutes from './src/server/routes/categoryRoutes.ts';
import posRoutes from './src/server/routes/posRoutes.ts';
import returnRoutes from './src/server/routes/returnRoutes.ts';
import supplierRoutes from './src/server/routes/supplierRoutes.ts';
import purchaseRoutes from './src/server/routes/purchaseRoutes.ts';
import purchaseReturnRoutes from './src/server/routes/purchaseReturnRoutes.ts';
import customerRoutes from './src/server/routes/customerRoutes.ts';
import reportRoutes from './src/server/routes/reportRoutes.ts';
import settingsRoutes from './src/server/routes/settingsRoutes.ts';
import backupRoutes from './src/server/routes/backupRoutes.ts';
import inventoryRoutes from './src/server/routes/inventoryRoutes.ts';
import notificationRoutes from './src/server/routes/notificationRoutes.ts';
import chatRoutes from './src/server/routes/chatRoutes.ts';
import tenantSaasRoutes from './src/server/routes/tenantSaasRoutes.ts';
import { transformKeysToCamelCase } from './src/utils/caseTransformer.ts';
import { loadAppSettingsCache } from './src/server/services/appSettingsService.ts';
import { recordApplicationBaseUrl } from './src/server/services/welcomeService.ts';

const rootDir = path.resolve('.');

export const app = express();
function resolvePort(): number {
  for (let i = 0; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === '--port' && process.argv[i + 1]) {
      const p = Number(process.argv[i + 1]);
      if (!isNaN(p) && p > 0) return p;
    }
    if (arg.startsWith('--port=')) {
      const p = Number(arg.slice(7));
      if (!isNaN(p) && p > 0) return p;
    }
  }
  // When running in deployed production container (Cloud Run), respect ambient PORT
  if (process.env.PORT) {
    const p = Number(process.env.PORT);
    if (!isNaN(p) && p > 0) return p;
  }
  // In AI Studio dev environment, default to port 3000
  return 3000;
}

const PORT = resolvePort();

// Universal API Response Transformer to map database rows (snake_case) to strict camelCase
app.use('/api', (_req, res, next) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const originalJson = res.json.bind(res);
  res.json = (body: any) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return originalJson(transformKeysToCamelCase(body));
  };
  next();
});

// Increase body size limit for JSON and URL-encoded payloads (e.g., base64 images & CSV imports)
app.use(express.json({ limit: '50mb', strict: false }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Root Service Worker endpoints (/sw.js, /firebase-messaging-sw.js, /sw-background-sync.js)
// Serves service workers directly from the domain root with Service-Worker-Allowed: /
// and application/javascript MIME type to satisfy PWABuilder, Lighthouse, and browser engines.
app.get(['/sw.js', '/firebase-messaging-sw.js', '/sw-background-sync.js'], (req, res, next) => {
  const filename = req.path.replace(/^\//, '');
  const publicCandidate = path.join(rootDir, 'public', filename);
  const distCandidate = path.join(rootDir, 'dist', filename);
  const targetPath = fs.existsSync(publicCandidate)
    ? publicCandidate
    : fs.existsSync(distCandidate)
    ? distCandidate
    : null;

  if (targetPath) {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Service-Worker-Allowed', '/');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.sendFile(targetPath);
  }
  next();
});

// Cross-Origin API Authentication & Store Isolation Middleware
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (typeof origin === 'string' && origin.trim() && origin !== 'null') {
    recordApplicationBaseUrl(origin);
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Auth-Token, X-Tenant-Id, X-Simulated-Host, X-Requested-With'
    );
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader(
      'Access-Control-Expose-Headers',
      'X-SaaS-Mode, X-Tenant-Id, X-Tenant-Status, X-Subscription-Status, X-Subscription-Plan'
    );
    res.setHeader('Vary', 'Origin, Host, X-Tenant-Id');
  } else {
    const host = req.get('x-forwarded-host') || req.get('host');
    if (host) {
      const proto = req.get('x-forwarded-proto') || req.protocol || 'http';
      recordApplicationBaseUrl(`${proto}://${host}`);
    }
  }
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});

// Support GET-based RPC fallback for iframe proxy environments that block POST/PUT/PATCH/DELETE or custom headers with 403
app.use((req, _res, next) => {
  if (typeof req.query.__token === 'string' && req.query.__token) {
    req.headers['x-auth-token'] = req.query.__token;
    delete req.query.__token;
  }
  if (typeof req.query.__tenantId === 'string' && req.query.__tenantId) {
    req.headers['x-tenant-id'] = req.query.__tenantId;
    delete req.query.__tenantId;
  }
  if (req.method === 'GET' && typeof req.query.__method === 'string' && req.query.__method) {
    req.method = req.query.__method.toUpperCase();
    delete req.query.__method;
  }
  if (typeof req.query.__body === 'string' && req.query.__body) {
    try {
      req.body = JSON.parse(req.query.__body);
    } catch {}
    delete req.query.__body;
  }
  next();
});

// Dedicated Store & SuperAdmin PWA Manifests (`/manifest.webmanifest`, `/manifest.json`, `/admin/manifest.*`)
app.get(['/manifest.webmanifest', '/manifest.json'], (req, res) => {
  res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  const storeQuery = typeof req.query.store === 'string' ? req.query.store.trim() : '';

  const manifestPath = path.join(rootDir, 'public', 'manifest.json');
  let manifestData: any = null;
  if (fs.existsSync(manifestPath)) {
    try {
      manifestData = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch {}
  }
  if (!manifestData) {
    manifestData = {
      id: '/',
      name: 'Shoe POS',
      short_name: 'ShoePOS',
      description: 'Multi-tenant dual-engine wholesale shoe shop POS and inventory management system',
      theme_color: '#9333EA',
      background_color: '#FFFFFF',
      display: 'standalone',
      display_override: ['standalone', 'minimal-ui'],
      orientation: 'any',
      start_url: '/',
      scope: '/',
      categories: ['business', 'productivity', 'shopping'],
      icons: [
        { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/pwa-maskable-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
        { src: '/pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        { src: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png', purpose: 'any' },
      ],
    };
  }

  // Align dynamically with active store/app title
  if (storeQuery) {
    const short = storeQuery.length > 12 ? storeQuery.slice(0, 12).trim() : storeQuery;
    manifestData.name = storeQuery;
    manifestData.short_name = short;
    manifestData.description = `Dedicated Point of Sale & Retail Inventory Management for ${storeQuery}`;
  }
  if (manifestData.prefer_related_applications === undefined) {
    manifestData.prefer_related_applications = false;
  }

  return res.json(manifestData);
});

// Dynamic Desktop Setup Installer (.EXE) Download Endpoint
app.get(['/api/download/desktop-setup', '/assets/SarbaazSoft-POS-Desktop-Setup.exe'], (req, res) => {
  const storeQuery = typeof req.query.store === 'string' ? req.query.store.trim() : '';
  const exePath = path.join(rootDir, 'public', 'assets', 'SarbaazSoft-POS-Desktop-Setup.exe');
  if (!fs.existsSync(exePath)) {
    return res.status(404).send('Desktop installer binary not found');
  }

  const cleanStore = storeQuery ? storeQuery.replace(/[^a-zA-Z0-9_-]/g, '_') : 'Shoe-POS';
  const downloadFileName = `${cleanStore}-Desktop-Setup.exe`;
  const originalBuf = fs.readFileSync(exePath);
  const buf = Buffer.from(originalBuf);

  // If a store name was provided, dynamically align desktop shortcut name in the binary buffer
  if (storeQuery) {
    // Binary offset 31997 is the start of the shortcut file name (22 bytes available before next string)
    const targetOffset = 31997;
    const maxLen = 22;
    const shortcutName = `${storeQuery.slice(0, 15).trim()}.url\0`;
    const shortcutBuf = Buffer.from(shortcutName, 'utf8');
    if (shortcutBuf.length <= maxLen) {
      buf.fill(0, targetOffset, targetOffset + maxLen);
      shortcutBuf.copy(buf, targetOffset);
    }
  }

  res.setHeader('Content-Type', 'application/vnd.microsoft.portable-executable');
  res.setHeader('Content-Disposition', `attachment; filename="${downloadFileName}"`);
  res.setHeader('Content-Length', buf.length);
  res.end(buf);
});

// Signed Android APK (.APK) Download Endpoint
app.get(['/api/download/apk', '/assets/SarbaazSoft-POS.apk'], (req, res) => {
  const storeQuery = typeof req.query.store === 'string' ? req.query.store.trim() : '';
  const requestedBase = 'SarbaazSoft-POS.apk';
  const candidates = [
    path.join(rootDir, 'public', 'assets', requestedBase),
    path.join(rootDir, 'dist', 'assets', requestedBase),
  ];
  const apkPath = candidates.find((p) => fs.existsSync(p));
  if (!apkPath) {
    return res.status(404).send('Android package APK not found');
  }

  let downloadFileName = requestedBase;
  if (storeQuery) {
    const cleanStore = storeQuery.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
    if (cleanStore) {
      downloadFileName = cleanStore.toLowerCase().endsWith('pos') ? `${cleanStore}.apk` : `${cleanStore}-POS.apk`;
    }
  }

  const stat = fs.statSync(apkPath);
  res.setHeader('Content-Type', 'application/vnd.android.package-archive');
  res.setHeader('Content-Disposition', `attachment; filename="${downloadFileName}"`);
  res.setHeader('Content-Length', stat.size);
  res.setHeader('Cache-Control', 'no-cache, must-revalidate');
  res.setHeader('X-APK-Package', process.env.TWA_PACKAGE_NAME || 'studio.ai.sarbaazsoft.twa');
  return res.sendFile(apkPath);
});

// Official Digital Asset Links endpoint for Android TWA verification
app.get('/.well-known/assetlinks.json', (_req, res) => {
  const candidates = [
    path.join(rootDir, 'public', '.well-known', 'assetlinks.json'),
    path.join(rootDir, 'dist', '.well-known', 'assetlinks.json'),
  ];
  const assetLinksPath = candidates.find((p) => fs.existsSync(p));

  let statements: Array<{
    relation: string[];
    target: { namespace: string; package_name: string; sha256_cert_fingerprints: string[] };
  }> = [];

  if (assetLinksPath) {
    try {
      const parsed = JSON.parse(fs.readFileSync(assetLinksPath, 'utf8'));
      if (Array.isArray(parsed)) {
        statements = parsed;
      }
    } catch {}
  }

  if (statements.length === 0) {
    statements = [
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: 'studio.ai.sarbaazsoft.twa',
          sha256_cert_fingerprints: [
            '58:54:C6:78:45:D3:CD:EA:AC:3B:42:57:23:DD:C9:EA:1B:7C:22:23:16:DF:93:6B:E3:06:DF:FF:00:FA:5F:50',
          ],
        },
      },
    ];
  }

  const extraPackage = (process.env.TWA_PACKAGE_NAME || '').trim();
  const extraShaList = (process.env.ASSETLINKS_SHA256 || '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  if (extraPackage || extraShaList.length > 0) {
    const targetPackage = extraPackage || statements[0].target.package_name;
    const existing = statements.find((s) => s?.target?.package_name === targetPackage);
    if (existing) {
      const merged = new Set([...(existing.target.sha256_cert_fingerprints || []), ...extraShaList]);
      existing.target.sha256_cert_fingerprints = Array.from(merged);
    } else if (extraShaList.length > 0) {
      statements.push({
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: targetPackage,
          sha256_cert_fingerprints: extraShaList,
        },
      });
    }
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  return res.json(statements);
});

app.get(['/admin/manifest.webmanifest', '/admin/manifest.json'], (_req, res) => {
  res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  const adminManifestPath = path.join(rootDir, 'public', 'admin', 'manifest.json');
  if (fs.existsSync(adminManifestPath)) {
    return res.sendFile(adminManifestPath);
  }
  res.json({
    id: '/admin/',
    name: 'POS Admin',
    short_name: 'POSAdmin',
    description: 'Dedicated SuperAdmin Control Plane for Multi-Tenant Dual-Engine Wholesale POS Provisioning, Store Suspension & SaaS Analytics',
    start_url: '/admin',
    scope: '/',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    orientation: 'any',
    background_color: '#FFFFFF',
    theme_color: '#9333EA',
    categories: ['business', 'finance', 'productivity'],
    icons: [
      {
        src: '/admin/favicon.png',
        sizes: '48x48',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/admin/pwa-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/admin/pwa-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/admin/pwa-maskable-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/admin/pwa-maskable-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/admin/apple-touch-icon.png',
        sizes: '180x180',
        type: 'image/png',
        purpose: 'any',
      },
    ],
    shortcuts: [
      {
        name: 'SuperAdmin Dashboard',
        short_name: 'Dashboard',
        description: 'Open SuperAdmin Overview & Metrics',
        url: '/admin',
        icons: [
          { src: '/admin/shortcut-dashboard.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/admin/pwa-maskable-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
        ],
      },
      {
        name: 'Store Tenants',
        short_name: 'Tenants',
        description: 'Provision & manage tenant stores',
        url: '/admin?tab=tenants',
        icons: [
          { src: '/admin/shortcut-tenants.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/admin/pwa-maskable-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
        ],
      },
      {
        name: 'Platform Reports',
        short_name: 'Reports',
        description: 'Platform ledger & analytics',
        url: '/admin?tab=reports',
        icons: [
          { src: '/admin/shortcut-reports.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/admin/pwa-maskable-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
        ],
      },
    ],
  });
});

// Initialize PostgreSQL schema + SaaS Multi-Tenant Control Plane on cold start
app.use(async (req, res, next) => {
  if (req.path.startsWith('/api/install/')) {
    try {
      await pgClient.waitReady;
    } catch (err) {
      return res.status(503).json({ code: 'DATABASE_UNAVAILABLE', error: 'Could not connect to the configured database.' });
    }
  } else if (req.path.startsWith('/api/') && !isSaasControlPlaneInitialized()) {
    try {
      await pgClient.waitReady;
      let installStatus = await checkInstallationStatus();
      if (!installStatus.installed) {
        if (installStatus.hasSuperAdmin || (installStatus.hasUsers && installStatus.hasAdmin)) {
          await ensureSaasControlPlane();
          installStatus = await checkInstallationStatus();
        }
      }
      if (!installStatus.installed) {
        return res.status(503).json({
          code: 'INSTALLATION_REQUIRED',
          error: 'Complete the installation wizard before using the application.',
          missingTables: installStatus.missingTables,
          hasSuperAdmin: installStatus.hasSuperAdmin,
        });
      }
      await ensureSaasControlPlane();
    } catch (err: any) {
      console.error('Database initialization error on request:', err);
      return res.status(503).json({ code: 'DATABASE_INITIALIZATION_FAILED', error: err?.message || 'Database initialization failed.' });
    }
  }

  // Isolate any SQL transactions per HTTP request using AsyncLocalStorage
  if (req.path.startsWith('/api')) {
    const txContext: { client: any } = { client: null };
    res.on('close', () => {
      if (txContext.client) {
        try {
          txContext.client.release();
        } catch {}
        txContext.client = null;
      }
    });
    return txStorage.run(txContext, () => next());
  }

  next();
});

// Mount Shared-Domain Multi-Tenant Routing Middleware
app.use(tenantRoutingMiddleware);

// Mount Multi-Tenant SaaS, Dynamic Manifest, SuperAdmin & Onboarding Routes
app.use('/api', tenantSaasRoutes);

// Mount Existing POS & Inventory API Routes (Now Tenant-Scoped)
app.use('/api/install', installRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api', categoryRoutes);
app.use('/api/pos', posRoutes);
app.use('/api/returns', returnRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/purchases', purchaseRoutes);
app.use('/api/purchase-returns', purchaseReturnRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/backup', backupRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/chat', chatRoutes);

// Health Check Endpoint with Real PostgreSQL & Multi-Tenant Verification
app.get('/api/health', async (_req, res) => {
  try {
    await pgClient.waitReady;
    const ping = await pgClient.query('SELECT 1 as ok');
    const isConnected = ping.rows.length > 0;
    res.json({
      status: isConnected ? 'ok' : 'error',
      timestamp: new Date().toISOString(),
      service: 'Multi-Tenant POS SaaS Platform',
      database: {
        engine: 'PostgreSQL (Strict Tenant Isolation)',
        connected: isConnected,
        host: dbInfo.host || 'Neon Serverless',
        mode: dbInfo.type || 'postgresql',
      },
    });
  } catch (err: any) {
    res.status(500).json({
      status: 'error',
      error: err.message,
      database: {
        engine: 'PostgreSQL',
        connected: false,
      },
    });
  }
});

// Strict Catch-all for unmatched /api routes - strictly return JSON 404, NEVER fall through to HTML or Vite
app.all('/api/*', (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(404).json({
    error: `API endpoint ${req.method} ${req.path} not found.`,
    code: 'ROUTE_NOT_FOUND',
  });
});

// Strict JSON Error Handler for /api routes - always return JSON, never HTML
app.use('/api', (err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[API Error Handler]:', err);
  const status = typeof err?.status === 'number' && err.status >= 400 && err.status < 600 ? err.status : 500;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(status).json({
    error: err?.message || 'Internal Server Error',
    code: err?.code || 'INTERNAL_SERVER_ERROR',
  });
});

const isServerless = Boolean(
  process.env.VERCEL ||
  process.env.NETLIFY ||
  process.env.AWS_LAMBDA_FUNCTION_NAME
);

async function startServer() {
  if (process.env.NODE_ENV !== 'production' && !isServerless) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        watch: null,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (!isServerless) {
    const distPath = path.join(rootDir, 'dist');
    app.use(
      express.static(distPath, {
        setHeaders: (res, filePath) => {
          if (/(?:^|[\\/])(?:sw|workbox-[^\\/]+)\.js$/.test(filePath)) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Service-Worker-Allowed', '/');
          } else if (filePath.endsWith('.webmanifest') || filePath.endsWith('manifest.json')) {
            res.setHeader('Content-Type', 'application/manifest+json');
            res.setHeader('Cache-Control', 'no-cache');
          } else if (filePath.endsWith('.apk')) {
            res.setHeader('Content-Type', 'application/vnd.android.package-archive');
            res.setHeader('Content-Disposition', 'attachment; filename="SarbaazSoft-POS.apk"');
          } else if (filePath.endsWith('.exe')) {
            res.setHeader('Content-Type', 'application/vnd.microsoft.portable-executable');
            res.setHeader('Content-Disposition', 'attachment; filename="SarbaazSoft-POS-Desktop-Setup.exe"');
          }
        },
      })
    );
    // Missing static files must 404 (never fall through to index.html with a 200)
    app.get(/\.(?:js|map|json|webmanifest|png|svg|ico|apk|exe)$/, (_req, res) => res.sendStatus(404));
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  if (!isServerless) {
    const httpServer = app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Multi-Tenant POS SaaS Server running on http://localhost:${PORT}`);
    });
    httpServer.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use. Stop the existing server or start this one with a different PORT.`);
      } else {
        console.error(`Unable to start the server on port ${PORT}.`, error);
      }
      process.exit(1);
    });
  }

  try {
    await pgClient.waitReady;
    await dropLegacyDocumentPrefixColumns();
    await migrateLegacyWholesaleProductPrices();
    await loadAppSettingsCache();
    const installStatus = await checkInstallationStatus();
    if (installStatus.hasSuperAdmin || (installStatus.hasUsers && installStatus.hasAdmin)) {
      await ensureSaasControlPlane();
      console.log('✅ PostgreSQL Schema & SaaS Multi-Tenant Control Plane verified.');
    }
  } catch (error) {
    console.error('PostgreSQL startup initialization error:', error);
  }
}

if (!isServerless) {
  startServer();
}

export default app;
