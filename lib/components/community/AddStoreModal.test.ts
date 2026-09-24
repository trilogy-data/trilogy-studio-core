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

describe('AddStoreModal store kinds', () => {
  it('adds a static store from a bucket URL', async () => {
    const wrapper = mountModal()
    await wrapper.get('[data-testid="store-type-select"]').setValue('static')
    expect(wrapper.find('[data-testid="add-store-cli-tip"]').exists()).toBe(false)

    await wrapper
      .get('[data-testid="store-url-input"]')
      .setValue('https://storage.googleapis.com/bucket/published/acme/sales/')
    await wrapper.get('form').trigger('submit')

    expect(wrapper.emitted('add')?.[0]?.[0]).toEqual({
      type: 'static',
      id: 'storage.googleapis.com-bucket-published-acme-sales',
      name: 'storage.googleapis.com',
      baseUrl: 'https://storage.googleapis.com/bucket/published/acme/sales',
    })
  })

  it('turns a GitHub repository into a static store with a derived baseUrl', async () => {
    const wrapper = mountModal()
    await wrapper.get('[data-testid="store-type-select"]').setValue('github')
    await wrapper.get('[data-testid="github-owner-input"]').setValue('acme')
    await wrapper.get('[data-testid="github-repo-input"]').setValue('models')
    await wrapper.get('form').trigger('submit')

    expect(wrapper.emitted('add')?.[0]?.[0]).toEqual({
      type: 'static',
      id: 'acme-models-main',
      name: 'acme/models',
      baseUrl: 'https://raw.githubusercontent.com/acme/models/main/studio',
      origin: { kind: 'github', owner: 'acme', repo: 'models', branch: 'main' },
    })
  })
})
