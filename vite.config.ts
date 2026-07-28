import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { cloudflare } from '@cloudflare/vite-plugin'

export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'test' ? [] : [cloudflare()])],
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
  },
}))
