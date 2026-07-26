import { describe, it, expect } from 'vitest'
// node: prefix — the jsdom test environment shims the bare specifiers.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))

function styleText(vuePath: string): string {
  const src = readFileSync(join(here, vuePath), 'utf8')
  return [...src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n')
}

/** Comments legitimately quote the broken pattern to explain why it's banned. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

describe('mobile viewport height declarations', () => {
  // `-webkit-fill-available` is a keyword, not a <length>, so it is illegal
  // inside calc(). Crucially, a declaration whose value contains var() is not
  // validated at parse time — it is "invalid at computed-value time", which
  // does NOT fall back to the previous declaration but resets the property to
  // its initial value. So
  //     height: calc(var(--mobile-viewport-height) - var(--h));   /* good */
  //     height: calc(-webkit-fill-available - var(--h));          /* wins, then -> auto */
  // silently collapsed #page-content to height:auto on iOS Safari (the only
  // engine matching -webkit-touch-callout), which stopped it being a scroll
  // container and made dashboards unscrollable. No browser Playwright can run
  // matches that @supports condition, so this is guarded at the source level.
  const files = [
    'MobileSidebarLayout.vue',
    // ideViewport.css is plain CSS, checked separately below.
  ]

  for (const file of files) {
    it(`${file} never puts -webkit-fill-available inside calc()`, () => {
      const css = stripComments(styleText(file))
      const offenders = [...css.matchAll(/calc\([^;]*-webkit-fill-available[^;]*\)/g)].map(
        (m) => m[0],
      )
      expect(offenders).toEqual([])
    })
  }

  it('ideViewport.css never puts -webkit-fill-available inside calc()', () => {
    const css = stripComments(readFileSync(join(here, 'ideViewport.css'), 'utf8'))
    const offenders = [...css.matchAll(/calc\([^;]*-webkit-fill-available[^;]*\)/g)].map(
      (m) => m[0],
    )
    expect(offenders).toEqual([])
  })

  it('the dashboard dock stays at bottom: 0 and underpaints the chrome strip', () => {
    // With viewport-fit=cover the page paints behind iOS Safari's translucent
    // bottom chrome, but WebKit anchors position: fixed elements above the
    // chrome, so dashboard content showed through the strip below the dock.
    // Repositioning the dock into that strip (e.g. compensating bottom with
    // the layout/visual viewport delta) truncates the controls behind the
    // chrome — that regression shipped once. The dock must keep bottom: 0 and
    // instead extend its background downward with solid box-shadow copies,
    // which are ink overflow and so can never create scrollable overflow.
    // No browser we can automate reproduces any of this.
    const css = stripComments(styleText('../dashboard/DashboardHeader.vue'))
    const dockRules = [...css.matchAll(/\.filter-row\s*\{([^}]*)\}/g)].map((m) => m[1])
    const fixedDock = dockRules.find((r) => /position:\s*fixed/.test(r))
    expect(fixedDock, 'fixed mobile dock rule not found').toBeTruthy()
    expect(fixedDock!).toMatch(/bottom:\s*0/)
    expect(fixedDock!).toMatch(/0\s+100px\s+0\s+var\(--query-window-bg\)/)
    expect(fixedDock!).toMatch(/0\s+200px\s+0\s+var\(--query-window-bg\)/)
  })

  it('the mobile panes keep a definite height driven by --mobile-viewport-height', () => {
    const css = stripComments(styleText('MobileSidebarLayout.vue'))
    // Both scrollable panes must retain a definite height; #page-content in
    // particular is the dashboard's scroll container (DashboardMobile's
    // scrollUpOne/scrollDownOne drive it by id).
    for (const selector of ['.sidebar', '.nested-page-content']) {
      const block = css.match(new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`))
      expect(block, `${selector} rule not found`).toBeTruthy()
      expect(block![1]).toMatch(
        /height:\s*calc\(var\(--mobile-viewport-height,\s*100dvh\)\s*-\s*var\(--mobile-header-height\)\)/,
      )
    }
  })
})
