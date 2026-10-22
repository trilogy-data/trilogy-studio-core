import { defineConfig } from 'vite'

// The `agent` entry is built in its own pass, after the main build. Sharing a
// build with the other entries lets the chunker fold modules they have in
// common — pinia stores among them — into the agent's chunk, and a consumer
// that only wanted providers + the tool loop inherits a pinia import. A
// separate pass sees only this entry's own import graph.
//
// Declarations come from the main build (`dist/entry.agent.d.ts`), so this
// pass emits JavaScript only and must not empty `dist`.
export default defineConfig({
  build: {
    emptyOutDir: false,
    lib: {
      entry: { agent: 'entry.agent.ts' },
      formats: ['es'],
      fileName: (_, entryName) => `${entryName}.js`,
    },
  },
})
