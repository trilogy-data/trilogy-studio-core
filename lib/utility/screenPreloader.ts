// Warms the lazy-loaded screen chunks before they're rendered, so switching
// screens doesn't flash a blank pane while the chunk downloads.
//
// These loaders must reference the same modules as the defineAsyncComponent
// loaders in views/IDE.vue — Vite resolves both to the same chunk, so a
// preload here means the async component resolves instantly later.
const screenLoaders: Record<string, () => Promise<unknown>> = {
  editors: () =>
    Promise.all([
      import('../components/editor/Editor.vue'),
      import('../components/editor/ResultComponent.vue'),
    ]),
  connections: () => import('../views/ConnectionView.vue'),
  llms: () => import('../views/LLMView.vue'),
  dashboard: () => import('../components/dashboard/Dashboard.vue'),
  models: () => import('../views/ModelView.vue'),
  'community-models': () => import('../components/community/CommunityModels.vue'),
  jobs: () => import('../components/jobs/JobsView.vue'),
  tutorial: () => import('../views/TutorialPage.vue'),
}

const started = new Set<string>()

/** Kick off the chunk download for a screen. Safe to call repeatedly; no-op
 * for unknown screens or screens already loading/loaded. */
export function preloadScreen(screen: string): void {
  if (started.has(screen)) return
  const loader = screenLoaders[screen]
  if (!loader) return
  started.add(screen)
  loader().catch(() => {
    // Fetch failed (e.g. offline) — allow a retry on the next trigger.
    started.delete(screen)
  })
}

/** Prefetch every screen chunk once the browser is idle, as a backstop for
 * clicks that land faster than a hover preload can finish. */
export function preloadAllScreensWhenIdle(delayMs = 3000): void {
  if (typeof window === 'undefined') return
  const run = () => Object.keys(screenLoaders).forEach(preloadScreen)
  window.setTimeout(() => {
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(() => run(), { timeout: 10000 })
    } else {
      run()
    }
  }, delayMs)
}
