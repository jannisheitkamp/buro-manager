import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from "vite-tsconfig-paths";
import { VitePWA } from 'vite-plugin-pwa';

// https://vite.dev/config/
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        // Große Bibliotheken in eigene Dateien: bessere Zwischenspeicherung bei Updates
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
          charts: ['recharts'],
        },
      },
    },
  },
  plugins: [
    react({
      babel: {
        plugins: [
          'react-dev-locator',
        ],
      },
    }),
    tsconfigPaths(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      workbox: {
        maximumFileSizeToCacheInBytes: 3000000,
        // Push-Nachrichten (siehe public/push-handler.js)
        importScripts: ['push-handler.js'],
        // Edge-Functions und Kalender-Abo nie aus dem Cache bedienen
        navigateFallbackDenylist: [/^\/functions\//],
      },
      manifest: {
        name: 'Büro Manager',
        short_name: 'Büro',
        description: 'Team, Empfang, Anrufe und Produktion an einem Ort',
        lang: 'de',
        theme_color: '#146A68',
        background_color: '#F5F6F3',
        display: 'standalone', // No browser UI
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any'
          },
          {
            src: 'icon.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          }
        ]
      }
    })
  ],
})
