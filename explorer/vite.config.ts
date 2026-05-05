import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import { resolve } from 'node:path'

// Explorer reuses lib/ source directly via a path alias.
// This mirrors how studio works (relative imports into ../lib),
// and avoids requiring lib to be built before explorer can run.
//
// Principle: never fork lib code; import from lib by path.
export default defineConfig({
  plugins: [
    vue(),
    // Lib's connections (duckdb-wasm, sql.js) reference Node built-ins.
    // Same set studio uses; explicit excludes keep prismjs untouched.
    nodePolyfills({ include: ['crypto', 'stream'], exclude: ['prismjs'] }),
  ],
  define: {
    // Desktop app — bundle the duckdb-wasm assets locally rather than
    // pulling them from jsDelivr at runtime. Lib's connection code
    // checks this flag and uses Vite's `?url` imports for the bundled
    // path. No network needed for query exec, faster first connect.
    'import.meta.env.VITE_DUCKDB_BUNDLED': JSON.stringify('true'),
    'import.meta.env.VITE_DISABLE_TIPS_DEFAULT': JSON.stringify('false'),
  },
  resolve: {
    dedupe: ['vue', 'pinia'],
    alias: {
      '@lib': resolve(__dirname, '../lib'),
      buffer: 'buffer/',
    },
  },
  server: {
    // 5180 avoids the 5173/5174 default range studio dev servers use.
    // strictPort: fail loudly if something is on it rather than wander to a
    // new port the Tauri shell can't follow.
    port: 5180,
    strictPort: true,
    fs: {
      // Lib's duckdb-wasm `?url` imports resolve through pnpm to
      // ../lib/node_modules/.pnpm/..., which sits outside the explorer
      // project root. Without a workspace marker at the repo root,
      // Vite's default fs.allow refuses to serve those files.
      allow: [resolve(__dirname, '..')],
    },
    headers: {
      'Cross-Origin-Embedder-Policy': 'unsafe-none',
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    },
  },
})
