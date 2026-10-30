import { api, getAuthToken, getActiveTenantId } from './api.ts';
import { playAudioFeedback } from '../utils/audio.ts';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function subscriptionMatchesKey(sub: PushSubscription, key: Uint8Array): boolean {
  const current = sub.options?.applicationServerKey;
  if (!current) return false;
  const a = new Uint8Array(current as ArrayBuffer);
  if (a.length !== key.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== key[i]) return false;
  return true;
}

export function isWebPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function getNotificationPermissionState(): NotificationPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }
  return Notification.permission;
}

export async function isDeviceSubscribedToPush(): Promise<boolean> {
  if (!isWebPushSupported()) return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return false;
    const sub = await reg.pushManager.getSubscription();
    return sub !== null;
  } catch {
    return false;
  }
}

export async function subscribeDeviceToWebPush(): Promise<{ success: boolean; error?: string }> {
  if (!isWebPushSupported()) {
    return { success: false, error: 'Web Push notifications are not supported on this browser or platform.' };
  }

  try {
    // 1. Request explicit permission
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return {
        success: false,
        error: permission === 'denied'
          ? 'Notification permission was denied. Please allow notifications in your browser or device settings.'
          : 'Notification permission request was dismissed.',
      };
    }

    // 2. Fetch server VAPID public key
    const vapidRes = await api.notifications.getVapidPublicKey();
    const publicKey = vapidRes?.publicKey;
    if (!publicKey) {
      return { success: false, error: 'Server did not return a valid VAPID public key.' };
    }

    // 3. Ensure Service Worker registration is active
    let reg = await navigator.serviceWorker.getRegistration();
    if (!reg) {
      reg = await navigator.serviceWorker.register('/sw-background-sync.js');
    }
    await navigator.serviceWorker.ready;

    // 4. Subscribe with PushManager
    const applicationServerKey = urlBase64ToUint8Array(publicKey);
    let sub = await reg.pushManager.getSubscription();
    // A subscription made with a different server key can never receive pushes: drop it and re-create it.
    if (sub && !subscriptionMatchesKey(sub, applicationServerKey)) {
      const staleEndpoint = sub.endpoint;
      await sub.unsubscribe().catch(() => {});
      await api.notifications.unsubscribe(staleEndpoint).catch(() => {});
      sub = null;
    }
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey as any,
      });
    }

    // 5. Send subscription to server
    const rawSub = sub.toJSON();
    await api.notifications.subscribe(rawSub);

    try {
      localStorage.setItem('pos_push_notifications_enabled', 'true');
    } catch {}

    return { success: true };
  } catch (err: any) {
    console.error('Failed to subscribe device to Web Push:', err);
    return {
      success: false,
      error: err?.message || 'Failed to complete push notification registration.',
    };
  }
}

/**
 * Silently re-registers this device with the server when the user had already enabled alerts.
 * Keeps the server-side subscription row fresh (new DB, rotated VAPID keys, expired endpoint).
 */
export async function resyncPushSubscriptionIfEnabled(): Promise<void> {
  if (!isWebPushSupported() || Notification.permission !== 'granted') return;
  try {
    if (localStorage.getItem('pos_push_notifications_enabled') !== 'true') return;
  } catch {
    return;
  }
  await subscribeDeviceToWebPush();
}

export async function unsubscribeDeviceFromWebPush(): Promise<boolean> {
  if (!isWebPushSupported()) return true;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) {
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe().catch(() => {});
        await api.notifications.unsubscribe(endpoint).catch(() => {});
      }
    }
    try {
      localStorage.setItem('pos_push_notifications_enabled', 'false');
    } catch {}
    return true;
  } catch (err) {
    console.warn('Error during push unsubscription:', err);
    return false;
  }
}

/**
 * Connects to the real-time Server-Sent Events (SSE) notification stream.
 * Fires instant events to active browser tabs with desktop notifications and in-app sound chimes.
 */
export function connectRealtimeNotificationStream(
  onNotification: (payload: any) => void
): () => void {
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
    return () => {};
  }

  let eventSource: EventSource | null = null;
  let isClosed = false;
  let reconnectTimeout: any = null;

  const connect = () => {
    if (isClosed) return;
    const token = getAuthToken() || '';
    const tenantId = getActiveTenantId() || 1;
    const params = new URLSearchParams();
    if (token) params.set('__token', token);
    if (tenantId) params.set('__tenantId', String(tenantId));
    params.set('_t', String(Date.now()));

    const streamUrl = `/api/notifications/stream?${params.toString()}`;

    try {
      eventSource = new EventSource(streamUrl);

      eventSource.addEventListener('pos_action', (event: MessageEvent) => {
        try {
          const payload = JSON.parse(event.data);
          handleIncomingNotification(payload);
        } catch (e) {
          console.warn('Error parsing POS action event data:', e);
        }
      });

      eventSource.addEventListener('platform_announcement', (event: MessageEvent) => {
        try {
          const payload = JSON.parse(event.data);
          window.dispatchEvent(new CustomEvent('platform:announcement', { detail: payload }));
          handleIncomingNotification({
            ...payload,
            isPlatformAnnouncement: true,
          });
        } catch (e) {
          console.warn('Error parsing platform announcement event data:', e);
        }
      });

      eventSource.onmessage = (event: MessageEvent) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload && payload.type && payload.type !== 'CONNECTED') {
            handleIncomingNotification(payload);
          }
        } catch {}
      };

      eventSource.onerror = () => {
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
        if (!isClosed) {
          reconnectTimeout = setTimeout(connect, 6000);
        }
      };
    } catch (err) {
      if (!isClosed) {
        reconnectTimeout = setTimeout(connect, 8000);
      }
    }
  };

  const handleIncomingNotification = (payload: any) => {
    // 1. Play audio chime
    try {
      playAudioFeedback.success();
    } catch {}

    // 2. Dispatch custom event for in-app UI toasts & modals
    window.dispatchEvent(
      new CustomEvent('pos:action-notification', { detail: payload })
    );

    // 3. Trigger OS desktop notification if permitted and tab is not active
    if (
      typeof Notification !== 'undefined' &&
      Notification.permission === 'granted' &&
      (document.hidden || !document.hasFocus())
    ) {
      try {
        const notif = new Notification(payload.title || 'POS Alert', {
          body: payload.message || 'Transaction confirmed.',
          icon: '/pwa-192x192.png',
          badge: '/pwa-192x192.png',
          tag: `pos-${payload.type?.toLowerCase()}-${payload.invoiceNumber || Date.now()}`,
          data: payload,
        });
        notif.onclick = () => {
          window.focus();
          notif.close();
          if (payload.deepLinkUrl) {
            window.dispatchEvent(
              new CustomEvent('pos:navigate-deep-link', { detail: payload })
            );
          }
        };
      } catch {}
    }

    onNotification(payload);
  };

  connect();

  return () => {
    isClosed = true;
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
  };
}
