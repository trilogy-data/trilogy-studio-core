import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import PopupModal from './PopupModal.vue'

describe('PopupModal', () => {
  it('persists skipAllTips when disabling all hints', async () => {
    const mockUserSettingsStore = {
      updateSetting: vi.fn(),
      saveSettings: vi.fn().mockResolvedValue(true),
    }

    const wrapper = mount(PopupModal, {
      props: {
        showModal: true,
        activeItems: [{ id: 'tip-1', title: 'Tip 1', content: 'Helpful text' }],
      },
      global: {
        provide: {
          userSettingsStore: mockUserSettingsStore,
        },
        stubs: {
          ResizeHandles: {
            template: '<div />',
          },
        },
      },
    })

    await wrapper.get('[data-testid="disable-all-hints"]').trigger('click')

    expect(mockUserSettingsStore.updateSetting).toHaveBeenCalledWith('skipAllTips', true)
    expect(mockUserSettingsStore.saveSettings).toHaveBeenCalled()
    expect(wrapper.emitted('close-modal')).toBeTruthy()
  })
})
