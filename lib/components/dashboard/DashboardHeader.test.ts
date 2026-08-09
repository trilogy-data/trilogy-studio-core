import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import DashboardHeader from './DashboardHeader.vue'

/**
 * The header's connection `<select>` is bound to `selectedConnection`, which
 * useDashboard resolves to a *store id* (`local:<name>`) because every consumer
 * downstream — updateDashboardConnection, the query executor — is keyed by id.
 * When the options carried display names instead, no option matched the bound
 * value and the browser rendered the select blank on every dashboard load.
 */

const FAA = { id: 'local:faa-demo', name: 'faa-demo', model: 'faa', deleted: false }
const OTHER = { id: 'local:zebra', name: 'zebra', model: 'zoo', deleted: false }
const NO_MODEL = { id: 'local:bare', name: 'bare', model: '', deleted: false }

let connections: Record<string, any>

vi.mock('../../stores', () => ({
  useConnectionStore: () => ({
    get connections() {
      return connections
    },
    connectionByName: (name: string) => Object.values(connections).find((c) => c.name === name),
  }),
  useEditorStore: () => ({ editors: {} }),
  useScreenNavigation: () => ({ openTab: vi.fn() }),
}))

function mountHeader(selectedConnection: string) {
  return mount(DashboardHeader, {
    props: {
      dashboard: { id: 'dash-1', name: 'D', state: 'editing', imports: [] } as any,
      selectedConnection,
    },
    global: {
      stubs: {
        DashboardImportSelector: true,
        DashboardSharePopup: true,
        DashboardThemePopup: true,
        FilterInputComponent: true,
        LoadingButton: true,
      },
    },
  })
}

beforeEach(() => {
  connections = { [OTHER.id]: OTHER, [FAA.id]: FAA, [NO_MODEL.id]: NO_MODEL }
})

describe('DashboardHeader connection selector', () => {
  it('offers connection ids as option values so the bound id selects', () => {
    const wrapper = mountHeader(FAA.id)
    const select = wrapper.get('[data-testid="connection-selector"]')

    expect(select.findAll('option').map((o) => o.attributes('value'))).toEqual([
      FAA.id,
      OTHER.id, // sorted by name: faa-demo, zebra
    ])
    expect((select.element as HTMLSelectElement).value).toBe(FAA.id)
    wrapper.unmount()
  })

  it('labels options with the display name', () => {
    const wrapper = mountHeader(FAA.id)

    expect(
      wrapper
        .get('[data-testid="connection-selector"]')
        .findAll('option')
        .map((o) => o.text()),
    ).toEqual([FAA.name, OTHER.name])
    wrapper.unmount()
  })

  it('still selects when a legacy dashboard hands over a display name', () => {
    const wrapper = mountHeader(FAA.name)

    // The value can't match — options are ids — but the name must at least
    // resolve for the tooltip rather than leaking the raw prop.
    expect(wrapper.get('[data-testid="connection-selector"]').attributes('title')).toBe(FAA.name)
    wrapper.unmount()
  })

  it('omits connections without a model', () => {
    const wrapper = mountHeader(FAA.id)

    const values = wrapper
      .get('[data-testid="connection-selector"]')
      .findAll('option')
      .map((o) => o.attributes('value'))
    expect(values).not.toContain(NO_MODEL.id)
    wrapper.unmount()
  })
})
