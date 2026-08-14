import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import AddStoreModal from './AddStoreModal.vue'

const mountModal = () =>
  mount(AddStoreModal, {
    props: { show: true },
    attachTo: document.body,
    global: {
      stubs: {
        // The dialog teleports to body; render it inline so the wrapper can see it.
        Teleport: true,
      },
    },
  })

describe('AddStoreModal serve hint', () => {
  it('points the CLI at this studio, so the link it prints comes back here', () => {
    const wrapper = mountModal()

    const expected = `${window.location.origin}${window.location.pathname}`
    expect(wrapper.get('[data-testid="add-store-cli-command"]').text()).toBe(
      `trilogy serve . --studio-url ${expected}`,
    )
    // The hash is a route within the studio, not part of its address — passing
    // it through would send the CLI's link to whatever screen happened to be open.
    expect(wrapper.get('[data-testid="add-store-cli-command"]').text()).not.toContain('#')
  })

  it('only offers the hint for a generic store, not a GitHub repo', async () => {
    const wrapper = mountModal()
    expect(wrapper.find('[data-testid="add-store-cli-tip"]').exists()).toBe(true)

    await wrapper.get('[data-testid="store-type-select"]').setValue('github')
    expect(wrapper.find('[data-testid="add-store-cli-tip"]').exists()).toBe(false)
  })
})
