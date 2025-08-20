import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    hmr: {
      clientPort: 443,
      protocol: 'wss',
      host: 'workspaces.etdofresh.com'
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