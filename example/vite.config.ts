import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      '@zhangly1403/3dbrowser': path.resolve(__dirname, './3dbrowser-lib')
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false
  }
})
