import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    exclude: [
      'e2e/**', // Exclude Playwright tests
      '**/node_modules/**',
      '**/dist/**',
    ],
  },
})
