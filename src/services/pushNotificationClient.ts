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
  if (!isWebPushSupported()) return false;
  try {
    if (Notification.permission !== 'granted') return false;
    // If explicitly disabled by user on this client, respect that setting
    if (localStorage.getItem('pos_push_notifications_enabled') === 'false') return false;

    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return false;
    const sub = await reg.pushManager.getSubscription();
    return sub !== null;
  } catch {
    return false;
  }
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

  if (!isWebPushSupported()) {
    return {
      success: false,
      error: 'Web Push notifications are not supported on this browser or platform.',
    };
  }

  try {
    // 1. Check or request browser notification permission
    let permission = Notification.permission;
    if (permission !== 'granted') {
      permission = await Notification.requestPermission();
    }

    if (permission === 'denied') {
      return {
        success: false,
        permission: 'denied',
        error: 'Notification permission was denied. Please allow notifications in your browser or device settings.',
      };
    }

    if (permission !== 'granted') {
      return {
        success: false,
        permission: 'default',
        error: 'Notification permission request was dismissed.',
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
      reg = await navigator.serviceWorker.register('/sw-background-sync.js', { scope: '/' });
    }
    await navigator.serviceWorker.ready;

    // 4. Ensure push subscription with PushManager
    const applicationServerKey = urlBase64ToUint8Array(publicKey);
    let sub = await reg.pushManager.getSubscription();

    // If permission is already granted but no subscription exists, create a new push subscription
    if (!sub) {
      try {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationServerKey as any,
        });
      } catch (subErr: any) {
        console.warn('[pushNotificationClient] Initial subscribe attempt error:', subErr);
        // If an existing subscription had mismatched keys, reset and retry once
        const existing = await reg.pushManager.getSubscription().catch(() => null);
        if (existing) {
          await existing.unsubscribe().catch(() => {});
        }
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationServerKey as any,
        });
      }
    }

    if (!sub) {
      return {
        success: false,
        error: 'Could not create a push subscription on this device.',
      };
    }

    // 5. Send subscription to server with explicit user, role, and store context
    const rawSub = sub.toJSON();
    let currentRole = overrideRole || 'ADMIN';
    let currentTenantId = getActiveTenantId() || 1;
    let currentUserId = 0;
    try {
      const stored = localStorage.getItem('pos_current_user');
      if (stored) {
        const u = JSON.parse(stored);
        if (!overrideRole && u.role) currentRole = String(u.role).toUpperCase();
        if (u.tenantId) currentTenantId = Number(u.tenantId) || currentTenantId;
        if (u.id) currentUserId = Number(u.id) || 0;
      }
    } catch {}

    const saveRes = await api.notifications.subscribe({
      ...rawSub,
      userRole: currentRole,
      role: currentRole,
      tenantId: currentTenantId,
      userId: currentUserId,
    });
    if (saveRes && saveRes.success === false) {
      return {
        success: false,
        error: saveRes.error || 'Server rejected push notification subscription.',
      };
    }

    try {
      localStorage.setItem('pos_push_notifications_enabled', 'true');
    } catch {}

    return { success: true, permission: 'granted' };
  } catch (err: any) {
    console.error('Failed to subscribe device to Web Push:', err);
    return {
      success: false,
      error: err?.message || 'Failed to complete push notification registration.',
    };
  }
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
