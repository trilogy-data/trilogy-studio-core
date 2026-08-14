import type { ScreenBridge } from '../llm/registry/types'

// Live capabilities registered by mounted screen components (Dashboard.vue,
// ReportLayout.vue, Editor.vue). Tools that need a mounted component
// (screenshots, in-view refresh, in-editor query runs) read this at call time
// via ToolRuntime.screenBridge; absence means the screen isn't open and the
// tool degrades with an actionable hint.
//
// Plain module state, not reactive: consumers are tool executors that read at
// call time, never templates.
const bridge: ScreenBridge = {}

export function registerDashboardBridge(entry: NonNullable<ScreenBridge['dashboard']>): void {
  bridge.dashboard = entry
}

/** Unregister only if the current registration matches — guards against a
 *  mount/unmount race between two dashboards clearing the newer entry. */
export function unregisterDashboardBridge(dashboardId: string): void {
  if (bridge.dashboard?.dashboardId === dashboardId) {
    delete bridge.dashboard
  }
}

export function registerEditorBridge(entry: NonNullable<ScreenBridge['editor']>): void {
  bridge.editor = entry
}

export function unregisterEditorBridge(editorId: string): void {
  if (bridge.editor?.editorId === editorId) {
    delete bridge.editor
  }
}

export function getScreenBridge(): ScreenBridge {
  return bridge
}

/** Test-only: clear all registrations. */
export function resetScreenBridgeForTests(): void {
  delete bridge.dashboard
  delete bridge.editor
}
