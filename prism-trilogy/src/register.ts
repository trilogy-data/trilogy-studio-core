/**
 * Side-effecting entry for ESM consumers:
 *
 *   import 'prismjs'
 *   import '@trilogy-data/prism-trilogy/register'
 *
 * Registers against the `prismjs` module resolved by the host bundler, which is
 * the instance the host's `Prism.highlight*` calls use -- provided prismjs is
 * deduped to a single copy.
 */
import Prism from 'prismjs'
import { registerTrilogy } from './grammar'

registerTrilogy(Prism)

export { trilogyGrammar, registerTrilogy } from './grammar'
