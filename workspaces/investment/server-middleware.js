export default function redirectMiddleware() {
  return {
    name: 'redirect-middleware',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        // Since Traefik strips /investment, we never see it
        // But if someone accesses without trailing slash, Vite might not handle it
        // This is mainly for local development
        if (req.url === '/investment') {
          res.writeHead(301, { Location: '/investment/' })
          res.end()
          return
        }
        next()
      })
    }
  }
}