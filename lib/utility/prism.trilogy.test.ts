import { describe, it, expect } from 'vitest'
import { Prism, ensurePrismLanguagesReady } from './prism'

// Deliberately its own file: Prism.languages is a module-level singleton, so
// asserting that a grammar was NOT loaded only means anything in a test file
// that has not already loaded it for some other reason.
describe('trilogy grammar registration', () => {
  it('registers trilogy without importing sql', async () => {
    // The grammar used to be built by spreading Prism.languages.sql, so every
    // surface that could render Trilogy paid to import prism-sql. It is now
    // standalone.
    await ensurePrismLanguagesReady(['trilogy'])

    expect(Prism.languages.trilogy).toBeTruthy()
    expect(Prism.languages.preql).toBeTruthy()
    expect(Prism.languages.sql).toBeFalsy()
  })

  it('highlights Trilogy-specific syntax the SQL-derived grammar got wrong', async () => {
    await ensurePrismLanguagesReady(['trilogy'])

    const html = Prism.highlight(
      '# a note\nselect --hidden, sum(x) -> total;',
      Prism.languages.trilogy,
      'trilogy',
    )

    // `#` is a comment and `--` is a select-item modifier -- the SQL grammar
    // had both of these exactly backwards.
    expect(html).toContain('<span class="token comment"># a note</span>')
    expect(html).toContain('token hide-modifier')
    expect(html).not.toContain('<span class="token comment">--hidden')
  })
})
