//@ts-ignore
export function configureTrilogy(languages) {
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
    tokenizer: {
      root: [
        // Match comments (lines starting with #)
        [/#.*/, 'comment'],

        // Match hidden
        [/\-\-.*/, 'hidden'],
        // match first part of <a,b>.b or a.b
        [/\<[a-zA-Z0-9\_\.\,]+\>\./, 'property'],
        [/([a-zA-Z0-9\_]+)\./, { token: 'property', next: '@afterDot' }],

        // Match Keywords (SELECT, WHERE, ORDER, BY)
        [
          /(IMPORT|SELECT|WHERE|ORDER|ASC|DESC|LIMIT|HAVING|DATASOURCE|GRAIN|BY|\sAS)(?=\s|$|,|;)/,
          'keyword',
        ],

        // Match definitions (auto, property, metric)
        [/(^|\s)(AUTO|PROPERTY|KEY|METRIC)(\s|$)/, 'definition'],

        // Match types (e.g., ::type, such as ::date or ::int)
        [/::[a-zA-Z0-9_]+/, 'type'],

        // Match operators (like ->, <-, *, +, -, /, !)
        [/\<\-|\-\>|\*|\+|\-|\/|\!/, 'operator'],

        // Match strings (enclosed in single or double quotes)
        [/['"`][^'"]*['"`]/, 'string'],

        // Match numbers (integers and floats)
        [/\b\d+(\.\d+)?\b/, 'number'],

        // Match delimiters (like commas, colons, parentheses)
        [/[(),;=]/, 'delimiter'],

        // Match variable or property names (e.g., line_item, discounted_price)
        // [/\b[a-zA-Z_][a-zA-Z0-9_]*\b/, "variable"],
        [
          /(^|\s)(current_date|current_datetime|cast|sum|max|avg|count|min|length|round|coalesce|concat|upper|lower|trim|date|now)(?=\()/,
          'function',
        ],

        // Additional special handling for `->` or `as` for renaming (like `sum(line_item.extended_price)-> base_price`)
        [/\->|\bas\b/, 'operator'],
      ],
      afterDot: [[/[a-zA-Z0-9\_]+/, { token: 'property', next: '@pop' }]],
    },
  })
}
