/* eslint-disable no-undef */
// SarbaazSoft Shoe POS - Firebase Cloud Messaging Background Service Worker
importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js');

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

let messagingInitialized = false;

async function initFirebaseInWorker() {
  if (messagingInitialized) return;
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
        const icon = payload.notification?.icon || '/pwa-192x192.png';
        const tag = payload.data?.tag || `pos-${Date.now()}`;
        const url = payload.data?.url || '/pos';

        const notificationOptions = {
          body,
          icon,
          badge: '/pwa-192x192.png',
          tag,
          vibrate: [200, 100, 200],
          data: {
            url,
            ...payload.data,
          },
          actions: [
            { action: 'open_pos', title: 'Open POS' },
          ],
        };

        return self.registration.showNotification(title, notificationOptions);
      });
      messagingInitialized = true;
    }
  } catch (err) {
    // Non-fatal if config not yet saved in database
  }
}

// Background push event fallback if standard Web Push delivery is used
self.addEventListener('push', (event) => {
  if (!event.data) return;
  try {
    const data = event.data.json();
    const notification = data.notification || data;
    const title = notification.title || 'SarbaazSoft Shoe POS Alert';
    const options = {
      body: notification.body || 'New store transaction received.',
      icon: notification.icon || '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag: data.data?.tag || `fcm-${Date.now()}`,
      data: data.data || {},
      vibrate: [200, 100, 200],
    };
    event.waitUntil(self.registration.showNotification(title, options));
  } catch {
    const text = event.data.text();
    event.waitUntil(
      self.registration.showNotification('SarbaazSoft Shoe POS', {
        body: text,
        icon: '/pwa-192x192.png',
      })
    );
  }
});

// Notification click router to open or focus the target POS URL
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/pos';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url && 'focus' in client) {
          if (targetUrl && client.navigate) {
            client.navigate(targetUrl);
          }
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

initFirebaseInWorker();
