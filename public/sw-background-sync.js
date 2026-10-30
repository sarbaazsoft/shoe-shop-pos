// PWA Background Sync Worker for Offline POS Transactions
// Handles Service Worker 'sync', 'periodicsync', and 'message' events
// to push pending offline transactions from IndexedDB to the server once connectivity is restored.

const SW_SYNC_TAG = 'pos-offline-transactions-sync';
const SW_PERIODIC_SYNC_TAG = 'pos-offline-periodic-sync';
const DB_NAME = 'ShoePosOfflineDB';
const DB_VERSION = 3;
const STORE_SALES = 'offline_sales_queue';
const BROADCAST_CHANNEL_NAME = 'pos_background_sync_channel';

let cachedAuthContext = {
  token: null,
  tenantId: null,
};

let isSwSyncing = false;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Pass-through fetch handler satisfying Chromium & Android WebAPK PWA installability standards
self.addEventListener('fetch', () => {
  // Let the browser handle network fetches by default while maintaining active service worker status
});

function broadcastSyncEvent(payload) {
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      channel.postMessage(payload);
      channel.close();
    }
  } catch {
    // Ignore BroadcastChannel errors in restricted contexts
  }

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

  // 1. Notify any active WindowClients first so the foreground app can coordinate & update UI
  const windowClients = await self.clients
    .matchAll({ type: 'window', includeUncontrolled: true })
    .catch(() => []);

  if (windowClients && windowClients.length > 0) {
    broadcastSyncEvent({
      type: 'SW_TRIGGER_OFFLINE_SYNC',
      source: triggerSource || 'sw-sync',
      timestamp: Date.now(),
    });
  }

  // 2. If no WindowClient is open (or if SW has auth token for headless background sync),
  // directly push pending sales from IndexedDB to /api/pos/checkout.
  if (windowClients && windowClients.length > 0) {
    // Active window client will handle the queue with full state & token access
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
          throw err; // Let SyncManager know to retry when online
        }
      }
    }

    if (synced > 0 || failed > 0) {
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
  if (event.tag === SW_PERIODIC_SYNC_TAG) {
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

  if (data.type === 'REGISTER_BACKGROUND_SYNC') {
    if (self.registration && 'sync' in self.registration) {
      self.registration.sync.register(SW_SYNC_TAG).catch(() => {});
    }
    event.waitUntil(processOfflineQueueFromSW('message-trigger').catch(() => {}));
  }
});

// =========================================================================
// Real-Time Web Push Notification System (Online, Background & Installed PWA)
// =========================================================================

self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { title: 'POS Alert', body: event.data.text() };
    }
  }

  const title = data.title || 'SarbaazSoft POS Alert';
  const tag = data.tag || `pos-alert-${Date.now()}`;
  const notificationOptions = {
    body: data.body || data.message || 'New Point of Sale transaction confirmed.',
    icon: data.icon || '/pwa-192x192.png',
    badge: data.badge || '/pwa-192x192.png',
    tag,
    data: data.data || { url: data.url || '/?tab=reports' },
    vibrate: [250, 100, 250, 100, 250],
    requireInteraction: true,
    renotify: true,
    actions: [
      { action: 'open_receipt', title: 'Open Receipt' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, notificationOptions));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  const notifData = event.notification.data || {};
  const targetUrl = notifData.url || '/?tab=reports';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // 1. If an active window is already open, notify it via postMessage and bring to focus
      for (const client of clientList) {
        if ('focus' in client) {
          try {
            client.postMessage({
              type: 'POS_DEEP_LINK_NOTIFICATION',
              payload: notifData,
              targetUrl,
            });
            if (client.url) {
              client.navigate(targetUrl);
            }
          } catch {}
          return client.focus();
        }
      }

      // 2. If no window is open, launch a new window client with the deep link target URL
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

