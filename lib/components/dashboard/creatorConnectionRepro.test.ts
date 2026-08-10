import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import DashboardCreatorInline from './DashboardCreatorInline.vue'
import useDashboardStore from '../../stores/dashboardStore'

const FAA = { id: 'local:faa-demo', name: 'faa-demo', model: 'faa', deleted: false }
const OTHER = { id: 'local:zebra', name: 'zebra', model: 'zoo', deleted: false }

let connections: Record<string, any>

const connectionStore = {
  get connections() {
    return connections
  },
  connectionByName: (name: string) => Object.values(connections).find((c) => c.name === name),
}

vi.mock('../../stores/connectionStore', () => ({
  default: () => connectionStore,
}))

beforeEach(() => {
  setActivePinia(createPinia())
  connections = { [OTHER.id]: OTHER, [FAA.id]: FAA }
})

describe('creator -> dashboard connectionId', () => {
  it('stores a store id', async () => {
    const dashboardStore = useDashboardStore()
    const wrapper = mount(DashboardCreatorInline, {
      props: { visible: true },
      global: {
        provide: {
          dashboardStore,
          connectionStore,
          llmConnectionStore: { hasActiveDefaultConnection: false },
          editorStore: { editors: {} },
          saveDashboards: () => {},
        },
      },
    })

    await wrapper.get('[data-testid="dashboard-creator-name"]').setValue('D1')
    const sel = wrapper.get('[data-testid="dashboard-creator-connection"]')
    console.log(
      'options:',
      sel.findAll('option').map((o) => [o.attributes('value'), o.text()]),
    )
    console.log('select value before:', (sel.element as HTMLSelectElement).value)
    await sel.setValue(FAA.id)
    await wrapper.get('[data-testid="dashboard-creator-submit"]').trigger('click')
    await wrapper.vm.$nextTick()

    const dash = dashboardStore.dashboards['D1']
    console.log('created:', dash && { connection: dash.connection, connectionId: dash.connectionId })
    expect(dash.connectionId).toBe(FAA.id)
    wrapper.unmount()
  })
})
