/* eslint-disable no-undef */
// =========================================================================
// SarbaazSoft Shoe POS - Consolidated Root Service Worker
// Combines:
// 1. PWA Shell Offline Caching & Fetch Handling (PWABuilder / WebAPK Compliant)
// 2. Firebase Cloud Messaging (FCM) Background Push Notifications
// 3. Web Push API & Notification Interaction / Deep-Linking
// 4. Background Sync & Periodic Sync for Offline POS Transactions (IndexedDB)
// =========================================================================

const CACHE_NAME = 'sarbaazsoft-pos-cache-v8';
const SW_SYNC_TAG = 'pos-offline-transactions-sync';
const SW_PERIODIC_SYNC_TAG = 'pos-offline-periodic-sync';
const DB_NAME = 'ShoePosOfflineDB';
const DB_VERSION = 4;
const STORE_SALES = 'offline_sales_queue';
const BROADCAST_CHANNEL_NAME = 'pos_background_sync_channel';

// Core assets to pre-cache on install for instant offline availability
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/manifest.json',
  '/.well-known/assetlinks.json',
  '/favicon.ico',
  '/favicon.png',
  '/favicon-16x16.png',
  '/favicon-32x32.png',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/pwa-maskable-192x192.png',
  '/pwa-maskable-512x512.png',
  '/apple-touch-icon.png',
  '/admin/manifest.webmanifest',
  '/admin/manifest.json',
  '/admin/favicon.ico',
  '/admin/favicon.png',
  '/admin/favicon-16x16.png',
  '/admin/favicon-32x32.png',
  '/admin/pwa-192x192.png',
  '/admin/pwa-512x512.png',
  '/admin/pwa-maskable-192x192.png',
  '/admin/pwa-maskable-512x512.png',
  '/admin/apple-touch-icon.png',
];

function isCacheableStaticOrigin(url) {
  if (url.origin === self.location.origin) return true;
  return (
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com'
  );
}

// -------------------------------------------------------------------------
// 1. Service Worker Lifecycle (Install & Activate)
// -------------------------------------------------------------------------
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        Promise.allSettled(
          PRECACHE_ASSETS.map((assetUrl) => cache.add(assetUrl).catch(() => null))
        )
      )
      .catch(() => {})
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE_NAME)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// -------------------------------------------------------------------------
// 2. PWA Fetch Handler (Offline Support & Caching Strategy)
// Satisfies PWABuilder, Lighthouse, and Chromium WebAPK offline requirements
// -------------------------------------------------------------------------
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Only handle HTTP/HTTPS GET requests
  if (request.method !== 'GET' || !url.protocol.startsWith('http')) {
    return;
  }

  // Pass-through API calls, binary installers (.apk / .exe), signing assets, and Vite dev internals directly to network
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/@') ||
    url.pathname.startsWith('/node_modules') ||
    url.pathname.includes('hot-update') ||
    url.pathname.endsWith('.apk') ||
    url.pathname.endsWith('.exe')
  ) {
    return;
  }

  // 1. Navigation requests (HTML pages): Network-first with Cache/Offline Fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)).catch(() => {});
            return response;
          }
          const cached =
            (await caches.match(request)) ||
            (await caches.match('/index.html')) ||
            (await caches.match('/'));
          return cached || response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          const indexFallback = (await caches.match('/index.html')) || (await caches.match('/'));
          if (indexFallback) return indexFallback;
          return new Response(
            '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Offline - SarbaazSoft Shoe POS</title><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#FFFFFF;color:#0F172A;text-align:center;padding:20px;}</style></head><body><div><h2>SarbaazSoft Shoe POS</h2><p>You are currently offline. Please reconnect to the internet or launch the installed app to use cached POS functions.</p></div></body></html>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        })
    );
    return;
  }

  // 2. Digital Asset Links & Web App Manifests: Network-First (always fresh for TWA/PWA verification, with offline fallback)
  if (
    url.pathname.startsWith('/.well-known/') ||
    url.pathname.endsWith('.webmanifest') ||
    url.pathname.endsWith('/manifest.json')
  ) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)).catch(() => {});
          }
          return networkResponse;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          return cached || Response.error();
        })
    );
    return;
  }

  // Skip runtime caching for unrelated third-party origins
  if (!isCacheableStaticOrigin(url)) {
    return;
  }

  // 3. Static Assets (JS, CSS, Images, Fonts, Icons): Stale-While-Revalidate
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)).catch(() => {});
          }
          return networkResponse;
        })
        .catch(() => cachedResponse || Response.error());

      return cachedResponse || fetchPromise;
    })
  );
});

// -------------------------------------------------------------------------
// 3. Firebase Cloud Messaging (FCM) Integration
// -------------------------------------------------------------------------
let messagingInitialized = false;

try {
  importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js');
} catch (err) {
  // Graceful fallback if running offline or in network-isolated environments
}

async function initFirebaseInWorker() {
  if (messagingInitialized || typeof firebase === 'undefined') return;
  try {
    const res = await fetch('/api/notifications/fcm-config');
    if (!res.ok) return;
    const config = await res.json();
    if (config && config.apiKey && config.projectId) {
      if (!firebase.apps.length) {
        firebase.initializeApp({
          apiKey: config.apiKey,
          projectId: config.projectId,
          messagingSenderId: config.messagingSenderId,
          appId: config.appId,
          measurementId: config.measurementId,
        });
      }
      const messaging = firebase.messaging();
      messaging.onBackgroundMessage((payload) => {
        const title = payload.notification?.title || payload.data?.title || 'SarbaazSoft Shoe POS Alert';
        const body = payload.notification?.body || payload.data?.body || 'New store transaction activity received.';
        const url = payload.data?.url || '/?tab=reports';
        const isAdminTarget = String(url).startsWith('/admin') || payload.data?.isAdmin === 'true';
        const defaultIcon = isAdminTarget ? '/admin/pwa-192x192.png' : '/pwa-192x192.png';
        const icon = payload.notification?.icon || defaultIcon;
        const tag = payload.data?.tag || `pos-${Date.now()}`;

        const notificationOptions = {
          body,
          icon,
          badge: defaultIcon,
          tag,
          vibrate: [200, 100, 200],
          data: {
            url,
            ...payload.data,
          },
          actions: [
            { action: 'open_pos', title: isAdminTarget ? 'Open Admin' : 'Open POS' },
            { action: 'dismiss', title: 'Dismiss' },
          ],
        };

        return self.registration.showNotification(title, notificationOptions);
      });
      messagingInitialized = true;
    }
  } catch {
    // Non-fatal if config not yet saved or offline
  }
}

initFirebaseInWorker().catch(() => {});

// -------------------------------------------------------------------------
// 4. Standard Web Push & Notification Interaction
// -------------------------------------------------------------------------
self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { title: 'SarbaazSoft POS Alert', body: event.data.text() };
    }
  }

  const notification = data.notification || data;
  const title = notification.title || 'SarbaazSoft Shoe POS Alert';
  const tag = data.data?.tag || data.tag || `pos-alert-${Date.now()}`;
  const targetUrl = (data.data && data.data.url) || data.url || '/?tab=reports';
  const isAdminTarget = String(targetUrl).startsWith('/admin') || Boolean(data.data?.isAdmin);
  const defaultIcon = isAdminTarget ? '/admin/pwa-192x192.png' : '/pwa-192x192.png';
  const options = {
    body: notification.body || data.body || data.message || 'New Point of Sale transaction confirmed.',
    icon: notification.icon || data.icon || defaultIcon,
    badge: data.badge || defaultIcon,
    tag,
    data: data.data || { url: targetUrl },
    vibrate: [250, 100, 250, 100, 250],
    requireInteraction: true,
    renotify: true,
    actions: [
      { action: 'open_pos', title: isAdminTarget ? 'Open Admin' : 'Open POS' },
      { action: 'open_receipt', title: 'Open Receipt' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  const notifData = event.notification.data || {};
  let targetUrl = notifData.url || '/?tab=reports';
  if (event.action === 'open_pos') {
    targetUrl = '/?tab=pos';
  } else if (event.action === 'open_receipt') {
    targetUrl = notifData.url || '/?tab=reports';
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // 1. If an active window is already open, notify it and bring to focus
      for (const client of clientList) {
        if ('focus' in client) {
          try {
            client.postMessage({
              type: 'POS_DEEP_LINK_NOTIFICATION',
              payload: notifData,
              targetUrl,
            });
            if (client.url && client.navigate) {
              client.navigate(targetUrl);
            }
          } catch {}
          return client.focus();
        }
      }

      // 2. If no window is open, open a new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

// -------------------------------------------------------------------------
// 5. Offline Background Sync for Offline Sales Transactions (IndexedDB)
// -------------------------------------------------------------------------
let cachedAuthContext = {
  token: null,
  tenantId: null,
};

let isSwSyncing = false;

function broadcastSyncEvent(payload) {
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      channel.postMessage(payload);
      channel.close();
    }
  } catch {}

  self.clients
    .matchAll({ type: 'window', includeUncontrolled: true })
    .then((clients) => {
      for (const client of clients) {
        try {
          client.postMessage(payload);
        } catch {}
      }
    })
    .catch(() => {});
}

function openOfflineDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in Service Worker'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_SALES)) {
        const salesStore = db.createObjectStore(STORE_SALES, { keyPath: 'clientTxId' });
        salesStore.createIndex('status', 'status', { unique: false });
        salesStore.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getAllQueuedSalesFromIDB(db) {
  return new Promise((resolve, reject) => {
    try {
      if (!db.objectStoreNames.contains(STORE_SALES)) {
        resolve([]);
        return;
      }
      const tx = db.transaction(STORE_SALES, 'readonly');
      const store = tx.objectStore(STORE_SALES);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    } catch (err) {
      reject(err);
    }
  });
}

function updateQueuedSaleInIDB(db, clientTxId, updates) {
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_SALES, 'readwrite');
      const store = tx.objectStore(STORE_SALES);
      const getReq = store.get(clientTxId);
      getReq.onsuccess = () => {
        const existing = getReq.result;
        if (!existing) {
          resolve(null);
          return;
        }
        const updated = Object.assign({}, existing, updates);
        const putReq = store.put(updated);
        putReq.onsuccess = () => resolve(updated);
        putReq.onerror = () => reject(putReq.error);
      };
      getReq.onerror = () => reject(getReq.error);
    } catch (err) {
      reject(err);
    }
  });
}

async function isServerHealthy() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4500);
    const res = await fetch('/api/health', {
      method: 'GET',
      headers: { 'Cache-Control': 'no-cache' },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return res.ok;
  } catch {
    return false;
  }
}

async function processOfflineQueueFromSW(triggerSource) {
  if (isSwSyncing) return;

  const windowClients = await self.clients
    .matchAll({ type: 'window', includeUncontrolled: true })
    .catch(() => []);

  if (windowClients && windowClients.length > 0) {
    broadcastSyncEvent({
      type: 'SW_TRIGGER_OFFLINE_SYNC',
      source: triggerSource || 'sw-sync',
      timestamp: Date.now(),
    });
    return;
  }

  if (!cachedAuthContext.token) {
    return;
  }

  const healthy = await isServerHealthy();
  if (!healthy) {
    throw new Error('Server unreachable during Service Worker background sync');
  }

  isSwSyncing = true;
  let db = null;
  let synced = 0;
  let failed = 0;

  try {
    db = await openOfflineDB();
    const allSales = await getAllQueuedSalesFromIDB(db);
    const pendingSales = allSales
      .filter((s) => s && (s.status === 'PENDING' || s.status === 'FAILED'))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    if (pendingSales.length === 0) {
      return;
    }

    for (const sale of pendingSales) {
      const authToken = sale.authToken || cachedAuthContext.token;
      if (!authToken) continue;

      try {
        await updateQueuedSaleInIDB(db, sale.clientTxId, { status: 'SYNCING' });

        const headers = {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        };
        const targetTenantId = sale.tenantId || cachedAuthContext.tenantId;
        if (targetTenantId) {
          headers['X-Tenant-Id'] = String(targetTenantId);
        }

        const payload = {
          clientTxId: sale.clientTxId,
          saleDate: sale.createdAt,
          items: (sale.items || []).map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            discount: i.discount,
          })),
          customerId: sale.customerId,
          paymentMethod: sale.paymentMethod,
          cashReceived: sale.cashReceived,
          changeGiven: sale.changeGiven,
          notes: sale.notes,
          isMinPriceOverridden: Boolean(sale.isMinPriceOverridden),
          adminOverrideEmail: sale.adminOverrideEmail || null,
          adminOverridePassword: sale.adminOverridePassword || null,
          exchange: sale.exchange || null,
        };

        const res = await fetch('/api/pos/checkout', {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP ${res.status}`);
        }

        const data = await res.json();
        await updateQueuedSaleInIDB(db, sale.clientTxId, {
          status: 'SYNCED',
          syncedInvoiceNumber: (data && data.sale && data.sale.invoiceNumber) || data.invoiceNumber,
          syncedAt: new Date().toISOString(),
          errorMessage: undefined,
        });
        synced++;
      } catch (err) {
        const msg = String((err && err.message) || err || 'Background sync error');
        const isNetErr =
          msg.includes('Failed to fetch') ||
          msg.includes('NetworkError') ||
          msg.includes('abort');
        await updateQueuedSaleInIDB(db, sale.clientTxId, {
          status: isNetErr ? 'PENDING' : 'FAILED',
          errorMessage: isNetErr ? 'Server offline (will auto-retry on reconnect)' : msg,
        });
        failed++;
        if (isNetErr) {
          throw err;
        }
      }
    }

    if (synced > 0 || failed > 0) {
      broadcastSyncEvent({
        type: 'SW_BACKGROUND_SYNC_COMPLETED',
        synced,
        failed,
        timestamp: Date.now(),
      });
      broadcastSyncEvent({
        type: 'SW_OFFLINE_SYNC_COMPLETE',
        synced,
        failed,
        timestamp: Date.now(),
      });
    }
  } finally {
    isSwSyncing = false;
    if (db) {
      try {
        db.close();
      } catch {}
    }
  }
}

self.addEventListener('sync', (event) => {
  if (event.tag === SW_SYNC_TAG) {
    event.waitUntil(processOfflineQueueFromSW('sync-event'));
  }
});

self.addEventListener('periodicsync', (event) => {
  if (event.tag === SW_PERIODIC_SYNC_TAG || event.tag === SW_SYNC_TAG) {
    event.waitUntil(processOfflineQueueFromSW('periodicsync-event'));
  }
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;

  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (data.type === 'SYNC_AUTH_CONTEXT') {
    cachedAuthContext = {
      token: data.token || cachedAuthContext.token,
      tenantId: data.tenantId !== undefined ? data.tenantId : cachedAuthContext.tenantId,
    };
    return;
  }

  if (data.type === 'CLEAR_AUTH_CONTEXT') {
    cachedAuthContext = {
      token: null,
      tenantId: null,
    };
    return;
  }

  if (data.type === 'TRIGGER_BACKGROUND_SYNC') {
    if (data.authToken) {
      cachedAuthContext.token = data.authToken;
    }
    event.waitUntil(processOfflineQueueFromSW('manual-trigger').catch(() => {}));
    return;
  }

  if (data.type === 'REGISTER_BACKGROUND_SYNC') {
    if (self.registration && 'sync' in self.registration) {
      self.registration.sync.register(SW_SYNC_TAG).catch(() => {});
    }
    event.waitUntil(processOfflineQueueFromSW('message-trigger').catch(() => {}));
  }
});
