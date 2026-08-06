import { describe, it, expect, afterEach } from 'vitest'
import { buildWidgetTheme, WIDGET_THEME_CONTRACT } from './theme'
import { buildFreeformSrcdoc } from './buildSrcdoc'
import { DEFAULT_FREEFORM_HTML } from './template'

function hostElement(vars: Record<string, string>): HTMLElement {
  const el = document.createElement('div')
  for (const [name, value] of Object.entries(vars)) {
    el.style.setProperty(name, value)
  }
  document.body.appendChild(el)
  return el
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('buildWidgetTheme', () => {
  it('always emits the full contract, even with no host element', () => {
    const light = buildWidgetTheme({ mode: 'light' })
    const dark = buildWidgetTheme({ mode: 'dark' })

    for (const variable of WIDGET_THEME_CONTRACT) {
      expect(light.vars[variable.name]).toBeTruthy()
      expect(dark.vars[variable.name]).toBeTruthy()
    }
    expect(light.mode).toBe('light')
    expect(dark.mode).toBe('dark')
  })

  it('uses mode-appropriate fallbacks so a widget is legible either way', () => {
    const light = buildWidgetTheme({ mode: 'light' })
    const dark = buildWidgetTheme({ mode: 'dark' })
    // The whole bug this contract exists to prevent: same color in both modes.
    expect(light.vars['--widget-text']).not.toBe(dark.vars['--widget-text'])
    expect(light.vars['--widget-bg']).not.toBe(dark.vars['--widget-bg'])
  })

  it('prefers host variables over fallbacks', () => {
    const el = hostElement({ '--text-color': 'rgb(1, 2, 3)', '--special-text': 'rgb(4, 5, 6)' })
    const theme = buildWidgetTheme({ mode: 'light', element: el })
    expect(theme.vars['--widget-text']).toBe('rgb(1, 2, 3)')
    expect(theme.vars['--widget-accent']).toBe('rgb(4, 5, 6)')
  })

  it('falls through the source list in order', () => {
    // --dashboard-background is preferred, --bg-color is the backup.
    const el = hostElement({ '--bg-color': 'rgb(9, 9, 9)' })
    expect(buildWidgetTheme({ mode: 'dark', element: el }).vars['--widget-bg']).toBe('rgb(9, 9, 9)')
  })

  it('provides a categorical series palette that differs by mode', () => {
    const light = buildWidgetTheme({ mode: 'light' })
    const dark = buildWidgetTheme({ mode: 'dark' })
    for (let i = 1; i <= 6; i++) {
      expect(light.vars[`--widget-series-${i}`]).toBeTruthy()
      expect(dark.vars[`--widget-series-${i}`]).toBeTruthy()
    }
    expect(light.vars['--widget-series-1']).not.toBe(dark.vars['--widget-series-1'])
  })

  it('forwards host variables verbatim for widgets using the app names', () => {
    const el = hostElement({ '--text-color': 'rgb(1, 2, 3)' })
    expect(buildWidgetTheme({ mode: 'light', element: el }).vars['--text-color']).toBe(
      'rgb(1, 2, 3)',
    )
  })
})

describe('theme in the generated document', () => {
  it('writes the contract and color-scheme into :root', () => {
    const doc = buildFreeformSrcdoc({
      html: '<p>x</p>',
      theme: buildWidgetTheme({ mode: 'dark' }),
    })
    expect(doc).toContain('color-scheme: dark')
    expect(doc).toContain('--widget-text:')
    expect(doc).toContain('--widget-accent-rgb:')
    expect(doc).toContain('--widget-series-1:')
  })

  it('defaults body typography and color to the contract, not to literals', () => {
    const doc = buildFreeformSrcdoc({ html: '<p>x</p>' })
    expect(doc).toContain('color: var(--widget-text')
    expect(doc).toContain('font-family: var(--widget-font')
    // Transparent, so the widget sits on the dashboard card in either mode.
    expect(doc).toContain('background: transparent')
  })
})

describe('starter widget', () => {
  it('references only theme variables, never literal colors', () => {
    const styleBlock = DEFAULT_FREEFORM_HTML.match(/<style>([\s\S]*?)<\/style>/)?.[1] || ''
    expect(styleBlock).toBeTruthy()
    expect(styleBlock).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(styleBlock).not.toMatch(/\brgb\(\s*\d/)
    expect(styleBlock).not.toMatch(/:\s*(white|black|red|blue|green|gray|grey)\b/i)
    expect(styleBlock).toContain('var(--widget-')
  })
})
