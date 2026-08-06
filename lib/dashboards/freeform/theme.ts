import type { FreeformTheme } from './types'

/**
 * The theme contract handed to freeform widgets.
 *
 * Widgets cannot read the host stylesheet — the frame has an opaque origin —
 * so anything they should match has to be pushed across explicitly. This is a
 * STABLE contract: `--widget-*` names are what widget authors (and the agent)
 * are told to use, and they must keep working even if the app renames its own
 * internal custom properties. Each entry maps to the first host variable that
 * resolves, with a per-mode fallback so a widget is legible even when the host
 * defines nothing.
 *
 * The underlying host variables are forwarded too, so `var(--text-color)`
 * keeps working for anyone already using it — but the contract below is the
 * documented surface.
 */

export interface WidgetThemeVariable {
  /** Stable widget-facing name. */
  name: string
  /** Host variables tried in order; first non-empty value wins. */
  sources: string[]
  /** Used when no host variable resolves. */
  fallback: { light: string; dark: string }
}

export const WIDGET_THEME_CONTRACT: readonly WidgetThemeVariable[] = [
  {
    name: '--widget-font',
    sources: ['--font'],
    fallback: {
      light: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      dark: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    },
  },
  {
    name: '--widget-font-size',
    sources: ['--font-size'],
    fallback: { light: '14px', dark: '14px' },
  },
  {
    name: '--widget-bg',
    sources: ['--dashboard-background', '--bg-color'],
    fallback: { light: '#ffffff', dark: '#121417' },
  },
  {
    name: '--widget-surface',
    sources: ['--panel-header-bg', '--query-window-bg'],
    fallback: { light: '#f6f8fb', dark: '#111318' },
  },
  {
    name: '--widget-text',
    sources: ['--text-color'],
    fallback: { light: '#1f2937', dark: '#e5e7eb' },
  },
  {
    name: '--widget-text-muted',
    sources: ['--dashboard-helper-text', '--text-color-muted'],
    fallback: { light: '#425466', dark: '#d3dbe5' },
  },
  {
    name: '--widget-border',
    sources: ['--border', '--border-color'],
    fallback: { light: '#d6dde6', dark: '#2a2f37' },
  },
  {
    name: '--widget-border-light',
    sources: ['--border-light'],
    fallback: { light: '#e1e6ed', dark: '#1b2027' },
  },
  {
    name: '--widget-accent',
    sources: ['--special-text'],
    fallback: { light: '#2563eb', dark: '#60a5fa' },
  },
  {
    name: '--widget-accent-rgb',
    sources: ['--special-text-rgb'],
    fallback: { light: '37, 99, 235', dark: '96, 165, 250' },
  },
  {
    name: '--widget-negative',
    sources: ['--delete-color'],
    fallback: { light: '#dc2626', dark: '#f87171' },
  },
  {
    name: '--widget-positive',
    sources: ['--success-color'],
    fallback: { light: '#15803d', dark: '#4ade80' },
  },
]

/** Categorical series colors, so a widget charting several series doesn't have
 *  to invent a palette (and pick one that vanishes in the other mode). */
const SERIES_PALETTE: Record<'light' | 'dark', string[]> = {
  light: ['#2563eb', '#d97706', '#059669', '#db2777', '#7c3aed', '#0891b2'],
  dark: ['#60a5fa', '#fbbf24', '#34d399', '#f472b6', '#a78bfa', '#22d3ee'],
}

/** Host variables forwarded verbatim alongside the contract, for widgets that
 *  reference the app's own names. */
const FORWARDED_HOST_VARS = [
  '--font',
  '--font-size',
  '--text-color',
  '--bg-color',
  '--border',
  '--border-light',
  '--special-text',
  '--special-text-rgb',
  '--dashboard-background',
  '--dashboard-helper-text',
  '--panel-header-bg',
  '--delete-color',
]

export interface BuildWidgetThemeOptions {
  mode: 'light' | 'dark'
  /** Element to resolve host custom properties against. When absent (SSR,
   *  tests, or an unmounted cell) the per-mode fallbacks are used. */
  element?: HTMLElement | null
}

/** Resolve the full theme payload pushed into a widget frame. */
export function buildWidgetTheme(options: BuildWidgetThemeOptions): FreeformTheme {
  const { mode, element } = options
  const computed =
    element && typeof getComputedStyle === 'function' ? getComputedStyle(element) : null

  const read = (name: string): string => (computed?.getPropertyValue(name) || '').trim()

  const vars: Record<string, string> = {}

  for (const variable of WIDGET_THEME_CONTRACT) {
    let value = ''
    for (const source of variable.sources) {
      value = read(source)
      if (value) break
    }
    vars[variable.name] = value || variable.fallback[mode]
  }

  SERIES_PALETTE[mode].forEach((color, index) => {
    vars[`--widget-series-${index + 1}`] = color
  })

  for (const name of FORWARDED_HOST_VARS) {
    const value = read(name)
    if (value) vars[name] = value
  }

  return { mode, vars }
}
