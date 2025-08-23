import { defineConfig } from 'vite';

export default defineConfig({
  base: '/file-browser',  // MUST match the URL subpath
  server: {
    host: '0.0.0.0',
    port: 5173,
    hmr: {
      clientPort: 443,
      protocol: 'wss',
      host: 'workspaces.etdofresh.com',
      path: '/file-browser/@vite'  // WebSocket path for HMR
    },
    watch: {
      usePolling: true,  // Required for Docker
      interval: 1000
    },
    allowedHosts: [
      'localhost',
      'file-browser',
      'workspaces.etdofresh.com',
      '.etdofresh.com'
    ]
  }
});