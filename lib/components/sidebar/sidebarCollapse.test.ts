import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import { computed, nextTick } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import EditorList from './EditorList.vue'
import DashboardListItem from './DashboardListItem.vue'
import useConnectionStore from '../../stores/connectionStore'

// The sidebar chevrons are the only way to collapse a tree on desktop. Two
// separate wiring bugs broke them, and both are invisible to a test that only
// ever expands, so everything here asserts the collapsed direction too.

const CONNECTION_ID = 'local:duck'
const CONNECTION_KEY = `c-local-${CONNECTION_ID}`
const FOLDER_KEY = `f-local-${CONNECTION_ID}-analysis`

const makeEditor = (id: string, name: string) => ({
  id,
  name,
  type: 'sql',
  storage: 'local',
  connection: 'duck',
  connectionId: CONNECTION_ID,
  tags: [],
  deleted: false,
  delete: vi.fn(),
})

describe('EditorList collapse state', () => {
  let wrapper: VueWrapper<any>

  const mountList = (isMobile: boolean) => {
    const connectionStore = useConnectionStore()
    connectionStore.connections[CONNECTION_ID] = {
      id: CONNECTION_ID,
      name: 'duck',
      storage: 'local',
      connected: true,
      type: 'duckdb',
      model: 'duck-model',
    } as any

    return mount(EditorList, {
      global: {
        provide: {
          connectionStore,
          editorStore: {
            editors: {
              e1: makeEditor('e1', 'analysis/sales-report'),
              e2: makeEditor('e2', 'top-level'),
            },
          },
          modelStore: { models: {} },
          storageSources: [],
          // Manager provides a computed ref, never a raw boolean.
          isMobile: computed(() => isMobile),
        },
        stubs: {
          SidebarList: { template: '<div><slot name="actions" /><slot /></div>' },
          MobileTreeList: true,
          EditorListItem: true,
          EditorCreatorInline: true,
          ConfirmDialog: true,
        },
      },
    })
  }

  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    if (wrapper) wrapper.unmount()
  })

  const keysOf = (list: any[]) => list.map((item) => item.key)

  it('prunes children of a collapsed node on desktop', async () => {
    wrapper = mountList(false)
    await nextTick()

    expect(keysOf(wrapper.vm.contentList)).toContain(CONNECTION_KEY)
    expect(keysOf(wrapper.vm.contentList)).toContain(FOLDER_KEY)

    wrapper.vm.toggleCollapse(CONNECTION_KEY)
    await nextTick()

    // Regresses `isMobile || searchQuery` reading the raw ref (always truthy),
    // which fed buildEditorTree an empty collapsed map on desktop — the chevron
    // flipped its icon but the tree never closed.
    expect(wrapper.vm.collapsed[CONNECTION_KEY]).toBe(true)
    expect(keysOf(wrapper.vm.contentList)).toContain(CONNECTION_KEY)
    expect(keysOf(wrapper.vm.contentList)).not.toContain(FOLDER_KEY)

    wrapper.vm.toggleCollapse(CONNECTION_KEY)
    await nextTick()
    expect(keysOf(wrapper.vm.contentList)).toContain(FOLDER_KEY)
  })

  it('collapses folders independently of their connection', async () => {
    wrapper = mountList(false)
    await nextTick()

    wrapper.vm.toggleCollapse(FOLDER_KEY)
    await nextTick()

    expect(keysOf(wrapper.vm.contentList)).toContain(FOLDER_KEY)
    expect(keysOf(wrapper.vm.contentList)).not.toContain('e-local-' + CONNECTION_ID + '-analysis')
    expect(wrapper.vm.contentList.filter((item: any) => item.type === 'editor')).toHaveLength(1)
  })

  it('keeps the full tree on mobile, where MobileTreeList owns disclosure', async () => {
    wrapper = mountList(true)
    await nextTick()

    wrapper.vm.toggleCollapse(CONNECTION_KEY)
    await nextTick()

    expect(keysOf(wrapper.vm.contentList)).toContain(FOLDER_KEY)
  })

  it('flattens to matching editors while searching', async () => {
    wrapper = mountList(false)
    await wrapper.setProps({ mobileSearchQuery: 'sales' })
    await nextTick()

    const list = wrapper.vm.contentList
    expect(list.every((item: any) => item.type === 'editor')).toBe(true)
    expect(list).toHaveLength(1)
    expect(list[0].label).toBe('sales-report')
  })
})

describe('DashboardListItem chevron', () => {
  let wrapper: VueWrapper<any>

  afterEach(() => {
    if (wrapper) wrapper.unmount()
  })

  const mountItem = (item: Record<string, any>) =>
    mount(DashboardListItem, {
      props: { item, isActive: false, isCollapsed: false },
      global: {
        provide: {
          connectionStore: { connections: {}, connectionByName: () => null },
          dashboardStore: { dashboards: {} },
          isMobile: computed(() => false),
        },
        stubs: {
          Tooltip: { template: '<div><slot /></div>' },
          SidebarOverflowMenu: true,
          StatusIcon: true,
        },
      },
    })

  it('emits toggle, not click, for a dashboard holding investigations', async () => {
    wrapper = mountItem({
      type: 'dashboard',
      key: 'd-1',
      id: '1',
      label: 'Dash',
      indent: 2,
      hasInvestigations: true,
      dashboard: { id: '1', name: 'Dash' },
    })

    await wrapper.find('[data-testid="expand-dashboard-d-1"]').trigger('click')

    // The chevron used to re-emit `click`, which the parent treats as "open
    // this dashboard" — so investigations could never be collapsed.
    expect(wrapper.emitted('toggle')).toHaveLength(1)
    expect(wrapper.emitted('click')).toBeUndefined()
  })

  it('still emits click when the row itself is clicked', async () => {
    wrapper = mountItem({
      type: 'connection',
      key: CONNECTION_KEY,
      id: CONNECTION_ID,
      label: 'duck',
      indent: 1,
      connectionId: CONNECTION_ID,
    })

    await wrapper.find('.sidebar-content').trigger('click')

    expect(wrapper.emitted('click')).toHaveLength(1)
    expect(wrapper.emitted('toggle')).toBeUndefined()
  })
})
