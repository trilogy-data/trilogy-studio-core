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
      rollupTypes: false,
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
      external: ['vue', 'pinia', '@motherduck/wasm-client', 'sql.js'],
      output: {
        globals: {
          vue: 'Vue',
          pinia: 'Pinia',
        },
      },
    },
  },
})
