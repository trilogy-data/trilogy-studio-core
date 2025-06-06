//@ts-ignore

import { Range } from 'monaco-editor'
import { dataTypes } from '../language'
import { languages } from 'monaco-editor/esm/vs/editor/editor.api'
import useEditorStore from '../stores/editorStore'
const store = useEditorStore()
export function configureTrilogy() {
  languages.register({ id: 'trilogy' })
  languages.setLanguageConfiguration('trilogy', {
    comments: {
      lineComment: '#',
      blockComment: ['/*', '*/'],
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
  })

  languages.setMonarchTokensProvider('trilogy', {
    ignoreCase: true,
    keywords: [
      'IMPORT',
      'SELECT',
      'WHERE',
      'ORDER',
      'ASC',
      'DESC',
      'LIMIT',
      'DEF',
      'TYPE',
      'HAVING',
      'DATASOURCE',
      'GRAIN',
      'ADDRESS',
      'QUERY',
      'BY',
      'AS',
      'CASE',
      'WHEN',
      'THEN',
      'ELSE',
      'END',
      'IF',
      'RANK',
      'OVER',
      'LEAD',
      'LAG',
    ],
    functions: [
      'current_date',
      'current_datetime',
      'cast',
      'sum',
      'max',
      'avg',
      'count',
      'min',
      'len',
      'round',
      'coalesce',
      'concat',
      'upper',
      'lower',
      'trim',
      'date',
      'now',
      'unnest',
      'union',
      'alias',
      'cast',
      'concat',
      'constant',
      'coalesce',
      'isnull',
      'bool',
      'index_access',
      'map_access',
      'attr_access',
      'struct',
      'array',
      'date_literal',
      'datetime_literal',
      'split',
      'len',
      'divide',
      'multiply',
      'add',
      'subtract',
      'mod',
      'round',
      'abs',
      'sqrt',
      'random',
      'group',
      'count',
      'count_distinct',
      'sum',
      'max',
      'min',
      'avg',
      'like',
      'ilike',
      'lower',
      'upper',
      'substring',
      'strpos',
      'contains',
      'date',
      'datetime',
      'timestamp',
      'second',
      'minute',
      'hour',
      'day',
      'day_of_week',
      'week',
      'month',
      'quarter',
      'year',
      'date_part',
      'date_truncate',
      'date_add',
      'date_sub',
      'date_diff',
      'unix_to_timestamp',
      'current_date',
      'current_datetime',
    ],
    typeKeywords: [
      'bool',
      'string',
      'int',
      'float',
      'string',
      'double',
      'decimal',
      'percent',
      'datetime',
      'date',
      'timestamp',
      'numeric',
    ],
    definitions: ['AUTO', 'PROPERTY', 'KEY', 'METRIC'],
    tokenizer: {
      root: [
        // Match comments (lines starting with #)
        [/#.*/, 'comment'],

        // Match hidden
        [/\-\-.*/, 'hidden'],
        // match first part of <a,b>.b or a.b
        [/\<[a-zA-Z0-9\_\.\,]+\>\./, 'property'],
        [/([a-zA-Z0-9\_\.]+)\./, { token: 'property', next: '@afterDot' }],

        // Match custom functions (starting with @)
        [/@[a-zA-Z][a-zA-Z0-9_]*/, { token: 'function', next: '@functionCheck' }],

        // Match Keywords (SELECT, WHERE, ORDER, BY)
        [
          /[a-zA-Z][a-zA-Z0-9_]*/,
          {
            cases: {
              '@typeKeywords': 'keyword',
              '@keywords': 'keyword',
              '@functions': { token: 'function', next: '@functionCheck' },
              '@definitions': 'definition',
              // '@default': 'variable'
            },
          },
        ],

        // Match types (e.g., ::type, such as ::date or ::int)
        [/::[a-zA-Z0-9_]+/, 'type'],

        // Match assignment (e.g abc:def)
        [/[a-zA-Z0-9_]+\s*:/, 'property'],

        // Match operators (like ->, <-, *, +, -, /, !)
        [/\<\-|\-\>|\*|\+|\-|\/|\!/, 'operator'],

        // Match strings (enclosed in single or double quotes)
        [/['"`][^'"]*['"`]/, 'string'],

        // Match numbers (integers and floats)
        [/\b\d+(\.\d+)?\b/, 'number'],

        // Match delimiters (like commas, colons, parentheses)
        [/[(),;=]/, 'delimiter'],

        // Additional special handling for `->` or `as` for renaming (like `sum(line_item.extended_price)-> base_price`)
        [/\->|\sas\s/, 'operator'],
      ],
      afterDot: [[/[a-zA-Z0-9\_]+/, { token: 'variable', next: '@pop' }]],
      functionCheck: [
        [/\s*\(/, { token: 'delimiter', next: '@pop' }],
        [/\s+/, { token: 'white', next: '@pop' }],
        [/./, { token: '@rematch', next: '@pop' }],
      ],
    },
  })

  // add model autocompletion
  function getModelCompletions(word: string, range: Range) {
    // returning a static list of proposals, not even looking at the prefix (filtering is done by the Monaco editor),
    // here you could do a server side lookup
    let completions = store.getCurrentEditorAutocomplete(word)
    return completions.map((completion) => {
      return {
        label: completion.label,
        kind: languages.CompletionItemKind.Variable,
        insertText: completion.insertText,
        range: range,
        commitCharacters: ['\t'],
      }
    })
  }

  function getLastContiguousToken(line: string): string | null {
    const match = line.match(/(\S+)(?:\s*$)/)
    return match ? match[0] : null
  }

  interface Completion {
    label: string
    kind: languages.CompletionItemKind
    insertText: string
    range: Range
  }

  languages.registerCompletionItemProvider('trilogy', {
    provideCompletionItems: function (model, position) {
      // const word = model.getWordUntilPosition(position);
      const lineContent = model.getLineContent(position.lineNumber)
      const cursorIndex = position.column - 1 // Convert Monaco 1-based column to 0-based index
      // Extract all non-whitespace characters before `.`
      const lineToCursor = lineContent.substring(0, cursorIndex)
      const match = getLastContiguousToken(lineToCursor)
      let fullIdentifier = match ? match : ''
      const range = new Range(
        position.lineNumber,
        position.column - fullIdentifier.length,
        position.lineNumber,
        position.column,
      )
      let suggestions: Completion[] = []
      if (fullIdentifier === '') {
        suggestions = []
      } else if (fullIdentifier.endsWith('::')) {
        suggestions = dataTypes.map((type) => ({
          label: `${fullIdentifier}${type.label}`,
          kind: languages.CompletionItemKind.Enum,
          insertText: `${fullIdentifier}${type.label}`,
          range: range,
          commitCharacters: ['\t'],
        }))
      } else {
        suggestions = getModelCompletions(fullIdentifier, range)
      }
      return {
        suggestions: suggestions,
      }
    },
    triggerCharacters: ['.'],
  })
}
