import { reactive } from 'vue'
import Editor, { EditorTag } from './editor'
import type { EditorType } from './editor'
import type { EditorStoreType } from '../stores/editorStore'

export interface RemoteEditorIntent {
  id: string
  name: string
  type: EditorType
  connection: string
  contents: string
  tags: EditorTag[]
  remoteStoreId: string
  remotePath: string
}

// Reconcile a desired remote-editor state against the editor store.
// If an editor matching (storage='remote', remoteStoreId, remotePath) is
// already present, reuse its id (so outside references — dashboards, tabs —
// stay stable) and overwrite its fields with the intent. Any additional
// duplicates matching the same key are pruned: they're leftovers from older
// sessions whose id schemes drifted. If no match is found, a fresh Editor is
// created with the intent's id.
export const reconcileRemoteEditor = (
  editorStore: EditorStoreType,
  intent: RemoteEditorIntent,
): Editor => {
  const matches = Object.values(editorStore.editors).filter(
    (existing) =>
      existing.storage === 'remote' &&
      existing.remoteStoreId === intent.remoteStoreId &&
      existing.remotePath === intent.remotePath,
  )

  if (matches.length === 0) {
    const editor = reactive(
      new Editor({
        id: intent.id,
        name: intent.name,
        type: intent.type,
        connection: intent.connection,
        storage: 'remote',
        contents: intent.contents,
        tags: intent.tags,
        remoteStoreId: intent.remoteStoreId,
        remotePath: intent.remotePath,
        remotePersisted: true,
      }),
    )
    editor.changed = false
    editorStore.editors[editor.id] = editor
    return editor
  }

  const survivor = matches.find((m) => m.id === intent.id) ?? matches[0]
  matches
    .filter((m) => m.id !== survivor.id)
    .forEach((stale) => {
      delete editorStore.editors[stale.id]
    })

  survivor.contents = intent.contents
  survivor.type = intent.type
  survivor.connection = intent.connection
  survivor.tags = intent.tags
  survivor.name = intent.name
  survivor.remotePersisted = true
  survivor.remoteOriginalPath = null
  survivor.changed = false
  return survivor
}
