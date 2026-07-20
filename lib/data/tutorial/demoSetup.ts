import type { EditorStoreType } from '../../stores/editorStore'
import type { ConnectionStoreType } from '../../stores/connectionStore'
import type { ModelConfigStoreType } from '../../stores/modelStore'
import { DuckDBConnection } from '../../connections'
import { ModelImportService } from '../../models/helpers'
import type { DashboardStoreType } from '../../stores/dashboardStore'
import type QueryExecutionService from '../../stores/queryExecutionService'

export const DEMO_CONNECTION_NAME = 'demo-model-connection'
export const DEMO_MODEL_NAME = 'demo-model'
const DEMO_IMPORT_ADDRESS =
  'https://trilogy-data.github.io/trilogy-public-models/studio/demo-model.json'
const DEMO_LANDING_EDITOR = 'tutorial_one_basic'

function findDemoEditorId(editorStore: EditorStoreType): string | null {
  const editor = Object.values(editorStore.editors).find(
    (editor) => editor.name === DEMO_LANDING_EDITOR && editor.connection === DEMO_CONNECTION_NAME,
  )
  return editor ? editor.id : null
}

// Validate the landing editor against the resolver. Parsing/validating the
// open file is what spins up (warms) the backend query-generation service, so
// the first real query the user runs doesn't pay cold-start latency. Best
// effort and fire-and-forget: warming failures must never block the demo.
function warmQueryBackend(
  editorStore: EditorStoreType,
  connectionId: string,
  editorId: string,
  queryExecutionService?: QueryExecutionService,
): void {
  if (!queryExecutionService) return
  const editor = editorStore.editors[editorId]
  if (!editor) return
  queryExecutionService
    .validateQuery(
      connectionId,
      {
        text: editor.contents,
        editorType: editor.type,
        imports: [],
        currentFilename: editor.name,
      },
      false,
    )
    .catch((error) => console.error('Demo query backend warm-up failed:', error))
}

export default async function setupDemo(
  editorStore: EditorStoreType,
  connectionStore: ConnectionStoreType,
  modelStore: ModelConfigStoreType,
  dashboardStore: DashboardStoreType,
  saveEditors: Function,
  saveConnections: Function,
  saveModels: Function,
  saveDashboards: Function,
  queryExecutionService?: QueryExecutionService,
) {
  // Idempotent: a repeat demo launch (welcome button or #demo=true deep link)
  // reuses the existing setup rather than clobbering any user edits to it.
  // The store is keyed by connection.id (e.g. "local:demo-model-connection"),
  // not the display name, so resolve by name and connect by id.
  const existingEditorId = findDemoEditorId(editorStore)
  const existingConnection = connectionStore.connectionByName(DEMO_CONNECTION_NAME)
  if (existingEditorId && existingConnection) {
    connectionStore
      .connectConnection(existingConnection.id)
      .catch((error) => console.error('Demo connection failed to connect:', error))
    // Warm the backend even on a repeat launch: a fresh page load rehydrates
    // the demo from storage but leaves the query service cold.
    warmQueryBackend(editorStore, existingConnection.id, existingEditorId, queryExecutionService)
    return existingEditorId
  }

  let connection = new DuckDBConnection(DEMO_CONNECTION_NAME, DEMO_MODEL_NAME)
  connectionStore.addConnection(connection)

  //force create
  modelStore.newModelConfig(DEMO_MODEL_NAME, true)
  const modelImportService = new ModelImportService(editorStore, modelStore, dashboardStore)
  await modelImportService.importModel(DEMO_MODEL_NAME, DEMO_IMPORT_ADDRESS, DEMO_CONNECTION_NAME)
  // Save state
  await saveEditors(Object.values(editorStore.editors))
  await saveConnections(Object.values(connectionStore.connections))
  await saveModels(Object.values(modelStore.models))
  await saveDashboards(Object.values(dashboardStore.dashboards))
  // Connect in the background so the first query doesn't pay connection latency
  connectionStore
    .connectConnection(connection.id)
    .catch((error) => console.error('Demo connection failed to connect:', error))
  const editorId = findDemoEditorId(editorStore)
  if (!editorId) {
    throw new Error(`Demo import did not produce the "${DEMO_LANDING_EDITOR}" editor`)
  }
  // Parse/validate the landing editor to warm the query-generation backend.
  warmQueryBackend(editorStore, connection.id, editorId, queryExecutionService)
  return editorId
}
