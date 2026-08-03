import Prism from 'prismjs'

// Languages whose grammar has actually been imported. Tracked per language
// rather than as a single "ready" promise: callers request different sets at
// different times (a SQL results pane on mount, a python block in a chat
// message ten seconds later), and a one-shot promise would resolve instantly
// for the second caller without ever loading what it asked for.
const loadedLanguages = new Set<string>()

// Grammar imports mutate the shared Prism.languages global and have ordering
// dependencies (typescript needs javascript, which needs clike), so loads are
// serialized onto one chain rather than run concurrently.
let loadQueue: Promise<void> = Promise.resolve()

// Only these can actually be imported. 'trilogy' is derived from sql in
// defineTrilogyLanguage, and 'text' has no grammar, so both drop out here.
const LOAD_ORDER = ['markup', 'javascript', 'typescript', 'python', 'sql', 'json', 'markdown']

const IMPLIED_LANGUAGES: Record<string, string[]> = {
  trilogy: ['sql'],
  typescript: ['javascript'],
  json: ['javascript'],
  markdown: ['markup'],
}

export function normalizePrismLanguage(language: string | null | undefined): string {
  const normalized = (language || '').trim().toLowerCase()

  switch (normalized) {
    case 'js':
    case 'jsx':
      return 'javascript'
    case 'ts':
    case 'tsx':
      return 'typescript'
    case 'py':
      return 'python'
    case 'preql':
      return 'trilogy'
    case '':
      return 'text'
    default:
      return normalized
  }
}

function defineTrilogyLanguage() {
  if (!Prism.languages.trilogy && Prism.languages.sql) {
    Prism.languages.trilogy = {
      ...Prism.languages.sql,
      keyword: [
        ...(Array.isArray(Prism.languages.sql.keyword)
          ? Prism.languages.sql.keyword
          : Prism.languages.sql.keyword
            ? [Prism.languages.sql.keyword]
            : []),
        /\b(?:DATASOURCE)\b/i,
        /\b(?:GRAIN)\b/i,
        /\b(?:ADDRESS)\b/i,
        /\b(?:DEF)\b/i,
        /\b(?:IMPORT)\b/i,
        /\b(?:MERGE)\b/i,
        /\b(?:HAVING_CLAUSE)\b/i,
        /\b(?:WHERE_CLAUSE)\b/i,
        /\b(?:SELECT_LIST)\b/i,
        /\b(?:ORDER_BY)\b/i,
        /\b(?:SELECT_STATEMENT)\b/i,
        /\b(?:SELECT_ITEM)\b/i,
        /\b(?:ALIGN_CLAUSE)\b/i,
        /\b(?:ALIGN_ITEM)\b/i,
        /\b(?:IDENTIFIER)\b/i,
      ],
    }
  }
}

async function loadPrismLanguage(language: string) {
  switch (language) {
    case 'javascript':
      if (!Prism.languages.javascript) {
        if (!Prism.languages.clike) {
          // @ts-ignore
          await import('prismjs/components/prism-clike')
        }
        // @ts-ignore
        await import('prismjs/components/prism-javascript')
      }
      break
    case 'typescript':
      if (!Prism.languages.typescript) {
        if (!Prism.languages.javascript) {
          await loadPrismLanguage('javascript')
        }
        // @ts-ignore
        await import('prismjs/components/prism-typescript')
      }
      break
    case 'python':
      if (!Prism.languages.python) {
        // @ts-ignore
        await import('prismjs/components/prism-python')
      }
      break
    case 'sql':
      if (!Prism.languages.sql) {
        // @ts-ignore
        await import('prismjs/components/prism-sql')
      }
      break
    case 'json':
      if (!Prism.languages.json) {
        if (!Prism.languages.javascript) {
          await loadPrismLanguage('javascript')
        }
        // @ts-ignore
        await import('prismjs/components/prism-json')
      }
      break
    case 'markup':
    case 'html':
    case 'xml':
      if (!Prism.languages.markup) {
        // @ts-ignore
        await import('prismjs/components/prism-markup')
      }
      break
    case 'markdown':
      if (!Prism.languages.markdown) {
        if (!Prism.languages.markup) {
          await loadPrismLanguage('markup')
        }
        // @ts-ignore
        await import('prismjs/components/prism-markdown')
      }
      break
  }
}

/**
 * Expand a caller's requested languages into the loadable set they imply, in
 * dependency order. sql is always included because the trilogy grammar is
 * derived from it and every surface in the app can show trilogy.
 */
function resolveLoadableLanguages(requestedLanguages: Array<string | null | undefined>): string[] {
  const normalized = new Set(
    requestedLanguages.map((language) => normalizePrismLanguage(language)).filter(Boolean),
  )

  normalized.add('sql')

  for (const language of Array.from(normalized)) {
    for (const implied of IMPLIED_LANGUAGES[language] ?? []) {
      normalized.add(implied)
    }
  }

  return LOAD_ORDER.filter((language) => normalized.has(language))
}

export async function ensurePrismLanguagesReady(
  requestedLanguages: Array<string | null | undefined> = [],
) {
  const wanted = resolveLoadableLanguages(requestedLanguages)

  if (wanted.every((language) => loadedLanguages.has(language))) {
    return
  }

  const run = loadQueue.then(async () => {
    for (const language of wanted) {
      if (loadedLanguages.has(language)) {
        continue
      }
      await loadPrismLanguage(language)
      // Only recorded on success, so a failed import is retried by the next
      // caller rather than being cached as done.
      loadedLanguages.add(language)
    }

    defineTrilogyLanguage()
  })

  // The chain must survive a failed load, or every later request queues behind
  // a rejected promise and rejects too.
  loadQueue = run.catch(() => {})

  await run
}

export { Prism }
