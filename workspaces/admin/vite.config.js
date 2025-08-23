import { defineConfig } from 'vite';

export default defineConfig({
  base: '/admin/',
  server: {
    host: '0.0.0.0',
    port: 3000,
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
    }
  },
  // Remove appType: 'mpa' to use default SPA behavior
  // This will serve index.html properly for the admin panel
});