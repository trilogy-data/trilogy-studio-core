import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, shallowMount } from '@vue/test-utils'
import CommunityModelCard from './CommunityModelCard.vue'
import type { Component, ModelFile } from '../../remotes/models'

const component = (
  name: string,
  type: Component['type'] = 'trilogy',
  purpose = 'source',
): Component => ({
  name,
  type,
  purpose,
  url: `https://example.com/${name}`,
})
const file: ModelFile = {
  name: 'sales model',
  description: 'A shared model',
  engine: 'bigquery',
  downloadUrl: 'https://example.com/store/model.json',
  components: [],
  store: { type: 'static', id: 'store', name: 'Store', baseUrl: 'https://example.com/store' },
}

describe('CommunityModelCard sharing', () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  let wrapper: ReturnType<typeof shallowMount>

  const mountCard = (components: Component[], overrides: Partial<ModelFile> = {}) => {
    wrapper = shallowMount(CommunityModelCard, {
      props: { file: { ...file, components, ...overrides } },
      global: { provide: { modelStore: { models: {} } } },
    })
    return wrapper
  }
  const share = async () => {
    await wrapper.get('[data-testid="copy-model-share-button"]').trigger('click')
    await flushPromises()
    return new URLSearchParams(new URL(writeText.mock.calls[0][0]).hash.slice(1))
  }

  beforeEach(() => {
    writeText.mockReset().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
  })
  afterEach(() => {
    wrapper?.unmount()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('shares the first named example while the component list is collapsed', async () => {
    mountCard([
      component('source'),
      component('', 'trilogy', 'example'),
      component('setup', 'python', 'example'),
      component('city cancellations', 'sql', 'example'),
      component('later example', 'trilogy', 'example'),
    ])
    expect(wrapper.find('.components-grid').exists()).toBe(false)
    const params = await share()
    expect(Object.fromEntries(params)).toEqual({
      screen: 'asset-import',
      import: file.downloadUrl,
      assetType: 'editor',
      assetName: 'city cancellations',
      modelName: file.name,
      connection: 'bigquery',
      store: 'https://example.com/store',
      kind: 'static',
    })
    expect(wrapper.get('[role="status"]').text()).toBe('Share link copied.')
  })

  it('falls back to the first shareable component when no example exists', async () => {
    mountCard([
      component('setup', 'python'),
      component('overview', 'dashboard'),
      component('source'),
    ])
    const params = await share()
    expect(params.get('assetType')).toBe('dashboard')
    expect(params.get('assetName')).toBe('overview')
    expect(wrapper.emitted('dashboard-link-copied')).toHaveLength(1)
  })

  it('uses the same link for the model and its selected file, including generic store metadata', async () => {
    mountCard([component('query', 'trilogy', 'example')], {
      store: {
        type: 'generic',
        id: 'live',
        name: 'Live',
        baseUrl: 'https://example.com/live',
        token: 'test-token',
      },
    })
    const params = await share()
    expect(params.get('store')).toBe('https://example.com/live')
    expect(params.get('token')).toBe('test-token')
    expect(params.has('kind')).toBe(false)
    await wrapper.get('[data-testid="expand-sales model"]').trigger('click')
    await wrapper.get('[data-testid="copy-editor-share-button"]').trigger('click')
    await flushPromises()
    expect(writeText.mock.calls[1][0]).toBe(writeText.mock.calls[0][0])
  })

  it.each([
    { components: [] },
    { components: [component('setup', 'python')] },
    { components: [component('')] },
  ])('disables sharing without a named supported component: %j', ({ components }) => {
    mountCard(components)
    expect(
      wrapper.get('[data-testid="copy-model-share-button"]').attributes('disabled'),
    ).toBeDefined()
  })

  it('reports clipboard failures without claiming the link was copied', async () => {
    writeText.mockRejectedValue(new Error('Permission denied'))
    mountCard([component('query')])
    await wrapper.get('[data-testid="copy-model-share-button"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="status"]').text()).toContain('Unable to copy')
    expect(wrapper.emitted('editor-link-copied')).toBeUndefined()
    expect(document.querySelector('textarea')).toBeNull()
  })
})
