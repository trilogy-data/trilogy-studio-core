import { defineConfig } from 'vite'
// import { resolve } from 'path'
import vue from '@vitejs/plugin-vue'
import dts from 'vite-plugin-dts'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import prism from 'vite-plugin-prismjs'
import { resolve } from 'node:path'
import { visualizer } from 'rollup-plugin-visualizer'
// https://vite.dev/config/
export default defineConfig({
  assetsInclude: ['**/*.wasm'],
  define: {
    'import.meta.env.VITE_DUCKDB_BUNDLED': JSON.stringify('true'),
    'import.meta.env.VITE_DISABLE_TIPS_DEFAULT': JSON.stringify('true'),
    'import.meta.env.VITE_RESOLVER_URL': JSON.stringify('/api'),
  },
  server: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'unsafe-none',
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    },
  },
  plugins: [
    vue(),
    visualizer({
      filename: 'dist/stats.html',
      open: true,
      gzipSize: true,
    }),
    // nodePolyfills({ include: ['events'] }),
    dts({ include: ['lib'] }),
    // nodePolyfills({ include: ['events', 'dns', 'stream', 'crypto'] }),
    nodePolyfills({ include: ['crypto', 'stream'], exclude: ['prismjs'] }),
    prism({
      // Keep this in sync with the root vite.config.ts: `languages` MUST stay
      // empty. babel-plugin-prismjs rewrites every `import Prism from 'prismjs'`
      // into a core import plus an eager, static side-effect import of each
      // language listed here, in every file that imports Prism.
      //
      // prismjs core is CommonJS, so it gets wrapped in a lazy factory while the
      // injected language import is plain ESM that evaluates eagerly. The
      // language component is a bare script that reads a global `Prism` the core
      // hasn't defined yet, so it throws `ReferenceError: Prism is not defined`
      // at module scope — which aborts main.ts before Vue mounts and leaves the
      // whole app stuck on the loading screen.
      //
      // Languages are loaded dynamically, after the core is guaranteed
      // evaluated, by ensurePrismLanguagesReady() in lib/utility/prism.ts.
      languages: [],
      plugins: ['line-numbers'],
      theme: 'default',
      css: true,
    }),
    {
      name: 'configure-response-headers',
      configureServer: (server) => {
        server.middlewares.use((_req, res, next) => {
          res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none')
          res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups')
          next()
        })
      },
    },
  ],
  resolve: {
    dedupe: ['vue', 'pinia'],
    alias: {
      buffer: 'buffer/', // buffer requires /
    },
  },
  build: {
    copyPublicDir: true,

    // if we ever want a build
    // lib: {
    //   entry: resolve(__dirname, 'lib/main.ts'),
    //   formats: ['es']
    // },
    // for when we turn this into a module
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
      // treeshake: {
      //   //@ts-ignore
      //   moduleSideEffects: (id) => {
      //     if (id.includes('monaco-editor')) {
      //       console.log('Monaco module:', id)
      //       return false // Force no side effects
      //     }
      //     return 'no-external'
      //   },
      // },
      external: ['prismjs'],
    },
  },
  // Prevent Vite from optimizing DuckDB WASM during development
  optimizeDeps: {
    exclude: ['@duckdb/duckdb-wasm'],
  },
  // Worker configuration for DuckDB
  worker: {
    format: 'es',
    plugins: () => [nodePolyfills({ include: ['crypto', 'stream'] })],
  },
  base: '/trilogy-studio-core/',
  css: {
    preprocessorOptions: {
      scss: {
        additionalData: `@import "tabulator-tables/dist/css/tabulator.min.css"; @import "tabulator-tables/dist/css/tabulator_midnight.css";`,
      },
    },
  },
})
