import { defineConfig } from 'vite';

export default defineConfig({
  base: '/admin/',
  server: {
    host: '0.0.0.0',
    hmr: {
      clientPort: 443,
      protocol: 'wss',
      host: 'workspaces.etdofresh.com',
      path: '/admin/@vite'
    },
    // Watch options for Docker environments
    watch: {
      usePolling: true,
      interval: 1000
    },
    // Allow requests from these hosts
    allowedHosts: [
      'localhost',
      'admin',
      'workspaces.etdofresh.com',
      '.etdofresh.com'
    ]
  },
  appType: 'mpa', // Multi-page app mode - don't serve index.html for all routes
});