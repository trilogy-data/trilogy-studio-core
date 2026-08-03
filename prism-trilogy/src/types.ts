/**
 * A structural subset of Prism's own types. Declared locally rather than
 * imported from `@types/prismjs` so that this package -- and the `.d.ts` it
 * emits -- has no type-level dependency on anything.
 */

export interface GrammarToken {
  pattern: RegExp
  lookbehind?: boolean
  greedy?: boolean
  alias?: string | string[]
  inside?: Grammar
}

export interface Grammar {
  [token: string]: RegExp | GrammarToken | Array<RegExp | GrammarToken> | Grammar | undefined
}

/**
 * The surface of the Prism global this package touches.
 *
 * `languages` is intentionally loose. Prism's own `Languages` type is invariant
 * enough that a stricter signature here (`Record<string, Grammar>`) rejects the
 * real `Prism` object, which would force every caller into a cast.
 */
export interface PrismLike {
  languages: Record<string, unknown>
}
