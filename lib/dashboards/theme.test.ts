import { describe, expect, it } from 'vitest'
import {
  resolveDashboardTheme,
  sanitizeDashboardTheme,
  applyEmbedPrecedence,
  describeDashboardTheme,
  isSafeColor,
  toRgbTriple,
  DASHBOARD_THEME_PRESETS,
  DASHBOARD_CORNERS,
  DASHBOARD_DENSITIES,
  DASHBOARD_ELEVATIONS,
  DASHBOARD_PRESET_OPTIONS,
  DASHBOARD_CORNER_OPTIONS,
  DASHBOARD_DENSITY_OPTIONS,
  DASHBOARD_ELEVATION_OPTIONS,
  DASHBOARD_THEME_COLOR_KEYS,
  DASHBOARD_THEME_COLOR_OPTIONS,
  type DashboardTheme,
} from './theme'
import { DashboardModel } from './base'

const resolve = (theme?: DashboardTheme | null, mode: 'light' | 'dark' = 'light') =>
  resolveDashboardTheme({ theme, mode })

describe('resolveDashboardTheme — untouched dashboards', () => {
  it('reproduces the pre-theming literals exactly', () => {
    const { vars, gridMargin, rowHeight } = resolve(undefined)

    expect(vars['--dashboard-card-radius']).toBe('14px')
    expect(vars['--dashboard-control-radius']).toBe('10px')
    expect(vars['--dashboard-chip-radius']).toBe('999px')
    expect(vars['--dashboard-card-border-width']).toBe('1px')
    expect(vars['--dashboard-header-padding']).toBe('4px 12px 3px')
    expect(vars['--dashboard-header-min-height']).toBe('27px')
    expect(vars['--dashboard-canvas-padding']).toBe('16px 18px 24px')
    // vue3-grid-layout's own defaults, previously left implicit.
    expect(gridMargin).toEqual([10, 10])
    expect(rowHeight).toBe(30)
  })

  it('emits no color variables, so light/dark inheritance is untouched', () => {
    const colorish = Object.keys(resolve(undefined).vars).filter((name) =>
      ['--dashboard-card-bg', '--dashboard-canvas-bg', '--text-color', '--special-text'].includes(
        name,
      ),
    )
    expect(colorish).toEqual([])
  })

  it('reproduces the historical flatten-below-768px behaviour', () => {
    const { vars } = resolve(undefined)
    expect(vars['--dashboard-card-radius-mobile']).toBe('0px')
    expect(vars['--dashboard-card-bg-mobile']).toBe('transparent')
    expect(vars['--dashboard-card-shadow-mobile']).toBe('none')
    expect(vars['--dashboard-header-border-width-mobile']).toBe('0px')
  })

  it('resolves the same geometry whatever the mode — only shadows differ', () => {
    const light = resolve(undefined, 'light').vars
    const dark = resolve(undefined, 'dark').vars
    expect(light['--dashboard-card-radius']).toBe(dark['--dashboard-card-radius'])
    expect(light['--dashboard-canvas-padding']).toBe(dark['--dashboard-canvas-padding'])
    // A shadow tuned for a white surface vanishes on a dark canvas.
    expect(light['--dashboard-card-shadow']).not.toBe(dark['--dashboard-card-shadow'])
  })
})

describe('resolveDashboardTheme — presets', () => {
  it('flat squares the corners, drops elevation, and untints the header', () => {
    const { vars } = resolve({ preset: 'flat' })
    expect(vars['--dashboard-card-radius']).toBe('0px')
    expect(vars['--dashboard-card-shadow']).toBe('none')
    expect(vars['--dashboard-header-bg']).toContain('--dashboard-card-bg')
  })

  it('dense tightens the gutter and canvas padding', () => {
    const dense = resolve({ preset: 'dense' })
    const base = resolve(undefined)
    expect(dense.gridMargin[0]).toBeLessThan(base.gridMargin[0])
    expect(dense.vars['--dashboard-canvas-padding']).not.toBe(
      base.vars['--dashboard-canvas-padding'],
    )
  })

  it('paper drops the border ring in favour of elevation, and keeps cards on mobile', () => {
    const { vars } = resolve({ preset: 'paper' })
    expect(vars['--dashboard-card-border-width']).toBe('0px')
    expect(vars['--dashboard-card-shadow']).not.toBe('none')
    expect(vars['--dashboard-card-radius-mobile']).toBe('14px')
  })

  it('tints the header only for presets that ask for it', () => {
    expect(resolve({ preset: 'default' }).vars['--dashboard-header-bg']).toBeUndefined()
    expect(resolve({ preset: 'paper' }).vars['--dashboard-header-bg']).toBeUndefined()
  })

  it('lets explicit fields override the preset', () => {
    const { vars, gridMargin } = resolve({
      preset: 'paper',
      corners: 'square',
      density: 'compact',
      elevation: 'none',
    })
    expect(vars['--dashboard-card-radius']).toBe('0px')
    expect(vars['--dashboard-card-shadow']).toBe('none')
    expect(gridMargin).toEqual([6, 6])
  })
})

describe('resolveDashboardTheme — mobile', () => {
  it('carries the card ring down when mobileCards is on', () => {
    const shadow = resolve({ mobileCards: true }).vars['--dashboard-card-shadow-mobile']
    // The mobile rule replaces the whole box-shadow, so the ring that draws the
    // card border has to be restated alongside the drop shadow.
    expect(shadow).toContain('inset 0 0 0 1px')
    expect(shadow).toContain('--dashboard-card-border-color')
    expect(shadow).toContain('rgba(15, 23, 42, 0.08)')
  })

  it('omits the drop shadow from the mobile ring when elevation is none', () => {
    const shadow = resolve({ mobileCards: true, elevation: 'none' }).vars[
      '--dashboard-card-shadow-mobile'
    ]
    expect(shadow).toContain('inset')
    expect(shadow).not.toContain('rgba(')
  })

  it('frees the mobile wrapper background so the card fill and radius show', () => {
    expect(resolve({ mobileCards: true }).vars['--dashboard-mobile-item-bg']).toBe('transparent')
    expect(resolve({ mobileCards: false }).vars['--dashboard-mobile-item-bg']).toContain(
      '--result-window-bg',
    )
  })

  it('can turn a preset default back off', () => {
    expect(
      resolve({ preset: 'paper', mobileCards: false }).vars['--dashboard-card-radius-mobile'],
    ).toBe('0px')
  })

  it('scales the mobile gap and padding with density', () => {
    expect(resolve({ density: 'compact' }).vars['--dashboard-mobile-gap']).not.toBe(
      resolve({ density: 'spacious' }).vars['--dashboard-mobile-gap'],
    )
  })
})

describe('resolveDashboardTheme — colors', () => {
  it('emits only the colors the author actually set', () => {
    const { vars } = resolve({ cardBackground: '#101820' })
    expect(vars['--dashboard-card-bg']).toBe('#101820')
    expect(vars['--dashboard-canvas-bg']).toBeUndefined()
    expect(vars['--text-color']).toBeUndefined()
  })

  it('derives the accent rgb triple, which chips consume inside rgba()', () => {
    const { vars } = resolve({ accentColor: '#2563eb' })
    expect(vars['--special-text']).toBe('#2563eb')
    expect(vars['--special-text-rgb']).toBe('37, 99, 235')
  })

  it('leaves the inherited triple alone when the accent cannot be decomposed', () => {
    const { vars } = resolve({ accentColor: 'rebeccapurple' })
    expect(vars['--special-text']).toBe('rebeccapurple')
    expect(vars['--special-text-rgb']).toBeUndefined()
  })

  it('lets an explicit header background beat the flat preset default', () => {
    expect(
      resolve({ preset: 'flat', headerBackground: '#123456' }).vars['--dashboard-header-bg'],
    ).toBe('#123456')
  })
})

describe('resolveDashboardTheme — image export', () => {
  it('floors the export border so a borderless theme still shows a card edge', () => {
    // html2canvas ignores box-shadow, so a paper card would export invisible.
    expect(resolve({ preset: 'paper' }).vars['--dashboard-export-border-width']).toBe('1px')
    expect(resolve({ preset: 'default' }).vars['--dashboard-export-border-width']).toBe('1px')
  })
})

describe('isSafeColor', () => {
  it('accepts the notations that describe a color', () => {
    for (const value of [
      '#fff',
      '#ffffff',
      '#ffffffcc',
      'rgb(1, 2, 3)',
      'rgba(1, 2, 3, 0.5)',
      'hsl(210, 50%, 40%)',
      'transparent',
      'rebeccapurple',
    ]) {
      expect(isSafeColor(value), value).toBe(true)
    }
  })

  it('rejects anything that could reach the network or escape the declaration', () => {
    for (const value of [
      'url(https://evil.example/pixel.png)',
      '#fff; background: url(https://evil.example)',
      'red}.x{color:blue',
      'var(--secret)',
      'rgb(1,2,3) /* */',
      '',
      '  ',
      123,
      null,
      '#'.padEnd(80, 'a'),
    ]) {
      expect(isSafeColor(value as unknown), String(value)).toBe(false)
    }
  })
})

describe('toRgbTriple', () => {
  it('decomposes hex in every valid length', () => {
    expect(toRgbTriple('#fff')).toBe('255, 255, 255')
    expect(toRgbTriple('#ffff')).toBe('255, 255, 255')
    expect(toRgbTriple('#2563eb')).toBe('37, 99, 235')
    expect(toRgbTriple('#2563ebcc')).toBe('37, 99, 235')
  })

  it('decomposes rgb/rgba', () => {
    expect(toRgbTriple('rgb(37, 99, 235)')).toBe('37, 99, 235')
    expect(toRgbTriple('rgba(37 99 235 / 0.5)')).toBe('37, 99, 235')
  })

  it('returns null rather than guessing', () => {
    expect(toRgbTriple('rebeccapurple')).toBeNull()
    expect(toRgbTriple('hsl(210, 50%, 40%)')).toBeNull()
    expect(toRgbTriple('#12345')).toBeNull()
  })
})

describe('sanitizeDashboardTheme', () => {
  it('drops unknown keys and out-of-vocabulary enum values', () => {
    const theme = sanitizeDashboardTheme({
      preset: 'flat',
      corners: 'octagonal',
      density: 'comfortable',
      somethingElse: 'nope',
    })
    expect(theme).toEqual({ preset: 'flat', density: 'comfortable' })
  })

  it('drops unsafe colors while keeping the safe ones', () => {
    const theme = sanitizeDashboardTheme({
      cardBackground: '#101820',
      canvasBackground: 'url(https://evil.example)',
    })
    expect(theme).toEqual({ cardBackground: '#101820' })
  })

  it('returns undefined for empty or non-object input', () => {
    expect(sanitizeDashboardTheme({})).toBeUndefined()
    expect(sanitizeDashboardTheme(null)).toBeUndefined()
    expect(sanitizeDashboardTheme('flat')).toBeUndefined()
    expect(sanitizeDashboardTheme([{ preset: 'flat' }])).toBeUndefined()
  })
})

describe('applyEmbedPrecedence', () => {
  it('drops dashboard values the embedding host named itself', () => {
    const merged = applyEmbedPrecedence(
      { '--special-text': '#ff0000', '--dashboard-card-radius': '0px' },
      { '--special-text': '#00ff00' },
    )
    expect(merged).toEqual({ '--dashboard-card-radius': '0px' })
  })

  it('passes everything through when the host named nothing', () => {
    const vars = { '--dashboard-card-radius': '0px' }
    expect(applyEmbedPrecedence(vars, null)).toEqual(vars)
    expect(applyEmbedPrecedence(vars, {})).toEqual(vars)
  })
})

describe('DashboardModel theme persistence', () => {
  const model = (theme?: unknown) =>
    new DashboardModel({
      id: 'd1',
      name: 'D',
      connection: 'duckdb',
      theme: theme as DashboardTheme,
    })

  it('round-trips through serialize/fromSerialized', () => {
    const serialized = model({ preset: 'paper', accentColor: '#2563eb' }).serialize()
    expect(serialized.theme).toEqual({ preset: 'paper', accentColor: '#2563eb' })
    expect(DashboardModel.fromSerialized(serialized).theme).toEqual({
      preset: 'paper',
      accentColor: '#2563eb',
    })
  })

  it('sanitizes on the way in, so stored junk cannot reach the style attribute', () => {
    expect(
      model({ preset: 'nope', cardBackground: 'url(https://evil.example)' }).theme,
    ).toBeUndefined()
  })

  it('leaves theme undefined for dashboards that predate the field', () => {
    expect(model(undefined).theme).toBeUndefined()
    expect(model(undefined).serialize().theme).toBeUndefined()
  })

  it('merges partial updates and marks the dashboard changed', () => {
    const dashboard = model({ preset: 'flat' })
    dashboard.changed = false

    dashboard.setTheme({ density: 'compact' })
    expect(dashboard.theme).toEqual({ preset: 'flat', density: 'compact' })
    expect(dashboard.changed).toBe(true)
  })

  it('does not mark a no-op update as changed', () => {
    const dashboard = model({ preset: 'flat' })
    dashboard.changed = false

    dashboard.setTheme({ preset: 'flat' })
    expect(dashboard.changed).toBe(false)
  })

  it('clears back to the inherited app styling on null', () => {
    const dashboard = model({ preset: 'flat' })
    dashboard.setTheme(null)
    expect(dashboard.theme).toBeUndefined()
    expect(resolve(dashboard.theme).vars['--dashboard-card-radius']).toBe('14px')
  })
})

describe('theme vocabulary', () => {
  it('derives the validation lists from the described options', () => {
    // The picker renders the option objects and the agent tool schema enumerates
    // the same values; a value that exists in one but not the other would let
    // the two surfaces offer different themes.
    expect(DASHBOARD_THEME_PRESETS).toEqual(DASHBOARD_PRESET_OPTIONS.map((o) => o.value))
    expect(DASHBOARD_CORNERS).toEqual(DASHBOARD_CORNER_OPTIONS.map((o) => o.value))
    expect(DASHBOARD_DENSITIES).toEqual(DASHBOARD_DENSITY_OPTIONS.map((o) => o.value))
    expect(DASHBOARD_ELEVATIONS).toEqual(DASHBOARD_ELEVATION_OPTIONS.map((o) => o.value))
  })

  it('describes every option, since the hints are the agent-facing schema text', () => {
    for (const option of [
      ...DASHBOARD_PRESET_OPTIONS,
      ...DASHBOARD_CORNER_OPTIONS,
      ...DASHBOARD_DENSITY_OPTIONS,
      ...DASHBOARD_ELEVATION_OPTIONS,
    ]) {
      expect(option.label.length, option.value).toBeGreaterThan(0)
      expect(option.hint.length, option.value).toBeGreaterThan(0)
    }
  })

  it('covers exactly the theme color slots, with a placeholder per mode', () => {
    expect(DASHBOARD_THEME_COLOR_OPTIONS.map((c) => c.key)).toEqual([...DASHBOARD_THEME_COLOR_KEYS])
    for (const color of DASHBOARD_THEME_COLOR_OPTIONS) {
      // The picker's native color input cannot show "unset", so it needs a
      // valid 6-digit hex stand-in for each mode.
      expect(color.placeholder.light, color.key).toMatch(/^#[0-9a-f]{6}$/i)
      expect(color.placeholder.dark, color.key).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('sanitizes every color slot it advertises', () => {
    const unsafe = Object.fromEntries(
      DASHBOARD_THEME_COLOR_KEYS.map((key) => [key, 'url(https://evil.example)']),
    )
    expect(sanitizeDashboardTheme(unsafe)).toBeUndefined()

    const safe = Object.fromEntries(DASHBOARD_THEME_COLOR_KEYS.map((key) => [key, '#101820']))
    expect(sanitizeDashboardTheme(safe)).toEqual(safe)
  })
})

describe('describeDashboardTheme', () => {
  it('names the default explicitly rather than returning nothing', () => {
    // This is the agent's only view of the styling between screenshots, so
    // "unset" and "I did not look" must not read the same.
    expect(describeDashboardTheme(undefined)).toContain('default')
    expect(describeDashboardTheme({})).toContain('default')
  })

  it('reports the preset, overrides, and colors', () => {
    const summary = describeDashboardTheme({
      preset: 'paper',
      density: 'compact',
      accentColor: '#2563eb',
    })
    expect(summary).toContain('preset paper')
    expect(summary).toContain('density compact')
    expect(summary).toContain('accentColor=#2563eb')
  })

  it('says colors are inherited when none are set', () => {
    expect(describeDashboardTheme({ preset: 'flat' })).toContain('colors inherited')
  })

  it('reports an implicit default preset when only overrides are set', () => {
    expect(describeDashboardTheme({ corners: 'square' })).toContain('preset default')
  })
})
