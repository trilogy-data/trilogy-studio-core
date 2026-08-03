/**
 * Classic Prism component build, for `<script>` tags and prism-autoloader:
 *
 *   <script src="prism.js"></script>
 *   <script src="prism-trilogy.min.js"></script>
 *
 * Attaches to the global `Prism` the way the bundled components in
 * `prismjs/components/` do. No-ops if Prism has not loaded yet, rather than
 * throwing at module scope and taking the page down with it.
 */
import { registerTrilogy } from './grammar'
import type { PrismLike } from './types'

const globalPrism = (globalThis as { Prism?: Partial<PrismLike> }).Prism

if (globalPrism?.languages) {
  registerTrilogy(globalPrism as PrismLike)
} else if (typeof console !== 'undefined') {
  console.warn('[prism-trilogy] Prism was not found on the global scope; grammar not registered.')
}
