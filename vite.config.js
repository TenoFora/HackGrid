import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Forward API calls to the Express server (npm run api) so the
    // frontend can use relative /api URLs in development.
    proxy: {
      '/api': 'http://localhost:5000',
    },
  },
})
