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
})
