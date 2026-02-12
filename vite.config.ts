import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => {
    return {
      base: './',
      server: {
        port: 5173,
        host: '0.0.0.0'
      },
      plugins: [react({
        jsxRuntime: 'automatic'
      })],
      assetsInclude: ['**/*.wasm', '**/*.glb', '**/*.gltf', '**/*.fbx', '**/*.obj', '**/*.stl', '**/*.ifc', '**/*.nbim', '**/*.lmb', '**/*.lmbz', '**/*.stp', '**/*.step', '**/*.igs', '**/*.iges'],
      optimizeDeps: {
        exclude: ['web-ifc']
      },
      build: {
        target: 'esnext',
        minify: false,
        chunkSizeWarningLimit: 1000, // 提高警告阈值到 1MB
        lib: {
          entry: 'ThreeViewer.tsx',
          name: 'ThreeBrowser',
          fileName: '3dbrowser',
          formats: ['es']
        },
        rollupOptions: {
          external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'three'],
          output: {
            globals: {
              react: 'React',
              'react-dom': 'ReactDOM',
              three: 'THREE'
            }
          }
        }
      },
      define: {
        global: 'globalThis'
      }
    };
});
