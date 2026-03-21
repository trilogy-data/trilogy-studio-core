import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { View } from 'vega'
import type { ChartConfig, ResultColumn } from '../editors/results'
import { ChartRenderManager } from './chartRenderManager'

const { vegaEmbedMock } = vi.hoisted(() => ({
  vegaEmbedMock: vi.fn(),
}))

vi.mock('vega-embed', () => ({
  default: vegaEmbedMock,
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, resolve, reject }
}

function createViewStub(): View {
  return {
    finalize: vi.fn(),
    addSignalListener: vi.fn(),
    addEventListener: vi.fn(),
    removeSignalListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as View
}

describe('ChartRenderManager', () => {
  beforeEach(() => {
    vegaEmbedMock.mockReset()
    vi.useFakeTimers()
  })

  afterEach(async () => {
    await vi.runOnlyPendingTimersAsync()
    vi.useRealTimers()
  })

  it('skips identical renders while the same spec is already in flight', async () => {
    const removeListener = vi.fn()
    const chartHelpers = {
      setupEventListeners: vi.fn().mockReturnValue(removeListener),
    }
    const manager = new ChartRenderManager(chartHelpers as any)
    const pendingEmbed = deferred<{ view: View }>()
    const view = createViewStub()
    const spec = {
      mark: 'bar',
      data: {
        values: [{ category: 'A', value: 1 }],
      },
    }
    const config = { chartType: 'bar' } as ChartConfig
    const columns = new Map<string, ResultColumn>()
    const brushHandler = vi.fn()
    const container1 = document.createElement('div')
    const container2 = document.createElement('div')

    vegaEmbedMock.mockReturnValue(pendingEmbed.promise)

    const firstRenderPromise = manager.renderChart(
      container1,
      container2,
      spec,
      config,
      columns,
      'light',
      false,
      brushHandler,
      'Revenue Trends',
    )
    const duplicateRenderPromise = manager.renderChart(
      container1,
      container2,
      spec,
      config,
      columns,
      'light',
      false,
      brushHandler,
      'Revenue Trends',
    )

    expect(vegaEmbedMock).toHaveBeenCalledTimes(1)

    await duplicateRenderPromise

    pendingEmbed.resolve({ view })
    await firstRenderPromise
    await vi.runAllTimersAsync()

    expect(vegaEmbedMock).toHaveBeenCalledTimes(1)
    expect(chartHelpers.setupEventListeners).toHaveBeenCalledTimes(1)
    expect(manager.hasLoaded.value).toBe(true)
  })
})
