import { describe, it, expect, beforeEach } from 'vitest'
import { buildDocsIndex, searchDocs, getArticle, resetDocsIndexForTests } from './docsIndex'

describe('docsIndex', () => {
  beforeEach(() => resetDocsIndexForTests())

  it('builds a sizable index quickly', () => {
    const start = performance.now()
    const entries = buildDocsIndex()
    const elapsed = performance.now() - start
    expect(entries.length).toBeGreaterThan(200)
    expect(elapsed).toBeLessThan(200)
    // Component-embed paragraphs are excluded.
    expect(entries.find((e) => e.paragraphTitle === 'ConnectionList')).toBeUndefined()
  })

  it('covers app docs, language reference, and function entries', () => {
    const entries = buildDocsIndex()
    expect(entries.some((e) => e.kind === 'app')).toBe(true)
    expect(entries.some((e) => e.kind === 'language')).toBe(true)
    expect(entries.some((e) => e.kind === 'function')).toBe(true)
    // Generated syntax reference is split into sections.
    expect(entries.some((e) => e.nodeTitle === 'Trilogy Language')).toBe(true)
  })

  it('finds app docs for UI questions', () => {
    const results = searchDocs('how do I save my work')
    expect(results.length).toBeGreaterThan(0)
    const joined = results.map((r) => r.entry.content).join(' ')
    expect(joined.toLowerCase()).toContain('save')
  })

  it('finds language docs for syntax questions', () => {
    const results = searchDocs('datasource grain join', { kind: 'language' })
    expect(results.length).toBeGreaterThan(0)
    expect(results.every((r) => r.entry.kind === 'language')).toBe(true)
  })

  it('finds specific built-in functions', () => {
    const results = searchDocs('lag window function', { limit: 10 })
    expect(results.some((r) => /lag/i.test(r.entry.paragraphTitle))).toBe(true)
  })

  it('reads a full article by article or paragraph id', () => {
    const [first] = searchDocs('connections')
    expect(first).toBeDefined()
    const byParagraph = getArticle(first.entry.id)
    expect(byParagraph).not.toBeNull()
    const byArticle = getArticle(`${first.entry.nodeTitle}/${first.entry.articleTitle}`)
    expect(byArticle).not.toBeNull()
    expect(byArticle!.paragraphs.length).toBeGreaterThan(0)
  })

  it('returns null for unknown ids and empty results for empty queries', () => {
    expect(getArticle('Nope/Nothing')).toBeNull()
    expect(searchDocs('')).toEqual([])
  })

  describe('syntax example drilldown', () => {
    // Upstream keeps the prompt small by listing one-line example headers and
    // serving bodies through `trilogy agent-info syntax example <name>` -- a CLI
    // the studio cannot call. These make read_doc the equivalent drilldown.
    it('surfaces syntax examples in search', () => {
      const ids = searchDocs('chart layer statement', { limit: 10, kind: 'language' }).map((hit) => hit.entry.id)
      expect(ids.some((id) => id.includes('Example: chart'))).toBe(true)
    })

    it('reads one example, not every example', () => {
      const article = getArticle('Trilogy Language/Example: chart')
      expect(article).not.toBeNull()
      expect(article!.paragraphs).toHaveLength(1)

      const body = article!.paragraphs[0].content
      expect(body).toContain('chart')
      // The whole point of a drilldown: `getArticle` resolves on node+article,
      // so sharing one article across all ~19 examples would return ~40KB every
      // time. Each example is its own article; this guards that.
      expect(body.length).toBeLessThan(20000)
    })

    it('gives every example its own article', () => {
      const articles = new Set(
        buildDocsIndex()
          .filter((entry) => entry.articleTitle.startsWith('Example: '))
          .map((entry) => entry.articleTitle),
      )
      expect(articles.size).toBeGreaterThan(10)
    })
  })
})
