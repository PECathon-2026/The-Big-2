/* Dev-only service worker: push alerts. In production vite-plugin-pwa replaces this file with a Workbox
   worker (offline shell, catalogue, fonts, last API responses) that imports the same push handlers. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
importScripts('/push-sw.js');
