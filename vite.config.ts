import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const packageJson = JSON.parse(
  readFileSync(resolve(__dirname, 'package.json'), 'utf-8')
) as { version?: string };
const appVersion = packageJson.version ?? '0.0.0';

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
      assetsInclude: ['**/*.wasm', '**/*.glb', '**/*.gltf', '**/*.fbx', '**/*.obj', '**/*.mtl', '**/*.stl', '**/*.ifc', '**/*.nbim', '**/*.lmb', '**/*.lmbz', '**/*.stp', '**/*.step', '**/*.igs', '**/*.iges', '**/*.hdr', '**/*.exr', '**/*.ktx2'],
      optimizeDeps: {
        exclude: ['web-ifc', 'occt-import-js']
      },
      build: {
        target: 'esnext',
        minify: 'terser' as const,
        terserOptions: {
          compress: {
            drop_console: false,
            drop_debugger: true
          }
        },
        chunkSizeWarningLimit: 2000,
        lib: {
          entry: 'ThreeViewer.tsx',
          name: 'ThreeBrowser',
          fileName: '3dbrowser',
          formats: ['es'] as any
        },
        rollupOptions: {
          external: [
            'react',
            'react-dom',
            'react-dom/client',
            'react/jsx-runtime',
            'three',
            'occt-import-js',
            'web-ifc'
          ],
          output: {
            manualChunks: {
              'loaders': [
                'three/examples/jsm/loaders/GLTFLoader.js',
                'three/examples/jsm/loaders/FBXLoader.js',
                'three/examples/jsm/loaders/OBJLoader.js',
                'three/examples/jsm/loaders/MTLLoader.js',
                'three/examples/jsm/loaders/STLLoader.js',
                'three/examples/jsm/loaders/PLYLoader.js',
                'three/examples/jsm/loaders/3MFLoader.js',
                'three/examples/jsm/loaders/DRACOLoader.js',
                'three/examples/jsm/loaders/KTX2Loader.js',
                'three/examples/jsm/loaders/RGBELoader.js',
                'three/examples/jsm/exporters/GLTFExporter.js',
                'three/examples/jsm/controls/OrbitControls.js',
                'three/examples/jsm/utils/BufferGeometryUtils.js'
              ],
              'utils': [
                './src/utils/exportLMB.ts',
                './src/utils/exportGLB.ts',
                './src/utils/converter.ts',
                './src/utils/octree.ts'
              ]
            },
            globals: {
              react: 'React',
              'react-dom': 'ReactDOM',
              three: 'THREE'
            }
          }
        }
      },
      define: {
        global: 'globalThis',
        __APP_VERSION__: JSON.stringify(appVersion)
      }
    };
});
