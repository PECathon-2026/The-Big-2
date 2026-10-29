/* Tsukuyomi Watch service worker: shows Web Push alerts such as "The Moon rises tonight at 20:14". */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = { title: 'Tsukuyomi Watch', body: '' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    if (event.data) data.body = event.data.text();
  }
  const options = {
    body: data.body,
    tag: data.event_id || `alert-${data.alert_id || Date.now()}`,
    data: { url: data.url || '/' },
    icon: '/moon.svg',
    badge: '/moon.svg',
    lang: 'en',
  };
  event.waitUntil(self.registration.showNotification(data.title || 'Tsukuyomi Watch', options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) return c.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
