import { describe, expect, it } from 'vitest'
import { normalizeEmbedTheme, resolveThemeMode, resolveThemeVariables } from './config'

describe('embed theme config', () => {
  it('normalizes string themes into theme objects', () => {
    expect(normalizeEmbedTheme('light')).toEqual({ mode: 'light' })
    expect(normalizeEmbedTheme('dark')).toEqual({ mode: 'dark' })
  })

  it('prefers explicit embed theme mode over settings store theme', () => {
    expect(resolveThemeMode('light', 'dark')).toBe('light')
    expect(resolveThemeMode({ mode: 'dark' }, 'light')).toBe('dark')
  })

  it('falls back to settings store theme when no embed theme is provided', () => {
    expect(resolveThemeMode(undefined, 'light')).toBe('light')
    expect(resolveThemeMode(null, 'dark')).toBe('dark')
  })

  it('defaults to dark when no theme source is present', () => {
    expect(resolveThemeMode()).toBe('dark')
    expect(resolveThemeMode(undefined, 'system')).toBe('dark')
  })

  it('stringifies css variable overrides', () => {
    expect(
      resolveThemeVariables({
        mode: 'dark',
        variables: {
          '--panel-header-bg': '#0f172a',
          '--dashboard-radius': 12,
        },
      }),
    ).toEqual({
      '--panel-header-bg': '#0f172a',
      '--dashboard-radius': '12',
    })
  })
})
