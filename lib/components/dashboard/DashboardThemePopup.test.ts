import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { reactive, nextTick } from 'vue'
import DashboardThemePopup from './DashboardThemePopup.vue'
import type { DashboardTheme } from '../../dashboards/theme'

function mountPicker(theme?: DashboardTheme) {
  const dashboard = reactive({ id: 'dash-1', name: 'D', theme }) as any
  const wrapper = mount(DashboardThemePopup, {
    attachTo: document.body,
    props: { dashboard, isOpen: true },
    global: {
      provide: { userSettingsStore: { settings: { theme: 'light' } } },
    },
  })
  return { wrapper, dashboard }
}

/** Patches emitted by the picker are merged by the caller, so a test that wants
 *  the resulting theme has to merge them the same way the model does. */
function emittedPatches(wrapper: ReturnType<typeof mountPicker>['wrapper']) {
  return (wrapper.emitted('theme-change') || []).map((args) => args[0] as DashboardTheme | null)
}

describe('DashboardThemePopup', () => {
  it('emits a preset patch when a preset card is clicked', async () => {
    const { wrapper } = mountPicker()

    await document.body
      .querySelector<HTMLButtonElement>('[data-testid="theme-preset-paper"]')!
      .click()

    expect(emittedPatches(wrapper)).toEqual([{ preset: 'paper' }])
    wrapper.unmount()
  })

  it('marks the default preset as selected when no theme is set', () => {
    const { wrapper } = mountPicker()

    const button = document.body.querySelector('[data-testid="theme-preset-default"]')
    expect(button?.getAttribute('aria-pressed')).toBe('true')
    wrapper.unmount()
  })

  it('clears an override back to the preset with Auto', async () => {
    const { wrapper } = mountPicker({ preset: 'flat', corners: 'round' })

    // The Auto chip is the first in each group; corners is the first group.
    const chips = document.body.querySelectorAll<HTMLButtonElement>('.chip')
    await chips[0].click()

    // `undefined` is how a patch clears a field — the model spreads it over the
    // current theme and re-sanitizes, dropping it.
    expect(emittedPatches(wrapper)).toEqual([{ corners: undefined }])
    wrapper.unmount()
  })

  it('commits a valid color typed into the text field', async () => {
    const { wrapper } = mountPicker()

    const input = document.body.querySelector<HTMLInputElement>(
      '[data-testid="theme-color-accentColor"]',
    )!
    input.value = 'rgb(37, 99, 235)'
    input.dispatchEvent(new Event('input'))
    await nextTick()
    input.dispatchEvent(new Event('blur'))
    await nextTick()

    expect(emittedPatches(wrapper)).toEqual([{ accentColor: 'rgb(37, 99, 235)' }])
    wrapper.unmount()
  })

  it('refuses a color that could reach the network, and emits nothing', async () => {
    const { wrapper } = mountPicker()

    const input = document.body.querySelector<HTMLInputElement>(
      '[data-testid="theme-color-cardBackground"]',
    )!
    input.value = 'url(https://evil.example/pixel.png)'
    input.dispatchEvent(new Event('input'))
    await nextTick()
    input.dispatchEvent(new Event('blur'))
    await nextTick()

    expect(emittedPatches(wrapper)).toEqual([])
    expect(input.classList.contains('invalid')).toBe(true)
    wrapper.unmount()
  })

  it('clears a color to inherited when the field is emptied', async () => {
    const { wrapper } = mountPicker({ accentColor: '#2563eb' })

    const input = document.body.querySelector<HTMLInputElement>(
      '[data-testid="theme-color-accentColor"]',
    )!
    expect(input.value).toBe('#2563eb')

    input.value = ''
    input.dispatchEvent(new Event('input'))
    await nextTick()
    input.dispatchEvent(new Event('blur'))
    await nextTick()

    expect(emittedPatches(wrapper)).toEqual([{ accentColor: undefined }])
    wrapper.unmount()
  })

  it('emits null to reset, and disables the reset button on an untouched theme', async () => {
    const { wrapper } = mountPicker()
    const reset = document.body.querySelector<HTMLButtonElement>(
      '[data-testid="theme-reset-button"]',
    )!
    expect(reset.disabled).toBe(true)
    wrapper.unmount()

    const customized = mountPicker({ preset: 'dense' })
    const enabled = document.body.querySelector<HTMLButtonElement>(
      '[data-testid="theme-reset-button"]',
    )!
    expect(enabled.disabled).toBe(false)
    await enabled.click()
    expect(emittedPatches(customized.wrapper)).toEqual([null])
    customized.wrapper.unmount()
  })
})
