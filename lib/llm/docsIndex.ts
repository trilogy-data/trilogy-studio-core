import { documentation } from '../data/tutorial/documentation'
import type { Paragraph } from '../data/tutorial/docTypes'
import { trilogySyntaxReference, syntaxExamples } from './data/constants'

// Lightweight keyword index over the in-app documentation (tutorial tree +
// language reference) for the agent's search_docs/read_doc tools. No
// embeddings: ~600 entries, simple weighted term scoring is plenty and free.

export interface DocEntry {
  /** `${node}/${article}/${paragraph}` — read_doc accepts the article prefix. */
  id: string
  nodeTitle: string
  articleTitle: string
  paragraphTitle: string
  content: string
  kind: 'app' | 'language' | 'function'
}

export interface ScoredDoc {
  entry: DocEntry
  score: number
  snippet: string
}

/** Paragraph types that are interactive component embeds with no prose. */
const SKIP_PARAGRAPH_TYPES = new Set([
  'editors',
  'connections',
  'llm-connections',
  'community-models',
  'dashboard',
  'tutorial-prompts',
  'editor-validator',
  'connection-validator',
  'model-validator',
])

const LANGUAGE_NODES = new Set(['Trilogy Reference'])
const SYNTAX_NODE = 'Trilogy Language'
/** Article-title prefix for a single syntax example, so each is read_doc-able alone. */
const EXAMPLE_ARTICLE_PREFIX = 'Example: '

function stripHtml(text: string): string {
  return text
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function paragraphContent(paragraph: Paragraph): string {
  let content = stripHtml(paragraph.content || '')
  const fn = paragraph.data?.function
  if (fn) {
    content = [
      content,
      `Inputs: ${fn.inputTypes.join(', ')}. Output: ${fn.outputType} (${fn.outputPurpose}).`,
      `Example: ${fn.example}`,
    ]
      .filter(Boolean)
      .join(' ')
  }
  return content
}

let cachedIndex: DocEntry[] | null = null

export function buildDocsIndex(): DocEntry[] {
  if (cachedIndex) return cachedIndex
  const entries: DocEntry[] = []

  for (const node of documentation) {
    const isLanguage = LANGUAGE_NODES.has(node.title)
    for (const article of node.articles) {
      for (const paragraph of article.paragraphs) {
        if (paragraph.type && SKIP_PARAGRAPH_TYPES.has(paragraph.type)) continue
        const content = paragraphContent(paragraph)
        if (!content) continue
        entries.push({
          id: `${node.title}/${article.title}/${paragraph.title}`,
          nodeTitle: node.title,
          articleTitle: article.title,
          paragraphTitle: paragraph.title,
          content,
          kind: paragraph.type === 'function' ? 'function' : isLanguage ? 'language' : 'app',
        })
      }
    }
  }

  // The generated syntax reference is one large markdown string; split it on
  // headings so sections are individually searchable/citable.
  const sections = trilogySyntaxReference.split(/^(?=#{1,3} )/m)
  for (const section of sections) {
    const match = section.match(/^#{1,3} (.+)/)
    if (!match) continue
    const title = match[1].trim()
    const body = section.slice(match[0].length).trim()
    if (!body) continue
    entries.push({
      id: `${SYNTAX_NODE}/Syntax Reference/${title}`,
      nodeTitle: SYNTAX_NODE,
      articleTitle: 'Syntax Reference',
      paragraphTitle: title,
      content: body,
      kind: 'language',
    })
  }

  // Syntax examples: upstream lists one-line headers in the reference above and
  // serves the bodies through `trilogy agent-info syntax example <name>`, a CLI
  // the studio has no way to call. Indexing the bodies here makes read_doc the
  // studio's equivalent drilldown, so an agent that spots a header can actually
  // read the example. Each body is one entry -- they are self-contained
  // annotated scripts and splitting them on headings would strip the setup.
  for (const example of syntaxExamples) {
    if (!example.body?.trim()) continue
    entries.push({
      // One article per example, not one article holding all of them:
      // `getArticle` resolves on node + article, so a shared article would make
      // every read_doc return all ~40KB of bodies. A drilldown that can't
      // narrow isn't a drilldown.
      id: `${SYNTAX_NODE}/${EXAMPLE_ARTICLE_PREFIX}${example.name}/${example.title}`,
      nodeTitle: SYNTAX_NODE,
      articleTitle: `${EXAMPLE_ARTICLE_PREFIX}${example.name}`,
      paragraphTitle: example.title,
      // The summary carries the searchable prose; the body is mostly code.
      content: `${example.summary}

${example.body.trim()}`,
      kind: 'language',
    })
  }

  cachedIndex = entries
  return entries
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((t) => t.length > 1)
}

function scoreEntry(entry: DocEntry, terms: string[]): number {
  const titleTokens = tokenize(entry.paragraphTitle)
  const articleTokens = tokenize(entry.articleTitle)
  const contentLower = entry.content.toLowerCase()
  const contentTokens = tokenize(entry.content)

  let score = 0
  for (const term of terms) {
    if (titleTokens.includes(term)) score += 3
    else if (term.length >= 4 && titleTokens.some((t) => t.startsWith(term))) score += 1.5

    if (articleTokens.includes(term)) score += 2

    const tf = contentTokens.filter((t) => t === term).length
    score += Math.min(tf, 5)
    if (tf === 0 && term.length >= 4 && contentLower.includes(term)) score += 0.5
  }
  // Mild length normalization so giant sections don't win on term volume alone.
  return score / Math.log(Math.max(entry.content.length, 50))
}

function makeSnippet(entry: DocEntry, terms: string[]): string {
  const lower = entry.content.toLowerCase()
  let position = -1
  for (const term of terms) {
    position = lower.indexOf(term)
    if (position >= 0) break
  }
  if (position < 0) position = 0
  const start = Math.max(0, position - 80)
  const end = Math.min(entry.content.length, position + 160)
  return `${start > 0 ? '…' : ''}${entry.content.slice(start, end)}${end < entry.content.length ? '…' : ''}`
}

export function searchDocs(
  query: string,
  opts: { limit?: number; kind?: DocEntry['kind'] } = {},
): ScoredDoc[] {
  const terms = tokenize(query)
  if (terms.length === 0) return []
  const limit = opts.limit ?? 5

  return buildDocsIndex()
    .filter((entry) => !opts.kind || entry.kind === opts.kind)
    .map((entry) => ({ entry, score: scoreEntry(entry, terms) }))
    .filter((scored) => scored.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((scored) => ({ ...scored, snippet: makeSnippet(scored.entry, terms) }))
}

export interface DocArticle {
  id: string
  nodeTitle: string
  articleTitle: string
  paragraphs: Array<{ title: string; content: string }>
}

/** Read a full article by id. Accepts an article id (`Node/Article`) or a
 *  paragraph id (`Node/Article/Paragraph`), resolving to the whole article. */
export function getArticle(id: string): DocArticle | null {
  const [nodeTitle, articleTitle] = id.split('/')
  if (!nodeTitle || !articleTitle) return null
  const entries = buildDocsIndex().filter(
    (entry) => entry.nodeTitle === nodeTitle && entry.articleTitle === articleTitle,
  )
  if (entries.length === 0) return null
  return {
    id: `${nodeTitle}/${articleTitle}`,
    nodeTitle,
    articleTitle,
    paragraphs: entries.map((entry) => ({ title: entry.paragraphTitle, content: entry.content })),
  }
}

/** Test-only: rebuild the index from scratch. */
export function resetDocsIndexForTests(): void {
  cachedIndex = null
}
