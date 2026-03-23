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
        activeItems: [
          { id: 'tip-1', title: 'Tip 1', content: 'Helpful text', category: 'onboarding' },
        ],
      },
      attachTo: document.body,
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

    const disableButton = document.body.querySelector(
      '[data-testid="disable-all-hints"]',
    ) as HTMLButtonElement | null
    expect(disableButton).not.toBeNull()
    disableButton?.click()
    await wrapper.vm.$nextTick()

    expect(mockUserSettingsStore.updateSetting).toHaveBeenCalledWith('skipAllTips', true)
    expect(mockUserSettingsStore.saveSettings).toHaveBeenCalled()
    expect(wrapper.emitted('close-modal')).toBeTruthy()
    wrapper.unmount()
  })
})
