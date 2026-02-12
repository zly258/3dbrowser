import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => {
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
        chunkSizeWarningLimit: 1000, // 提高警告阈值到 1MB
        rollupOptions: {
          external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'three'],
          output: {
            // 设置输出文件名格式，便于分包
            chunkFileNames: 'assets/[name]-[hash].js',
            entryFileNames: '[name].js',
            assetFileNames: 'assets/[name]-[hash].[ext]',
            globals: {
              react: 'React',
              'react-dom': 'ReactDOM',
              three: 'THREE'
            },
            // 优化分包策略
            manualChunks(id) {
              if (id.includes('node_modules')) {
                // 将大型依赖项独立拆分
                if (id.includes('3d-tiles-renderer')) {
                  return 'vendor-3d-tiles';
                }
                // web-ifc 本身很大，且包含 wasm，保持独立
                if (id.includes('web-ifc')) {
                  return 'vendor-web-ifc';
                }
                if (id.includes('occt-import-js')) {
                  return 'vendor-occt';
                }
                if (id.includes('lucide-react')) {
                  return 'vendor-icons';
                }
                if (id.includes('pako')) {
                  return 'vendor-utils';
                }
                // 其他第三方库
                return 'vendor';
              }
              // 按照功能模块拆分业务代码
              if (id.includes('src/loader/')) {
                return 'module-loaders';
              }
              if (id.includes('src/components/')) {
                return 'module-components';
              }
              if (id.includes('src/utils/')) {
                return 'module-utils';
              }
            }
          }
        }
      },
      define: {
        global: 'globalThis',
        'process.env': {}
      }
    };
});
