/**
 * Side-effect-free entry point. Importing this registers nothing; call
 * `registerTrilogy(Prism)` with your own Prism instance, or import
 * `@trilogy-data/prism-trilogy/register` to have it done for you.
 */
export { trilogyGrammar, registerTrilogy } from './grammar'
export type { Grammar, GrammarToken, PrismLike } from './types'
export * from './vocabulary'
