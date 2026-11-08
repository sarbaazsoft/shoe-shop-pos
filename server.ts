import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import AdmZip from 'adm-zip';
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
import { getCachedAppSetting } from './src/server/services/appSettingsService.ts';
import { recordApplicationBaseUrl } from './src/server/services/welcomeService.ts';

const rootDir = path.resolve('.');

export const app = express();
const portArg = process.argv.indexOf('--port') !== -1 ? Number(process.argv[process.argv.indexOf('--port') + 1]) : undefined;
const PORT = portArg || 3000;

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
  const swKillSwitchEnabled = getCachedAppSetting('SW_KILL_SWITCH', 'false') === 'true';
  if (swKillSwitchEnabled && req.path === '/sw.js') {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.send(`
self.addEventListener('install', () => {
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.registration.unregister())
      .then(() => self.clients.claim())
  );
});
`);
  }

  const filename = req.path.replace(/^\//, '');
  const candidatePath = path.join(rootDir, 'public', filename);
  if (fs.existsSync(candidatePath)) {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Service-Worker-Allowed', '/');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.sendFile(candidatePath);
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
      description: 'Multi-tenant dual-engine wholesale & retail shoe shop POS and inventory management system',
      theme_color: '#4F46E5',
      background_color: '#4F46E5',
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
app.get(['/api/download/apk', '/assets/SarbaazSoft-POS.apk', '/assets/ShoePOS.apk'], (req, res) => {
  const storeQuery = typeof req.query.store === 'string' ? req.query.store.trim() : '';
  const apkPath = path.join(rootDir, 'public', 'assets', 'SarbaazSoft-POS.apk');
  if (!fs.existsSync(apkPath)) {
    return res.status(404).send('Android package APK not found');
  }

  const cleanStore = storeQuery ? storeQuery.replace(/[^a-zA-Z0-9_-]/g, '_') : 'Shoe-POS';
  const downloadFileName = `${cleanStore}.apk`;

  res.setHeader('Content-Type', 'application/vnd.android.package-archive');
  res.setHeader('Content-Disposition', `attachment; filename="${downloadFileName}"`);
  return res.sendFile(apkPath);
});

// Official Digital Asset Links endpoint for Android TWA verification
app.get('/.well-known/assetlinks.json', (_req, res) => {
  const assetLinksPath = path.join(rootDir, 'public', '.well-known', 'assetlinks.json');
  if (fs.existsSync(assetLinksPath)) {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.sendFile(assetLinksPath);
  }
  return res.status(404).json({ error: 'assetlinks.json not found' });
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
    description: 'Dedicated SuperAdmin Control Plane for Multi-Tenant Dual-Engine Wholesale & Retail POS Provisioning, Store Suspension & SaaS Analytics',
    start_url: '/admin',
    scope: '/',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    orientation: 'any',
    background_color: '#0F172A',
    theme_color: '#0F172A',
    categories: ['business', 'finance', 'productivity'],
    icons: [
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
app.use('/api/system-settings', settingsRoutes);
app.use('/api/root-settings', settingsRoutes);
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
    app.get(/\.(?:js|map|webmanifest|png|svg|ico|apk|exe)$/, (_req, res) => res.sendStatus(404));
    app.get('*', (_req, res) => {
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
