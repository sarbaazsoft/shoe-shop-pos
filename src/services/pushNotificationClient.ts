import { api, getAuthToken, getActiveTenantId } from './api.ts';
import { playAudioFeedback } from '../utils/audio.ts';
import { requestFcmDeviceToken } from './firebaseConfig.ts';

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

export function isIOSDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) || (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);
}

export function isStandalonePWA(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    (window.navigator as any).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  );
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
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission !== 'granted') return false;
  if (localStorage.getItem('pos_push_notifications_enabled') === 'false') return false;
  return Boolean(localStorage.getItem('pos_fcm_token'));
}

export async function subscribeDeviceToWebPush(overrideRole?: string): Promise<{
  success: boolean;
  error?: string;
  permission?: NotificationPermission;
}> {
  if (typeof window === 'undefined') {
    return { success: false, error: 'Web Push is not available in non-browser environments.' };
  }

  // iOS Safari requires adding to Home Screen first for Web Push
  if (isIOSDevice() && !isStandalonePWA() && !('Notification' in window)) {
    return {
      success: false,
      error: 'On iPhone or iPad, push notifications require adding this app to your Home Screen first (tap Share > Add to Home Screen), then launching it from your Home Screen.',
    };
  }

  // Delegate directly to Firebase Cloud Messaging (FCM)
  return requestFcmDeviceToken(overrideRole);
}



/**
 * Silently re-registers this device with the server when notification permission is already granted.
 * Keeps the server-side subscription row fresh (new DB, rotated VAPID keys, expired endpoint).
 */
export async function resyncPushSubscriptionIfEnabled(): Promise<void> {
  if (!isWebPushSupported() || Notification.permission !== 'granted') return;
  try {
    if (localStorage.getItem('pos_push_notifications_enabled') === 'false') return;
  } catch {
    return;
  }
  await subscribeDeviceToWebPush();
}

/**
 * Prompts the platform's official native system/browser notification permission dialog directly,
 * exactly like YouTube or Google AI Studio, without any intermediate custom HTML popups, dialogs, or banners.
 * If permission is granted, automatically registers the device for Web Push notifications.
 */
export async function triggerNativeNotificationPrompt(overrideRole?: string): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }

  if (Notification.permission === 'granted') {
    subscribeDeviceToWebPush(overrideRole).catch(() => {});
    return 'granted';
  }

  if (Notification.permission === 'denied') {
    return 'denied';
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      await subscribeDeviceToWebPush(overrideRole).catch(() => {});
    }
    return permission;
  } catch (err) {
    console.warn('[pushNotificationClient] Error requesting native notification permission:', err);
    return Notification.permission;
  }
}

/**
 * Directly initializes native notification permission prompt on session load or on first user gesture,
 * ensuring complete compatibility across Android, iOS, and Web browsers without custom HTML prompts.
 */
export function initNativeNotificationPrompt(overrideRole?: string): () => void {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return () => {};
  }

  // Already granted: keep background subscription synced
  if (Notification.permission === 'granted') {
    subscribeDeviceToWebPush(overrideRole).catch(() => {});
    return () => {};
  }

  // Already explicitly denied by user in browser settings
  if (Notification.permission === 'denied') {
    return () => {};
  }

  let hasTriggered = false;

  const runNativePrompt = async () => {
    if (hasTriggered) return;
    hasTriggered = true;
    cleanupListeners();
    await triggerNativeNotificationPrompt(overrideRole);
  };

  const onUserGesture = () => {
    runNativePrompt();
  };

  const cleanupListeners = () => {
    window.removeEventListener('click', onUserGesture);
    window.removeEventListener('pointerdown', onUserGesture);
    window.removeEventListener('touchstart', onUserGesture);
    window.removeEventListener('keydown', onUserGesture);
  };

  // 1. Direct attempt without waiting (standard for YouTube/Google AI Studio)
  triggerNativeNotificationPrompt(overrideRole)
    .then((result) => {
      if (result !== 'default') {
        hasTriggered = true;
        cleanupListeners();
      }
    })
    .catch(() => {});

  // 2. Also attach one-time user gesture listeners for browsers that enforce a user gesture (e.g., iOS Safari)
  window.addEventListener('click', onUserGesture, { once: true, passive: true });
  window.addEventListener('pointerdown', onUserGesture, { once: true, passive: true });
  window.addEventListener('touchstart', onUserGesture, { once: true, passive: true });
  window.addEventListener('keydown', onUserGesture, { once: true, passive: true });

  return cleanupListeners;
}

/**
 * Disables Web Push notifications for this device and unregisters from the server.
 */
export async function unsubscribeDeviceFromWebPush(): Promise<boolean> {
  try {
    localStorage.setItem('pos_push_notifications_enabled', 'false');
  } catch {}

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
    let currentRole = 'ADMIN';
    let currentUserId = 0;
    try {
      const stored = localStorage.getItem('pos_current_user');
      if (stored) {
        const u = JSON.parse(stored);
        if (u.role) currentRole = String(u.role).toUpperCase();
        if (u.id) currentUserId = Number(u.id) || 0;
      }
    } catch {}

    const params = new URLSearchParams();
    if (token) params.set('__token', token);
    if (tenantId) params.set('__tenantId', String(tenantId));
    params.set('role', currentRole);
    if (currentUserId > 0) params.set('userId', String(currentUserId));
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
