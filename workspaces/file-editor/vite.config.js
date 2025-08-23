import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  server: {
    host: '0.0.0.0',
    port: 5173,
    hmr: {
      clientPort: 443,
      protocol: 'wss',
      host: 'workspaces.etdofresh.com',
      path: '/@vite'
    },
    watch: {
      usePolling: true,
      interval: 1000
    },
    allowedHosts: [
      'localhost',
      'file-editor',
      'workspaces.etdofresh.com',
      '.etdofresh.com'
    ]
  }
});