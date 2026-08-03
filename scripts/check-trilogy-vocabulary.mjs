/**
 * Compares the shared Trilogy vocabulary against pytrilogy's own grammar file.
 *
 * The highlighter word lists were hand-maintained for a long time and drifted
 * badly: ~45 functions were missing, `date_trunc` was absent while its alias
 * `date_truncate` was present, and nine entries turned out to be lark rule
 * names (`SELECT_LIST`, `HAVING_CLAUSE`) that never appear in Trilogy source at
 * all. This script makes that drift a build failure instead of a bug report.
 *
 *   node scripts/check-trilogy-vocabulary.mjs           # report
 *   node scripts/check-trilogy-vocabulary.mjs --check   # exit 1 on drift
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const checkMode = process.argv.includes('--check')

function findGrammarFile() {
  const roots = [
    process.env.VIRTUAL_ENV,
    join(repoRoot, '.venv'),
    join(repoRoot, 'venv'),
    join(repoRoot, 'pyserver', '.venv'),
  ].filter(Boolean)

  for (const root of roots) {
    // Windows: <venv>/Lib/site-packages. POSIX: <venv>/lib/python3.x/site-packages.
    const candidates = [join(root, 'Lib', 'site-packages')]
    const posixLib = join(root, 'lib')
    if (existsSync(posixLib)) {
      for (const entry of readdirSync(posixLib)) {
        candidates.push(join(posixLib, entry, 'site-packages'))
      }
    }
    for (const sitePackages of candidates) {
      const grammar = join(sitePackages, 'trilogy', 'parsing', 'trilogy.lark')
      if (existsSync(grammar)) {
        return grammar
      }
    }
  }

  // Fallback: ask the interpreter. CI installs pytrilogy with plain pip into
  // the setup-python toolchain, where there is no venv directory to walk.
  const interpreters = [
    process.env.PYTHON,
    process.platform === 'win32' ? 'python.exe' : 'python3',
    'python',
  ].filter(Boolean)

  for (const interpreter of interpreters) {
    const attempt = spawnSync(
      interpreter,
      ['-c', 'import trilogy, os; print(os.path.dirname(trilogy.__file__))'],
      { encoding: 'utf8' },
    )
    if (attempt.status === 0) {
      const grammar = join(attempt.stdout.trim(), 'parsing', 'trilogy.lark')
      if (existsSync(grammar)) {
        return grammar
      }
    }
  }

  return null
}

/**
 * Names the grammar defines but the highlighter deliberately does not match as
 * a standalone word, because each is far too plausible as a concept name.
 * Every one of these is instead covered by a context-gated pattern in
 * CONTEXTUAL_KEYWORD_PATTERNS, or left unhighlighted on purpose.
 */
const INTENTIONALLY_UNMATCHED = new Set([
  // chart types -- only meaningful after `layer` / `place` / `set`
  'line',
  'bar',
  'barh',
  'point',
  'area',
  'headline',
  'donut',
  'heatmap',
  'boxplot',
  'treemap',
  'hline',
  'vline',
  'hide_legend',
  'show_title',
  'scale_x',
  'scale_y',
  'linear',
  'log',
  'sqrt',
  'at',
  'set',
  'layer',
  'place',
  // datasource status clause -- only after `state`
  'state',
  'published',
  'unpublished',
  // ordering tail -- only after `nulls`
  'first',
  'last',
  // create modifiers / def table -- matched as whole phrases
  'exists',
  'table',
  'data',
  // copy targets and hash algorithms: argument values, not keywords
  'csv',
  'json',
  'parquet',
  'png',
  'svg',
  'html',
  'pdf',
  'md5',
  'sha1',
  'sha256',
  'sha512',
  // DATE_PART values: argument positions inside the date_* functions
  'second',
  'minute',
  'hour',
  'day',
  'day_of_week',
  'week',
  'month',
  'quarter',
  'year',
])

function extractGrammarNames(source) {
  const functions = new Set()
  const words = new Set()

  // Strip line comments so commented-out rules do not count.
  const body = source.replace(/^\s*\/\/.*$/gm, '')

  // `"name("i` and `"name" "("` -- a callable.
  for (const [, name] of body.matchAll(/"([a-zA-Z_][a-zA-Z0-9_]*)\("/g)) {
    functions.add(name.toLowerCase())
  }
  // Regex terminals: /name\(/, /name\s*\(/, /name\(\)/.
  for (const [, name] of body.matchAll(/\/([a-zA-Z_][a-zA-Z0-9_]*)(?:\\s\*)?\\\(/g)) {
    functions.add(name.toLowerCase())
  }
  // Bare quoted words -- keywords, purposes, types, modifiers.
  for (const [, word] of body.matchAll(/"([a-zA-Z_][a-zA-Z0-9_]*)"/g)) {
    words.add(word.toLowerCase())
  }

  return { functions, words }
}

async function main() {
  const grammarPath = findGrammarFile()
  if (!grammarPath) {
    console.error(
      'Could not find trilogy/parsing/trilogy.lark. Install pyserver/requirements.txt into the repository virtualenv first.',
    )
    process.exit(checkMode ? 1 : 0)
  }

  const vocabulary = await import('@trilogy-data/prism-trilogy/vocabulary')
  const {
    KEYWORDS,
    PURPOSES,
    MODIFIERS,
    DATA_TYPES,
    FUNCTIONS,
    WINDOW_FUNCTIONS,
    DATE_PARTS,
    BOOLEAN_LITERALS,
    NULL_LITERAL,
    CONTEXTUAL_KEYWORD_PATTERNS,
  } = vocabulary

  const known = new Set(
    [
      ...KEYWORDS,
      ...PURPOSES,
      ...MODIFIERS,
      ...DATA_TYPES,
      ...FUNCTIONS,
      ...WINDOW_FUNCTIONS,
      ...DATE_PARTS,
      ...BOOLEAN_LITERALS,
      NULL_LITERAL,
    ].map((word) => word.toLowerCase()),
  )
  // A word is also "covered" if a context-gated pattern mentions it.
  const contextual = CONTEXTUAL_KEYWORD_PATTERNS.join(' ').toLowerCase()

  const { functions, words } = extractGrammarNames(readFileSync(grammarPath, 'utf8'))

  const missing = []
  for (const name of [...functions, ...words].sort()) {
    if (known.has(name) || INTENTIONALLY_UNMATCHED.has(name)) continue
    if (contextual.includes(name)) continue
    missing.push(name)
  }

  // Functions we claim exist but the grammar never mentions.
  const stale = [...FUNCTIONS]
    .map((name) => name.toLowerCase())
    .filter((name) => !functions.has(name) && !words.has(name))
    .sort()

  console.log(`Grammar: ${grammarPath}`)
  console.log(`Vocabulary covers ${known.size} names.`)

  if (missing.length) {
    console.log(`\n${missing.length} name(s) in the grammar are not in the vocabulary:`)
    for (const name of missing) console.log(`  + ${name}`)
  }
  if (stale.length) {
    console.log(`\n${stale.length} function(s) in the vocabulary are not in the grammar:`)
    for (const name of stale) console.log(`  - ${name}`)
  }

  if (!missing.length && !stale.length) {
    console.log('\nVocabulary is in sync with the grammar.')
    return
  }

  console.log(
    '\nUpdate prism-trilogy/src/vocabulary.ts, or add a deliberate omission to INTENTIONALLY_UNMATCHED in this script.',
  )
  if (checkMode) {
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
