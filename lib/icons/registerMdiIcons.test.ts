import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { ICON_CLASS_NAMES, resolveMdiIconPath } from './registerMdiIcons'

/**
 * Icons are an explicit allowlist: a class only renders if it appears in
 * ICON_CLASS_NAMES *and* ICON_PATH_MAP. An unregistered one fails silently and
 * badly — `.mdi::before` still paints a 1em box filled with currentColor, just
 * with no mask — so the UI shows a solid black square rather than nothing at
 * all. That reads as a styling quirk, not a missing registration, which is why
 * it needs a test rather than review attention.
 */

const REPO_ROOT = resolve(__dirname, '../..')
const SCAN_DIRS = ['lib', 'src']
const SCAN_EXTENSIONS = ['.vue', '.ts', '.js']
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'coverage', 'test-results'])

/** Sizing/animation modifiers defined in buildBaseCss, not icon glyphs. */
const MODIFIER_CLASSES = /^mdi-(?:set|spin|\d+px|rotate-\d+|flip-[hv])$/

/**
 * Project-internal marker classes that merely share the `mdi-` prefix. Keep
 * this list short and justified — every entry is a name this test can no
 * longer protect.
 */
const NON_GLYPH_CLASSES = new Set<string>()

function collectFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      collectFiles(full, found)
    } else if (SCAN_EXTENSIONS.some((ext) => entry.endsWith(ext))) {
      found.push(full)
    }
  }
  return found
}

/** Every `mdi-foo` token used anywhere in the source, mapped to the files
 *  using it so a failure names somewhere to go. */
function collectUsedIcons(): Map<string, Set<string>> {
  const used = new Map<string, Set<string>>()

  for (const dir of SCAN_DIRS) {
    for (const file of collectFiles(join(REPO_ROOT, dir))) {
      // The registration module itself is the allowlist, not a consumer.
      if (file.includes('registerMdiIcons')) continue

      const source = readFileSync(file, 'utf8')
      for (const match of source.matchAll(/\bmdi-[a-z0-9]+(?:-[a-z0-9]+)*\b/g)) {
        const name = match[0]
        if (MODIFIER_CLASSES.test(name) || NON_GLYPH_CLASSES.has(name)) continue
        if (!used.has(name)) used.set(name, new Set())
        used.get(name)!.add(file.slice(REPO_ROOT.length + 1).replace(/\\/g, '/'))
      }
    }
  }

  return used
}

describe('MDI icon registration', () => {
  it('registers every icon class the app actually uses', () => {
    const unregistered = [...collectUsedIcons().entries()]
      .filter(([name]) => resolveMdiIconPath(name) === null)
      .map(([name, files]) => `${name} (used in ${[...files].sort().join(', ')})`)

    expect(unregistered).toEqual([])
  })

  it('resolves a path for every advertised class name', () => {
    // A name in ICON_CLASS_NAMES with no ICON_PATH_MAP entry emits no mask rule
    // and produces the same filled square as an unregistered class.
    const missingPaths = ICON_CLASS_NAMES.filter((name) => !resolveMdiIconPath(name))
    expect(missingPaths).toEqual([])
  })

  it('resolves the icon class out of a full class attribute', () => {
    expect(resolveMdiIconPath('mdi mdi-palette-outline filter-action-icon')).toBeTruthy()
    expect(resolveMdiIconPath('mdi mdi-not-a-real-icon')).toBeNull()
  })
})
