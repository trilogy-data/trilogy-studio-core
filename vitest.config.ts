import { defineConfig } from 'vitest/config'

import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    // Without dedupe, code under lib/ resolves lib/node_modules copies of
    // vue's internals while root code resolves the root copies. Mixing the
    // two silently breaks reactivity in tests: initial renders work but no
    // update ever re-renders (the reactive effect registries are separate).
    dedupe: [
      'vue',
      '@vue/runtime-dom',
      '@vue/runtime-core',
      '@vue/reactivity',
      '@vue/shared',
      '@vue/test-utils',
      'pinia',
    ],
  },
  test: {
    environment: 'jsdom',
    exclude: [
      'e2e/**', // Exclude Playwright tests
      '**/node_modules/**',
      '**/dist/**',
    ],
  },
})
