import Prism from 'prismjs'

let prismLanguagesReadyPromise: Promise<void> | null = null

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

export async function ensurePrismLanguagesReady(
  requestedLanguages: Array<string | null | undefined> = [],
) {
  if (!prismLanguagesReadyPromise) {
    prismLanguagesReadyPromise = (async () => {
      const normalized = new Set(
        requestedLanguages.map((language) => normalizePrismLanguage(language)).filter(Boolean),
      )

      normalized.add('sql')

      if (normalized.has('trilogy')) {
        normalized.add('sql')
      }
      if (normalized.has('typescript')) {
        normalized.add('javascript')
      }
      if (normalized.has('json')) {
        normalized.add('javascript')
      }
      if (normalized.has('markdown')) {
        normalized.add('markup')
      }

      const preferredOrder = [
        'markup',
        'javascript',
        'typescript',
        'python',
        'sql',
        'json',
        'markdown',
      ]

      for (const language of preferredOrder) {
        if (normalized.has(language)) {
          await loadPrismLanguage(language)
        }
      }

      defineTrilogyLanguage()
    })().catch((error) => {
      prismLanguagesReadyPromise = null
      throw error
    })
  }

  await prismLanguagesReadyPromise
}

export { Prism }
