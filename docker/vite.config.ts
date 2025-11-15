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
    nodePolyfills({ include: ['crypto', 'stream'] }),
    prism({
      languages: ['sql'],
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
