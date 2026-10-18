import { describe, it, expect, afterEach } from 'vitest'
import {
  buildVegaThemeConfig,
  chartMutedTextColor,
  chartTextColor,
  resolveChartThemeFromElement,
} from './chartTheme'

describe('resolveChartThemeFromElement', () => {
  const mounted: HTMLElement[] = []
  const mount = (style: Record<string, string>) => {
    const el = document.createElement('div')
    for (const [name, value] of Object.entries(style)) {
      el.style.setProperty(name, value)
    }
    document.body.appendChild(el)
    mounted.push(el)
    return el
  }

  afterEach(() => {
    for (const el of mounted.splice(0)) el.remove()
  })

  it('returns nothing for a missing element', () => {
    expect(resolveChartThemeFromElement(null)).toEqual({})
    expect(resolveChartThemeFromElement(undefined)).toEqual({})
  })

  it('returns nothing when no token is set, so the mode literals apply', () => {
    expect(resolveChartThemeFromElement(mount({}))).toEqual({})
  })

  it('follows the chrome tokens when no chart-specific token is set', () => {
    const el = mount({
      '--text-color': '#303b2d',
      '--text-color-muted': '#626757',
      '--border-color': '#cecdbb',
      '--border-light': '#e5e7d9',
      '--font': 'Georgia, serif',
    })
    expect(resolveChartThemeFromElement(el)).toEqual({
      font: 'Georgia, serif',
      text: '#303b2d',
      textMuted: '#626757',
      axis: '#cecdbb',
      grid: '#e5e7d9',
    })
  })

  it('prefers the chart-specific token over the chrome token', () => {
    const el = mount({
      '--text-color': '#303b2d',
      '--trilogy-chart-text': '#000000',
      '--border-light': '#e5e7d9',
    })
    expect(resolveChartThemeFromElement(el)).toEqual({ text: '#000000', grid: '#e5e7d9' })
  })
})

describe('buildVegaThemeConfig', () => {
  it('never fills the plot area, in either mode', () => {
    expect(buildVegaThemeConfig('light').view).toEqual({ stroke: null })
    expect(buildVegaThemeConfig('dark').view).toEqual({ stroke: null })
  })

  it('keeps the per-mode literals when no theme is given', () => {
    const light = buildVegaThemeConfig('light')
    expect(light.axis.labelColor).toBe('#475569')
    expect(light.axis.gridColor).toBe('#e5e9ef')
    expect(light.legend.titleColor).toBe('#334155')
    expect(light.font).toBeUndefined()

    const dark = buildVegaThemeConfig('dark')
    expect(dark.axis.labelColor).toBe('#cbd5e1')
    expect(dark.axis.domainColor).toBe('#2a2f37')
    expect(dark.legend.labelColor).toBe('#cbd5e1')
  })

  it('maps each theme slot onto the axis, legend and font config', () => {
    const config = buildVegaThemeConfig('light', {
      font: 'Georgia, serif',
      text: '#111',
      textMuted: '#666',
      axis: '#ccc',
      grid: '#eee',
    })
    expect(config.font).toBe('Georgia, serif')
    expect(config.axis).toEqual({
      domainColor: '#ccc',
      tickColor: '#ccc',
      gridColor: '#eee',
      labelColor: '#666',
      titleColor: '#666',
    })
    expect(config.legend).toEqual({ labelColor: '#666', titleColor: '#111' })
  })

  it('falls back slot by slot, so a partial theme keeps the rest literal', () => {
    const config = buildVegaThemeConfig('dark', { grid: '#333' })
    expect(config.axis.gridColor).toBe('#333')
    expect(config.axis.labelColor).toBe('#cbd5e1')
  })
})

describe('chartTextColor / chartMutedTextColor', () => {
  const literals = { light: '#000', dark: '#fff' }

  it('uses the mode literal without a theme', () => {
    expect(chartTextColor('light', undefined, literals)).toBe('#000')
    expect(chartTextColor('dark', {}, literals)).toBe('#fff')
    expect(chartMutedTextColor('light', undefined, literals)).toBe('#000')
  })

  it('uses the theme slot when set', () => {
    expect(chartTextColor('light', { text: '#123' }, literals)).toBe('#123')
    expect(chartMutedTextColor('dark', { textMuted: '#456' }, literals)).toBe('#456')
    // The other slot does not bleed across.
    expect(chartTextColor('light', { textMuted: '#456' }, literals)).toBe('#000')
  })
})
