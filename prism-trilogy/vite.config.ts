import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

// ESM build. `prismjs` stays external so the host app and this package share
// one Prism singleton -- bundling a second copy would register the grammar on
// an instance the host never highlights with.
export default defineConfig({
  plugins: [dts({ include: ['src'], exclude: ['src/**/*.test.ts'], insertTypesEntry: true })],
  build: {
    emptyOutDir: true,
    lib: {
      entry: {
        index: 'src/index.ts',
        register: 'src/register.ts',
        vocabulary: 'src/vocabulary.ts',
      },
      formats: ['es'],
      fileName: (_, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      external: ['prismjs'],
    },
  },
})
