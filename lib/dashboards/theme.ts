/**
 * Per-dashboard container theming.
 *
 * The dashboard chrome (card corners, gutters, header tint, elevation) was
 * historically a pile of literals in `DashboardGridItem.vue`. This module turns
 * it into a small, CLOSED vocabulary that can be persisted on the dashboard
 * definition, validated, and handed to the agent as a tool schema.
 *
 * Deliberately not "arbitrary CSS": a dashboard can be shared or loaded from a
 * remote store, so every color goes through `isSafeColor` and every geometric
 * knob is an enum rather than a free string. What you can express is bounded by
 * `DashboardTheme` and nothing else.
 *
 * Resolution is a pure function so the same values drive CSS custom properties
 * AND the two vue3-grid-layout props (`margin`, `row-height`) that CSS cannot
 * reach. Anything the theme leaves unset emits NO variable at all — the
 * stylesheet's existing fallback chain then applies, which is already
 * light/dark aware. That is what keeps `theme: undefined` byte-identical to the
 * pre-theming rendering.
 */

export type DashboardThemePreset = 'default' | 'flat' | 'paper' | 'dense'
export type DashboardCorners = 'square' | 'soft' | 'round'
export type DashboardDensity = 'compact' | 'comfortable' | 'spacious'
export type DashboardElevation = 'none' | 'subtle' | 'raised'

export interface DashboardTheme {
  /** Baseline look. Individual fields below override whatever it sets. */
  preset?: DashboardThemePreset
  corners?: DashboardCorners
  density?: DashboardDensity
  elevation?: DashboardElevation
  /** Keep the card treatment on narrow viewports. When false (the historical
   *  behaviour) cells flatten to the page background below 768px. */
  mobileCards?: boolean
  /** Colors. Omitted entries inherit the app/embed theme, so a dashboard that
   *  sets none of these still renders correctly in both light and dark. */
  cardBackground?: string
  headerBackground?: string
  canvasBackground?: string
  borderColor?: string
  textColor?: string
  accentColor?: string
}

/** What a resolved theme actually drives. */
export interface ResolvedDashboardTheme {
  /** Custom properties to set on the dashboard root element. */
  vars: Record<string, string>
  /** vue3-grid-layout `margin` prop — [horizontal, vertical] gutter in px. */
  gridMargin: [number, number]
  /** vue3-grid-layout `row-height` prop, in px. */
  rowHeight: number
}

/**
 * The vocabulary, described once. The settings picker renders these labels and
 * the agent tool schema enumerates the same values with the same hints, so the
 * two surfaces cannot drift into offering different themes.
 */
export interface DashboardThemeOption<T extends string> {
  value: T
  label: string
  /** One line on when to pick it. Shown under the label in the picker and
   *  inlined into the agent's tool schema. */
  hint: string
}

export const DASHBOARD_PRESET_OPTIONS: readonly DashboardThemeOption<DashboardThemePreset>[] = [
  {
    value: 'default',
    label: 'Default',
    hint: 'Rounded cards, tinted headers, a hairline ring. The standard look.',
  },
  {
    value: 'flat',
    label: 'Flat',
    hint: 'Square corners, no shadow, untinted headers. Reads as one surface.',
  },
  {
    value: 'paper',
    label: 'Paper',
    hint: 'Borderless cards floating on the canvas with roomy spacing. Best for reports and presentations.',
  },
  {
    value: 'dense',
    label: 'Dense',
    hint: 'Tight gutters and short headers, to fit more panels on one screen.',
  },
]

export const DASHBOARD_CORNER_OPTIONS: readonly DashboardThemeOption<DashboardCorners>[] = [
  { value: 'square', label: 'Square', hint: 'No rounding.' },
  { value: 'soft', label: 'Soft', hint: 'Lightly rounded.' },
  { value: 'round', label: 'Round', hint: 'Fully rounded cards.' },
]

export const DASHBOARD_DENSITY_OPTIONS: readonly DashboardThemeOption<DashboardDensity>[] = [
  { value: 'compact', label: 'Compact', hint: 'Tight gutters and padding.' },
  { value: 'comfortable', label: 'Comfortable', hint: 'Balanced spacing.' },
  { value: 'spacious', label: 'Spacious', hint: 'Generous gutters and padding.' },
]

export const DASHBOARD_ELEVATION_OPTIONS: readonly DashboardThemeOption<DashboardElevation>[] = [
  { value: 'none', label: 'None', hint: 'Cards sit flat on the canvas.' },
  { value: 'subtle', label: 'Subtle', hint: 'A faint drop shadow.' },
  { value: 'raised', label: 'Raised', hint: 'Cards clearly float.' },
]

export const DASHBOARD_THEME_PRESETS: readonly DashboardThemePreset[] =
  DASHBOARD_PRESET_OPTIONS.map((option) => option.value)
export const DASHBOARD_CORNERS: readonly DashboardCorners[] = DASHBOARD_CORNER_OPTIONS.map(
  (option) => option.value,
)
export const DASHBOARD_DENSITIES: readonly DashboardDensity[] = DASHBOARD_DENSITY_OPTIONS.map(
  (option) => option.value,
)
export const DASHBOARD_ELEVATIONS: readonly DashboardElevation[] = DASHBOARD_ELEVATION_OPTIONS.map(
  (option) => option.value,
)

/** Color slots, in the order the picker shows them. */
export const DASHBOARD_THEME_COLOR_KEYS = [
  'canvasBackground',
  'cardBackground',
  'headerBackground',
  'borderColor',
  'textColor',
  'accentColor',
] as const

export type DashboardThemeColorKey = (typeof DASHBOARD_THEME_COLOR_KEYS)[number]

export const DASHBOARD_THEME_COLOR_OPTIONS: readonly {
  key: DashboardThemeColorKey
  label: string
  hint: string
  /** Stand-in swatch for an unset slot, so the picker's color input has
   *  somewhere to start. Never persisted — an unset slot stays unset. */
  placeholder: { light: string; dark: string }
}[] = [
  {
    key: 'canvasBackground',
    label: 'Canvas',
    hint: 'The page behind the cards.',
    placeholder: { light: '#f6f8fb', dark: '#0d0f13' },
  },
  {
    key: 'cardBackground',
    label: 'Card',
    hint: 'Fill of each panel.',
    placeholder: { light: '#ffffff', dark: '#121417' },
  },
  {
    key: 'headerBackground',
    label: 'Card header',
    hint: 'Title strip at the top of each panel.',
    placeholder: { light: '#f6f8fb', dark: '#111318' },
  },
  {
    key: 'borderColor',
    label: 'Border',
    hint: 'Card ring and header rule.',
    placeholder: { light: '#d6dde6', dark: '#2a2f37' },
  },
  {
    key: 'textColor',
    label: 'Text',
    hint: 'Body and title text.',
    placeholder: { light: '#1f2733', dark: '#e6e9ef' },
  },
  {
    key: 'accentColor',
    label: 'Accent',
    hint: 'Links, chips, active controls, and chart highlights.',
    placeholder: { light: '#2563eb', dark: '#60a5fa' },
  },
]

/** Mirrors the existing fallback chain in DashboardGridItem.vue, so a value
 *  that wants to say "whatever the card background already is" can. */
const CARD_BG_CHAIN =
  'var(--dashboard-card-bg, var(--trilogy-embed-dashboard-background, var(--dashboard-background, #ffffff)))'

const BORDER_COLOR_CHAIN =
  'var(--dashboard-card-border-color, var(--trilogy-embed-border, var(--border-color, var(--border, #d6dde6))))'

interface CornerSpec {
  card: string
  control: string
  chip: string
}

const CORNER_SPECS: Record<DashboardCorners, CornerSpec> = {
  square: { card: '0px', control: '0px', chip: '4px' },
  soft: { card: '8px', control: '6px', chip: '999px' },
  // Matches the pre-theming literals exactly.
  round: { card: '14px', control: '10px', chip: '999px' },
}

interface DensitySpec {
  gutter: number
  rowHeight: number
  canvasPadding: string
  headerPadding: string
  headerMinHeight: string
  mobileGap: string
  mobileCanvasPadding: string
  mobileHeaderPadding: string
  mobileHeaderMinHeight: string
}

const DENSITY_SPECS: Record<DashboardDensity, DensitySpec> = {
  compact: {
    gutter: 6,
    rowHeight: 30,
    canvasPadding: '8px 10px 16px',
    headerPadding: '2px 8px 2px',
    headerMinHeight: '24px',
    mobileGap: '8px',
    mobileCanvasPadding: '4px 6px',
    mobileHeaderPadding: '2px 8px 2px',
    mobileHeaderMinHeight: '22px',
  },
  // Matches the pre-theming literals exactly.
  comfortable: {
    gutter: 10,
    rowHeight: 30,
    canvasPadding: '16px 18px 24px',
    headerPadding: '4px 12px 3px',
    headerMinHeight: '27px',
    mobileGap: '15px',
    mobileCanvasPadding: '5px 10px',
    mobileHeaderPadding: '3px 10px 2px',
    mobileHeaderMinHeight: '25px',
  },
  spacious: {
    gutter: 16,
    rowHeight: 32,
    canvasPadding: '24px 28px 32px',
    headerPadding: '7px 16px 6px',
    headerMinHeight: '34px',
    mobileGap: '22px',
    mobileCanvasPadding: '10px 14px',
    mobileHeaderPadding: '6px 14px 5px',
    mobileHeaderMinHeight: '32px',
  },
}

/** Drop shadows are the one geometric knob that is mode-dependent — a shadow
 *  tuned for white surfaces disappears on a dark canvas. */
const ELEVATION_SHADOWS: Record<DashboardElevation, { light: string; dark: string }> = {
  none: { light: 'none', dark: 'none' },
  // Matches --surface-shadow in embedTheme.css for both modes.
  subtle: {
    light: '0 1px 2px rgba(15, 23, 42, 0.08)',
    dark: '0 1px 2px rgba(2, 6, 23, 0.35)',
  },
  raised: {
    light: '0 8px 20px rgba(15, 23, 42, 0.12)',
    dark: '0 8px 20px rgba(2, 6, 23, 0.5)',
  },
}

interface PresetSpec {
  corners: DashboardCorners
  density: DashboardDensity
  elevation: DashboardElevation
  mobileCards: boolean
  /** Card ring / header rule thickness. `paper` drops it and leans on shadow. */
  borderWidth: string
  /** When false the header shares the card background instead of the tinted
   *  `--panel-header-bg` surface. */
  headerTint: boolean
}

const PRESET_SPECS: Record<DashboardThemePreset, PresetSpec> = {
  default: {
    corners: 'round',
    density: 'comfortable',
    elevation: 'subtle',
    mobileCards: false,
    borderWidth: '1px',
    headerTint: true,
  },
  flat: {
    corners: 'square',
    density: 'comfortable',
    elevation: 'none',
    mobileCards: false,
    borderWidth: '1px',
    headerTint: false,
  },
  paper: {
    corners: 'round',
    density: 'spacious',
    elevation: 'raised',
    mobileCards: true,
    borderWidth: '0px',
    headerTint: true,
  },
  dense: {
    corners: 'soft',
    density: 'compact',
    elevation: 'subtle',
    mobileCards: false,
    borderWidth: '1px',
    headerTint: true,
  },
}

/**
 * Colors reach us from persisted (and possibly shared or remote) dashboard
 * JSON, and end up in a `style` attribute. Vue writes those through
 * `style.setProperty`, so new rules can't be injected — but a permissive value
 * could still smuggle a `url()` that phones home when the dashboard is opened.
 * Accept only the notations that describe a color and nothing else.
 */
const HEX_COLOR = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i
const FUNCTIONAL_COLOR = /^(?:rgb|rgba|hsl|hsla)\(\s*[0-9a-z.,%/\s-]+\)$/i
const NAMED_COLOR = /^[a-z]+$/i

export function isSafeColor(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > 64) return false
  // No escapes, comments, statement breaks, or nested functions.
  if (/[;{}\\<>]|\/\*|url\(|var\(|expression|@import/i.test(trimmed)) return false
  return HEX_COLOR.test(trimmed) || FUNCTIONAL_COLOR.test(trimmed) || NAMED_COLOR.test(trimmed)
}

/** `--special-text-rgb` is consumed as a bare `r, g, b` triple inside
 *  `rgba(...)`, so an accent override has to supply one or the accent-tinted
 *  chips and hover states would keep the old hue. Returns null for notations we
 *  can't decompose, in which case the inherited triple is simply left alone. */
export function toRgbTriple(color: string): string | null {
  const trimmed = color.trim()

  const hex = trimmed.match(/^#([0-9a-f]{3,8})$/i)?.[1]
  if (hex) {
    const expand = (h: string) =>
      h.length === 3 || h.length === 4
        ? h
            .slice(0, 3)
            .split('')
            .map((c) => c + c)
            .join('')
        : h.slice(0, 6)
    if (hex.length === 5 || hex.length === 7) return null
    const full = expand(hex)
    const int = parseInt(full, 16)
    if (Number.isNaN(int)) return null
    return `${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}`
  }

  const rgb = trimmed.match(/^rgba?\(\s*([0-9.]+)[\s,]+([0-9.]+)[\s,]+([0-9.]+)/i)
  if (rgb) {
    const parts = [rgb[1], rgb[2], rgb[3]].map((p) => Math.round(Number(p)))
    if (parts.some((p) => !Number.isFinite(p) || p < 0 || p > 255)) return null
    return parts.join(', ')
  }

  return null
}

/** Drop unknown keys and unsafe values. Persisted themes come from JSON and,
 *  for remote dashboards, from someone else's browser. */
export function sanitizeDashboardTheme(input: unknown): DashboardTheme | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined
  const raw = input as Record<string, unknown>
  const theme: DashboardTheme = {}

  const pickEnum = <T extends string>(value: unknown, allowed: readonly T[]): T | undefined =>
    typeof value === 'string' && (allowed as readonly string[]).includes(value)
      ? (value as T)
      : undefined

  const preset = pickEnum(raw.preset, DASHBOARD_THEME_PRESETS)
  if (preset) theme.preset = preset
  const corners = pickEnum(raw.corners, DASHBOARD_CORNERS)
  if (corners) theme.corners = corners
  const density = pickEnum(raw.density, DASHBOARD_DENSITIES)
  if (density) theme.density = density
  const elevation = pickEnum(raw.elevation, DASHBOARD_ELEVATIONS)
  if (elevation) theme.elevation = elevation
  if (typeof raw.mobileCards === 'boolean') theme.mobileCards = raw.mobileCards

  for (const key of DASHBOARD_THEME_COLOR_KEYS) {
    if (isSafeColor(raw[key])) theme[key] = raw[key].trim()
  }

  return Object.keys(theme).length > 0 ? theme : undefined
}

/**
 * One-line summary of a theme, for the agent's dashboard-state snapshot and for
 * tool acknowledgements. The agent cannot see the rendered dashboard between
 * screenshots, so its only view of the current styling is this string —
 * unset knobs are named explicitly rather than omitted, so "inherited" and
 * "I forgot to look" don't read the same.
 */
export function describeDashboardTheme(theme?: DashboardTheme | null): string {
  if (!theme || Object.keys(theme).length === 0) {
    return 'default (inherits the app light/dark theme)'
  }

  const parts: string[] = [`preset ${theme.preset || 'default'}`]
  if (theme.corners) parts.push(`corners ${theme.corners}`)
  if (theme.density) parts.push(`density ${theme.density}`)
  if (theme.elevation) parts.push(`elevation ${theme.elevation}`)
  if (theme.mobileCards !== undefined) {
    parts.push(theme.mobileCards ? 'cards kept on mobile' : 'cards flattened on mobile')
  }

  const colors = DASHBOARD_THEME_COLOR_KEYS.filter((key) => theme[key]).map(
    (key) => `${key}=${theme[key]}`,
  )
  parts.push(colors.length > 0 ? `colors: ${colors.join(', ')}` : 'colors inherited')

  return parts.join(', ')
}

export interface ResolveDashboardThemeOptions {
  theme?: DashboardTheme | null
  /** Needed for elevation, which has to differ between light and dark. */
  mode: 'light' | 'dark'
}

/**
 * Turn a (possibly empty) theme into the variables + grid props that render it.
 *
 * Geometry is always emitted: it is mode-independent, and the `default` preset
 * resolves to precisely the literals this replaced, so emitting it is a no-op
 * for untouched dashboards. Colors are emitted only when the author set them,
 * so an unset dashboard keeps inheriting the app's light/dark palette.
 */
export function resolveDashboardTheme(
  options: ResolveDashboardThemeOptions,
): ResolvedDashboardTheme {
  const { mode } = options
  const theme = options.theme || {}
  const preset = PRESET_SPECS[theme.preset || 'default']

  const corners = CORNER_SPECS[theme.corners || preset.corners]
  const density = DENSITY_SPECS[theme.density || preset.density]
  const elevation = theme.elevation || preset.elevation
  const mobileCards = theme.mobileCards ?? preset.mobileCards
  const dropShadow = ELEVATION_SHADOWS[elevation][mode]
  // The mobile rule replaces the whole `box-shadow`, so carrying cards down to
  // narrow viewports has to restate the inset ring that draws the card border.
  const mobileCardShadow =
    `inset 0 0 0 ${preset.borderWidth} ${BORDER_COLOR_CHAIN}` +
    (dropShadow === 'none' ? '' : `, ${dropShadow}`)

  const vars: Record<string, string> = {
    '--dashboard-card-radius': corners.card,
    '--dashboard-control-radius': corners.control,
    '--dashboard-chip-radius': corners.chip,
    '--dashboard-card-border-width': preset.borderWidth,
    '--dashboard-header-border-width': preset.borderWidth,
    // PNG export redraws the card ring as a real border (html2canvas ignores
    // box-shadow). A borderless, elevation-only theme would otherwise export as
    // an invisible card on a same-colored canvas, so floor it at a hairline.
    '--dashboard-export-border-width': preset.borderWidth === '0px' ? '1px' : preset.borderWidth,
    '--dashboard-card-shadow': dropShadow,
    '--dashboard-canvas-padding': density.canvasPadding,
    '--dashboard-header-padding': density.headerPadding,
    '--dashboard-header-min-height': density.headerMinHeight,
    '--dashboard-gutter': `${density.gutter}px`,
    // Mobile. Defaults reproduce the historical flatten-below-768px behaviour;
    // `mobileCards` opts into carrying the card treatment down.
    '--dashboard-card-radius-mobile': mobileCards ? corners.card : '0px',
    '--dashboard-card-bg-mobile': mobileCards ? CARD_BG_CHAIN : 'transparent',
    '--dashboard-card-shadow-mobile': mobileCards ? mobileCardShadow : 'none',
    '--dashboard-header-border-width-mobile': mobileCards ? preset.borderWidth : '0px',
    '--dashboard-mobile-item-bg': mobileCards
      ? 'transparent'
      : 'var(--result-window-bg, transparent)',
    '--dashboard-mobile-gap': density.mobileGap,
    '--dashboard-mobile-canvas-padding': density.mobileCanvasPadding,
    '--dashboard-header-padding-mobile': density.mobileHeaderPadding,
    '--dashboard-header-min-height-mobile': density.mobileHeaderMinHeight,
  }

  if (!preset.headerTint && !theme.headerBackground) {
    vars['--dashboard-header-bg'] = CARD_BG_CHAIN
  }

  if (theme.cardBackground) vars['--dashboard-card-bg'] = theme.cardBackground
  if (theme.headerBackground) vars['--dashboard-header-bg'] = theme.headerBackground
  if (theme.canvasBackground) vars['--dashboard-canvas-bg'] = theme.canvasBackground
  if (theme.borderColor) vars['--dashboard-card-border-color'] = theme.borderColor
  if (theme.textColor) vars['--text-color'] = theme.textColor
  if (theme.accentColor) {
    vars['--special-text'] = theme.accentColor
    const triple = toRgbTriple(theme.accentColor)
    if (triple) vars['--special-text-rgb'] = triple
  }

  return {
    vars,
    gridMargin: [density.gutter, density.gutter],
    rowHeight: density.rowHeight,
  }
}

/**
 * An embedding host's explicit `theme.variables` outrank the dashboard's own
 * theme. The dashboard root is a descendant of `TrilogyEmbedProvider`, so the
 * cascade alone would let a shared dashboard definition repaint the host's
 * branding; deciding precedence here rather than in CSS keeps the host in
 * control of anything it named.
 */
export function applyEmbedPrecedence(
  vars: Record<string, string>,
  embedVariables?: Record<string, string | number> | null,
): Record<string, string> {
  if (!embedVariables) return vars
  const result: Record<string, string> = {}
  for (const [name, value] of Object.entries(vars)) {
    if (!(name in embedVariables)) result[name] = value
  }
  return result
}
