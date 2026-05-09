import useEditorStore from '@lib/stores/editorStore'
import useConnectionStore from '@lib/stores/connectionStore'
import useProjectStore from '@lib/stores/projectStore'
import { getEditorTypeForPath, type EditorType } from '@lib/editors/fileTypes'
import { isTauri } from '../storage/tauriKvBackend'
import { pickDirectory, readDir, readTextFile } from '../storage/tauriFs'

export interface IngestResult {
  attached: number
  skipped: { name: string; reason: string }[]
  errors: { name: string; error: string }[]
}

interface ImportableConnection {
  id: string
  connected: boolean
  importFile(file: File, onProgress?: (message: string) => void): Promise<unknown>
}

/**
 * File ingestion pipeline shared by drag-drop, file-picker, and the Tauri
 * directory-import flow. Creates one editor per supported file and — for
 * CSVs — also registers the content with the project's DuckDB connection
 * so it's queryable via the analyst tool loop.
 */
export function useFileIngestion() {
  const editorStore = useEditorStore()
  const connectionStore = useConnectionStore()
  const projectStore = useProjectStore()

  /** Resolve the project's data connection. */
  function projectConnection(projectId: string) {
    const project = projectStore.projects[projectId]
    if (!project) return null
    return project.dataConnectionId
      ? connectionStore.connections[project.dataConnectionId] || null
      : null
  }

  function isImportableConnection(connection: unknown): connection is ImportableConnection {
    return Boolean(
      connection && typeof (connection as ImportableConnection).importFile === 'function',
    )
  }

  /**
   * Attach a single in-memory file to the project. Creates an Editor,
   * registers it with the project, and (for CSVs) imports it into DuckDB.
   *
   * Throws on unrecoverable errors; returns silently on unsupported types.
   */
  async function attachFile(opts: {
    projectId: string
    name: string
    type: EditorType
    contents: string
  }): Promise<void> {
    const connection = projectConnection(opts.projectId)
    const connectionName = connection?.name ?? ''

    // Avoid duplicates: if an editor with this name already lives in the
    // project, skip rather than create a sibling.
    const existing = projectStore.projects[opts.projectId]?.editorIds
      .map((id) => editorStore.editors[id])
      .find((e) => e && e.name === opts.name)
    if (existing) return

    const editor = editorStore.newEditor(opts.name, opts.type, connectionName, opts.contents)
    projectStore.addEditorToProject(opts.projectId, editor.id)

    if (opts.type === 'csv' && isImportableConnection(connection)) {
      // Lazy-init the wasm DB if it hasn't been touched yet, then register
      // the CSV. Failures bubble up — caller decides whether to surface.
      if (!connection.connected) {
        await connectionStore.connectConnection(connection.id)
      }
      const file = new File([opts.contents], opts.name, { type: 'text/csv' })
      await connection.importFile(file)
    }
  }

  /**
   * Pick a directory (Tauri only), scan it, and attach every supported
   * file. Skips dotfiles, subdirectories, and unsupported extensions.
   * Persists the chosen path on the project for display + future re-sync.
   */
  async function importDirectory(opts: { projectId: string }): Promise<IngestResult | null> {
    if (!isTauri()) return null

    const dir = await pickDirectory()
    if (!dir) return null

    projectStore.setProjectDirectory(opts.projectId, dir)

    const entries = await readDir(dir)
    const result: IngestResult = { attached: 0, skipped: [], errors: [] }

    for (const entry of entries) {
      if (entry.is_dir) {
        result.skipped.push({ name: entry.name, reason: 'subdirectory' })
        continue
      }
      const type = getEditorTypeForPath(entry.name)
      if (!type) {
        result.skipped.push({ name: entry.name, reason: 'unsupported type' })
        continue
      }
      try {
        const contents = await readTextFile(entry.path)
        await attachFile({
          projectId: opts.projectId,
          name: entry.name,
          type,
          contents,
        })
        result.attached += 1
      } catch (err) {
        result.errors.push({
          name: entry.name,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    return result
  }

  return { attachFile, importDirectory }
}
