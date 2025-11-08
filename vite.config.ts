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
      output: {
        manualChunks: (id) => {
          // Monaco Editor splitting
          // Monaco Editor fine-grained splitting
          if (id.includes('monaco-editor')) {
            // Core editor browser components (large)
            if (id.includes('/editor/browser/')) {
              return 'monaco-editor-browser'
            }

            // Editor contributions (features like find, folding, etc.)
            if (id.includes('/editor/contrib/')) {
              return 'monaco-editor-contrib'
            }

            // Common editor utilities
            if (id.includes('/editor/common/')) {
              return 'monaco-editor-common'
            }

            // Standalone editor (main API)
            if (id.includes('/editor/standalone/')) {
              return 'monaco-editor-standalone'
            }

            // Platform services (large - DI, commands, etc.)
            if (id.includes('/platform/')) {
              return 'monaco-platform'
            }

            // Base services
            if (id.includes('/base/')) {
              return 'monaco-base'
            }

            // Language services
            if (id.includes('/language/') || id.includes('/basic-languages/')) {
              return 'monaco-languages'
            }

            // Workers
            if (id.includes('/worker/')) {
              return 'monaco-workers'
            }

            // Everything else monaco
            return 'monaco-core'
          }
        },
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
