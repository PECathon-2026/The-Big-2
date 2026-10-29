import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // PWA (§10.7): offline shell, catalogue, fonts, Moon texture and the last API responses.
    // The generated worker is /sw.js (the path push.ts registers) and imports the Web Push handlers.
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'script-defer',
      filename: 'sw.js',
      includeAssets: ['favicon.svg', 'moon.svg', 'push-sw.js'],
      manifest: {
        name: 'Tsukuyomi Watch · 月読の見張り',
        short_name: '月読 Watch',
        description: 'Your real sky, tonight, where you stand.',
        theme_color: '#07090C',
        background_color: '#07090C',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        importScripts: ['/push-sw.js'],
        // shell + sky data + Moon texture; font subsets (hundreds of unicode-range files) are cached on first use
        globPatterns: ['**/*.{js,css,html,svg,webp,png}', 'data/sky/catalog.json', 'data/sky/mw.json'],
        // raw d3-celestial sources are build inputs only (scripts/build-sky.mjs)
        globIgnores: ['**/stars.6.json', '**/starnames.json', '**/constellations*.json', '**/messier.json', '**/dsos.bright.json', 'qa/**'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // the backend: fresh when online, last good response when offline (field mode on a hilltop)
            urlPattern: ({ url }) => url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/alerts'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api',
              networkTimeoutSeconds: 8,
              expiration: { maxEntries: 200, maxAgeSeconds: 3 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ url }) => url.pathname.endsWith('.woff2'),
            handler: 'CacheFirst',
            options: { cacheName: 'fonts', expiration: { maxEntries: 400, maxAgeSeconds: 365 * 24 * 3600 } },
          },
          {
            urlPattern: ({ url }) => /tile\.openstreetmap\.org$/.test(url.hostname),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'osm-tiles', expiration: { maxEntries: 400, maxAgeSeconds: 7 * 24 * 3600 } },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 3000, strictPort: true },
  preview: { port: 3000, strictPort: true },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1600,
  },
});
