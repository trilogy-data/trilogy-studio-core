import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import useDashboardStore from './dashboardStore'
import {
  resolveDashboardConnectionId,
  repairDashboardConnectionRefs,
} from '../dashboards/connectionResolution'

/**
 * A dashboard's connection has to survive three hops before a query runs:
 * the model (`connection` name + `connectionId` key), the resolution step,
 * and the per-dashboard query executor — which is cached for the life of the
 * dashboard. Any hop that drops or freezes the id surfaces to the user as
 * "Connection <name> not found." on every card, while the header still shows a
 * healthy connection because it reads the model rather than the executor.
 */

vi.mock('./connectionStore', () => ({
  default: () => mockConnectionStore,
}))

let mockConnectionStore: any

function makeConnectionStore(connections: Record<string, { id: string; name: string }>) {
  return {
    connections,
    connectionByName: (name: string) => Object.values(connections).find((c) => c.name === name),
  }
}

const FAA = { id: 'local:faa-demo-connection', name: 'faa-demo-connection' }

beforeEach(() => {
  setActivePinia(createPinia())
  mockConnectionStore = makeConnectionStore({ [FAA.id]: FAA })
})

describe('resolveDashboardConnectionId', () => {
  it('prefers an id that resolves', () => {
    const resolved = resolveDashboardConnectionId(
      { connection: FAA.name, connectionId: FAA.id },
      mockConnectionStore,
    )
    expect(resolved).toBe(FAA.id)
  })

  it('falls back to the display name when the id is missing', () => {
    const resolved = resolveDashboardConnectionId(
      { connection: FAA.name, connectionId: '' },
      mockConnectionStore,
    )
    expect(resolved).toBe(FAA.id)
  })

  it('falls back to the display name when the id no longer resolves', () => {
    // e.g. the connection was deleted and recreated under a new storage.
    const resolved = resolveDashboardConnectionId(
      { connection: FAA.name, connectionId: 'remote:gone:faa-demo-connection' },
      mockConnectionStore,
    )
    expect(resolved).toBe(FAA.id)
  })

  it('returns the raw name when nothing resolves, so the error names it', () => {
    const resolved = resolveDashboardConnectionId(
      { connection: FAA.name, connectionId: '' },
      makeConnectionStore({}) as any,
    )
    expect(resolved).toBe(FAA.name)
  })
})

describe('repairDashboardConnectionRefs', () => {
  it('repairs an id that does not resolve, so exact-match consumers see it', () => {
    // What a manifest import against a remote connection produced: `local:`
    // hardcoded onto a dashboard whose connection is remote. Cascade delete and
    // getConnectionDashboards compare ids exactly, and the sidebar groups on
    // the raw value — so this rendered as a second group with the same label.
    const remote = { id: 'remote:store-1:faa-demo-connection', name: 'faa-demo-connection' }
    const store = makeConnectionStore({ [remote.id]: remote })
    const dashboard = {
      connection: 'faa-demo-connection',
      connectionId: 'local:faa-demo-connection',
      changed: false,
    }

    expect(repairDashboardConnectionRefs([dashboard], store as any)).toBe(1)
    expect(dashboard.connectionId).toBe(remote.id)
    expect(dashboard.changed).toBe(true)
  })

  it('backfills a missing id', () => {
    const dashboard = { connection: FAA.name, connectionId: '', changed: false }

    expect(repairDashboardConnectionRefs([dashboard], mockConnectionStore)).toBe(1)
    expect(dashboard.connectionId).toBe(FAA.id)
  })

  it('normalizes a connection field holding an id rather than a display name', () => {
    // newDashboard writes the id into `connection` when the connection didn't
    // resolve at creation time; left alone the sidebar labels it `local:...`.
    const dashboard = { connection: FAA.name, connectionId: FAA.id, changed: false }
    const drifted = { connection: FAA.id, connectionId: '', changed: false }

    repairDashboardConnectionRefs([dashboard, drifted], mockConnectionStore)

    expect(dashboard.changed).toBe(false) // already correct — left alone
    expect(drifted.connection).toBe(FAA.name)
    expect(drifted.connectionId).toBe(FAA.id)
  })

  it('leaves a dashboard whose connection is gone alone', () => {
    // Must not be silently merged into a live connection: an orphan should stay
    // visible as its own group.
    const orphan = {
      connection: 'deleted-connection',
      connectionId: 'local:deleted',
      changed: false,
    }

    expect(repairDashboardConnectionRefs([orphan], mockConnectionStore)).toBe(0)
    expect(orphan.connectionId).toBe('local:deleted')
    expect(orphan.changed).toBe(false)
  })

  it('collapses mixed-key dashboards onto one connection id', () => {
    // The reported symptom: two sidebar groups carrying the same display name.
    const byName = { connection: FAA.name, connectionId: '', changed: false }
    const byStaleId = { connection: FAA.name, connectionId: 'remote:gone:x', changed: false }
    const correct = { connection: FAA.name, connectionId: FAA.id, changed: false }

    repairDashboardConnectionRefs([byName, byStaleId, correct], mockConnectionStore)

    const keys = new Set([byName, byStaleId, correct].map((d) => d.connectionId))
    expect(keys).toEqual(new Set([FAA.id]))
  })
})

describe('dashboardStore connection plumbing', () => {
  it('normalizes a display name into a store id on create', () => {
    // The sidebar context menu and DashboardCreatorIcon hand over whatever the
    // tree node was grouped under, which for legacy dashboards is a bare name.
    // Storing that as the id left the header's `<select>` bound to a value no
    // option carried, so the picker rendered blank on a brand-new dashboard.
    const store = useDashboardStore()

    const dashboard = store.newDashboard('by-name', FAA.name)

    expect(dashboard.connectionId).toBe(FAA.id)
    expect(dashboard.connection).toBe(FAA.name)
  })

  it('normalizes a display name into a store id on update', () => {
    const store = useDashboardStore()
    store.newDashboard('base', FAA.id)

    store.updateDashboardConnection('base', FAA.name)

    expect(store.dashboards['base'].connectionId).toBe(FAA.id)
    expect(store.dashboards['base'].connection).toBe(FAA.name)
  })

  it('keeps an unresolvable ref intact so the error names it', () => {
    const store = useDashboardStore()

    const dashboard = store.newDashboard('orphan', 'local:gone')

    expect(dashboard.connectionId).toBe('local:gone')
    expect(dashboard.connection).toBe('local:gone')
  })

  it('carries connectionId onto a fork', () => {
    const store = useDashboardStore()
    store.newDashboard('base', FAA.id)

    const fork = store.forkDashboard('base', 'chat-183844')

    expect(fork.connectionId).toBe(FAA.id)
    expect(fork.connection).toBe(FAA.name)
  })

  it('carries connectionId onto a clone', () => {
    const store = useDashboardStore()
    store.newDashboard('base', FAA.id)

    const copy = store.cloneDashboard('base')

    expect(copy.connectionId).toBe(FAA.id)
  })

  it('re-syncs a cached executor whose connection was resolved too early', () => {
    // The regression: the first getOrCreate happens before the connection
    // store has hydrated, so resolution bottoms out at the bare display name.
    // The executor was cached with that value forever, and every later query
    // failed even once the connection was present.
    const store = useDashboardStore()
    store.newDashboard('base', FAA.id)

    const deps = (connectionName: string) => ({
      queryExecutionService: {} as any,
      connectionName,
      dashboardId: 'base',
      getDashboardData: (id: string) => store.dashboards[id],
      getItemData: (() => ({})) as any,
      setItemData: () => {},
    })

    const early = store.getOrCreateQueryExecutor('base', deps(FAA.name))
    expect(early.connectionName).toBe(FAA.name)
    // Pinia hands back a reactive proxy, so identity is tracked via a marker
    // rather than ===. The executor must be reused, not rebuilt: it owns the
    // in-flight query queue.
    ;(early as any).__marker = 'first'

    const later = store.getOrCreateQueryExecutor('base', deps(FAA.id))

    expect((later as any).__marker).toBe('first')
    expect(later.connectionName).toBe(FAA.id)
  })
})
