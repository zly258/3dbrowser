import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  base: './',
  root: path.resolve(__dirname, 'example'),
  publicDir: path.resolve(__dirname, 'public'), // 使用根目录的 public 包含 libs
  plugins: [react({
    jsxRuntime: 'classic'
  })],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    }
  },
  assetsInclude: ['**/*.wasm', '**/*.glb', '**/*.gltf', '**/*.fbx', '**/*.obj', '**/*.stl', '**/*.ifc', '**/*.nbim', '**/*.lmb', '**/*.lmbz', '**/*.stp', '**/*.step', '**/*.igs', '**/*.iges'],
  optimizeDeps: {
    exclude: ['web-ifc']
  },
  build: {
    outDir: path.resolve(__dirname, 'dist-example'),
    emptyOutDir: true,
    target: 'esnext',
    minify: 'terser',
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'example/index.html')
      }
    }
  },
  define: {
    global: 'globalThis',
    'process.env': {}
  }
});
