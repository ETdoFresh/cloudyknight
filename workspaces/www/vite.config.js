import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Custom plugin to handle 404 errors
const handle404Plugin = () => {
  return {
    name: 'handle-404',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        // Skip Vite internal paths
        if (req.url.startsWith('/@') || 
            req.url.startsWith('/node_modules') ||
            req.url.startsWith('/__vite') ||
            req.url.includes('.hot-update')) {
          return next();
        }

        // Define valid workspace routes and static files
        const validRoutes = [
          '/',
          '/index.html',
          '/style.css',
          '/main.js',
          '/404.html',
          '/favicon.ico'
        ];

        // Extract the path without query strings or hash
        const urlPath = req.url.split('?')[0].split('#')[0];
        
        // Check if it's a valid route
        const isValidRoute = validRoutes.some(route => 
          urlPath === route || 
          urlPath === route + '/' ||
          (route !== '/' && urlPath.startsWith(route + '/'))
        );

        // Check for existing static files
        const publicPath = path.join(__dirname, 'public', urlPath);
        const rootPath = path.join(__dirname, urlPath.slice(1));
        const fileExists = fs.existsSync(publicPath) || fs.existsSync(rootPath);

        // If not a valid route and file doesn't exist, serve 404
        if (!isValidRoute && !fileExists) {
          const notFoundPath = path.join(__dirname, '404.html');
          if (fs.existsSync(notFoundPath)) {
            res.statusCode = 404;
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            const content = fs.readFileSync(notFoundPath, 'utf-8');
            res.end(content);
            return;
          }
        }

        next();
      });
    }
  };
};

export default defineConfig({
  server: {
    port: 5173,
    host: '0.0.0.0',
    hmr: {
      clientPort: 443,
      protocol: 'wss',
      host: 'workspaces.etdofresh.com'
    },
    watch: {
      usePolling: true,
      interval: 1000
    },
    // Allow requests from these hosts
    allowedHosts: [
      'localhost',
      'www',
      'workspaces.etdofresh.com',
      '.etdofresh.com'
    ]
  },
  plugins: [handle404Plugin()],
  // For production build, copy 404.html to dist
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        notfound: path.resolve(__dirname, '404.html')
      }
    }
  }
});