import path from "path"
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'generateSW',
      manifest: false, // usa public/manifest.json existente
      workbox: {
        // Service worker novo assume controle imediato + limpa caches velhos.
        // Evita o cenário clássico de usuário preso com bundle antigo após deploy.
        clientsClaim: true,
        skipWaiting: true,
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024, // 8 MB — bundle principal excede o default de 2 MB
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackAllowlist: [/^\/v\//],
        // NUNCA cachear auth/RPCs do Supabase ou assets com hash — evita servir
        // bundle velho quando o HTML novo já aponta pra hash novo.
        navigateFallbackDenylist: [/^\/api\//, /\/auth\//, /\.supabase\.co/],
        runtimeCaching: [
          {
            // Voucher PDFs do Supabase Storage — cache longo
            urlPattern: /\.supabase\.co\/storage\/v1\/object\/.+\.(pdf|PDF)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'voucher-pdfs',
              expiration: { maxEntries: 50, maxAgeSeconds: 30 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Imagens de capa do Supabase Storage — cache longo
            urlPattern: /\.supabase\.co\/storage\/v1\/object\/.+\.(png|jpg|jpeg|webp|avif)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'viagem-images',
              expiration: { maxEntries: 100, maxAgeSeconds: 30 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Assets estáticos (JS, CSS hashados) — rede primeiro com timeout curto.
            // NetworkFirst previne o cenário de servir bundle antigo incompatível
            // com o HTML novo pós-deploy. StaleWhileRevalidate anterior causava
            // "Processando..." travado porque browser recebia JS com hash obsoleto.
            urlPattern: /\.(?:js|css)$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'static-assets',
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 60, maxAgeSeconds: 7 * 24 * 60 * 60 },
            },
          },
          {
            // RPCs do Supabase — network first com fallback cache
            urlPattern: /\.supabase\.co\/rest\/v1\/rpc\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-rpc',
              expiration: { maxEntries: 30, maxAgeSeconds: 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
              networkTimeoutSeconds: 5,
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5714,
    host: true
  },
})
