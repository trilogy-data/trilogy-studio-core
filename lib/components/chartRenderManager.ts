// chartRenderManager.ts
import { ref, nextTick } from 'vue'
import vegaEmbed from 'vega-embed'
import type { View } from 'vega'
import type { ChartConfig, ResultColumn } from '../editors/results'
import { ChromaChartHelpers } from './chartHelpers'

// Type for tracking render operations
export interface RenderOperation {
  id: number
  aborted: boolean
  container: 1 | 2
}

export class ChartRenderManager {
  // Dual container state management
  public activeContainer = ref<1 | 2>(1)
  public transitioning = ref(false)
  public hasLoaded = ref(false)

  // Store views for both containers
  private vegaViews = ref<Map<1 | 2, View | null>>(
    new Map([
      [1, null],
      [2, null],
    ]),
  )

  // Track event listeners for cleanup
  private eventListeners = ref<Map<1 | 2, (() => void) | null>>(
    new Map([
      [1, null],
      [2, null],
    ]),
  )

  // Render operation tracking for concurrency control
  private renderCounter = 0
  private pendingRender = ref<RenderOperation | null>(null)
  private activeRender = ref<RenderOperation | null>(null)
  private lastSpec = ref<string | null>(null)

  constructor(private chartHelpers: ChromaChartHelpers) {}

  // Get the currently active Vega view for operations like download
  getActiveView(): View | null {
    return this.vegaViews.value.get(this.activeContainer.value) || null
  }

  // Clean up a specific container's resources
  cleanupContainer(container: 1 | 2): void {
    // Clean up event listener
    const listener = this.eventListeners.value.get(container)
    if (listener) {
      listener()
      this.eventListeners.value.set(container, null)
    }

    // Finalize view
    const view = this.vegaViews.value.get(container)
    if (view) {
      view.finalize()
      this.vegaViews.value.set(container, null)
    }
  }

  // Main render function with hot-swap logic
  async renderChart(
    vegaContainer1: HTMLElement | null,
    vegaContainer2: HTMLElement | null,
    spec: any,
    config: ChartConfig,
    columns: Map<string, ResultColumn>,
    currentTheme: string,
    isMobile: boolean,
    debouncedBrushHandler: (name: string, item: any) => void,
    chartTitle: string = '',
    force: boolean = false,
  ): Promise<void> {
    if (!spec) return

    const currentSpecString = JSON.stringify(spec)

    // Skip if spec hasn't changed and not forced
    if (this.hasLoaded.value && this.lastSpec.value === currentSpecString && !force) {
      console.log('Skipping render - spec unchanged')
      return
    } else {
      console.log('Rendering new spec on chart:', chartTitle, 'length', currentSpecString.length)
    }

    // Create new render operation
    const renderOp: RenderOperation = {
      id: ++this.renderCounter,
      aborted: false,
      container: this.activeContainer.value === 1 ? 2 : (1 as 1 | 2),
    }

    // If there's an active render, mark pending render for abort
    if (this.activeRender.value) {
      this.activeRender.value.aborted = true
    }

    // If there's a pending render, abort it
    if (this.pendingRender.value) {
      this.pendingRender.value.aborted = true
    }

    // This render is now pending
    this.pendingRender.value = renderOp

    // Check if this render was aborted while waiting
    if (renderOp.aborted) {
      console.log(`Render ${renderOp.id} ${chartTitle} aborted before starting`)
      return
    }

    // Move from pending to active
    this.pendingRender.value = null
    this.activeRender.value = renderOp

    try {
      // Get the target container
      const targetContainer = renderOp.container === 1 ? vegaContainer1 : vegaContainer2

      if (!targetContainer) {
        console.log(`Container ${renderOp.container} not available`)
        return
      }

      // Check for abort before expensive operations
      if (renderOp.aborted) {
        console.log(`Render ${renderOp.id} aborted before vega embed`)
        return
      }

      // Render to the inactive container
      const result = await vegaEmbed(targetContainer, spec, {
        actions: false,
        theme: currentTheme === 'dark' ? 'dark' : undefined,
        renderer: 'canvas',
      })

      // Check for abort after async operation
      if (renderOp.aborted) {
        console.log(`Render ${renderOp.id} ${chartTitle} aborted after vega embed`)
        // Clean up the just-created view since we're aborting
        result.view.finalize()
        return
      }

      // Store the new view
      this.vegaViews.value.set(renderOp.container, result.view)

      // Clean up old event listener for this container
      const oldListener = this.eventListeners.value.get(renderOp.container)
      if (oldListener) {
        oldListener()
      }

      // Setup new event listeners
      const removeListener = this.chartHelpers.setupEventListeners(
        result.view,
        config,
        columns,
        isMobile,
        debouncedBrushHandler,
      )
      this.eventListeners.value.set(renderOp.container, removeListener)

      // Final abort check before transition
      if (renderOp.aborted) {
        console.log(`Render ${renderOp.id} on container ${renderOp.container} aborted before transition`)
        this.cleanupContainer(renderOp.container)
        return
      }

      // Perform the hot-swap transition
      this.transitioning.value = true

      // Wait a tick for the new chart to be ready
      await nextTick()

      // Switch active container
      const previousContainer = this.activeContainer.value
      this.activeContainer.value = renderOp.container

      // Let the transition effect play out
      setTimeout(() => {
        this.transitioning.value = false
        // Clean up the old container after transition
        this.cleanupContainer(previousContainer)
      }, 300) // Match CSS transition duration

      this.lastSpec.value = currentSpecString
      this.hasLoaded.value = true

      console.log(`Render ${renderOp.id} completed successfully on container ${renderOp.container}`)
    } catch (error) {
      console.error(`Error in render ${renderOp.id}:`, error)
    } finally {
      // Clear active render if it's this one
      if (this.activeRender.value?.id === renderOp.id) {
        this.activeRender.value = null
      }
    }
  }

  // Cleanup all resources
  cleanup(): void {
    // Abort any pending renders
    if (this.pendingRender.value) {
      this.pendingRender.value.aborted = true
    }
    if (this.activeRender.value) {
      this.activeRender.value.aborted = true
    }

    // Clean up both containers
    this.cleanupContainer(1)
    this.cleanupContainer(2)
  }
}
