import type { EditorStoreType } from '../../stores/editorStore'
import type { ConnectionStoreType } from '../../stores/connectionStore'
import type { ModelConfigStoreType } from '../../stores/modelStore'
import { DuckDBConnection } from '../../connections'
import { Editor, EditorTag } from '../../editors'
import { ModelConfig, ModelSource } from '../../models'
import {
  CUSTOMER_CONTENT,
  ORDER_CONTENT,
  PART_CONTENT,
  NATION_CONTENT,
  SUPPLIER_CONTENT,
  REGION_CONTENT,
  LINE_ITEM_CONTENT,
} from './queries'
import { QUERY_LINE_ITEM, QUERY_JOIN } from './example_queries'

export default async function setupDemo(
  editorStore: EditorStoreType,
  connectionStore: ConnectionStoreType,
  modelStore: ModelConfigStoreType,
  saveEditors: Function,
  saveConnections: Function,
  saveModels: Function,
) {
  let connName = 'demo-connection'
  let modelName = 'demo-model'
  let connection = new DuckDBConnection(connName, modelName)
  connectionStore.addConnection(connection)
  await connection.connect()

  // Define and add editors
  const editors = [
    new Editor({
      name: 'customer',
      type: 'trilogy',
      connection: connName,
      storage: 'local',
      contents: CUSTOMER_CONTENT,
      tags: [EditorTag.SOURCE],
    }),
    new Editor({
      name: 'order',
      type: 'trilogy',
      connection: connName,
      storage: 'local',
      contents: ORDER_CONTENT,
      tags: [EditorTag.SOURCE],
    }),
    new Editor({
      name: 'part',
      type: 'trilogy',
      connection: connName,
      storage: 'local',
      contents: PART_CONTENT,
      tags: [EditorTag.SOURCE],
    }),
    new Editor({
      name: 'nation',
      type: 'trilogy',
      connection: connName,
      storage: 'local',
      contents: NATION_CONTENT,
      tags: [EditorTag.SOURCE],
    }),
    new Editor({
      name: 'supplier',
      type: 'trilogy',
      connection: connName,
      storage: 'local',
      contents: SUPPLIER_CONTENT,
      tags: [EditorTag.SOURCE],
    }),
    new Editor({
      name: 'region',
      type: 'trilogy',
      connection: connName,
      storage: 'local',
      contents: REGION_CONTENT,
      tags: [EditorTag.SOURCE],
    }),
    new Editor({
      name: 'lineitem',
      type: 'trilogy',
      connection: connName,
      storage: 'local',
      contents: LINE_ITEM_CONTENT,
      tags: [EditorTag.SOURCE],
    }),
    new Editor({
      name: 'example_query_1',
      type: 'trilogy',
      connection: connName,
      storage: 'local',
      contents: QUERY_LINE_ITEM,
    }),
    new Editor({
      name: 'example_query_2',
      type: 'trilogy',
      connection: connName,
      storage: 'local',
      contents: QUERY_JOIN,
    }),
  ]

  editors.forEach((editor) => editorStore.addEditor(editor))

  // Create and add model configuration
  let mc = new ModelConfig({
    name: modelName,
    sources: editors
      .slice(0, 7)
      .map((e) => (ModelSource.fromJSON({ alias: e.name, editor: e.name, concepts: [], datasources: [] }))),
    storage: 'local',
  })

  modelStore.addModelConfig(mc)

  // Save state
  saveEditors(Object.values(editorStore.editors))
  saveConnections(Object.values(connectionStore.connections))
  saveModels(Object.values(modelStore.models))
}
