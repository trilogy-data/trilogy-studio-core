import { defineConfig } from 'vite'

// Classic Prism component build: a single self-contained IIFE that attaches to
// the global `Prism`, for <script> tags, prism-autoloader and CDN use. Nothing
// is external here -- there is no module system to resolve `prismjs` through,
// and the grammar itself needs no Prism code, only the global object.
export default defineConfig({
  build: {
    emptyOutDir: false,
    lib: {
      entry: 'src/component.ts',
      formats: ['iife'],
      name: 'PrismTrilogy',
      fileName: () => 'prism-trilogy.js',
    },
  },
})
