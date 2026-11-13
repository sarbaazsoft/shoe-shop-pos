import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

import {
  resolvePwaRoleMode,
  resolvePwaBranding,
  buildPwaManifest,
  STANDARD_PWA_APP_NAME,
  STANDARD_PWA_SHORT_NAME,
  SUPERADMIN_PWA_APP_NAME,
  SUPERADMIN_PWA_SHORT_NAME,
} from '../src/utils/pwaBranding.ts';
import { getStandardDocumentTitle } from '../src/utils/documentTitle.ts';
import { syncPwaMetadataToDocument } from '../src/hooks/usePwaManifest.ts';
import { pgClient } from '../src/db/index.ts';
import { ensureSaasControlPlane } from '../src/db/schemaInit.ts';
import tenantSaasRoutes from '../src/server/routes/tenantSaasRoutes.ts';
import { transformKeysToCamelCase } from '../src/utils/caseTransformer.ts';

test('pwaBranding: Store Owner, Cashier, and Public users strictly resolve to SarbaazSoft Shoe Shop POS / SarbaazSoft POS', () => {
  const standardCases = [
    undefined,
    null,
    'PUBLIC',
    'ADMIN',
    'CASHIER',
    { role: 'ADMIN', saasMode: 'TENANT_ACTIVE', pathname: '/dashboard' },
    { role: 'CASHIER', saasMode: 'TENANT_ACTIVE', pathname: '/pos' },
    { role: null, saasMode: 'LANDING', pathname: '/' },
    { role: null, saasMode: 'AUTH', pathname: '/auth' },
  ];

  for (const input of standardCases) {
    const config = resolvePwaBranding(input);
    assert.equal(config.isSuperAdmin, false);
    assert.equal(config.appName, STANDARD_PWA_APP_NAME);
    assert.equal(config.shortName, STANDARD_PWA_SHORT_NAME);
    assert.equal(config.documentTitle, STANDARD_PWA_APP_NAME);
    assert.equal(config.applicationName, STANDARD_PWA_APP_NAME);
    assert.equal(config.appleMobileWebAppTitle, STANDARD_PWA_APP_NAME);
    assert.equal(config.themeColor, '#9333EA');
    assert.match(config.manifestUrl, /^\/api\/pwa\/manifest\.webmanifest\?role=(PUBLIC|ADMIN|CASHIER)$/);

    const manifest = buildPwaManifest(input);
    assert.equal(manifest.name, 'SarbaazSoft Shoe Shop POS');
    assert.equal(manifest.short_name, 'SarbaazSoft POS');
    assert.equal(manifest.start_url, '/');
    assert.equal(manifest.theme_color, '#9333EA');
    assert.ok(manifest.icons.some((i) => i.src === '/pwa-192x192.png' && i.purpose === 'any'));
    assert.ok(manifest.icons.some((i) => i.src === '/pwa-maskable-512x512.png' && i.purpose === 'maskable'));
  }

  assert.equal(
    getStandardDocumentTitle({ saasMode: 'TENANT_ACTIVE', role: 'ADMIN', storeName: 'Acme Shoes', currentTab: 'pos' }),
    'SarbaazSoft Shoe Shop POS'
  );
  assert.equal(
    getStandardDocumentTitle({ saasMode: 'TENANT_ACTIVE', role: 'CASHIER', storeName: 'Acme Shoes', currentTab: 'pos' }),
    'SarbaazSoft Shoe Shop POS'
  );
  assert.equal(
    getStandardDocumentTitle({ saasMode: 'LANDING' }),
    'SarbaazSoft Shoe Shop POS'
  );
});

test('pwaBranding: SuperAdmin Control Panel strictly resolves to SuperAdmin SarbaazSoft Shoe POS / SarbaazSoft Admin', () => {
  const superAdminCases = [
    'SUPERADMIN',
    { role: 'SUPERADMIN', saasMode: 'SUPERADMIN', pathname: '/admin' },
    { role: null, saasMode: 'SUPERADMIN', pathname: '/admin' },
    { isSuperAdmin: true },
    { pathname: '/admin/reports' },
  ];

  for (const input of superAdminCases) {
    assert.equal(resolvePwaRoleMode(input), 'SUPERADMIN');
    const config = resolvePwaBranding(input);
    assert.equal(config.isSuperAdmin, true);
    assert.equal(config.appName, SUPERADMIN_PWA_APP_NAME);
    assert.equal(config.shortName, SUPERADMIN_PWA_SHORT_NAME);
    assert.equal(config.documentTitle, SUPERADMIN_PWA_APP_NAME);
    assert.equal(config.applicationName, SUPERADMIN_PWA_APP_NAME);
    assert.equal(config.appleMobileWebAppTitle, SUPERADMIN_PWA_APP_NAME);
    assert.equal(config.manifestUrl, '/api/pwa/manifest.webmanifest?role=SUPERADMIN');

    const manifest = buildPwaManifest(input);
    assert.equal(manifest.name, 'SuperAdmin SarbaazSoft Shoe POS');
    assert.equal(manifest.short_name, 'SarbaazSoft Admin');
    assert.equal(manifest.id, '/admin/');
    assert.equal(manifest.start_url, '/admin');
    assert.equal(manifest.theme_color, '#9333EA');
    assert.ok(manifest.icons.some((i) => i.src === '/admin/pwa-192x192.png' && i.purpose === 'any'));
    assert.ok(manifest.icons.some((i) => i.src === '/admin/pwa-maskable-512x512.png' && i.purpose === 'maskable'));
  }

  assert.equal(
    getStandardDocumentTitle({ saasMode: 'SUPERADMIN', storeName: 'Some Store' }),
    'SuperAdmin SarbaazSoft Shoe POS'
  );
});

test('syncPwaMetadataToDocument: dynamically updates title, meta tags, manifest link, and icons when role changes', () => {
  class MockElement {
    tagName: string;
    attrs = new Map<string, string>();
    rel = '';
    href = '';
    constructor(tagName: string, initialAttrs: Record<string, string> = {}) {
      this.tagName = tagName;
      for (const [k, v] of Object.entries(initialAttrs)) {
        this.setAttribute(k, v);
      }
    }
    setAttribute(k: string, v: string) {
      this.attrs.set(k, v);
      if (k === 'rel') this.rel = v;
      if (k === 'href') this.href = v;
    }
    getAttribute(k: string): string | null {
      return this.attrs.get(k) ?? null;
    }
    remove() {}
  }

  const elements: MockElement[] = [
    new MockElement('meta', { name: 'apple-mobile-web-app-title', content: '' }),
    new MockElement('meta', { name: 'application-name', content: '' }),
    new MockElement('meta', { name: 'theme-color', content: '#9333EA' }),
    new MockElement('meta', { property: 'og:title', content: '' }),
    new MockElement('link', { rel: 'manifest', href: '/manifest.webmanifest' }),
    new MockElement('link', { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' }),
    new MockElement('link', { rel: 'icon', type: 'image/x-icon', href: '/admin/favicon.ico' }),
    new MockElement('link', { rel: 'shortcut icon', type: 'image/x-icon', href: '/admin/favicon.ico' }),
  ];

  const matchSelector = (el: MockElement, selector: string): boolean => {
    const parts = selector.split(',').map((s) => s.trim());
    return parts.some((part) => {
      if (part === 'link[rel="apple-touch-icon"]') return el.tagName === 'link' && el.getAttribute('rel') === 'apple-touch-icon';
      if (part === 'link[rel="manifest"]') return el.tagName === 'link' && el.getAttribute('rel') === 'manifest';
      const metaName = part.match(/^meta\[name="([^"]+)"\]$/);
      if (metaName) return el.tagName === 'meta' && el.getAttribute('name') === metaName[1];
      const metaProp = part.match(/^meta\[property="([^"]+)"\]$/);
      if (metaProp) return el.tagName === 'meta' && el.getAttribute('property') === metaProp[1];
      const iconExact = part.match(/^link\[rel="([^"]+)"\]\[type="([^"]+)"\]$/);
      if (iconExact) return el.tagName === 'link' && el.getAttribute('rel') === iconExact[1] && el.getAttribute('type') === iconExact[2];
      const iconRel = part.match(/^link\[rel="([^"]+)"\]$/);
      if (iconRel) return el.tagName === 'link' && el.getAttribute('rel') === iconRel[1];
      return false;
    });
  };

  const prevDocument = (globalThis as any).document;
  const mockDoc = {
    title: '',
    head: {
      appendChild(el: MockElement) {
        elements.push(el);
      },
    },
    querySelector(selector: string) {
      return elements.find((el) => matchSelector(el, selector)) || null;
    },
    querySelectorAll(selector: string) {
      return elements.filter((el) => matchSelector(el, selector));
    },
    createElement(tag: string) {
      return new MockElement(tag);
    },
  };
  (globalThis as any).document = mockDoc;

  try {
    // 1. Store Owner (ADMIN)
    syncPwaMetadataToDocument(resolvePwaBranding({ role: 'ADMIN', saasMode: 'TENANT_ACTIVE' }));
    assert.equal(mockDoc.title, 'SarbaazSoft Shoe Shop POS');
    assert.equal(mockDoc.querySelector('meta[name="apple-mobile-web-app-title"]')?.getAttribute('content'), 'SarbaazSoft Shoe Shop POS');
    assert.equal(mockDoc.querySelector('meta[name="application-name"]')?.getAttribute('content'), 'SarbaazSoft Shoe Shop POS');
    assert.equal(mockDoc.querySelector('link[rel="manifest"]')?.getAttribute('href'), '/api/pwa/manifest.webmanifest?role=ADMIN');
    assert.equal(mockDoc.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href'), '/apple-touch-icon.png');

    // 2. SuperAdmin Control Panel
    syncPwaMetadataToDocument(resolvePwaBranding({ role: 'SUPERADMIN', saasMode: 'SUPERADMIN' }));
    assert.equal(mockDoc.title, 'SuperAdmin SarbaazSoft Shoe POS');
    assert.equal(mockDoc.querySelector('meta[name="apple-mobile-web-app-title"]')?.getAttribute('content'), 'SuperAdmin SarbaazSoft Shoe POS');
    assert.equal(mockDoc.querySelector('meta[name="application-name"]')?.getAttribute('content'), 'SuperAdmin SarbaazSoft Shoe POS');
    assert.equal(mockDoc.querySelector('link[rel="manifest"]')?.getAttribute('href'), '/api/pwa/manifest.webmanifest?role=SUPERADMIN');
    assert.equal(mockDoc.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href'), '/admin/apple-touch-icon.png');

    // 3. Cashier switch
    syncPwaMetadataToDocument(resolvePwaBranding({ role: 'CASHIER', saasMode: 'TENANT_ACTIVE' }));
    assert.equal(mockDoc.title, 'SarbaazSoft Shoe Shop POS');
    assert.equal(mockDoc.querySelector('link[rel="manifest"]')?.getAttribute('href'), '/api/pwa/manifest.webmanifest?role=CASHIER');
  } finally {
    if (prevDocument === undefined) {
      delete (globalThis as any).document;
    } else {
      (globalThis as any).document = prevDocument;
    }
  }
});

test('static manifests and index.html match strict role-based branding', () => {
  const indexHtml = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
  assert.ok(indexHtml.includes('<title>SarbaazSoft Shoe Shop POS</title>'));
  assert.ok(indexHtml.includes('<meta name="apple-mobile-web-app-title" content="SarbaazSoft Shoe Shop POS" />'));
  assert.ok(indexHtml.includes('<meta name="application-name" content="SarbaazSoft Shoe Shop POS" />'));

  for (const file of ['public/manifest.json', 'public/manifest.webmanifest']) {
    const manifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), file), 'utf8'));
    assert.equal(manifest.name, 'SarbaazSoft Shoe Shop POS');
    assert.equal(manifest.short_name, 'SarbaazSoft POS');
  }

  for (const file of ['public/admin/manifest.json', 'public/admin/manifest.webmanifest']) {
    const manifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), file), 'utf8'));
    assert.equal(manifest.name, 'SuperAdmin SarbaazSoft Shoe POS');
    assert.equal(manifest.short_name, 'SarbaazSoft Admin');
  }
});

test('backend manifest routes serve strict role-based manifests and ignore dynamic ?store= names', async () => {
  await ensureSaasControlPlane();

  const app = express();
  // Mirror server.ts /api response transformer middleware with manifest exemption
  app.use('/api', (req, res, next) => {
    if (
      req.path === '/pwa/manifest.webmanifest' ||
      req.path === '/pwa/manifest.json' ||
      req.path.startsWith('/tenants/manifest')
    ) {
      return next();
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    const originalJson = res.json.bind(res);
    res.json = (body: any) => {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return originalJson(transformKeysToCamelCase(body));
    };
    next();
  });

  app.get(['/api/pwa/manifest.webmanifest', '/api/pwa/manifest.json'], (req, res) => {
    const role = typeof req.query.role === 'string' ? req.query.role.trim() : undefined;
    const mode = typeof req.query.mode === 'string' ? req.query.mode.trim() : undefined;
    const isSuperAdmin = req.query.admin === '1' || req.query.admin === 'true' || req.query.isAdmin === 'true';
    res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
    return res.status(200).send(JSON.stringify(buildPwaManifest({ role, saasMode: mode, isSuperAdmin: isSuperAdmin || undefined })));
  });
  app.get(['/manifest.webmanifest', '/manifest.json'], (req, res) => {
    const role = typeof req.query.role === 'string' ? req.query.role.trim() : undefined;
    const mode = typeof req.query.mode === 'string' ? req.query.mode.trim() : undefined;
    res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
    return res.status(200).send(JSON.stringify(buildPwaManifest({ role, saasMode: mode })));
  });
  app.get(['/admin/manifest.webmanifest', '/admin/manifest.json'], (_req, res) => {
    res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
    return res.status(200).send(JSON.stringify(buildPwaManifest('SUPERADMIN')));
  });
  app.use('/api', tenantSaasRoutes);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;

  const assertCleanManifestShape = (json: Record<string, unknown>) => {
    assert.equal('companyName' in json, false);
    assert.equal('shortName' in json, false);
    assert.equal('themeColor' in json, false);
    assert.equal('backgroundColor' in json, false);
    assert.equal('displayOverride' in json, false);
  };

  try {
    for (const role of ['PUBLIC', 'ADMIN', 'CASHIER']) {
      const res = await fetch(`${baseUrl}/api/pwa/manifest.webmanifest?role=${role}&store=CustomTenantShop`);
      assert.equal(res.status, 200);
      assert.ok((res.headers.get('content-type') || '').includes('application/manifest+json'));
      const json = (await res.json()) as Record<string, unknown> & { name: string; short_name: string; start_url: string };
      assert.equal(json.name, 'SarbaazSoft Shoe Shop POS');
      assert.equal(json.short_name, 'SarbaazSoft POS');
      assert.equal(json.start_url, '/');
      assertCleanManifestShape(json);
    }

    const saRes = await fetch(`${baseUrl}/api/pwa/manifest.webmanifest?role=SUPERADMIN&store=CustomTenantShop`);
    assert.equal(saRes.status, 200);
    assert.ok((saRes.headers.get('content-type') || '').includes('application/manifest+json'));
    const saJson = (await saRes.json()) as Record<string, unknown> & { name: string; short_name: string; start_url: string };
    assert.equal(saJson.name, 'SuperAdmin SarbaazSoft Shoe POS');
    assert.equal(saJson.short_name, 'SarbaazSoft Admin');
    assert.equal(saJson.start_url, '/admin');
    assertCleanManifestShape(saJson);

    const rootRes = await fetch(`${baseUrl}/manifest.webmanifest?store=ShouldBeIgnored`);
    assert.equal(rootRes.status, 200);
    assert.ok((rootRes.headers.get('content-type') || '').includes('application/manifest+json'));
    const rootJson = (await rootRes.json()) as Record<string, unknown> & { name: string; short_name: string };
    assert.equal(rootJson.name, 'SarbaazSoft Shoe Shop POS');
    assert.equal(rootJson.short_name, 'SarbaazSoft POS');
    assertCleanManifestShape(rootJson);

    const adminRes = await fetch(`${baseUrl}/admin/manifest.webmanifest?role=CASHIER&store=ShouldBeIgnored`);
    assert.equal(adminRes.status, 200);
    assert.ok((adminRes.headers.get('content-type') || '').includes('application/manifest+json'));
    const adminJson = (await adminRes.json()) as Record<string, unknown> & { name: string; short_name: string };
    assert.equal(adminJson.name, 'SuperAdmin SarbaazSoft Shoe POS');
    assert.equal(adminJson.short_name, 'SarbaazSoft Admin');
    assertCleanManifestShape(adminJson);

    const tenantRow = await pgClient.query<{ id: number; name: string }>('SELECT id, name FROM tenants ORDER BY id ASC LIMIT 1');
    if (tenantRow.rows.length > 0) {
      const tid = tenantRow.rows[0].id;
      const tRes = await fetch(`${baseUrl}/api/tenants/manifest?tenantId=${tid}`);
      assert.equal(tRes.status, 200);
      assert.ok((tRes.headers.get('content-type') || '').includes('application/manifest+json'));
      const tJson = (await tRes.json()) as Record<string, unknown> & { name: string; short_name: string; start_url: string };
      assert.equal(tJson.name, 'SarbaazSoft Shoe Shop POS');
      assert.equal(tJson.short_name, 'SarbaazSoft POS');
      assert.equal(tJson.start_url, `/?tenantId=${tid}`);
      assertCleanManifestShape(tJson);
    }
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});
