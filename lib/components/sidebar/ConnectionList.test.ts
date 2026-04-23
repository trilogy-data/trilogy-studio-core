import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, VueWrapper, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { setActivePinia, createPinia } from 'pinia'
import ConnectionList from './ConnectionList.vue'
import useConnectionStore from '../../stores/connectionStore'

describe('ConnectionList - delete flow', () => {
  let wrapper: VueWrapper<any>
  let saveConnections: ReturnType<typeof vi.fn>
  let saveEditors: ReturnType<typeof vi.fn>
  let saveDashboards: ReturnType<typeof vi.fn>
  let editorStore: { editors: Record<string, any> }
  let modelStore: { models: Record<string, any> }
  let dashboardStore: {
    dashboards: Record<string, any>
    purgeDeletedDashboards: ReturnType<typeof vi.fn>
  }

  const mountList = (opts: { includeDashboards?: boolean } = { includeDashboards: true }) => {
    const provide: Record<string, any> = {
      connectionStore: useConnectionStore(),
      saveConnections,
      saveEditors,
      modelStore,
      editorStore,
    }
    if (opts.includeDashboards) {
      provide.dashboardStore = dashboardStore
      provide.saveDashboards = saveDashboards
    }
    return mount(ConnectionList, {
      global: {
        plugins: [],
        provide,
        stubs: {
          SidebarList: { template: '<div><slot name="header" /><slot name="actions" /><slot /></div>' },
          ConnectionListItem: true,
          ConnectionCreatorInline: true,
        },
      },
    })
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    saveConnections = vi.fn().mockResolvedValue(undefined)
    saveEditors = vi.fn().mockResolvedValue(undefined)
    saveDashboards = vi.fn().mockResolvedValue(undefined)
    editorStore = { editors: {} }
    modelStore = { models: {} }
    dashboardStore = {
      dashboards: {},
      purgeDeletedDashboards: vi.fn(function (this: any) {
        for (const id of Object.keys(dashboardStore.dashboards)) {
          if (dashboardStore.dashboards[id].deleted) {
            delete dashboardStore.dashboards[id]
          }
        }
      }),
    }
  })

  afterEach(() => {
    if (wrapper) wrapper.unmount()
  })

  const seedConnection = (name = 'doomed') => {
    const store = useConnectionStore()
    const conn: any = {
      name,
      deleted: false,
      changed: false,
      databases: [],
      connected: false,
      type: 'duckdb',
      delete(this: any) {
        this.deleted = true
        this.changed = true
      },
    }
    store.connections[name] = conn
    return conn
  }

  // Regresses the original template-wiring bug: `:delete-connection="..."` vs
  // `@delete-connection="..."`. The child emits this event; the parent has to
  // listen with `@`, otherwise clicks on the child's delete button are no-ops.
  it('listens for @delete-connection from the child in the template', () => {
    const src = readFileSync(
      resolve(__dirname, 'ConnectionList.vue'),
      'utf-8',
    )
    expect(src).toMatch(/@delete-connection\s*=\s*"deleteConnection"/)
    expect(src).not.toMatch(/:delete-connection\s*=/)
  })

  it('showDeleteConfirmation opens the modal and tracks the pending name', async () => {
    const conn = seedConnection()
    wrapper = mountList()
    await nextTick()

    expect(wrapper.vm.showDeleteConfirmationState).toBe(false)

    // Simulates the child's emitted event reaching the `deleteConnection`
    // method bound in the template.
    wrapper.vm.deleteConnection(conn)
    await nextTick()

    expect(wrapper.vm.showDeleteConfirmationState).toBe(true)
    expect(wrapper.vm.connectionToDelete).toBe('doomed')
    expect(wrapper.find('.confirmation-overlay').exists()).toBe(true)
  })

  it('confirmDelete invokes delete + save + purge so the connection leaves the store', async () => {
    const conn = seedConnection()
    const store = useConnectionStore()

    // Add an editor bound to this connection so we can verify it's deleted too.
    const editorDelete = vi.fn()
    editorStore.editors['e1'] = {
      id: 'e1',
      name: 'editor-1',
      connection: 'doomed',
      delete: editorDelete,
    }
    editorStore.editors['e2'] = {
      id: 'e2',
      name: 'editor-2',
      connection: 'other',
      delete: vi.fn(),
    }

    // Dashboards bound to this connection must be cascaded. The one on
    // "other" must stay.
    const doomedDashDelete = vi.fn(function (this: any) {
      this.deleted = true
      this.changed = true
    })
    const survivorDashDelete = vi.fn()
    dashboardStore.dashboards['d1'] = {
      id: 'd1',
      name: 'cascade-me',
      connection: 'doomed',
      deleted: false,
      changed: false,
      delete: doomedDashDelete,
    }
    dashboardStore.dashboards['d2'] = {
      id: 'd2',
      name: 'leave-me',
      connection: 'other',
      deleted: false,
      changed: false,
      delete: survivorDashDelete,
    }

    wrapper = mountList()
    await nextTick()

    wrapper.vm.deleteConnection(conn)
    await nextTick()

    await wrapper.find('.confirmation-dialog .confirm-btn').trigger('click')
    await flushPromises()

    // Editor bound to the deleted connection should be removed, others left alone.
    expect(editorDelete).toHaveBeenCalledTimes(1)
    expect(editorStore.editors['e2'].delete).not.toHaveBeenCalled()

    // Dashboards cascade the same way: bound dashboards get deleted, others don't.
    expect(doomedDashDelete).toHaveBeenCalledTimes(1)
    expect(survivorDashDelete).not.toHaveBeenCalled()

    // Persistence writes each side so localStorage observes the `deleted` flag.
    expect(saveConnections).toHaveBeenCalledTimes(1)
    expect(saveEditors).toHaveBeenCalledTimes(1)
    expect(saveDashboards).toHaveBeenCalledTimes(1)

    // After purge the connection + cascaded dashboard must both be gone.
    expect(store.connections['doomed']).toBeUndefined()
    expect(dashboardStore.dashboards['d1']).toBeUndefined()
    expect(dashboardStore.dashboards['d2']).toBeDefined()
    expect(dashboardStore.purgeDeletedDashboards).toHaveBeenCalledTimes(1)
    expect(wrapper.vm.showDeleteConfirmationState).toBe(false)
    expect(wrapper.vm.connectionToDelete).toBe('')
  })

  it('works without a dashboardStore injection (embedded sidebar contexts)', async () => {
    const conn = seedConnection()
    const store = useConnectionStore()

    wrapper = mountList({ includeDashboards: false })
    await nextTick()

    wrapper.vm.deleteConnection(conn)
    await nextTick()

    await wrapper.find('.confirmation-dialog .confirm-btn').trigger('click')
    await flushPromises()

    expect(saveConnections).toHaveBeenCalledTimes(1)
    expect(saveEditors).toHaveBeenCalledTimes(1)
    expect(saveDashboards).not.toHaveBeenCalled()
    expect(store.connections['doomed']).toBeUndefined()
  })

  it('cancelDelete closes the modal without touching the store', async () => {
    const conn = seedConnection()
    const store = useConnectionStore()

    wrapper = mountList()
    await nextTick()

    wrapper.vm.deleteConnection(conn)
    await nextTick()

    await wrapper.find('.confirmation-dialog .cancel-btn').trigger('click')
    await flushPromises()

    expect(saveConnections).not.toHaveBeenCalled()
    expect(saveEditors).not.toHaveBeenCalled()
    expect(store.connections['doomed']).toBeDefined()
    expect(store.connections['doomed'].deleted).toBe(false)
    expect(wrapper.vm.showDeleteConfirmationState).toBe(false)
  })
})
