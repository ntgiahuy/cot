import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 43123,
  },
  optimizeDeps: {
    include: ['pdf-lib', '@pdf-lib/fontkit'],
  },
  build: {
    outDir: 'docs',
    emptyOutDir: true,
  },
})
