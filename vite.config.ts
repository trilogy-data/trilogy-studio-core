import { defineConfig, mergeConfig, type UserConfig } from 'vite'
// import { resolve } from 'path'
import vue from '@vitejs/plugin-vue'
import dts from 'vite-plugin-dts'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import prism from 'vite-plugin-prismjs'

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { visualizer } from 'rollup-plugin-visualizer'

// https://vite.dev/config/
const studioConfig = defineConfig({
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

// `--mode haybarn` (pnpm dev:haybarn / build:haybarn) builds the same app on
// Query.Farm's Haybarn fork of duckdb-wasm, whose extension repository carries
// `vgi` -- what VGI-backed models need. Its API mirrors @duckdb/duckdb-wasm, so
// the swap is an import alias and nothing in lib branches on which one it got.
const HAYBARN_PACKAGE = '@haybarn/haybarn-wasm'

// index.html's CSP is shared, so the origins only this build talks to are
// appended here: the engine itself (unpkg), Haybarn's extension repository
// (`INSTALL vgi FROM community`), and the Query.Farm VGI servers the
// trilogy-public-models VGI models ATTACH.
const HAYBARN_CONNECT_SRC = [
  'https://unpkg.com',
  'https://haybarn-extensions.query.farm',
  'https://*.rusty-bb6.workers.dev',
]

// The worker JS and the wasm must be the same release, so the CDN root comes
// from the installed package rather than a second hard-coded version. unpkg,
// not jsDelivr: the package is over jsDelivr's 150MB limit and 403s there.
function haybarnConfig(): UserConfig {
  const { version } = JSON.parse(
    readFileSync(resolve(__dirname, 'node_modules', HAYBARN_PACKAGE, 'package.json'), 'utf8'),
  )
  return {
    define: {
      'import.meta.env.VITE_DUCKDB_CDN_BASE': JSON.stringify(
        `https://unpkg.com/${HAYBARN_PACKAGE}@${version}/dist/`,
      ),
    },
    // A string key also rewrites subpaths (`.../dist/duckdb-eh.wasm?url`).
    resolve: { alias: { '@duckdb/duckdb-wasm': HAYBARN_PACKAGE } },
    plugins: [
      {
        name: 'haybarn-csp',
        transformIndexHtml(html) {
          if (!html.includes('connect-src ')) {
            throw new Error('haybarn-csp: no connect-src directive in index.html')
          }
          return html.replace('connect-src ', `connect-src ${HAYBARN_CONNECT_SRC.join(' ')} `)
        },
      },
    ],
    base: '/trilogy-studio-core-haybarn/',
    // Own dep-optimizer cache, so switching modes (or running both dev servers
    // at once) doesn't re-bundle over the other mode's pre-bundled duckdb.
    cacheDir: 'node_modules/.vite-haybarn',
  }
}

export default defineConfig(({ mode }) =>
  mode === 'haybarn' ? mergeConfig(studioConfig, haybarnConfig()) : studioConfig,
)
