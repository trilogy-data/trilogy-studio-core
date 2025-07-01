import { defineConfig } from 'vitest/config'

import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'jsdom', // or 'happy-dom'
    // other test config

    exclude: [
      'e2e/**', // Exclude Playwright tests
      '**/node_modules/**',
      '**/dist/**',
    ],
  },
})
