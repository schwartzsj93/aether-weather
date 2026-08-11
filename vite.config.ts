import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Cache the app shell so it loads instantly and works offline.
      // API/weather calls are always network-first (live data).
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        runtimeCaching: [
          {
            // Weather, geocoding, and radar manifest — network first, fall back to cache
            urlPattern: /^https:\/\/(api\.open-meteo\.com|geocoding-api\.open-meteo\.com|api\.rainviewer\.com)/,
            handler: 'NetworkFirst',
            options: { cacheName: 'weather-api', expiration: { maxAgeSeconds: 300 } },
          },
          {
            // Map tiles — cache first (tiles rarely change)
            urlPattern: /^https:\/\/.*\.(cartocdn\.com|basemaps\.cartocdn\.com|tilecache\.rainviewer\.com)/,
            handler: 'CacheFirst',
            options: { cacheName: 'map-tiles', expiration: { maxEntries: 500, maxAgeSeconds: 3600 } },
          },
        ],
      },
      manifest: {
        name: 'Aether Weather',
        short_name: 'Aether',
        description: 'Cinematic AI-powered weather intelligence.',
        theme_color: '#0b1020',
        background_color: '#05070f',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      // Forward /api/* to the deployed CloudFront → Lambda proxy so local dev
      // gets live AI briefings and Kalshi markets without a local Lambda.
      '/api': {
        target: 'https://dllow6zve33wp.cloudfront.net',
        changeOrigin: true,
        secure: true,
      },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          maplibre: ['maplibre-gl', 'react-map-gl'],
          deckgl: ['deck.gl'],
          motion: ['framer-motion'],
        },
      },
    },
  },
});
