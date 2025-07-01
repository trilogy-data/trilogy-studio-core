import { defineConfig } from 'vitest/config'

import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    exclude: [
      'e2e/**', // Exclude Playwright tests
      '**/node_modules/**',
      '**/dist/**',
    ],
  },
})
