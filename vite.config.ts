import { defineConfig } from 'vite'
// import { resolve } from 'path'
import vue from '@vitejs/plugin-vue'
import dts from 'vite-plugin-dts'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import prism from 'vite-plugin-prismjs'

import { resolve } from 'node:path'
// https://vite.dev/config/
export default defineConfig({
  server: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    },
  },
  plugins: [
    vue(),
    // nodePolyfills({ include: ['events'] }),
    dts({ include: ['lib'] }),
    nodePolyfills({ include: ['events', 'dns', 'stream', 'crypto'] }),
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
          res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
          res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups')
          next()
        })
      },
    },
  ],
  define: {
    global: 'window',
    '__IS_VITE__': true
  },
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
      // external: ['vue'],
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
