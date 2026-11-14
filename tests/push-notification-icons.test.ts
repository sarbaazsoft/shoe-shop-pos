import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import vm from 'node:vm';

import {
  ADMIN_NOTIFICATION_ICON,
  DEFAULT_NOTIFICATION_ICON,
  NOTIFICATION_BADGE_ICON,
  buildFcmNotificationConfig,
} from '../src/server/pushNotificationService.ts';
import { buildPwaManifest } from '../src/utils/pwaBranding.ts';

function decodePngRgba(filePath: string) {
  const data = fs.readFileSync(filePath);
  assert.equal(data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), true);

  let pos = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks: Buffer[] = [];

  while (pos < data.length) {
    const length = data.readUInt32BE(pos);
    const type = data.subarray(pos + 4, pos + 8).toString('ascii');
    const chunk = data.subarray(pos + 8, pos + 8 + length);
    pos += 12 + length;

    if (type === 'IHDR') {
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      bitDepth = chunk[8];
      colorType = chunk[9];
    } else if (type === 'IDAT') {
      idatChunks.push(chunk);
    } else if (type === 'IEND') {
      break;
    }
  }

  const raw = zlib.inflateSync(Buffer.concat(idatChunks));
  const bpp = 4;
  const stride = width * bpp;
  const pixels = Buffer.alloc(height * stride);

  const paeth = (a: number, b: number, c: number) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };

  let src = 0;
  for (let y = 0; y < height; y++) {
    const filterType = raw[src++];
    const rowStart = y * stride;
    for (let x = 0; x < stride; x++) {
      const val = raw[src++];
      const a = x >= bpp ? pixels[rowStart + x - bpp] : 0;
      const b = y > 0 ? pixels[rowStart - stride + x] : 0;
      const c = x >= bpp && y > 0 ? pixels[rowStart - stride + x - bpp] : 0;
      let recon = val;
      if (filterType === 1) recon = (val + a) & 0xff;
      else if (filterType === 2) recon = (val + b) & 0xff;
      else if (filterType === 3) recon = (val + ((a + b) >> 1)) & 0xff;
      else if (filterType === 4) recon = (val + paeth(a, b, c)) & 0xff;
      pixels[rowStart + x] = recon;
    }
  }

  return { width, height, bitDepth, colorType, pixels };
}

test('badge-favicon.png is a crisp 96x96 monochrome white (#FFFFFF) silhouette on transparent background', () => {
  const badgePath = path.join(process.cwd(), 'public', 'icons', 'badge-favicon.png');
  assert.equal(fs.existsSync(badgePath), true, 'public/icons/badge-favicon.png must exist');

  const png = decodePngRgba(badgePath);
  assert.equal(png.width, 96);
  assert.equal(png.height, 96);
  assert.equal(png.bitDepth, 8);
  assert.equal(png.colorType, 6, 'Badge PNG must be 8-bit RGBA with alpha transparency');

  let transparentPixels = 0;
  let visiblePixels = 0;
  for (let i = 0; i < png.pixels.length; i += 4) {
    const r = png.pixels[i];
    const g = png.pixels[i + 1];
    const b = png.pixels[i + 2];
    const a = png.pixels[i + 3];

    if (a === 0) {
      transparentPixels++;
    } else {
      visiblePixels++;
      assert.equal(r, 255, 'Visible silhouette pixel R channel must be 255 (#FFFFFF)');
      assert.equal(g, 255, 'Visible silhouette pixel G channel must be 255 (#FFFFFF)');
      assert.equal(b, 255, 'Visible silhouette pixel B channel must be 255 (#FFFFFF)');
    }
  }

  const totalPixels = png.width * png.height;
  assert.ok(transparentPixels > totalPixels * 0.4, 'Badge must have transparent background (not a solid square)');
  assert.ok(visiblePixels > totalPixels * 0.2, 'Badge must contain a visible silhouette');

  // Verify all 4 corners are fully transparent
  const corners: Array<[number, number]> = [
    [0, 0],
    [95, 0],
    [0, 95],
    [95, 95],
  ];
  for (const [x, y] of corners) {
    const alpha: number = png.pixels[(y * png.width + x) * 4 + 3];
    assert.equal(alpha, 0, `Corner (${x},${y}) should be transparent`);
  }
});

test('buildFcmNotificationConfig sets monochrome favicon badge and role-specific full-color app icon', () => {
  const posConfig = buildFcmNotificationConfig({
    title: 'New Sale #INV-101',
    body: 'Sale completed',
    deepLinkUrl: '/?tab=reports',
  });
  assert.equal(posConfig.webpushNotification.icon, DEFAULT_NOTIFICATION_ICON);
  assert.equal(posConfig.webpushNotification.badge, NOTIFICATION_BADGE_ICON);
  assert.equal(posConfig.stringData.icon, '/pwa-192x192.png');
  assert.equal(posConfig.stringData.badge, '/icons/badge-favicon.png');

  const adminConfig = buildFcmNotificationConfig({
    title: 'SuperAdmin Alert',
    body: 'New store trial',
    deepLinkUrl: '/admin',
    data: { isAdmin: 'true' },
  });
  assert.equal(adminConfig.webpushNotification.icon, ADMIN_NOTIFICATION_ICON);
  assert.equal(adminConfig.webpushNotification.badge, NOTIFICATION_BADGE_ICON);
  assert.equal(adminConfig.stringData.icon, '/admin/pwa-192x192.png');
  assert.equal(adminConfig.stringData.badge, '/icons/badge-favicon.png');
});

test('public/sw.js showNotification uses full-color app icon and /icons/badge-favicon.png badge in push & FCM handlers', async () => {
  const swCode = fs.readFileSync(path.join(process.cwd(), 'public', 'sw.js'), 'utf8');
  assert.ok(swCode.includes("'/icons/badge-favicon.png'"), 'PRECACHE_ASSETS must include /icons/badge-favicon.png');

  const listeners = new Map<string, (event: any) => void>();
  const shownNotifications: Array<{ title: string; options: any }> = [];
  const bgHandlers: Array<(payload: any) => Promise<void> | void> = [];

  const sandbox: Record<string, any> = {
    URL,
    Promise,
    Response,
    fetch: async () => ({
      ok: true,
      json: async () => ({
        apiKey: 'test-key',
        projectId: 'test-proj',
        messagingSenderId: '123',
        appId: '1:123:web:abc',
      }),
    }),
    importScripts: () => {},
    firebase: {
      apps: [],
      initializeApp: () => {},
      messaging: () => ({
        onBackgroundMessage: (fn: (payload: any) => void) => {
          bgHandlers.push(fn);
        },
      }),
    },
    caches: {
      open: async () => ({ add: async () => {}, put: async () => {} }),
      keys: async () => [],
      match: async () => null,
      delete: async () => true,
    },
  };

  sandbox.self = {
    location: { origin: 'https://sarbaazsoft.cloud.run' },
    skipWaiting: () => {},
    clients: { claim: async () => {}, matchAll: async () => [] },
    registration: {
      showNotification: async (title: string, options: any) => {
        shownNotifications.push({ title, options });
      },
    },
    addEventListener: (name: string, fn: (event: any) => void) => {
      listeners.set(name, fn);
    },
  };

  vm.runInNewContext(swCode, sandbox, { filename: 'public/sw.js' });
  // Wait a microtask tick for initFirebaseInWorker()
  await new Promise((r) => setTimeout(r, 20));

  const pushListener = listeners.get('push');
  assert.ok(pushListener, 'Service Worker must register a push listener');
  assert.equal(bgHandlers.length, 1, 'Service Worker must register Firebase onBackgroundMessage handler');

  // 1. Standard POS Web Push event (even if legacy payload omits or sends pwa-192x192 as badge)
  let waitPromise: Promise<any> = Promise.resolve();
  pushListener({
    data: {
      json: () => ({
        title: 'POS Sale',
        body: 'Invoice #1001',
        badge: '/pwa-192x192.png',
        data: { url: '/?tab=reports' },
      }),
    },
    waitUntil: (p: Promise<any>) => {
      waitPromise = p;
    },
  });
  await waitPromise;

  assert.equal(shownNotifications.length, 1);
  assert.equal(shownNotifications[0].options.icon, '/pwa-192x192.png');
  assert.equal(shownNotifications[0].options.badge, '/icons/badge-favicon.png');

  // 2. SuperAdmin FCM background message
  await bgHandlers[0]({
    notification: { title: 'Admin Notice', body: 'New tenant' },
    data: { url: '/admin', isAdmin: 'true' },
  });

  assert.equal(shownNotifications.length, 2);
  assert.equal(shownNotifications[1].options.icon, '/admin/pwa-192x192.png');
  assert.equal(shownNotifications[1].options.badge, '/icons/badge-favicon.png');
});

test('manifests and TWA assetlinks resolve all icon paths cleanly on disk', () => {
  const assetlinks = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'public', '.well-known', 'assetlinks.json'), 'utf8')
  );
  assert.equal(assetlinks[0]?.target?.package_name, 'com.sarbaazsoft.shoepos');

  const manifestFiles = [
    'public/manifest.json',
    'public/manifest.webmanifest',
    'public/admin/manifest.json',
    'public/admin/manifest.webmanifest',
  ];

  for (const rel of manifestFiles) {
    const manifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), rel), 'utf8'));
    for (const icon of manifest.icons || []) {
      const diskPath = path.join(process.cwd(), 'public', String(icon.src).replace(/^\//, ''));
      assert.equal(fs.existsSync(diskPath), true, `${rel} icon missing on disk: ${icon.src}`);
    }
    for (const shortcut of manifest.shortcuts || []) {
      for (const icon of shortcut.icons || []) {
        const diskPath = path.join(process.cwd(), 'public', String(icon.src).replace(/^\//, ''));
        assert.equal(fs.existsSync(diskPath), true, `${rel} shortcut icon missing on disk: ${icon.src}`);
      }
    }
  }

  for (const role of ['PUBLIC', 'ADMIN', 'CASHIER', 'SUPERADMIN']) {
    const dynamicManifest = buildPwaManifest(role);
    for (const icon of dynamicManifest.icons) {
      const diskPath = path.join(process.cwd(), 'public', icon.src.replace(/^\//, ''));
      assert.equal(fs.existsSync(diskPath), true, `Dynamic manifest (${role}) icon missing: ${icon.src}`);
    }
  }
});
