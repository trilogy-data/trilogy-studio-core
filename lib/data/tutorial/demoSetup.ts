import type { EditorStoreType } from '../../stores/editorStore'
import type { ConnectionStoreType } from '../../stores/connectionStore'
import type { ModelConfigStoreType } from '../../stores/modelStore'
import { DuckDBConnection } from '../../connections'
import { ModelImportService } from '../../models/helpers'
import type { DashboardStoreType } from '../../stores/dashboardStore'

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

export default async function setupDemo(
  editorStore: EditorStoreType,
  connectionStore: ConnectionStoreType,
  modelStore: ModelConfigStoreType,
  dashboardStore: DashboardStoreType,
  saveEditors: Function,
  saveConnections: Function,
  saveModels: Function,
  saveDashboards: Function,
) {
  // Idempotent: a repeat demo launch (welcome button or #demo=true deep link)
  // reuses the existing setup rather than clobbering any user edits to it.
  const existingEditorId = findDemoEditorId(editorStore)
  if (existingEditorId && connectionStore.connections[DEMO_CONNECTION_NAME]) {
    connectionStore
      .connectConnection(DEMO_CONNECTION_NAME)
      .catch((error) => console.error('Demo connection failed to connect:', error))
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
    .connectConnection(DEMO_CONNECTION_NAME)
    .catch((error) => console.error('Demo connection failed to connect:', error))
  const editorId = findDemoEditorId(editorStore)
  if (!editorId) {
    throw new Error(`Demo import did not produce the "${DEMO_LANDING_EDITOR}" editor`)
  }
  return editorId
}
