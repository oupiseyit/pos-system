import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// host: true so the dev server is reachable from outside the Docker container.
// /api goes to the API: http://api:3000 in Docker (API_URL), localhost:3000 on the host.
export default defineConfig({
  plugins: [
    react(),
    // App shell precached so the till opens with no network (03 §5). Built output only; dev has no SW.
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        name: 'POS',
        short_name: 'POS',
        start_url: '/',
        display: 'standalone',
        background_color: '#f5f6f8',
        theme_color: '#0e6b4e',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg}'],
        navigateFallbackDenylist: [/^\/api\//],
        // Fonts from Google: cache on first use so receipts and screens look the same offline
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/,
            handler: 'CacheFirst',
            options: { cacheName: 'fonts', expiration: { maxEntries: 30 } },
          },
        ],
      },
    }),
  ],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    proxy: { '/api': process.env.API_URL ?? 'http://localhost:3000' },
  },
});
