import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    return {
      base: './',
      server: {
        port: 5173,
        host: '0.0.0.0',
        fs: {
          allow: ['..']
        }
      },
      plugins: [react()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      assetsInclude: ['**/*.wasm'],
      optimizeDeps: {
        exclude: ['web-ifc']
      },
      build: {
        target: 'esnext',
        minify: 'terser',
        rollupOptions: {
          output: {
            manualChunks: {
              'vendor-three': ['three'],
              'vendor-ifc': ['web-ifc'],
              'vendor-ui': ['react', 'react-dom', 'lucide-react'],
            }
          }
        }
      },
      define: {
        global: 'globalThis'
      }
    };
});
