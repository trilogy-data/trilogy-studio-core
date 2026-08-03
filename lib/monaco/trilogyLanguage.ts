// Type-only: this module is pure data, so it stays importable (and testable)
// without pulling in the monaco-editor runtime and its DOM requirements.
import type { languages } from 'monaco-editor'
import {
  CONTEXTUAL_KEYWORD_PATTERNS,
  DATA_TYPES,
  FUNCTIONS,
  KEYWORDS,
  MODIFIERS,
  PURPOSES,
  WINDOW_FUNCTIONS,
} from '@trilogy-data/prism-trilogy/vocabulary'

/**
 * Monaco language configuration and Monarch grammar for Trilogy.
 *
 * The word lists come from `@trilogy-data/prism-trilogy/vocabulary`, which is
 * derived from `trilogy/parsing/trilogy.lark`, so the editor, the Prism
 * renderer and the `::` autocomplete all read from one list. They used to be
 * three hand-maintained copies that had drifted badly apart.
 */

export const trilogyLanguageConfiguration: languages.LanguageConfiguration = {
  comments: {
    // Trilogy has no block comment -- PARSE_COMMENT is `#...` or `//...` only.
    // Advertising `/* */` here made Monaco's block-comment command emit source
    // the parser rejects.
    lineComment: '#',
  },
  brackets: [
    ['{', '}'],
    ['[', ']'],
    ['(', ')'],
  ],
  autoClosingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: "'", close: "'", notIn: ['string', 'comment'] },
    { open: '"', close: '"', notIn: ['string'] },
    { open: '`', close: '`', notIn: ['string', 'comment'] },
  ],
  surroundingPairs: [
    { open: "'", close: "'" },
    { open: '"', close: '"' },
    { open: '`', close: '`' },
  ],
  // IDENTIFIER admits `.`, so a namespaced reference is one word. Without this
  // Monaco's default word pattern splits `orders.customer.id` into three, which
  // is why the completion provider has to rebuild the token by hand.
  wordPattern: /[a-zA-Z_][a-zA-Z0-9_.]*/,
}

export const trilogyMonarchLanguage: languages.IMonarchLanguage = {
  ignoreCase: true,
  keywords: [...KEYWORDS, ...MODIFIERS],
  definitions: [...PURPOSES],
  typeKeywords: [...DATA_TYPES],
  functions: [...FUNCTIONS],
  windowFunctions: [...WINDOW_FUNCTIONS],
  tokenizer: {
    root: [
      // Both line-comment forms. There is no block comment.
      [/#.*/, 'comment'],
      [/\/\/.*/, 'comment'],

      // MULTILINE_STRING. Used for `query`, `raw(...)` and `raw_sql(...)`, all
      // of which carry SQL, so the body is handed to the embedded SQL grammar.
      [/'''/, { token: 'string', next: '@tripleQuoteString', nextEmbedded: 'sql' }],

      // Matching delimiters, honouring backslash escapes, single line only.
      [/'(?:[^'\\\r\n]|\\.)*'/, 'string'],
      [/"(?:[^"\\\r\n]|\\.)*"/, 'string'],
      [/f?`[^`\r\n]*`/, 'string'],

      // select_hide_modifier and select_partial_modifier: one-character
      // prefixes on a single select item. The lookahead is what stops `--`
      // from greying out the rest of the line as though it were a comment.
      [/--(?=[a-zA-Z_<])/, 'hidden'],
      [/~(?=[a-zA-Z_<])/, 'hidden'],

      // custom_function, and the @lambda of array_transform/array_filter.
      [/@[a-zA-Z_]\w*/, 'function'],

      // `x::int`, `x::percent`.
      [/::\s*[a-zA-Z_]\w*/, 'type'],

      // Numbers come before any rule that can see a `.`, so a decimal is one
      // token. The namespace rule used to match the `1.` of `1.5` and split it.
      [/\d+\.\d+/, 'number'],
      [/\.\d+/, 'number'],
      [/\d+/, 'number'],

      // prop_ident: `<customer_id, country>.local_alias`.
      [/<[a-zA-Z0-9_.,\s*]+>(?=\s*\.)/, 'property'],

      // Call position. Checking `@functions` here rather than in the general
      // identifier rule below is what lets `date(x)` read as a function while a
      // bare `date` reads as a type -- the two lists genuinely overlap, and
      // list precedence alone always got one of the two cases wrong.
      [
        /[a-zA-Z_]\w*(?=\s*\()/,
        {
          cases: {
            '@functions': 'function',
            '@windowFunctions': 'function',
            '@keywords': 'keyword',
            '@definitions': 'definition',
            '@default': 'identifier',
          },
        },
      ],

      // Multi-word constructs whose individual words are too common to match on
      // their own (`by rollup`, `nulls last`, `layer bar`, `state published`).
      ...CONTEXTUAL_KEYWORD_PATTERNS.map(
        (source) => [new RegExp(source, 'i'), 'keyword'] as [RegExp, string],
      ),
      // Infix like/ilike (PLUS_OR_MINUS). The called forms were taken above.
      [/\b(?:not\s+)?i?like\b/, 'keyword'],

      // Left-hand side of a binding: datasource column_assignment, align_item,
      // struct_component. `(?!:)` keeps it off the `x` of `x::int`. This has to
      // sit ABOVE the general identifier rule -- below it, the identifier rule
      // consumed the name first and this never fired at all.
      [/[a-zA-Z_]\w*(?=\s*:(?!:))/, 'property'],

      // Namespace segment. A lookahead rather than a `@afterDot` state: the old
      // state had no fallback rule, so a `.` not followed by an identifier left
      // the tokenizer stuck in it, leaking across the rest of the buffer.
      [/[a-zA-Z_]\w*(?=\s*\.)/, 'property'],

      [
        /[a-zA-Z_]\w*/,
        {
          cases: {
            '@keywords': 'keyword',
            '@definitions': 'definition',
            '@typeKeywords': 'type',
            '@windowFunctions': 'function',
            '@functions': 'function',
            '@default': 'identifier',
          },
        },
      ],

      [/<-|->|\.\.|>=|<=|!=|\*\*|\|\||[-+*/%=<>!?]/, 'operator'],

      [/[(),;:[\]{}.]/, 'delimiter'],
    ],
    tripleQuoteString: [
      [/'''/, { token: 'string', next: '@pop', nextEmbedded: '@pop' }],
      [/[^']+/, 'string'],
      [/'/, 'string'],
    ],
  },
}
