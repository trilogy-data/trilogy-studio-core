import { describe, it, expect } from 'vitest'
import { trilogyMonarchLanguage } from './trilogyLanguage'

/**
 * Monarch is compiled inside monaco-editor, which needs a DOM-ish environment
 * that is heavy to stand up for a grammar test. These tests instead exercise
 * the rule table directly with the same "first rule that matches at the current
 * position wins, then advance" algorithm Monarch uses, which is what every
 * ordering bug in the old grammar came down to.
 */
type Rule = [RegExp, unknown]

const rules = trilogyMonarchLanguage.tokenizer.root as Rule[]

const listFor = (name: string): string[] =>
  (trilogyMonarchLanguage as unknown as Record<string, string[]>)[name.slice(1)] ?? []

function resolveAction(action: unknown, matched: string): string {
  if (typeof action === 'string') {
    return action
  }
  const cases = (action as { cases?: Record<string, string> }).cases
  if (!cases) {
    return (action as { token: string }).token
  }
  const lowered = matched.toLowerCase()
  for (const [key, token] of Object.entries(cases)) {
    if (key === '@default') {
      return token
    }
    if (listFor(key).some((word) => word.toLowerCase() === lowered)) {
      return token
    }
  }
  return 'identifier'
}

interface Token {
  type: string
  text: string
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  let position = 0

  outer: while (position < source.length) {
    if (/\s/.test(source[position])) {
      position += 1
      continue
    }
    for (const [pattern, action] of rules) {
      // Monarch anchors every rule at the current position.
      const flags = new Set(pattern.flags.replace('g', ''))
      if (trilogyMonarchLanguage.ignoreCase) {
        flags.add('i')
      }
      const anchored = new RegExp(`^(?:${pattern.source})`, [...flags].join(''))
      const match = anchored.exec(source.slice(position))
      if (match && match[0].length > 0) {
        tokens.push({ type: resolveAction(action, match[0]), text: match[0] })
        position += match[0].length
        continue outer
      }
    }
    position += 1
  }

  return tokens
}

const typeOf = (source: string, text: string) =>
  tokenize(source).find((token) => token.text === text)?.type

describe('trilogy monarch grammar', () => {
  it('tokenizes both line comment forms', () => {
    expect(typeOf('# note\nselect x;', '# note')).toBe('comment')
    expect(typeOf('// note\nselect x;', '// note')).toBe('comment')
  })

  it('treats -- as a one-item modifier, not a comment', () => {
    // The old rule was /--.*/  -> 'hidden', which greyed out the whole line.
    const tokens = tokenize('select --hidden, visible;')
    expect(tokens.find((t) => t.text === '--')?.type).toBe('hidden')
    expect(tokens.some((t) => t.text === 'visible')).toBe(true)
  })

  it('tokenizes ~ as a partial modifier', () => {
    expect(typeOf('select ~partial_thing;', '~')).toBe('hidden')
  })

  it('keeps a decimal as a single number token', () => {
    // The namespace rule accepted digits, matched the `1.` of `1.5`, and the
    // number rule below it never ran.
    expect(typeOf('select 1.5 -> x;', '1.5')).toBe('number')
    expect(tokenize('select 1.5 -> x;').some((t) => t.type === 'property')).toBe(false)
  })

  it('tokenizes a binding left-hand side as a property', () => {
    // Unreachable in the old grammar: the general identifier rule sat above it
    // and consumed the name first.
    expect(typeOf('datasource d (o_orderkey: order_id)', 'o_orderkey')).toBe('property')
  })

  it('resolves the type/function overlap by call position', () => {
    expect(typeOf('select date(x) -> d;', 'date')).toBe('function')
    expect(typeOf('property a.b date;', 'date')).toBe('type')
  })

  it('tokenizes data types as types rather than keywords', () => {
    // typeKeywords used to map to 'keyword', so the theme's distinct type
    // colour never applied to a declaration.
    expect(typeOf('key order_id int;', 'int')).toBe('type')
    expect(typeOf('property a.b string;', 'string')).toBe('type')
  })

  it('covers keywords the old list was missing', () => {
    for (const word of [
      'from',
      'merge',
      'align',
      'rowset',
      'and',
      'or',
      'not',
      'between',
      'join',
    ]) {
      expect(typeOf(`${word} x`, word), word).toBe('keyword')
    }
  })

  it('covers functions the old list was missing', () => {
    for (const name of ['concat_ws', 'greatest', 'stddev', 'array_agg', 'date_trunc', 'geo_x']) {
      expect(typeOf(`select ${name}(x) -> v;`, name), name).toBe('function')
    }
  })

  it('tokenizes purposes as definitions', () => {
    for (const word of ['key', 'metric', 'property', 'auto', 'const']) {
      expect(typeOf(`${word} x int;`, word), word).toBe('definition')
    }
  })

  it('tokenizes namespaces without a stateful afterDot', () => {
    const tokens = tokenize('select orders.customer.id;')
    expect(tokens.filter((t) => t.type === 'property').map((t) => t.text)).toEqual([
      'orders',
      'customer',
    ])
  })

  it('does not strand the tokenizer on a dot with no identifier after it', () => {
    // The old `@afterDot` state had no fallback rule, so this left every
    // following line mis-tokenized.
    const tokens = tokenize('select a.\nselect sum(x) -> total;')
    expect(tokens.find((t) => t.text === 'sum')?.type).toBe('function')
  })

  it('tokenizes casts and arrows', () => {
    expect(typeOf('select x::int -> y;', '::int')).toBe('type')
    expect(typeOf('metric total <- sum(x);', '<-')).toBe('operator')
    expect(typeOf('select sum(x) -> total;', '->')).toBe('operator')
  })

  it('tokenizes strings with matching delimiters and escapes', () => {
    expect(typeOf(`where a = 'it\\'s';`, `'it\\'s'`)).toBe('string')
    // A mismatched pair must not be treated as a string.
    expect(tokenize(`where a = 'abc";`).some((t) => t.type === 'string')).toBe(false)
  })

  it('does not report a comment inside a string', () => {
    expect(tokenize(`where a = 'x # y';`).some((t) => t.type === 'comment')).toBe(false)
  })

  it('tokenizes multi-word constructs', () => {
    expect(typeOf('select x by rollup (a);', 'by rollup')).toBe('keyword')
    expect(typeOf('order by x desc nulls last;', 'nulls last')).toBe('keyword')
  })

  it('has no duplicate entries in any word list', () => {
    for (const name of ['keywords', 'functions', 'typeKeywords', 'definitions'] as const) {
      const list = (trilogyMonarchLanguage as unknown as Record<string, string[]>)[name]
      expect(new Set(list).size, name).toBe(list.length)
    }
  })
})
