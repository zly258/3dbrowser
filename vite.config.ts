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
      plugins: [react({
        jsxRuntime: 'automatic'
      })],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      assetsInclude: ['**/*.wasm', '**/*.glb', '**/*.gltf', '**/*.fbx', '**/*.obj', '**/*.stl', '**/*.ifc', '**/*.nbim', '**/*.lmb', '**/*.lmbz', '**/*.stp', '**/*.step', '**/*.igs', '**/*.iges'],
      optimizeDeps: {
        exclude: ['web-ifc']
      },
      build: {
        target: 'esnext',
        minify: 'terser',
        lib: {
          entry: path.resolve(__dirname, 'src/index.ts'),
          name: 'ThreeDBrowser',
          fileName: (format) => `3dbrowser.${format}.js`,
          formats: ['es', 'umd']
        },
        rollupOptions: {
          external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'three'],
          output: {
            globals: {
              react: 'React',
              'react-dom': 'ReactDOM',
              three: 'THREE'
            },
            manualChunks: undefined // Library mode doesn't support manualChunks
          }
        }
      },
      define: {
        global: 'globalThis',
        'process.env': {}
      }
    };
});
