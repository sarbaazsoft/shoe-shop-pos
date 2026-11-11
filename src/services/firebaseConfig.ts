import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getMessaging, getToken, onMessage, isSupported, type Messaging } from 'firebase/messaging';
import { api, getActiveTenantId } from './api.ts';
import { playAudioFeedback } from '../utils/audio.ts';

let cachedFirebaseApp: FirebaseApp | null = null;
let cachedMessaging: Messaging | null = null;
let cachedConfig: any = null;
let onMessageUnsubscribe: (() => void) | null = null;

export async function fetchFcmConfig() {
  if (cachedConfig) return cachedConfig;
  try {
    const config = await api.notifications.getFcmConfig();
    if (config && config.projectId && config.apiKey) {
      cachedConfig = config;
      return config;
    }
  } catch (err) {
    console.warn('[firebaseConfig] Could not fetch FCM config from server:', err);
  }
  return null;
}

export async function initFirebaseClient(): Promise<{ app: FirebaseApp | null; messaging: Messaging | null }> {
  if (typeof window === 'undefined') {
    return { app: null, messaging: null };
  }

  const supported = await isSupported().catch(() => false);
  if (!supported) {
    return { app: null, messaging: null };
  }

  if (cachedFirebaseApp && cachedMessaging) {
    return { app: cachedFirebaseApp, messaging: cachedMessaging };
  }

  const config = await fetchFcmConfig();
  if (!config || !config.apiKey || !config.projectId) {
    return { app: null, messaging: null };
  }

  try {
    let app: FirebaseApp;
    if (getApps().length > 0) {
      app = getApp();
    } else {
      app = initializeApp({
        apiKey: config.apiKey,
        projectId: config.projectId,
        messagingSenderId: config.messagingSenderId,
        appId: config.appId,
        measurementId: config.measurementId,
      });
    }

    const messaging = getMessaging(app);
    cachedFirebaseApp = app;
    cachedMessaging = messaging;

    // Attach foreground message listener once
    if (!onMessageUnsubscribe) {
      onMessageUnsubscribe = onMessage(messaging, (payload) => {
        console.log('🔔 [FCM] Foreground message received:', payload);
        const title = payload.notification?.title || payload.data?.title || 'POS Notification';
        const body = payload.notification?.body || payload.data?.body || 'New operational activity';
        const deepLinkUrl = payload.data?.url || '/pos';

        // Play alert audio chime
        playAudioFeedback.success();

        // Show browser notification if permitted
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          try {
            const notif = new Notification(title, {
              body,
              icon: '/pwa-192x192.png',
              badge: '/pwa-192x192.png',
              tag: payload.data?.tag || `fcm-fg-${Date.now()}`,
              data: { url: deepLinkUrl },
            });
            notif.onclick = () => {
              window.focus();
              if (window.location.pathname !== deepLinkUrl) {
                window.location.href = deepLinkUrl;
              }
              notif.close();
            };
          } catch {
            // Some mobile browsers restrict new Notification() in foreground; ServiceWorker handles background
          }
        }
      });
    }

    return { app, messaging };
  } catch (err) {
    console.warn('[firebaseConfig] Error initializing Firebase client:', err);
    return { app: null, messaging: null };
  }
}

/**
 * Core background token acquisition and database sync.
 * Assumes Notification.permission is 'granted' or already established.
 * Fetches the FCM device token and persists it to backend without requesting UI permission.
 */
export async function acquireAndSyncFcmToken(overrideRole?: string): Promise<{
  success: boolean;
  token?: string;
  error?: string;
  warning?: string;
  mode?: 'fcm' | 'realtime';
}> {
  if (typeof window === 'undefined') {
    return { success: false, error: 'Notifications are only available in a browser environment.' };
  }

  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return { success: false, error: 'Notification permission is not granted on this device.' };
  }

  try {
    // 1. Initialize Firebase client
    const { messaging } = await initFirebaseClient();
    if (!messaging) {
      return {
        success: false,
        error: 'Firebase Cloud Messaging is not yet configured in SuperAdmin settings. Please enter FCM credentials.',
      };
    }

    // 2. Ensure Service Worker is registered AND active
    let activeSwReg: ServiceWorkerRegistration | undefined;
    if ('serviceWorker' in navigator) {
      try {
        // First check existing registration
        let reg = await navigator.serviceWorker.getRegistration();
        if (!reg) {
          reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        }

        // If a waiting worker exists, tell it to activate immediately
        if (reg?.waiting) {
          try {
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          } catch {}
        }

        // Await navigator.serviceWorker.ready to guarantee active worker state
        const readyReg = await Promise.race([
          navigator.serviceWorker.ready,
          new Promise<ServiceWorkerRegistration | null>((resolve) => setTimeout(() => resolve(null), 3000)),
        ]);
        if (readyReg?.active) {
          reg = readyReg;
        }

        // If worker is still installing or waiting, wait for it to transition to activated
        if (reg && (!reg.active || reg.active.state !== 'activated')) {
          await new Promise<void>((resolve) => {
            if (reg?.active && reg.active.state === 'activated') return resolve();
            const timer = setTimeout(resolve, 2500);
            const worker = reg?.installing || reg?.waiting;
            if (worker) {
              worker.addEventListener('statechange', (e: any) => {
                if (e.target?.state === 'activated' || reg?.active?.state === 'activated') {
                  clearTimeout(timer);
                  resolve();
                }
              });
            }
          });
        }

        // Re-check active state on the registration
        if (reg?.active) {
          activeSwReg = reg;
        } else {
          const freshReg = await navigator.serviceWorker.getRegistration();
          if (freshReg?.active) {
            activeSwReg = freshReg;
          }
        }
      } catch (swErr) {
        console.warn('[firebaseConfig] Service worker readiness notice:', swErr);
      }
    }

    // 3. Attempt FCM Token acquisition if messaging client is initialized
    let token: string | undefined;
    if (messaging) {
      try {
        const config = await fetchFcmConfig();
        const rawVapid = config?.vapidKey?.trim();
        const vapidKey = rawVapid && !rawVapid.includes('@') && rawVapid.length > 30 ? rawVapid : undefined;

        // ONLY pass serviceWorkerRegistration if we have a verified active worker.
        // Passing an inactive registration causes Firebase to throw 'Failed to register user. No service workers.'
        if (activeSwReg?.active) {
          token = await getToken(messaging, {
            serviceWorkerRegistration: activeSwReg,
            vapidKey,
          });
        } else {
          // Attempt default token acquisition without passing an unconfirmed worker
          token = await getToken(messaging, { vapidKey });
        }
      } catch (fcmErr) {
        console.warn('[firebaseConfig] Background push token notice (activating real-time alert stream fallback):', fcmErr);
      }
    }

    // 4. Send token to backend if obtained
    if (token) {
      let userRole = overrideRole || 'ADMIN';
      let tenantId = getActiveTenantId() || 1;
      let userId = 0;
      try {
        const stored = localStorage.getItem('pos_current_user');
        if (stored) {
          const u = JSON.parse(stored);
          if (u.role) userRole = String(u.role).toUpperCase();
          if (u.tenantId || u.tenant_id) tenantId = Number(u.tenantId || u.tenant_id);
          if (u.id) userId = Number(u.id);
        }
      } catch {}

      const deviceName = `${navigator.userAgent.includes('Mobile') ? 'Mobile Device' : 'Desktop/Laptop'} (${navigator.platform || 'Web'})`;

      await api.notifications.registerFcmToken({
        token,
        tenantId,
        userId,
        userRole,
        userAgent: navigator.userAgent,
        deviceName,
      });

      localStorage.setItem('pos_fcm_token', token);
    }

    // Mark notifications as enabled in localStorage and clear denial flag
    localStorage.setItem('pos_push_notifications_enabled', 'true');
    localStorage.removeItem('pos_push_permission_denied');

    // Notify other components that notification state updated
    window.dispatchEvent(
      new CustomEvent('pos:push-status-changed', {
        detail: { token, permission: 'granted', isSubscribed: true, mode: token ? 'fcm' : 'realtime' },
      })
    );

    return {
      success: true,
      token,
      mode: token ? 'fcm' : 'realtime',
      warning: !token
        ? 'Real-time desktop alerts are active! (Live counter & sales alerts will pop up while POS is open).'
        : undefined,
    };
  } catch (err: any) {
    console.error('[firebaseConfig] Exception in acquireAndSyncFcmToken:', err);
    // If notification permission was already granted by user, don't break - enable real-time notifications
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      localStorage.setItem('pos_push_notifications_enabled', 'true');
      localStorage.removeItem('pos_push_permission_denied');
      window.dispatchEvent(
        new CustomEvent('pos:push-status-changed', {
          detail: { permission: 'granted', isSubscribed: true, mode: 'realtime' },
        })
      );
      return {
        success: true,
        mode: 'realtime',
        warning: 'Real-time notifications are enabled! You will receive live desktop and counter alerts while POS is open.',
      };
    }
    return {
      success: false,
      error: err?.message || 'Failed to complete notification registration.',
    };
  }
}

/**
 * Silent background token sync for active sessions where permission was already granted.
 * Ensures the token remains valid and registered in the database without any UI disruption.
 */
export async function syncFcmTokenSilently(overrideRole?: string): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission !== 'granted') return false;
  if (localStorage.getItem('pos_push_notifications_enabled') === 'false') return false;

  try {
    const res = await acquireAndSyncFcmToken(overrideRole);
    return res.success;
  } catch {
    return false;
  }
}

/**
 * Two-step permission flow entrypoint:
 * Step 1: Explicitly requests browser/OS permission (triggered only by user intent).
 * Step 2: If granted, automatically calls acquireAndSyncFcmToken() to obtain and store the FCM token.
 * If denied: sets local denial flag and returns clean feedback for manual settings fallback.
 */
export async function requestFcmPermissionAndToken(overrideRole?: string): Promise<{
  success: boolean;
  token?: string;
  error?: string;
  warning?: string;
  mode?: 'fcm' | 'realtime';
  permission?: NotificationPermission;
}> {
  if (typeof window === 'undefined') {
    return { success: false, error: 'Notifications are only available in a browser environment.' };
  }

  if (!('Notification' in window)) {
    return { success: false, error: 'Push notifications are not supported by this browser.' };
  }

  try {
    // 1. Request browser/system notification permission
    let permission = Notification.permission;
    if (permission !== 'granted') {
      permission = await Notification.requestPermission();
    }

    if (permission !== 'granted') {
      if (permission === 'denied') {
        localStorage.setItem('pos_push_permission_denied', 'true');
        localStorage.setItem('pos_push_notifications_enabled', 'false');
      }
      window.dispatchEvent(
        new CustomEvent('pos:push-status-changed', {
          detail: { permission, isSubscribed: false },
        })
      );
      return {
        success: false,
        permission,
        error:
          permission === 'denied'
            ? 'Notifications are currently blocked by your browser settings. Please click the lock or site settings icon in your address bar to allow alerts.'
            : 'Notification permission request was dismissed.',
      };
    }

    // 2. Permission granted! Automatically acquire token and sync with backend
    const acquireRes = await acquireAndSyncFcmToken(overrideRole);
    return {
      success: acquireRes.success,
      token: acquireRes.token,
      permission: 'granted',
      mode: acquireRes.mode,
      warning: acquireRes.warning,
      error: acquireRes.error,
    };
  } catch (err: any) {
    console.error('[firebaseConfig] Exception in requestFcmPermissionAndToken:', err);
    return {
      success: false,
      error: err?.message || 'Failed to request notification permission.',
    };
  }
}

/**
 * Alias for requestFcmPermissionAndToken for backwards compatibility with existing callers.
 */
export async function requestFcmDeviceToken(overrideRole?: string): Promise<{
  success: boolean;
  token?: string;
  error?: string;
  warning?: string;
  mode?: 'fcm' | 'realtime';
  permission?: NotificationPermission;
}> {
  return requestFcmPermissionAndToken(overrideRole);
}

/**
 * Unsubscribes and deletes the stored FCM token from the database.
 */
export async function unregisterFcmDeviceToken(): Promise<boolean> {
  const token = localStorage.getItem('pos_fcm_token');
  if (token) {
    try {
      await api.notifications.removeFcmToken(token);
    } catch {}
    localStorage.removeItem('pos_fcm_token');
  }
  localStorage.setItem('pos_push_notifications_enabled', 'false');
  window.dispatchEvent(
    new CustomEvent('pos:push-status-changed', {
      detail: { permission: typeof Notification !== 'undefined' ? Notification.permission : 'default', isSubscribed: false },
    })
  );
  return true;
}

export function getStoredFcmToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('pos_fcm_token');
}
