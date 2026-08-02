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
  server: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'unsafe-none',
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    },
  },
  define: {
    // 'false' routes DuckDB through jsDelivr at runtime, which is deliberate:
    // our static host is too slow to serve the 73MB of wasm itself. The e2e
    // suite exercises this same path and caches the CDN response to disk (see
    // cacheDuckDBCdn in e2e/test-helpers.js) so a throttled runner can't turn
    // an 8MB fetch per connection into a hang.
    'import.meta.env.VITE_DUCKDB_BUNDLED': JSON.stringify('false'),
    'import.meta.env.VITE_DISABLE_TIPS_DEFAULT': JSON.stringify('false'),
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
      // `languages` MUST stay empty. babel-plugin-prismjs rewrites every
      // `import Prism from 'prismjs'` into a core import plus an eager, static
      // side-effect import of each language listed here — and it does that in
      // every file that imports Prism (lib/utility/prism.ts, Results.vue, ...).
      //
      // prismjs core is CommonJS, so rolldown wraps it in a lazy __commonJS
      // factory, while the injected language import is plain ESM that evaluates
      // eagerly. The language component is a bare script that reads a global
      // `Prism` the core hasn't defined yet, so it throws
      // `ReferenceError: Prism is not defined` at module scope — an uncaught
      // exception during boot that takes down the whole app shell. Whether it
      // fires depends on chunk evaluation order, which is why CI hit it and
      // local runs off the identical bundle did not.
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
  base: '/trilogy-studio-core/',
  css: {
    preprocessorOptions: {
      scss: {
        additionalData: `@import "tabulator-tables/dist/css/tabulator.min.css"; @import "tabulator-tables/dist/css/tabulator_midnight.css";`,
      },
    },
  },
})
