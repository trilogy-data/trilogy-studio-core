import { describe, expect, it } from 'vitest'
import Prism from 'prismjs'
import { trilogyGrammar, registerTrilogy } from './grammar'
import type { PrismLike } from './types'

interface FlatToken {
  type: string
  content: string
}

/** Flatten Prism's token tree to `{type, content}`, dropping pure whitespace. */
function tokenize(code: string): FlatToken[] {
  const walk = (nodes: ReturnType<typeof Prism.tokenize>): FlatToken[] =>
    nodes.flatMap((node): FlatToken[] => {
      if (typeof node === 'string') {
        return node.trim() ? [{ type: 'text', content: node }] : []
      }
      const content = node.content
      if (typeof content === 'string') {
        return [{ type: node.type, content }]
      }
      // Nested (e.g. the `cast` rule's `inside`): keep the leaves.
      return walk(Array.isArray(content) ? content : [content])
    })

  return walk(Prism.tokenize(code, trilogyGrammar as Prism.Grammar))
}

/** The token type assigned to the first occurrence of `text`. */
function typeOf(code: string, text: string): string | undefined {
  return tokenize(code).find((token) => token.content === text)?.type
}

describe('comments', () => {
  it('treats # as a line comment', () => {
    expect(typeOf('# a note\nselect x;', '# a note')).toBe('comment')
  })

  it('treats // as a line comment', () => {
    expect(typeOf('// a note\nselect x;', '// a note')).toBe('comment')
  })

  it('does not treat -- as a comment', () => {
    // `--` is select_hide_modifier: it hides ONE item, and must not swallow the
    // rest of the line the way a SQL-derived grammar did.
    const tokens = tokenize('select --hidden, visible;')
    expect(tokens.find((t) => t.content === '--')?.type).toBe('hide-modifier')
    expect(tokens.some((t) => t.type === 'comment')).toBe(false)
    expect(tokens.some((t) => t.content.includes('visible'))).toBe(true)
  })

  it('marks ~ as a partial modifier', () => {
    expect(typeOf('select ~maybe_partial;', '~')).toBe('partial-modifier')
  })

  it('does not find a comment inside a string', () => {
    const tokens = tokenize(`select 'a # b' -> label;`)
    expect(tokens.some((t) => t.type === 'comment')).toBe(false)
    expect(tokens.find((t) => t.type === 'string')?.content).toBe(`'a # b'`)
  })
})

describe('literals', () => {
  it('tokenizes a decimal as one number', () => {
    // Regression: a namespace rule that accepted digits split `1.5` into
    // `1.` + `5` and the number rule never ran.
    expect(typeOf('select 1.5 -> x;', '1.5')).toBe('number')
  })

  it('tokenizes a leading-dot float', () => {
    expect(typeOf('select .25 -> x;', '.25')).toBe('number')
  })

  it('handles escaped quotes in strings', () => {
    expect(typeOf(`select 'it\\'s' -> x;`, `'it\\'s'`)).toBe('string')
  })

  it('does not match across mismatched quote delimiters', () => {
    const tokens = tokenize(`select 'abc" -> x;`)
    expect(tokens.some((t) => t.type === 'string')).toBe(false)
  })

  it('tokenizes triple-quoted blocks', () => {
    const code = "datasource d (x: y) query '''select 1''';"
    expect(typeOf(code, "'''select 1'''")).toBe('triple-quoted-string')
  })

  it('tokenizes backtick addresses', () => {
    expect(typeOf('datasource d (x: y) address `schema.table`;', '`schema.table`')).toBe(
      'quoted-identifier',
    )
  })

  it('tokenizes booleans and null', () => {
    expect(typeOf('where x = true;', 'true')).toBe('boolean')
    expect(typeOf('where x is null;', 'null')).toBe('null')
  })
})

describe('functions vs types vs keywords', () => {
  it('reads a called name as a function', () => {
    expect(typeOf('select date(order_ts) -> d;', 'date')).toBe('function')
  })

  it('reads the same name bare as a type', () => {
    // The old Monaco list checked types first, so `date(...)` never rendered as
    // a function at all; call position is the only correct discriminator.
    expect(typeOf('property x.d date;', 'date')).toBe('class-name')
  })

  it('prefers the longest function name', () => {
    expect(typeOf('select count_distinct(x) -> c;', 'count_distinct')).toBe('function')
  })

  it('reads group(x) as a function but `group x by y` as a keyword', () => {
    expect(typeOf('select group(x) -> g;', 'group')).toBe('function')
    expect(typeOf('select group x by y -> g;', 'group')).toBe('keyword')
  })

  it('reads union(...) as a function but `union join` as a keyword', () => {
    expect(typeOf('select union(a, b) -> u;', 'union')).toBe('function')
    expect(typeOf('union join a = b select x;', 'union')).toBe('keyword')
  })

  it('does not treat `not (` as a function call', () => {
    expect(typeOf('where not (x = 1);', 'not')).toBe('keyword')
  })

  it('covers functions the old list was missing', () => {
    for (const name of [
      'concat_ws',
      'greatest',
      'least',
      'nullif',
      'stddev',
      'variance',
      'array_agg',
      'bool_or',
      'grouping_id',
      'regexp_extract',
      'array_transform',
      'map_keys',
      'geo_distance',
      'date_trunc',
      'date_spine',
      'recurse_edge',
    ]) {
      expect(typeOf(`select ${name}(x) -> v;`, name), name).toBe('function')
    }
  })

  it('tokenizes window functions', () => {
    expect(typeOf('select rank x over y -> r;', 'rank')).toBe('window-function')
    expect(typeOf('select row_number(a) over (order by b) -> r;', 'row_number')).toBe(
      'window-function',
    )
  })

  it('tokenizes custom functions and lambdas', () => {
    expect(typeOf('select @my_fn(x) -> v;', '@my_fn')).toBe('custom-function')
    expect(typeOf('select array_transform(x, @double) -> v;', '@double')).toBe('custom-function')
  })
})

describe('keywords', () => {
  it('covers the everyday words the SQL-derived grammar missed', () => {
    for (const word of [
      'from',
      'merge',
      'align',
      'rowset',
      'with',
      'and',
      'or',
      'not',
      'between',
    ]) {
      expect(typeOf(`${word} x`, word), word).toBe('keyword')
    }
  })

  it('tokenizes multi-word grouping constructs', () => {
    expect(typeOf('select x by rollup (a, b);', 'by rollup')).toBe('keyword')
    expect(typeOf('select x by grouping sets ((a), (b));', 'by grouping sets')).toBe('keyword')
  })

  it('tokenizes the ordering tail', () => {
    expect(typeOf('order by x desc nulls last;', 'nulls last')).toBe('keyword')
  })

  it('gates chart words on their context', () => {
    expect(typeOf('chart layer bar (x <- a);', 'layer bar')).toBe('keyword')
    // `bar` on its own is an ordinary name, not a chart type.
    expect(typeOf('select bar -> b;', 'bar')).not.toBe('keyword')
  })

  it('tokenizes infix like/ilike', () => {
    expect(typeOf(`where name like '%a%';`, 'like')).toBe('keyword')
    expect(typeOf(`where name not ilike '%a%';`, 'not ilike')).toBe('keyword')
  })

  it('tokenizes purposes as builtins', () => {
    for (const word of ['key', 'metric', 'property', 'const', 'auto']) {
      expect(typeOf(`${word} x int;`, word), word).toBe('builtin')
    }
  })
})

describe('operators and references', () => {
  it('tokenizes the derivation arrow', () => {
    expect(typeOf('metric total <- sum(x);', '<-')).toBe('operator')
  })

  it('tokenizes the alias arrow', () => {
    expect(typeOf('select sum(x) -> total;', '->')).toBe('operator')
  })

  it('tokenizes a cast', () => {
    const tokens = tokenize('select x::int -> y;')
    expect(tokens.find((t) => t.content === '::')?.type).toBe('operator')
    expect(tokens.find((t) => t.content === 'int')?.type).toBe('class-name')
  })

  it('tokenizes namespace segments as properties', () => {
    const tokens = tokenize('select orders.customer.id;')
    const properties = tokens.filter((t) => t.type === 'property').map((t) => t.content)
    expect(properties).toEqual(['orders', 'customer'])
  })

  it('tokenizes a datasource column assignment as a property', () => {
    const tokens = tokenize('datasource d (o_orderkey: order_id) grain (order_id);')
    expect(tokens.find((t) => t.content === 'o_orderkey')?.type).toBe('property')
  })

  it('does not treat the left side of a cast as a binding', () => {
    expect(typeOf('select x::int -> y;', 'x')).not.toBe('property')
  })

  it('tokenizes the filter operator', () => {
    expect(typeOf('select x ? y > 1 -> z;', '?')).toBe('operator')
  })
})

describe('registration', () => {
  it('registers under both trilogy and preql', () => {
    const fake: PrismLike = { languages: {} }
    registerTrilogy(fake)
    expect(fake.languages.trilogy).toBe(trilogyGrammar)
    expect(fake.languages.preql).toBe(trilogyGrammar)
  })

  it('produces highlighted markup through the real Prism', () => {
    registerTrilogy(Prism as unknown as PrismLike)
    const html = Prism.highlight('select sum(x) -> total;', Prism.languages.trilogy!, 'trilogy')
    expect(html).toContain('token keyword')
    expect(html).toContain('token function')
    expect(html).toContain('token operator')
  })
})
