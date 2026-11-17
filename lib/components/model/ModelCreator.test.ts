import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ModelCreator from './ModelCreator.vue'
import useConnectionStore from '../../stores/connectionStore'
import useModelConfigStore from '../../stores/modelStore'
import useEditorStore from '../../stores/editorStore'
import useDashboardStore from '../../stores/dashboardStore'

function mountCreator(connection = 'new-databricks') {
  const pinia = createPinia()
  setActivePinia(pinia)
  const connectionStore = useConnectionStore()
  const saveAll = vi.fn(async () => {})
  const wrapper = mount(ModelCreator, {
    props: { visible: true, formDefaults: { name: 'bakehouse', connection } },
    global: {
      plugins: [pinia],
      provide: {
        connectionStore,
        modelStore: useModelConfigStore(),
        editorStore: useEditorStore(),
        dashboardStore: useDashboardStore(),
        saveAll,
      },
    },
    attachTo: document.body,
  })
  return { wrapper, connectionStore, saveAll }
}

const submit = (wrapper: ReturnType<typeof mountCreator>['wrapper']) =>
  wrapper.get('[data-testid="model-creation-submit"]')

describe('ModelCreator with a Databricks model', () => {
  beforeEach(() => {
    vi.useRealTimers()
  })

  it('preselects New Databricks and asks for an engine key', async () => {
    const { wrapper } = mountCreator()
    expect(wrapper.get('[data-testid="model-creator-connection"]').text()).toContain(
      'New Databricks (Beta)',
    )
    expect(wrapper.find('[data-testid="model-creator-databricks-hint"]').exists()).toBe(true)
    expect(submit(wrapper).attributes('disabled')).toBeDefined()

    await wrapper.get('[data-testid="model-creator-databricks-engine-key"]').setValue('tre_key')
    expect(submit(wrapper).attributes('disabled')).toBeUndefined()
    wrapper.unmount()
  })

  it('refuses a partial workspace', async () => {
    const { wrapper } = mountCreator()
    await wrapper.get('[data-testid="model-creator-databricks-engine-key"]').setValue('tre_key')
    await wrapper.get('#model-dbx-host').setValue('dbc-1.cloud.databricks.com')
    expect(wrapper.find('[data-testid="model-creator-databricks-partial"]').exists()).toBe(true)
    expect(submit(wrapper).attributes('disabled')).toBeDefined()

    await wrapper.get('#model-dbx-http-path').setValue('/sql/1.0/warehouses/abc')
    await wrapper.get('#model-dbx-token').setValue('dapi123')
    expect(wrapper.find('[data-testid="model-creator-databricks-partial"]').exists()).toBe(false)
    expect(submit(wrapper).attributes('disabled')).toBeUndefined()
    wrapper.unmount()
  })

  it('creates a Databricks connection bound to the model', async () => {
    const { wrapper, connectionStore, saveAll } = mountCreator()
    await wrapper.get('[data-testid="model-creator-databricks-engine-key"]').setValue('tre_key')
    await submit(wrapper).trigger('click')
    await flushPromises()
    await vi.waitFor(() => expect(saveAll).toHaveBeenCalled())

    const connection = connectionStore.connectionByName('bakehouse-connection')
    expect(connection?.type).toBe('remote-worker:databricks')
    expect(connection?.model).toBe('bakehouse')
    wrapper.unmount()
  })

  it('offers existing connections in the picker', async () => {
    const { wrapper, connectionStore } = mountCreator('')
    connectionStore.newConnection('dbx-test', 'databricks', { engineKey: 'k' })
    await wrapper.get('[data-testid="model-creator-connection"]').trigger('click')
    await wrapper.get('[data-testid="model-creator-connection-search"]').setValue('dbx')
    await wrapper
      .get('[data-testid="model-creator-connection-option-dbx-test"]')
      .trigger('mousedown')
    expect(wrapper.get('[data-testid="model-creator-connection"]').text()).toContain('dbx-test')
    expect(wrapper.find('[data-testid="model-creator-databricks-hint"]').exists()).toBe(false)
    wrapper.unmount()
  })
})
