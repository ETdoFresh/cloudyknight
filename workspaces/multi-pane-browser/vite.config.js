import { defineConfig } from 'vite';

export default defineConfig({
  base: '/multi-pane-browser',
  server: {
    host: '0.0.0.0',
    port: 5173,
    hmr: {
      clientPort: 443,
      protocol: 'wss',
      host: 'workspaces.etdofresh.com',
      path: '/multi-pane-browser/@vite'
    },
    watch: {
      usePolling: true,
      interval: 1000
    },
    allowedHosts: [
      'localhost',
      'multi-pane-browser',
      'workspaces.etdofresh.com',
      '.etdofresh.com'
    ]
  }
});