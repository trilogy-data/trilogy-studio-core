import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import DataTable from './DataTable.vue'
import { ColumnType, type ResultColumn, type Row } from '../editors/results'

// Tabulator needs a laid-out element; jsdom gives every element a zero
// offsetWidth, so create() stays pending and the table is never built. That
// is fine here: these tests are about the component's own chrome.

const headers = new Map<string, ResultColumn>([
  ['name', { name: 'name', type: ColumnType.STRING, description: '' }],
  ['launches', { name: 'launches', type: ColumnType.INTEGER, description: '' }],
])
const results: Row[] = [
  { name: 'Falcon 9', launches: 100 },
  { name: 'Electron', launches: 12 },
]

function mountTable(props: Record<string, unknown> = {}) {
  return mount(DataTable, {
    props: { headers, results, ...props },
    global: { provide: { userSettingsStore: null } },
  })
}

describe('DataTable controls', () => {
  it('renders the floating copy/download buttons by default', () => {
    const wrapper = mountTable()
    expect(wrapper.find('.controls-toggle').exists()).toBe(true)
    expect(wrapper.findAll('.control-btn')).toHaveLength(2)
  })

  it('omits the floating buttons when showControls is false', () => {
    const wrapper = mountTable({ showControls: false })
    expect(wrapper.find('.controls-toggle').exists()).toBe(false)
    expect(wrapper.find('.control-btn').exists()).toBe(false)
  })

  /*
    A host that hides the floating buttons renders its own affordances and
    drives the table through a template ref, so the two actions are part of the
    component's public surface. Both bail out without a Tabulator instance
    rather than throwing, which is what a host hits if it fires one before the
    table has laid out.
  */
  it('exposes copyToClipboard and downloadData for host-rendered controls', async () => {
    const wrapper = mountTable({ showControls: false })
    const vm = wrapper.vm as unknown as {
      copyToClipboard: () => Promise<void>
      downloadData: () => void
    }
    expect(typeof vm.copyToClipboard).toBe('function')
    expect(typeof vm.downloadData).toBe('function')

    const writeText = vi.fn()
    Object.assign(navigator, { clipboard: { writeText } })
    await expect(vm.copyToClipboard()).resolves.toBeUndefined()
    expect(() => vm.downloadData()).not.toThrow()
    expect(writeText).not.toHaveBeenCalled()
  })
})
