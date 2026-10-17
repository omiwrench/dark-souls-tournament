import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const serverUrl = 'http://127.0.0.1:3000'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': serverUrl,
      '/ws': { target: serverUrl, ws: true },
    },
  },
})
