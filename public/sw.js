// Unorthodox Athletes — Service Worker
// Handles push notifications

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let title = 'Unorthodox Athletes';
  let body = '📬 Έχεις νέο μήνυμα — Άνοιξε την εφαρμογή.';
  let tag = 'ua-notification';
  let pushData = null;

  if (event.data) {
    try {
      const d = event.data.json();
      pushData = d;
      if (d.title) title = d.title;
      if (d.body) body = d.body;
      if (d.tag) tag = d.tag;
    } catch (e) {
      body = event.data.text() || body;
    }
  }

  // Notify any open app windows so the bell badge updates immediately
  if (pushData) {
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clients => clients.forEach(c => c.postMessage({ type: 'UA_PUSH', ...pushData })));
  }

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag,
      renotify: true,
      vibrate: [200, 100, 200],
      data: { url: '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if ('focus' in client) {
            client.focus();
            if (client.navigate) client.navigate(targetUrl);
            return;
          }
        }
        if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
      })
  );
});
