import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'node:path'

// Explorer reuses lib/ source directly via a path alias.
// This mirrors how studio works (relative imports into ../lib),
// and avoids requiring lib to be built before explorer can run.
//
// Principle: never fork lib code; import from lib by path.
export default defineConfig({
  plugins: [vue()],
  resolve: {
    dedupe: ['vue', 'pinia'],
    alias: {
      '@lib': resolve(__dirname, '../lib'),
    },
  },
  server: {
    port: 5174,
  },
})
