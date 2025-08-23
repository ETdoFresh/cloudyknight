import { defineConfig } from 'vite';

export default defineConfig({
  base: '/clock',
  server: {
    host: '0.0.0.0',
    port: 5173,
    hmr: {
      clientPort: 443,
      protocol: 'wss',
      host: 'workspaces.etdofresh.com',
      path: '/clock/@vite'
    },
    watch: {
      usePolling: true,
      interval: 1000
    },
    // Allow requests from these hosts
    allowedHosts: [
      'localhost',
      'clock',
      'workspaces.etdofresh.com',
      '.etdofresh.com'
    ]
  }
});