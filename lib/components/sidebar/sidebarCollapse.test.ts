import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import { computed, nextTick, reactive } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import EditorList from './EditorList.vue'
import DashboardList from './DashboardList.vue'
import DashboardListItem from './DashboardListItem.vue'
import ModelSidebar from './ModelSidebar.vue'
import useConnectionStore from '../../stores/connectionStore'
import { useScreenNavigation } from '../../stores'
import { KeySeparator } from '../../data/constants'

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

  const mountList = (isMobile: boolean, editorStore?: { editors: Record<string, any> }) => {
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
          editorStore: editorStore ?? {
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
    // which fed buildEditorTree a fully-expanded predicate on desktop — the
    // chevron flipped its icon but the tree never closed.
    expect(wrapper.vm.isCollapsed(CONNECTION_KEY)).toBe(true)
    expect(keysOf(wrapper.vm.contentList)).toContain(CONNECTION_KEY)
    expect(keysOf(wrapper.vm.contentList)).not.toContain(FOLDER_KEY)

    wrapper.vm.toggleCollapse(CONNECTION_KEY)
    await nextTick()
    expect(keysOf(wrapper.vm.contentList)).toContain(FOLDER_KEY)
  })

  it('collapses folders independently of their connection', async () => {
    wrapper = mountList(false)
    await nextTick()

    // The lone connection opens, but folders under it start shut — opening one
    // would mean picking arbitrarily among them.
    expect(keysOf(wrapper.vm.contentList)).toContain(FOLDER_KEY)
    expect(wrapper.vm.contentList.filter((item: any) => item.type === 'editor')).toHaveLength(1)

    wrapper.vm.toggleCollapse(FOLDER_KEY)
    await nextTick()
    expect(wrapper.vm.contentList.filter((item: any) => item.type === 'editor')).toHaveLength(2)

    wrapper.vm.toggleCollapse(FOLDER_KEY)
    await nextTick()
    expect(keysOf(wrapper.vm.contentList)).toContain(CONNECTION_KEY)
    expect(wrapper.vm.contentList.filter((item: any) => item.type === 'editor')).toHaveLength(1)
  })

  it('keeps the full tree on mobile, where MobileTreeList owns disclosure', async () => {
    wrapper = mountList(true)
    await nextTick()

    wrapper.vm.toggleCollapse(CONNECTION_KEY)
    await nextTick()

    expect(keysOf(wrapper.vm.contentList)).toContain(FOLDER_KEY)
  })

  it('collapses editors that hydrate after the sidebar mounts', async () => {
    // The sidebar is not gated on storesLoaded, so the storage promises in
    // Manager resolve after this list has already mounted and seeded defaults.
    const editorStore = reactive({ editors: {} as Record<string, any> })
    wrapper = mountList(false, editorStore)
    await nextTick()

    editorStore.editors.e2 = makeEditor('e2', 'top-level')
    editorStore.editors.e1 = makeEditor('e1', 'analysis/sales-report')
    await nextTick()

    // Nothing is selected, so the first editor's chain opens — but the analysis
    // folder is off that chain and must stay shut. Seeding once from the empty
    // store left it absent from the map, which buildEditorTree reads as open.
    expect(keysOf(wrapper.vm.contentList)).toContain(FOLDER_KEY)
    expect(wrapper.vm.isCollapsed(FOLDER_KEY)).toBe(true)
    const editors = wrapper.vm.contentList.filter((item: any) => item.type === 'editor')
    expect(editors.map((item: any) => item.label)).toEqual(['top-level'])
  })

  it('opens nothing on first run when more than one connection has editors', async () => {
    // The old fallback opened whichever editor `Object.values` happened to
    // return first. With a real choice to make, the tree stays shut rather than
    // picking arbitrarily.
    const editorStore = reactive({
      editors: {
        e1: makeEditor('e1', 'analysis/sales-report'),
        e2: { ...makeEditor('e2', 'top-level'), connectionId: 'local:other', connection: 'other' },
      } as Record<string, any>,
    })
    wrapper = mountList(false, editorStore)
    await nextTick()

    const list = wrapper.vm.contentList
    expect(list.every((item: any) => item.type === 'storage')).toBe(true)
    expect(wrapper.vm.isCollapsed(CONNECTION_KEY)).toBe(true)
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

describe('DashboardList collapse state', () => {
  let wrapper: VueWrapper<any>

  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    if (wrapper) wrapper.unmount()
  })

  it('collapses dashboards that hydrate after the sidebar mounts', async () => {
    const connectionStore = useConnectionStore()
    connectionStore.connections[CONNECTION_ID] = {
      id: CONNECTION_ID,
      name: 'duck',
      storage: 'local',
      connected: true,
      type: 'duckdb',
    } as any
    const dashboardStore = reactive({ dashboards: {} as Record<string, any> })

    wrapper = mount(DashboardList, {
      global: {
        provide: {
          connectionStore,
          dashboardStore,
          chatStore: { chats: {} },
          saveDashboards: vi.fn(),
          isMobile: computed(() => false),
        },
        stubs: {
          SidebarList: { template: '<div><slot name="actions" /><slot /></div>' },
          MobileTreeList: true,
          DashboardListItem: true,
          DashboardCreatorInline: true,
          DashboardImportPopup: true,
          LoadingButton: true,
          ConfirmDialog: true,
        },
      },
    })
    await nextTick()

    dashboardStore.dashboards.d1 = {
      id: 'd1',
      name: 'Sales',
      storage: 'local',
      connection: 'duck',
      connectionId: CONNECTION_ID,
      state: 'ready',
      deleted: false,
    }
    await nextTick()

    // The storage opens (nothing is selected), but the connection under it stays
    // collapsed, so the dashboard itself must not be listed.
    const keys = wrapper.vm.contentList.map((item: any) => item.key)
    expect(keys).toContain('s-local')
    expect(keys).toContain(`c-local-${CONNECTION_ID}`)
    expect(wrapper.vm.isCollapsed(`c-local-${CONNECTION_ID}`)).toBe(true)
    expect(wrapper.vm.contentList.filter((item: any) => item.type === 'dashboard')).toHaveLength(0)
  })
})

describe('ModelSidebar default collapse', () => {
  let wrapper: VueWrapper<any>

  const MODEL = 'duck-model'
  const modelKey = ['model', MODEL].join(KeySeparator)
  const sourceKey = ['source', MODEL, 'sales'].join(KeySeparator)
  const dsKey = ['datasource', MODEL, 'sales', 'sales_raw'].join(KeySeparator)

  const makeModel = () => ({
    name: MODEL,
    deleted: false,
    sources: [
      {
        alias: 'sales',
        editor: 'e1',
        concepts: [{ name: 'revenue', namespace: 'local', purpose: 'metric' }],
        datasources: [
          { name: 'sales_raw', concepts: [{ name: 'id', namespace: 'local', purpose: 'key' }] },
        ],
      },
    ],
  })

  const mountSidebar = (modelStore: { models: Record<string, any> }) =>
    mount(ModelSidebar, {
      global: {
        provide: {
          modelStore,
          saveModels: vi.fn(),
          editorStore: { editors: {} },
          trilogyResolver: {},
          isMobile: computed(() => false),
        },
        stubs: {
          SidebarList: { template: '<div><slot name="actions" /><slot /></div>' },
          MobileTreeList: true,
          ModelCreator: true,
          LoadingButton: true,
        },
      },
    })

  afterEach(() => {
    if (wrapper) wrapper.unmount()
    useScreenNavigation().activeModelKey.value = ''
  })

  const idsOf = (list: any[]) => list.map((item) => item.id)

  it('collapses models that load after the sidebar mounts', async () => {
    // ModelSidebar is v-show'd, so it mounts before storage finishes loading.
    // Regresses snapshotting the collapsed map in setup(): with no models to walk
    // the map came out empty, and every node read as expanded.
    const modelStore = reactive({ models: {} as Record<string, any> })
    wrapper = mountSidebar(modelStore)
    await nextTick()
    expect(wrapper.vm.flatList).toHaveLength(0)

    modelStore.models[MODEL] = makeModel()
    await nextTick()

    expect(idsOf(wrapper.vm.flatList)).toEqual([modelKey])
    expect(wrapper.vm.isCollapsed(modelKey)).toBe(true)
  })

  it('toggles a late-loaded node open and closed again', async () => {
    const modelStore = reactive({ models: {} as Record<string, any> })
    wrapper = mountSidebar(modelStore)
    modelStore.models[MODEL] = makeModel()
    await nextTick()

    wrapper.vm.handleToggle(modelKey)
    await nextTick()
    expect(idsOf(wrapper.vm.flatList)).toEqual([modelKey, sourceKey])

    wrapper.vm.handleToggle(sourceKey)
    await nextTick()
    expect(idsOf(wrapper.vm.flatList)).toContain(dsKey)
    expect(wrapper.vm.flatList.filter((i: any) => i.type === 'concept')).toHaveLength(1)

    wrapper.vm.handleToggle(modelKey)
    await nextTick()
    expect(idsOf(wrapper.vm.flatList)).toEqual([modelKey])
  })

  it('expands the path to the active selection', async () => {
    useScreenNavigation().activeModelKey.value = sourceKey
    const modelStore = reactive({ models: { [MODEL]: makeModel() } as Record<string, any> })
    wrapper = mountSidebar(modelStore)
    await nextTick()

    const ids = idsOf(wrapper.vm.flatList)
    expect(ids).toContain(sourceKey)
    expect(ids).toContain(dsKey)
    // The datasource itself is off the active path, so its fields stay hidden.
    expect(wrapper.vm.isCollapsed(dsKey)).toBe(true)
    expect(wrapper.vm.flatList.filter((i: any) => i.type === 'concept')).toHaveLength(1)
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
