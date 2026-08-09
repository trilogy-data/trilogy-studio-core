import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, VueWrapper, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ModelSelector from './ModelSelector.vue'
import ContextMenu from '../ContextMenu.vue'
import useConnectionStore from '../../stores/connectionStore'
import useModelConfigStore from '../../stores/modelStore'

/**
 * The selector lives in a sidebar row whose slot wrapper is a fixed-height
 * overflow:hidden span, so the menu has to render as a fixed-position
 * ContextMenu -- an in-flow dropdown is clipped out of sight and the control
 * reads as dead.
 */
describe('ModelSelector', () => {
  let wrapper: VueWrapper<any>
  let saveConnections: ReturnType<typeof vi.fn>
  let saveModels: ReturnType<typeof vi.fn>

  const mountSelector = (connection: any) =>
    mount(ModelSelector, {
      props: { connection },
      global: {
        provide: {
          connectionStore: useConnectionStore(),
          modelStore: useModelConfigStore(),
          saveConnections,
          saveModels,
        },
      },
    })

  beforeEach(() => {
    setActivePinia(createPinia())
    saveConnections = vi.fn().mockResolvedValue(undefined)
    saveModels = vi.fn().mockResolvedValue(undefined)
  })

  afterEach(() => {
    if (wrapper) wrapper.unmount()
  })

  const newConnection = (name: string) => {
    const connectionStore = useConnectionStore()
    return connectionStore.newConnection(name, 'duckdb', {})
  }

  it('opens the menu outside the clipping row and assigns the picked model', async () => {
    const connection = newConnection('analytics')
    useModelConfigStore().newModelConfig('other-model')
    wrapper = mountSelector(connection)

    await wrapper.find('[data-testid="model-selector-trigger"]').trigger('click')

    // Scoped CSS is not applied under jsdom, so assert the structural choice:
    // the menu is the fixed-position ContextMenu, anchored by viewport
    // coordinates rather than laid out inside the clipped row.
    const menu = wrapper.findComponent(ContextMenu)
    expect(menu.exists()).toBe(true)
    const style = (menu.element as HTMLElement).style
    expect(style.left).toMatch(/px$/)
    expect(style.top).toMatch(/px$/)

    const option = wrapper
      .findAll('.context-menu-item')
      .find((item) => item.text() === 'other-model')!
    await option.trigger('click')
    await flushPromises()

    expect(connection.model).toBe('other-model')
    expect(saveConnections).toHaveBeenCalled()
  })

  it('creates a new model without overwriting the same-named existing one', async () => {
    const connection = newConnection('analytics')
    const modelStore = useModelConfigStore()
    // newConnection already made an `analytics` model; give it content to lose.
    modelStore.models['analytics'].description = 'existing'
    wrapper = mountSelector(connection)

    await wrapper.find('[data-testid="model-selector-trigger"]').trigger('click')
    const createOption = wrapper
      .findAll('.context-menu-item')
      .find((item) => item.text() === 'Create New Model')!
    await createOption.trigger('click')
    await flushPromises()

    expect(modelStore.models['analytics'].description).toBe('existing')
    expect(connection.model).toBe('analytics-2')
    expect(modelStore.models['analytics-2']).toBeDefined()
    expect(saveModels).toHaveBeenCalled()
    expect(saveConnections).toHaveBeenCalled()
  })

  it('marks the currently assigned model', async () => {
    const connection = newConnection('analytics')
    wrapper = mountSelector(connection)

    expect(wrapper.find('[data-testid="model-selector-trigger"]').text()).toContain('analytics')
    await wrapper.find('[data-testid="model-selector-trigger"]').trigger('click')

    const active = wrapper
      .findAll('.context-menu-item')
      .find((item) => item.text() === 'analytics')!
    expect(active.find('i').classes()).toContain('mdi-check')
  })
})
