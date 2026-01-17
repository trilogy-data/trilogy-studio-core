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
      rollupTypes: true,
    }),
    nodePolyfills({ include: ['crypto', 'stream'] }) as PluginOption,
  ],
  build: {
    lib: {
      entry: 'main.ts',
      name: 'TrilogyStudioComponents',
      fileName: 'main',
    },
    rollupOptions: {
      external: ['vue', 'pinia', '@motherduck/wasm-client'],
      output: {
        globals: {
          vue: 'Vue',
          pinia: 'Pinia',
        },
      },
    },
  },
})
