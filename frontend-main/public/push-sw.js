/* Tsukuyomi Watch — Web Push handlers (from frontend-basic/public/sw.js). Imported by the service worker:
   in dev by public/sw.js, in production by the Workbox worker vite-plugin-pwa generates at /sw.js. */
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
    icon: '/icons/icon-192.png',
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
