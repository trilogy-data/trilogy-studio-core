/**
 * Chart colours and type that follow the surrounding stylesheet.
 *
 * Vega renders to a canvas, so it cannot read CSS custom properties the way
 * the dashboard chrome does. Every axis label, legend entry, headline value
 * and annotation used to be a mode-keyed literal, which meant an embedding
 * host could theme the card around a chart but never the chart itself: light
 * mode painted a white plot area and slate-grey text whatever the page looked
 * like.
 *
 * `resolveChartThemeFromElement` closes that gap by reading a small, STABLE
 * set of custom properties off the chart's own element at render time. Each
 * slot is tried as a chart-specific `--trilogy-chart-*` property first, then
 * as the embed/app token it would naturally follow, so a host that already
 * themes the chrome gets matching charts for free and one that wants charts
 * to differ can say so without touching the chrome.
 *
 * Every slot is optional. A slot that resolves to nothing leaves the
 * builders' existing per-mode literals in place, which keeps a chart outside
 * any themed container (and every existing test) byte-identical.
 */

export interface ChartTheme {
  /** Vega `config.font`: axis and legend labels, headline text, annotations. */
  font?: string
  /** Primary text: headline values, chart titles, legend titles, donut labels. */
  text?: string
  /** Secondary text: axis labels and titles, legend labels, headline labels, annotations. */
  textMuted?: string
  /** Axis domain line and tick stroke. */
  axis?: string
  /** Gridlines. */
  grid?: string
}

export interface ChartThemeVariable {
  slot: keyof ChartTheme
  /** Custom properties tried in order; the first non-empty value wins. */
  sources: readonly string[]
}

/** The contract, in resolution order. Documented in `embedTheme.css`. */
export const CHART_THEME_VARIABLES: readonly ChartThemeVariable[] = [
  { slot: 'font', sources: ['--trilogy-chart-font', '--font'] },
  { slot: 'text', sources: ['--trilogy-chart-text', '--text-color'] },
  { slot: 'textMuted', sources: ['--trilogy-chart-text-muted', '--text-color-muted'] },
  { slot: 'axis', sources: ['--trilogy-chart-axis', '--border-color'] },
  { slot: 'grid', sources: ['--trilogy-chart-grid', '--border-light'] },
]

/**
 * Read the chart theme off an element's computed style.
 *
 * Returns only the slots that resolved, so spreading the result over the
 * mode literals is safe. Tolerates a missing element and a DOM without
 * `getComputedStyle` (test environments), in which case nothing resolves.
 */
export function resolveChartThemeFromElement(element: Element | null | undefined): ChartTheme {
  if (!element || typeof getComputedStyle !== 'function') return {}
  let style: CSSStyleDeclaration
  try {
    style = getComputedStyle(element)
  } catch {
    return {}
  }
  const theme: ChartTheme = {}
  for (const { slot, sources } of CHART_THEME_VARIABLES) {
    for (const source of sources) {
      const value = style.getPropertyValue(source).trim()
      if (value) {
        theme[slot] = value
        break
      }
    }
  }
  return theme
}

/**
 * The Vega-Lite `config` block that carries the theme: axis, legend and font.
 *
 * The plot area is never filled. Light mode used to paint it white, which a
 * host with any other page colour saw as a white rectangle inside each card;
 * the embed and app stylesheets already give the surrounding surface its
 * colour, so a transparent view is what both modes want.
 */
export function buildVegaThemeConfig(
  currentTheme: 'light' | 'dark' | '',
  theme: ChartTheme = {},
): Record<string, any> {
  const literals =
    currentTheme === 'light'
      ? {
          axis: '#cfd6df',
          grid: '#e5e9ef',
          axisText: '#475569',
          legendText: '#475569',
          legendTitle: '#334155',
        }
      : {
          axis: '#2a2f37',
          grid: '#1f242c',
          axisText: '#cbd5e1',
          legendText: '#cbd5e1',
          legendTitle: '#e5e7eb',
        }

  const config: Record<string, any> = {
    view: {
      stroke: null,
    },
    axis: {
      domainColor: theme.axis ?? literals.axis,
      tickColor: theme.axis ?? literals.axis,
      gridColor: theme.grid ?? literals.grid,
      labelColor: theme.textMuted ?? literals.axisText,
      titleColor: theme.textMuted ?? literals.axisText,
    },
    legend: {
      labelColor: theme.textMuted ?? literals.legendText,
      titleColor: theme.text ?? literals.legendTitle,
    },
    header: {},
  }
  if (theme.font) {
    config.font = theme.font
  }
  return config
}

/** Primary text colour for a mark, honouring the theme before the mode literal. */
export function chartTextColor(
  currentTheme: string,
  theme: ChartTheme | undefined,
  literals: { light: string; dark: string },
): string {
  return theme?.text ?? (currentTheme === 'light' ? literals.light : literals.dark)
}

/** Secondary text colour for a mark, honouring the theme before the mode literal. */
export function chartMutedTextColor(
  currentTheme: string,
  theme: ChartTheme | undefined,
  literals: { light: string; dark: string },
): string {
  return theme?.textMuted ?? (currentTheme === 'light' ? literals.light : literals.dark)
}
