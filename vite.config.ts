import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// `npm run dev` and `npm run preview` forward /api to the news API so the page can use
// same-origin requests. Without a running API the feed shows as unavailable; the page still works.
const proxy = {
  '/api': { target: process.env.API_PROXY_TARGET || 'http://localhost:8080', changeOrigin: true },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: { proxy },
  preview: { proxy },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
