import { defineConfig } from 'vite'
// import { resolve } from 'path'
import vue from '@vitejs/plugin-vue'
import dts from 'vite-plugin-dts'
import tailwindcss from '@tailwindcss/vite'
import {
  resolve
} from 'node:path'
// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(),
  dts({ include: ['lib'] }),
  tailwindcss(),
  {
    name: "configure-response-headers",
    configureServer: (server) => {
      server.middlewares.use((_req, res, next) => {
        res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
        res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
        next();
      });
    },
  },
  ],

  build: {
    copyPublicDir: false,

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
        additionalData: `@import "tabulator-tables/dist/css/tabulator.min.css"; @import "tabulator-tables/dist/css/tabulator_midnight.css";`
      }
    }
  }
})


