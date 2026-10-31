import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');

const packageJson = JSON.parse(
  readFileSync(resolve(__dirname, 'package.json'), 'utf-8')
) as { version?: string };
const appVersion = packageJson.version ?? '0.0.0';

export default defineConfig(({ mode }) => {
    const isPages = mode === 'pages';
    return {
      base: isPages ? (process.env.VITE_BASE_PATH || '/3dbrowser/') : './',
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
      build: isPages ? {
        target: 'esnext',
        outDir: 'dist-pages',
        emptyOutDir: true,
        chunkSizeWarningLimit: 2000,
      } : {
        target: 'esnext',
        minify: 'esbuild' as const,
        chunkSizeWarningLimit: 1200,
        lib: {
          entry: resolve(__dirname, 'src/index.ts'),
          name: 'ThreeBrowser',
          fileName: '3dbrowser',
          formats: ['es']
        },
        rollupOptions: {
          external: [
            'react',
            'react-dom',
            'react-dom/client',
            'react/jsx-runtime',
            /^three/,
            'occt-import-js',
            'web-ifc'
          ],
          output: {
            inlineDynamicImports: false,
            manualChunks: (id) => {
              if (id.includes('three/examples/jsm/loaders/')) {
                  const name = id.split('/').pop()?.replace('.js', '').toLowerCase();
                  return `loaders-${name}`;
              }
              if (id.includes('src/loader/')) {
                if (id.includes('ifcLoader')) return 'ifcLoader';
                if (id.includes('occtLoader')) return 'occtLoader';
                if (id.includes('lmbLoader')) return 'lmbLoader';
              }
              if (id.includes('src/utils/')) {
                return 'utils';
              }
              return null;
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
