import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    server: {
      port: 5173,
      // Proxy API calls to backend only in local dev
      // In production (Amplify), VITE_API_URL is set to App Runner URL
      proxy: !env.VITE_API_URL ? {
        '/inventory':    { target: 'http://localhost:8000', changeOrigin: true },
        '/recipe':       { target: 'http://localhost:8000', changeOrigin: true },
        '/user-recipes': { target: 'http://localhost:8000', changeOrigin: true },
        '/me':           { target: 'http://localhost:8000', changeOrigin: true },
        '/health':       { target: 'http://localhost:8000', changeOrigin: true },
      } : {},
    },
  }
})
