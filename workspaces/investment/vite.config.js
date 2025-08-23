import { defineConfig } from 'vite'

export default defineConfig({
  base: '/investment',
  server: {
    port: 5173,
    host: '0.0.0.0',
    hmr: {
      clientPort: 443,
      protocol: 'wss',
      host: 'workspaces.etdofresh.com',
      path: '/investment/@vite'
    },
    watch: {
      usePolling: true,
      interval: 1000
    },
    allowedHosts: [
      'localhost',
      'investment',
      'workspaces.etdofresh.com',
      '.etdofresh.com'
    ]
  }
})