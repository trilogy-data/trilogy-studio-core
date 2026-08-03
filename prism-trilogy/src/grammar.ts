import type { Grammar, PrismLike } from './types'
import {
  CONTEXTUAL_KEYWORD_PATTERNS,
  DATA_TYPES,
  FUNCTIONS,
  KEYWORDS,
  MODIFIERS,
  PURPOSES,
  WINDOW_FUNCTIONS,
  alternation,
  callPattern,
  wordBoundaryPattern,
} from './vocabulary'

/**
 * A standalone Prism grammar for Trilogy.
 *
 * Deliberately NOT derived from `Prism.languages.sql`. Trilogy's lexical rules
 * disagree with SQL's on exactly the things that matter most for reading a
 * file: comments open with `#` or `//` (SQL: `--` and block comments), `--` is
 * a select-item modifier rather than a comment, and `<-`, `::`, `@fn(...)`,
 * `'''...'''` and `?` have no SQL analogue. Inheriting from SQL got the two
 * comment rules precisely backwards.
 *
 * Token names are the conventional Prism ones, so stock themes style this
 * grammar with no extra CSS.
 */
export const trilogyGrammar: Grammar = {
  // Prism resolves in key order, so the ordering below is load-bearing. Notes
  // are on the rules whose position is doing real work.
  comment: {
    // Safe above the string rules because every pattern that could contain a
    // `#` is `greedy`: a greedy match starting earlier reclaims text an earlier
    // rule already tokenized.
    pattern: /(?:#|\/\/).*/,
    greedy: true,
  },

  // `query '''select ...'''`, `raw('''...''')`, and any triple-quoted literal.
  'triple-quoted-string': {
    pattern: /'''[\s\S]*?'''/,
    greedy: true,
    alias: 'string',
  },

  string: {
    // Mirrors SINGLE_STRING_CHARS / DOUBLE_STRING_CHARS: backslash escapes are
    // honoured, delimiters must match, and a literal cannot span lines.
    pattern: /(["'])(?:\\[\s\S]|(?!\1)[^\\\r\n])*\1/,
    greedy: true,
  },

  // QUOTED_IDENTIFIER / QUOTED_ADDRESS / FILE_PATH, plus their f-string forms.
  'quoted-identifier': {
    pattern: /f?`[^`\r\n]*`/,
    greedy: true,
    alias: 'symbol',
  },

  // `x::int`, `x::percent`. Above `operator` so `::` is not split off first.
  cast: {
    pattern: /::\s*[a-zA-Z_]\w*/,
    inside: {
      operator: /^::/,
      'class-name': /[a-zA-Z_]\w*/,
    },
  },

  // `@my_function(...)`, and the `@lambda` passed to array_transform/array_filter.
  'custom-function': {
    pattern: /@[a-zA-Z_]\w*/,
    alias: 'function',
  },

  // select_hide_modifier and select_partial_modifier: single-character prefixes
  // bound to ONE select item. The lookahead keeps `--` from reading as a
  // comment-to-end-of-line, so `select --hidden, visible;` only dims `hidden`.
  'hide-modifier': {
    pattern: /--(?=[a-zA-Z_<])/,
    alias: 'important',
  },
  'partial-modifier': {
    pattern: /~(?=[a-zA-Z_<])/,
    alias: 'important',
  },

  // Above `keyword` so the names that are both (`group`, `union`, `grain`)
  // resolve by call position. Gating on an explicit name list -- rather than
  // "any identifier before a paren" -- is what keeps `not (...)`, `in (...)`
  // and the `(select ...)` scalar subquery out of this rule.
  function: callPattern(FUNCTIONS),

  'window-function': {
    // Legacy window syntax takes no parens (`rank x over y order by z`), so
    // these match bare as well as called.
    pattern: wordBoundaryPattern(WINDOW_FUNCTIONS),
    alias: 'function',
  },

  keyword: [
    // Multi-word and context-gated forms first: they are built out of words too
    // common to match standalone without lighting up ordinary concept names.
    ...CONTEXTUAL_KEYWORD_PATTERNS.map((source) => new RegExp(source, 'i')),
    // Infix `like` / `ilike` (PLUS_OR_MINUS in the grammar). The called forms
    // `like(x, 'y')` were already taken by `function` above.
    /\b(?:not\s+)?i?like\b/i,
    wordBoundaryPattern(KEYWORDS),
    wordBoundaryPattern(MODIFIERS),
  ],

  builtin: wordBoundaryPattern(PURPOSES),

  boolean: /\b(?:true|false)\b/i,

  null: {
    pattern: /\bnull\b/i,
    alias: 'keyword',
  },

  property: [
    // A namespace segment: the identifier immediately before a `.`. Anchored on
    // a leading letter/underscore so it can never match the `1.` of a float --
    // the namespace and number rules used to fight over decimals.
    /\b[a-zA-Z_]\w*(?=\s*\.)/,
    // The left-hand side of a binding: datasource column_assignment
    // (`o_orderkey: order_id`), align_item, struct_component, function binding
    // types. `(?!:)` keeps this off the `x` in `x::int` -- though in practice
    // the `cast` rule above has already split that chunk.
    /\b[a-zA-Z_]\w*(?=\s*:(?!:))/,
  ],

  'class-name': wordBoundaryPattern(DATA_TYPES),

  number: /(?:\b\d+(?:\.\d+)?|\B\.\d+)\b/,

  operator: new RegExp(
    alternation([
      '<-',
      '->',
      '\\.\\.',
      '>=',
      '<=',
      '!=',
      '\\*\\*',
      '\\|\\|',
      '\\+',
      '-',
      '\\*',
      '/',
      '%',
      '=',
      '>',
      '<',
      '\\?',
      '!',
    ]),
  ),

  punctuation: /[[\](){},;:.]/,
}

/**
 * Register the grammar on a Prism instance, under both `trilogy` and its
 * former name `preql`.
 *
 * Prism keeps grammars on a module-level singleton, so this has to run against
 * the *same* Prism instance the host highlights with. A bundler that hands the
 * app and this package separate copies of `prismjs` will register `trilogy` on
 * the copy nobody calls, which surfaces as silently unhighlighted code rather
 * than an error. Keep `prismjs` external and deduped.
 */
export function registerTrilogy(prism: PrismLike): void {
  prism.languages.trilogy = trilogyGrammar
  prism.languages.preql = trilogyGrammar
}
