// Offline Sales Queue Manager: PWA Background Sync Service, Service Worker bridge, queue status listener, and local fallback

import { api, getAuthToken } from './api.ts';
import { QueuedSale, queueOfflineSale, getOfflineSales, getPendingOfflineSalesCount, updateOfflineSaleStatus, deleteOfflineSale, cacheCatalogOffline, resolveActiveTenantId } from '../utils/offlineDb.ts';
import { buildCheckoutRequestPayload, processOfflineSalesQueue } from './offline/syncEngine.ts';

export const SW_SYNC_TAG = 'pos-offline-transactions-sync';

type QueueListener = (
  pendingCount: number,
  isSyncing: boolean,
  isBackendConnected: boolean,
  lastSyncedAt: Date | null
) => void;

class OfflineQueueService {
  private isOnlineState: boolean = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private isBackendConnectedState: boolean = true;
  private isSyncingState: boolean = false;
  private lastSyncedAtState: Date | null = null;
  private listeners: Set<QueueListener> = new Set();
  private syncIntervalId: any = null;
  private healthCheckIntervalId: any = null;

  constructor() {
    // Restore cached lastSyncedAt if available
    try {
      const cached = localStorage.getItem('pos_last_synced_at');
      if (cached) {
        this.lastSyncedAtState = new Date(cached);
      } else {
        this.lastSyncedAtState = new Date();
      }
    } catch {
      this.lastSyncedAtState = new Date();
    }

    // Listen to browser network, focus, visibility, and Service Worker background sync events
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline);
      window.addEventListener('offline', this.handleOffline);
      window.addEventListener('focus', this.handleWindowFocus);
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
      this.setupServiceWorkerBridge();
    }

    // Initial check and start periodic background checks
    this.notify();
    this.checkBackendHealth();
    this.startPeriodicSync();
  }

  public get isOnline(): boolean {
    return this.isOnlineState;
  }

  public get isBackendConnected(): boolean {
    return this.isBackendConnectedState;
  }

  public get isSyncing(): boolean {
    return this.isSyncingState;
  }

  public get lastSyncedAt(): Date | null {
    return this.lastSyncedAtState;
  }

  public subscribe(listener: QueueListener): () => void {
    this.listeners.add(listener);
    // Notify immediately
    this.notify();
    return () => {
      this.listeners.delete(listener);
    };
  }

  private async notify() {
    try {
      const count = await getPendingOfflineSalesCount();
      for (const fn of this.listeners) {
        fn(count, this.isSyncingState, this.isBackendConnectedState, this.lastSyncedAtState);
      }
    } catch (e) {
      console.warn('[OfflineSync] Failed to query count:', e);
    }
  }

  /**
   * Wire up two-way communication with the PWA Service Worker background sync module
   */
  private setupServiceWorkerBridge() {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    navigator.serviceWorker.addEventListener('message', async (event) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;

      if (data.type === 'SW_BACKGROUND_SYNC_STARTED') {
        this.isSyncingState = true;
        this.notify();
      } else if (data.type === 'SW_BACKGROUND_SYNC_PROGRESS') {
        this.notify();
      } else if (data.type === 'SW_BACKGROUND_SYNC_COMPLETED') {
        this.isSyncingState = false;
        const syncedCount = Number(data.synced || 0);
        if (syncedCount > 0) {
          this.recordRemoteSave();
          this.primeCatalogCache().catch(() => {});
          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('pos:offline-sync-complete', {
                detail: { synced: syncedCount, failed: Number(data.failed || 0), source: 'service-worker' },
              })
            );
          }
        } else {
          this.notify();
        }
      } else if (data.type === 'SW_REQUEST_AUTH_TOKEN') {
        const token = getAuthToken();
        if (token && navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({
            type: 'TRIGGER_BACKGROUND_SYNC',
            authToken: token,
          });
        }
      }
    });
  }

  /**
   * Register a native Service Worker Background Sync task (SyncManager API)
   * and notify active Service Worker controller as fallback.
   */
  public async registerBackgroundSync(): Promise<void> {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    try {
      const registration = await navigator.serviceWorker.ready;
      if ('sync' in registration && (registration as any).sync) {
        await (registration as any).sync.register(SW_SYNC_TAG);
      }

      // Also register periodic background sync if supported and permitted
      if ('periodicSync' in registration && (registration as any).periodicSync) {
        try {
          await (registration as any).periodicSync.register(SW_SYNC_TAG, {
            minInterval: 60 * 1000,
          });
        } catch {
          // Periodic background sync permission may not be granted in all browsers
        }
      }
    } catch {
      // Fallback handled by window online/periodic listeners
    }
  }

  /**
   * Trigger Service Worker background sync via postMessage if controller is active
   */
  private notifyServiceWorkerToSync() {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    try {
      const token = getAuthToken();
      if (navigator.serviceWorker.controller && token) {
        navigator.serviceWorker.controller.postMessage({
          type: 'TRIGGER_BACKGROUND_SYNC',
          authToken: token,
        });
      }
    } catch {
      // Ignore if controller is not ready
    }
  }

  /**
   * Ping backend directly to verify remote server responsiveness
   */
  public async checkBackendHealth(): Promise<boolean> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.isOnlineState = false;
      this.isBackendConnectedState = false;
      this.notify();
      return false;
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4500);
      const healthHeaders: Record<string, string> = { 'Cache-Control': 'no-cache' };
      const activeTid = resolveActiveTenantId();
      if (activeTid) {
        healthHeaders['X-Tenant-Id'] = String(activeTid);
      }
      const token = getAuthToken();
      if (token) {
        healthHeaders['X-Auth-Token'] = token;
      }
      const res = await fetch('/api/health', {
        method: 'GET',
        signal: controller.signal,
        headers: healthHeaders,
      });
      clearTimeout(timer);

      const wasDisconnected = !this.isBackendConnectedState;
      const isOk = res.ok;
      this.isBackendConnectedState = isOk;
      this.isOnlineState = isOk;

      if (isOk) {
        // If we just reconnected, or if we have unsynced transactions, trigger automatic sync
        if (wasDisconnected) {
          console.log('[OfflineSync] Backend reconnected. Initiating automatic background sync...');
          this.syncPendingSales();
        } else {
          const pendingCount = await getPendingOfflineSalesCount();
          if (pendingCount > 0 && !this.isSyncingState) {
            this.syncPendingSales();
          }
        }
      }
    } catch {
      this.isBackendConnectedState = false;
    }

    this.notify();
    return this.isBackendConnectedState;
  }

  /**
   * Record that a transaction or action was successfully saved on remote backend
   */
  public recordRemoteSave() {
    this.lastSyncedAtState = new Date();
    this.isBackendConnectedState = true;
    this.isOnlineState = true;
    try {
      localStorage.setItem('pos_last_synced_at', this.lastSyncedAtState.toISOString());
    } catch {}
    this.notify();
  }

  private handleOnline = async () => {
    console.log('[OfflineSync] Network back ONLINE. Checking backend and auto-syncing...');
    this.isOnlineState = true;
    await this.registerBackgroundSync();
    await this.checkBackendHealth();
    await this.syncPendingSales();
  };

  private handleOffline = () => {
    console.log('[OfflineSync] Network is OFFLINE. POS will queue checkouts locally in IndexedDB.');
    this.isOnlineState = false;
    this.isBackendConnectedState = false;
    this.registerBackgroundSync();
    this.notify();
  };

  private handleWindowFocus = () => {
    // When user returns to tab, perform a lightweight backend health check & flush pending queue
    this.checkBackendHealth();
  };

  private handleVisibilityChange = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      this.checkBackendHealth();
    }
  };

  private startPeriodicSync() {
    if (this.syncIntervalId) clearInterval(this.syncIntervalId);
    if (this.healthCheckIntervalId) clearInterval(this.healthCheckIntervalId);

    // Every 12 seconds: perform lightweight ping to check backend connectivity
    this.healthCheckIntervalId = setInterval(() => {
      this.checkBackendHealth();
    }, 12000);

    // Every 15 seconds, if backend is connected, flush any unsynced offline sales
    this.syncIntervalId = setInterval(() => {
      if (this.isBackendConnectedState && !this.isSyncingState) {
        this.syncPendingSales();
      }
    }, 15000);
  }

  private buildCheckoutPayload(sale: QueuedSale): any {
    return buildCheckoutRequestPayload(sale);
  }

  /**
   * Save an offline sale to IndexedDB and register Service Worker Background Sync
   */
  public async enqueueSale(sale: Omit<QueuedSale, 'clientTxId' | 'createdAt' | 'status'>): Promise<QueuedSale> {
    const tenantId = resolveActiveTenantId(sale.tenantId);
    const authToken = getAuthToken() || sale.authToken;
    const prefix = tenantId ? `T${tenantId}` : 'OFF';
    const clientTxId = `OFFLINE-${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    const queued: QueuedSale = {
      ...sale,
      ...(tenantId ? { tenantId } : {}),
      ...(authToken ? { authToken } : {}),
      clientTxId,
      createdAt: new Date().toISOString(),
      status: 'PENDING',
    };

    await queueOfflineSale(queued, tenantId);
    await this.registerBackgroundSync();
    await this.notify();

    // If online right now, attempt immediate background flush
    if (this.isOnlineState) {
      setTimeout(() => this.syncPendingSales(), 100);
    }

    return queued;
  }

  /**
   * Synchronize all pending sales in chronological order to PostgreSQL
   */
  public async syncPendingSales(): Promise<{ synced: number; failed: number }> {
    if (this.isSyncingState) {
      return { synced: 0, failed: 0 };
    }

    // Do not attempt network checkout if browser is explicitly offline
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.isOnlineState = false;
      this.isBackendConnectedState = false;
      await this.registerBackgroundSync();
      this.notify();
      return { synced: 0, failed: 0 };
    }

    // Do not attempt checkout if user is not authenticated yet (e.g. login screen)
    const token = getAuthToken();
    if (!token) {
      return { synced: 0, failed: 0 };
    }

    this.isSyncingState = true;
    this.notify();

    const result = await processOfflineSalesQueue(
      {
        getSales: () => getOfflineSales(),
        updateSaleStatus: updateOfflineSaleStatus,
      },
      {
        submitCheckout: (payload) => api.pos.checkout(payload),
      },
      () => this.notify()
    );

    const { synced, failed, abortedByNetwork } = result;
    if (abortedByNetwork) {
      this.isBackendConnectedState = false;
      this.isOnlineState = false;
      await this.registerBackgroundSync();
    }

    this.isSyncingState = false;
    if (synced > 0) {
      this.lastSyncedAtState = new Date();
      this.isBackendConnectedState = true;
      try {
        localStorage.setItem('pos_last_synced_at', this.lastSyncedAtState.toISOString());
      } catch {}
      // Refresh local product catalog cache with updated server stock levels
      this.primeCatalogCache().catch(() => {});
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('pos:offline-sync-complete', {
            detail: { synced, failed, source: 'foreground' },
          })
        );
      }
    } else if (failed > 0) {
      this.notifyServiceWorkerToSync();
    }
    this.notify();
    return { synced, failed };
  }

  /**
   * Helper to refresh offline catalog cache
   */
  public async primeCatalogCache(): Promise<void> {
    const token = getAuthToken();
    if (!token) return;
    try {
      const res = await api.products.list({ limit: 500 } as any);
      if (res && res.products) {
        await cacheCatalogOffline(res.products);
        console.log(`[OfflineSync] Cached ${res.products.length} products for offline POS use.`);
      }
    } catch {
      // Ignore transient network blips during background cache priming
    }
  }

  public async getQueue(): Promise<QueuedSale[]> {
    return getOfflineSales();
  }

  public async removeSale(clientTxId: string): Promise<void> {
    await deleteOfflineSale(clientTxId);
    this.notify();
  }

  public async retrySingleSale(sale: QueuedSale): Promise<boolean> {
    const token = getAuthToken();
    if (!token) {
      console.warn('[OfflineSync] Cannot retry sync: user is not logged in.');
      return false;
    }

    try {
      await updateOfflineSaleStatus(sale.clientTxId, 'SYNCING');
      this.notify();

      const payload = this.buildCheckoutPayload(sale);
      const res = await api.pos.checkout(payload);

      await updateOfflineSaleStatus(sale.clientTxId, 'SYNCED', {
        syncedInvoiceNumber: res?.sale?.invoiceNumber || res?.invoiceNumber,
        syncedAt: new Date().toISOString(),
        errorMessage: undefined,
      });
      this.recordRemoteSave();
      this.primeCatalogCache().catch(() => {});
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('pos:offline-sync-complete', {
            detail: { synced: 1, failed: 0, source: 'manual-retry' },
          })
        );
      }
      return true;
    } catch (err: any) {
      const rawMsg = String(err?.message || err || '');
      console.warn(`[OfflineSync] Retry for sale ${sale.clientTxId} notice:`, rawMsg);
      await updateOfflineSaleStatus(sale.clientTxId, 'FAILED', {
        errorMessage: rawMsg,
      });
      this.notify();
      return false;
    }
  }
}

export const offlineQueueService = new OfflineQueueService();
