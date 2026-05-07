import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // selfDestroying unregisters any previously installed service worker and
      // clears its caches — fixing stale-SW "offline" issues for existing users.
      // The manifest is kept so the app remains installable, but no SW is
      // registered going forward (live data apps don't benefit from SW caching).
      selfDestroying: true,
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
