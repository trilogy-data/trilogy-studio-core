import { defineConfig, type PluginOption } from 'vite'
import vue from '@vitejs/plugin-vue'
import dts from 'vite-plugin-dts'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  plugins: [
    vue(),
    dts({
      insertTypesEntry: true,
      exclude: ['**/*.test.ts', '**/*.spec.ts'],
      bundleTypes: false,
    }),
    nodePolyfills({ include: ['crypto', 'stream'] }) as PluginOption,
  ],
  build: {
    lib: {
      entry: {
        dashboard: 'entry.dashboard.ts',
        views: 'entry.views.ts',
        monaco: 'entry.monaco.ts',
        llm: 'entry.llm.ts',
        stores: 'entry.stores.ts',
        connections: 'entry.connections.ts',
        embed: 'entry.embed.ts',
      },
      formats: ['es'],
      fileName: (_, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      // prismjs is external because Prism keeps its grammars on a module-level
      // singleton: a bundled second copy would receive the trilogy grammar
      // while the host app highlights with its own, which shows up as silently
      // unhighlighted code rather than an error.
      // @trilogy-data/prism-trilogy is deliberately NOT external -- it is a few
      // kB of stateless data, so bundling it spares consumers an extra install.
      // The regex form also covers the `prismjs/components/prism-*` subpaths
      // that ensurePrismLanguagesReady() imports dynamically; a bare 'prismjs'
      // string only matches the exact specifier.
      external: [/^prismjs(\/.*)?$/, 'vue', 'pinia', '@motherduck/wasm-client', 'sql.js'],
      output: {
        globals: {
          vue: 'Vue',
          pinia: 'Pinia',
        },
      },
    },
  },
})
