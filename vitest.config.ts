import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: [
      'tests/**', // Exclude Playwright tests
      '**/node_modules/**',
      '**/dist/**'
    ],
  },
});