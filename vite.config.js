import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  // Project is deployed to https://kcicek.github.io/fxart/
  // so assets must be resolved under "/fxart/" rather than domain root.
  base: '/fxart/',
  build: {
    outDir: 'docs',
    emptyOutDir: true,
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'fxART',
        short_name: 'fxART',
        description: 'Function art canvas',
        theme_color: '#4f46e5',
        background_color: '#ffffff',
        display: 'standalone',
        // Ensure PWA scope/URLs work on a project page
        start_url: '/fxart/',
        scope: '/fxart/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
      },
      devOptions: {
        enabled: false
      }
    })
  ],
})
