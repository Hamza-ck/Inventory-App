import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// Keep the build config aligned with declared dependencies. The previous
// Inventory Scan PWA plugin/manifest was stale and the plugin is not a
// declared dependency of this accounting application.
export default defineConfig({
  plugins: [react(), tailwindcss()],
})
