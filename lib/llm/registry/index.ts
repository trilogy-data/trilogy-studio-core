import { ToolRegistry } from './toolRegistry'
import { buildDataPack, buildArtifactsPack, buildBasePack } from './packs/chatPacks'
import { buildNavigationPack } from './packs/navigationPack'
import { buildEditorPack } from './packs/editorPack'
import { buildDashboardPack } from './packs/dashboardPack'
import { buildJobsPack } from './packs/jobsPack'
import { buildDocsPack } from './packs/docsPack'
import { buildContextPack } from './packs/contextPack'

export { ToolRegistry } from './toolRegistry'
export type { ToolsetContextId, RegistryExecutor } from './toolRegistry'
export type {
  RegisteredTool,
  ToolPackId,
  ToolRuntime,
  ToolSession,
  ToolContext,
  ScreenBridge,
  ToolAvailability,
} from './types'
export { renderToolListMarkdown } from './renderToolList'

/** Build a registry with the default pack roster. Pack registration order is
 *  the toolset order — fixed here so toolsets are deterministic (a prompt-cache
 *  requirement, see ToolRegistry). Embedders can compose their own registry
 *  from the pack factories instead. */
export function buildDefaultRegistry(): ToolRegistry {
  const registry = new ToolRegistry()
  registry.registerAll(buildDataPack())
  registry.registerAll(buildArtifactsPack())
  registry.registerAll(buildNavigationPack())
  registry.registerAll(buildEditorPack())
  registry.registerAll(buildDashboardPack())
  registry.registerAll(buildJobsPack())
  registry.registerAll(buildDocsPack())
  registry.registerAll(buildContextPack())
  // base last so flow-control tools close every toolset.
  registry.registerAll(buildBasePack())
  return registry
}

// Shared instance for app surfaces (chatStore, global panel). Lazy so simply
// importing this module doesn't pull every pack's dependency graph, and a
// single instance so memoized toolset arrays stay identity-stable across
// turns — swapping instances mid-conversation would silently bust the
// Anthropic prompt cache.
let sharedRegistry: ToolRegistry | null = null

export function getSharedRegistry(): ToolRegistry {
  if (!sharedRegistry) {
    sharedRegistry = buildDefaultRegistry()
  }
  return sharedRegistry
}

/** Test-only: drop the shared instance. */
export function resetSharedRegistryForTests(): void {
  sharedRegistry = null
}
