import type { EditorStoreType } from '../../stores/editorStore'
import type { ConnectionStoreType } from '../../stores/connectionStore'
import type { ModelConfigStoreType } from '../../stores/modelStore'
import { DuckDBConnection } from '../../connections'
import { ModelImportService } from '../../models/helpers'
import type { DashboardStoreType } from '../../stores/dashboardStore'

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
  let connName = 'demo-connection'
  let modelName = 'demo-model'
  let importAddress = 'https://trilogy-data.github.io/trilogy-public-models/studio/demo-model.json'
  let connection = new DuckDBConnection(connName, modelName)
  connectionStore.addConnection(connection)

  //force create
  modelStore.newModelConfig(modelName, true)
  const modelImportService = new ModelImportService(editorStore, modelStore, dashboardStore)
  await modelImportService.importModel(modelName, importAddress, connName)
  // Save state
  saveEditors(Object.values(editorStore.editors))
  saveConnections(Object.values(connectionStore.connections))
  saveModels(Object.values(modelStore.models))
  saveDashboards(Object.values(dashboardStore.dashboards))
  //@ts-ignore
  return Object.values(editorStore.editors).find(
    (editor) => editor.name === 'tutorial_one_basic' && editor.connection === connName,
  ).id
}
