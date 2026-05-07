import express from 'express'
import { createProxyMiddleware } from 'express-http-proxy'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = 3000

// Proxy /api requests to API service
app.use(
  '/api',
  createProxyMiddleware({
    target: 'http://api:3001',
    changeOrigin: true,
    pathRewrite: {
      '^/api': '/api', // Keep /api in path
    },
    onError: (err, req, res) => {
      console.error('Proxy error:', err)
      res.status(502).json({ error: 'API service unavailable' })
    },
  })
)

// Serve static files
app.use(express.static(join(__dirname, 'dist')))

// Fallback to index.html for SPA routing
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'))
})

app.listen(PORT, () => {
  console.log(`Web server listening on port ${PORT}`)
})
