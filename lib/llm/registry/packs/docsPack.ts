import type { RegisteredTool } from '../types'
import { searchDocs, getArticle } from '../../docsIndex'
import { KeySeparator } from '../../../data/constants'

// Documentation tools: let the agent explain the app UI and the Trilogy
// language from the same in-app docs the tutorial screen renders, and open
// the cited page for the user.

export function buildDocsPack(): RegisteredTool[] {
  return [
    {
      pack: 'docs',
      definition: {
        name: 'search_docs',
        description:
          "Search Trilogy Studio's in-app documentation: how to use the app (connections, editors, dashboards, models, jobs, saving, storage/privacy) and the Trilogy language reference (syntax, keywords, built-in and window functions). Use for any question about how the app or the language works.",
        input_schema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search terms' },
            limit: { type: 'number', description: 'Max results (default 5)' },
            kind: {
              type: 'string',
              enum: ['app', 'language', 'function'],
              description:
                'Optional filter: app = UI/feature docs, language = Trilogy syntax/reference, function = built-in function entries',
            },
          },
          required: ['query'],
        },
      },
      execute: async (input) => {
        const results = searchDocs(String(input.query ?? ''), {
          limit: Number(input.limit) || 5,
          kind: input.kind,
        })
        if (results.length === 0) {
          return {
            success: true,
            message: 'No documentation matched. Try different terms or drop the kind filter.',
          }
        }
        return {
          success: true,
          message: results
            .map((r) => `- [${r.entry.kind}] ${r.entry.id}\n  ${r.snippet}`)
            .join('\n'),
        }
      },
    },
    {
      pack: 'docs',
      definition: {
        name: 'read_doc',
        description:
          'Read a full documentation article by id from search_docs results (accepts "Node/Article" or a full "Node/Article/Paragraph" id).',
        input_schema: {
          type: 'object',
          properties: {
            doc_id: { type: 'string', description: 'Documentation id from search_docs' },
          },
          required: ['doc_id'],
        },
      },
      execute: async (input) => {
        const article = getArticle(String(input.doc_id ?? ''))
        if (!article) {
          return {
            success: false,
            error: `Documentation "${input.doc_id}" not found. Use search_docs to find valid ids.`,
          }
        }
        return {
          success: true,
          message: `${article.nodeTitle} > ${article.articleTitle}\n\n${article.paragraphs
            .map((p) => `## ${p.title}\n${p.content}`)
            .join('\n\n')}`,
        }
      },
    },
    {
      pack: 'docs',
      definition: {
        name: 'open_documentation',
        description:
          'Open a documentation article in the main pane so the user can read it (use the "Node/Article" id from search_docs). Only articles from the docs tree can be opened; generated syntax-reference sections are read_doc-only.',
        input_schema: {
          type: 'object',
          properties: {
            doc_id: { type: 'string', description: 'Documentation id ("Node/Article")' },
          },
          required: ['doc_id'],
        },
      },
      availability: (ctx) =>
        ctx.runtime.navigation
          ? { available: true }
          : {
              available: false,
              hint: 'App navigation is not available in this embedding context.',
            },
      execute: async (input, ctx) => {
        const article = getArticle(String(input.doc_id ?? ''))
        if (!article) {
          return {
            success: false,
            error: `Documentation "${input.doc_id}" not found. Use search_docs to find valid ids.`,
          }
        }
        if (article.nodeTitle === 'Trilogy Language') {
          return {
            success: false,
            error:
              'That section only exists in the generated syntax reference and has no page in the app. Use read_doc to fetch its content instead.',
          }
        }
        const nav = ctx.runtime.navigation!
        nav.setActiveDocumentationKey(
          `article${KeySeparator}${article.nodeTitle}${KeySeparator}${article.articleTitle}`,
        )
        nav.setActiveScreen('tutorial')
        nav.setActiveSidebarScreen('tutorial')
        return {
          success: true,
          message: `Opened documentation "${article.nodeTitle} > ${article.articleTitle}" for the user.`,
        }
      },
    },
  ]
}
