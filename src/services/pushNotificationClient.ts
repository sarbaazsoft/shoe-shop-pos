import { getAuthToken, getActiveTenantId } from './api.ts';
import { playAudioFeedback } from '../utils/audio.ts';
import {
  initFirebaseClient,
  requestFcmPermissionAndToken,
  syncFcmTokenSilently,
  unregisterFcmDeviceToken,
} from './firebaseConfig.ts';

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
  return localStorage.getItem('pos_push_notifications_enabled') === 'true' || Boolean(localStorage.getItem('pos_fcm_token'));
}

export async function subscribeDeviceToWebPush(overrideRole?: string): Promise<{
  success: boolean;
  token?: string;
  error?: string;
  warning?: string;
  mode?: 'fcm' | 'realtime';
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

  // Delegate directly to Firebase Cloud Messaging (FCM) with graceful Real-time Stream fallback
  return requestFcmPermissionAndToken(overrideRole);
}

/**
 * Silently re-registers this device with the server when notification permission is already granted.
 * Keeps the server-side subscription row fresh (new DB, rotated VAPID keys, expired endpoint) without UI popups.
 */
export async function resyncPushSubscriptionIfEnabled(overrideRole?: string): Promise<void> {
  if (!isWebPushSupported() || Notification.permission !== 'granted') return;
  try {
    if (localStorage.getItem('pos_push_notifications_enabled') === 'false') return;
  } catch {
    return;
  }
  await syncFcmTokenSilently(overrideRole);
}

const SOFT_PROMPT_STORAGE_KEY = 'pos_push_soft_prompt_dismissed_until';

export function isSoftPromptDismissed(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const raw = localStorage.getItem(SOFT_PROMPT_STORAGE_KEY);
    if (!raw) return false;
    const until = Number(raw);
    return !isNaN(until) && until > Date.now();
  } catch {
    return false;
  }
}

export function shouldShowSoftPushPrompt(): boolean {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  // If permission has already been decided (granted or denied), do not show soft prompt
  if (Notification.permission !== 'default') return false;
  // If user dismissed it recently, do not show
  if (isSoftPromptDismissed()) return false;
  return true;
}

export function dismissSoftPushPrompt(days = 3): void {
  if (typeof window === 'undefined') return;
  try {
    const until = Date.now() + Math.max(days, 1) * 86400000;
    localStorage.setItem(SOFT_PROMPT_STORAGE_KEY, String(until));
    window.dispatchEvent(new CustomEvent('pos:push-soft-prompt-updated'));
  } catch {}
}

export function resetSoftPushPromptDismissal(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(SOFT_PROMPT_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent('pos:push-soft-prompt-updated'));
  } catch {}
}

/**
 * Triggers the two-step permission and token registration flow.
 * Usually invoked when the user clicks 'Allow' on the soft prompt or enables the toggle in settings.
 */
export async function triggerNativeNotificationPrompt(overrideRole?: string): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }

  if (Notification.permission === 'granted') {
    await syncFcmTokenSilently(overrideRole).catch(() => {});
    return 'granted';
  }

  if (Notification.permission === 'denied') {
    return 'denied';
  }

  try {
    const res = await requestFcmPermissionAndToken(overrideRole);
    return res.permission || Notification.permission;
  } catch (err) {
    console.warn('[pushNotificationClient] Error requesting notification permission:', err);
    return Notification.permission;
  }
}

/**
 * Background FCM initialization on session load:
 * 1. Warm up the Firebase client and foreground listener.
 * 2. If permission is already granted, silently synchronize the FCM device token with the backend.
 * 3. Does NOT force native permission prompts on page load or clicks, allowing the soft prompt to guide the user.
 */
export function initNativeNotificationPrompt(overrideRole?: string): () => void {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return () => {};
  }

  // Pre-initialize Firebase client in the background
  initFirebaseClient().catch(() => {});

  // If already granted, perform silent token verification/resync in background
  if (Notification.permission === 'granted') {
    syncFcmTokenSilently(overrideRole).catch(() => {});
  }

  return () => {};
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
        await sub.unsubscribe().catch(() => {});
      }
      await unregisterFcmDeviceToken().catch(() => {});
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
