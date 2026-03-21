import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, reactive } from 'vue'
import HintComponent from './HintComponent.vue'

describe('HintComponent', () => {
  it('persists the disable-all-hints preference and hides the panel', async () => {
    const mockUserSettingsStore = {
      settings: reactive({
        disableEditorHints: false,
      }),
      updateSetting: vi.fn((key: string, value: boolean) => {
        mockUserSettingsStore.settings[key as 'disableEditorHints'] = value
      }),
      saveSettings: vi.fn().mockResolvedValue(true),
    }

    const wrapper = mount(HintComponent, {
      global: {
        provide: {
          userSettingsStore: mockUserSettingsStore,
        },
      },
    })

    expect(wrapper.find('[data-testid="editor-shortcut-hints"]').exists()).toBe(true)

    await wrapper.get('[data-testid="disable-editor-hints"]').trigger('click')
    await nextTick()

    expect(mockUserSettingsStore.updateSetting).toHaveBeenCalledWith('disableEditorHints', true)
    expect(mockUserSettingsStore.saveSettings).toHaveBeenCalled()
    expect(wrapper.find('[data-testid="editor-shortcut-hints"]').exists()).toBe(false)
  })
})
