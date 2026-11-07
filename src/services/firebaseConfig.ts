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
 * Requests notification permission from user, registers Service Worker,
 * retrieves FCM device token, and persists it to backend database.
 */
export async function requestFcmDeviceToken(overrideRole?: string): Promise<{
  success: boolean;
  token?: string;
  error?: string;
  permission?: NotificationPermission;
}> {
  if (typeof window === 'undefined') {
    return { success: false, error: 'Notifications are only available in a browser environment.' };
  }

  if (!('Notification' in window)) {
    return { success: false, error: 'Push notifications are not supported by this browser.' };
  }

  try {
    // 1. Request browser permission
    let permission = Notification.permission;
    if (permission !== 'granted') {
      permission = await Notification.requestPermission();
    }

    if (permission !== 'granted') {
      return {
        success: false,
        permission,
        error: permission === 'denied'
          ? 'Notification permission was denied. Please enable notifications in your browser or device settings.'
          : 'Notification permission request was dismissed.',
      };
    }

    // 2. Initialize Firebase client
    const { messaging } = await initFirebaseClient();
    if (!messaging) {
      return {
        success: false,
        error: 'Firebase Cloud Messaging is not yet configured in SuperAdmin settings. Please enter FCM credentials.',
      };
    }

    // 3. Register or locate the Service Worker
    let swReg: ServiceWorkerRegistration | undefined;
    if ('serviceWorker' in navigator) {
      swReg = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js');
      if (!swReg) {
        swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
      }
      await navigator.serviceWorker.ready;
    }

    if (!swReg) {
      return { success: false, error: 'Service Worker could not be registered for push messages.' };
    }

    // 4. Get FCM Token using optional VAPID certificate key
    const config = await fetchFcmConfig();
    const vapidKey = config?.vapidKey || undefined;

    const token = await getToken(messaging, {
      serviceWorkerRegistration: swReg,
      vapidKey: vapidKey || undefined,
    });

    if (!token) {
      return { success: false, error: 'Failed to generate Firebase device push token.' };
    }

    // 5. Send token to backend
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
    localStorage.setItem('pos_push_notifications_enabled', 'true');

    return {
      success: true,
      token,
      permission: 'granted',
    };
  } catch (err: any) {
    console.error('[firebaseConfig] Exception in requestFcmDeviceToken:', err);
    return {
      success: false,
      error: err?.message || 'Failed to request notification permission.',
    };
  }
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
  return true;
}

export function getStoredFcmToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('pos_fcm_token');
}
