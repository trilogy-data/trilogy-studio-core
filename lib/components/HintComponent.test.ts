import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import HintComponent from './HintComponent.vue'

describe('HintComponent', () => {
  it('always shows editor shortcut hints without a disable-all action', () => {
    const wrapper = mount(HintComponent)

    expect(wrapper.find('[data-testid="editor-shortcut-hints"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="disable-editor-hints"]').exists()).toBe(false)
  })
})
