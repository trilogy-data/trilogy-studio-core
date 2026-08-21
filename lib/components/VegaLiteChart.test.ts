import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import VegaLiteChart from './VegaLiteChart.vue'
import { ColumnType, type ChartConfig, type ResultColumn, type Row } from '../editors/results'

// vega-embed touches canvas, which jsdom has no implementation for; the render
// manager is not what these tests are about.
vi.mock('vega-embed', () => ({
  default: vi.fn(async () => ({ view: { addEventListener: vi.fn(), finalize: vi.fn() } })),
}))

// jsdom has no ResizeObserver; the component wires one up on mount.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub)

const columns = new Map<string, ResultColumn>([
  ['category', { name: 'category', type: ColumnType.STRING, description: 'Category' }],
  ['total', { name: 'total', type: ColumnType.NUMBER, description: 'Total' }],
  ['average', { name: 'average', type: ColumnType.NUMBER, description: 'Average' }],
])

const data: Row[] = [
  { category: 'a', total: 10, average: 4 },
  { category: 'b', total: 20, average: 6 },
]

const mountChart = (initialConfig: ChartConfig) =>
  mount(VegaLiteChart, {
    props: { data, columns, initialConfig, showControls: false },
    global: { stubs: { Tooltip: true, ChartControlPanel: true } },
  })

describe('VegaLiteChart spec errors', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('surfaces an unbuildable chart instead of throwing', async () => {
    // Trellis inside a layered spec is forbidden by Vega-Lite. pytrilogy parses
    // it happily -- only its renderer objects -- so this reaches the studio as
    // a valid statement and has to fail legibly here.
    const wrapper = mountChart({
      chartType: 'bar',
      trellisField: 'category',
      layers: [
        { chartType: 'bar', xField: 'category', yField: 'total' },
        { chartType: 'line', xField: 'category', yField: 'average' },
      ],
    })
    await flushPromises()

    const error = wrapper.find('[data-testid="chart-spec-error"]')
    expect(error.exists()).toBe(true)
    expect(error.text()).toContain('Trellis roles cannot be combined')
    wrapper.unmount()
  })

  it('surfaces a chart type that cannot be a layer', async () => {
    const wrapper = mountChart({
      chartType: 'bar',
      layers: [
        { chartType: 'bar', xField: 'category', yField: 'total' },
        { chartType: 'headline', yField: 'average' },
      ],
    })
    await flushPromises()

    const error = wrapper.find('[data-testid="chart-spec-error"]')
    expect(error.exists()).toBe(true)
    expect(error.text()).toContain('cannot be used as a layer')
    wrapper.unmount()
  })

  it('shows no error for a chart it can build', async () => {
    const wrapper = mountChart({
      chartType: 'bar',
      layers: [
        { chartType: 'bar', xField: 'category', yField: 'total' },
        { chartType: 'line', xField: 'category', yField: 'average' },
      ],
    })
    await flushPromises()

    expect(wrapper.find('[data-testid="chart-spec-error"]').exists()).toBe(false)
    wrapper.unmount()
  })
})
