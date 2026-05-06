import { onMounted, watch } from 'vue'
import LocalStorage from '@lib/data/localStorage'
import {
  TrilogyResolver,
  QueryExecutionService,
  ConnectionStoreExecutionConnectionProvider,
} from '@lib/stores'
import useUserSettingsStore from '@lib/stores/userSettingsStore'
import useConnectionStore from '@lib/stores/connectionStore'
import useProjectStore from '@lib/stores/projectStore'
import useEditorStore from '@lib/stores/editorStore'
import { registerRemoteWorkerHost } from '@lib/connections'
import { ModelSource } from '@lib/models'
import type { ContentInput } from '@lib/stores/resolver'
import { tauriRemoteWorkerHost } from '../storage/tauriRemoteWorkerHost'
import { isTauri } from '../storage/tauriKvBackend'

const DEFAULT_LOCAL_DUCKDB_NAME = 'local-duckdb'

// Editor types that the trilogy server can ingest as importable sources.
// Markdown / CSV / Python files are skipped because they aren't valid
// import targets — the server's parser would reject them and the cache key
// would churn for nothing.
const IMPORTABLE_EDITOR_TYPES = new Set<string>(['preql', 'trilogy', 'sql'])

export type { QueryExecutionService } from '@lib/stores'

/**
 * Bootstraps the runtime context that powers tool execution AND lib's
 * Editor.vue. Produces real instances synchronously so they can be
 * `provide()`d at App.vue setup time. Async work (loading persisted
 * settings + connections) runs in onMounted.
 */
export interface ExecutionContext {
  queryExecutionService: QueryExecutionService
  trilogyResolver: TrilogyResolver
}

export function useExecutionContext(prefix = 'explorer:'): ExecutionContext {
  const settingsStore = useUserSettingsStore()
  const connectionStore = useConnectionStore()
  const storage = new LocalStorage(prefix)

  // Resolver reads its URL out of settingsStore at call time — the empty
  // string before onMounted load is fine because no one calls .validate()
  // until the user types something.
  const trilogyResolver = new TrilogyResolver(settingsStore)

  // Resolve a connection id to the absolute path of the project that owns
  // it. The trilogy server uses this as Environment.working_path so file
  // addresses (`file 'ratings.csv'`) resolve against the user's actual
  // project directory and the rendered SQL embeds the real OS path that
  // the local DuckDB worker can open. When no project owns the connection
  // we return null and let the server fall back to its default working
  // path (the explorer's seeded local-duckdb starts out unowned, which
  // means file-backed datasources won't resolve until a project picks it
  // up — same contract as the studio path).
  const projectStore = useProjectStore()
  const editorStore = useEditorStore()

  // Find the project that owns this connection. Walks all non-deleted
  // projects looking for a `dataConnectionId` match. We index lazily here
  // because connection ↔ project is rarely contended and the project list
  // is small in practice; if this becomes hot we'd cache the inverse map
  // and invalidate on project add / delete / dataConnectionId change.
  const findOwningProject = (connectionId: string) => {
    for (const project of Object.values(projectStore.projects)) {
      if (project.deleted) continue
      if (project.dataConnectionId === connectionId) return project
    }
    return null
  }

  // Resolve a connection id to the absolute path of the project that owns
  // it. The trilogy server uses this as Environment.working_path so file
  // addresses (`file 'ratings.csv'`) resolve against the user's actual
  // project directory and the rendered SQL embeds the real OS path that
  // the local DuckDB worker can open. No owning project / no directory →
  // null and the server falls back to its own CWD.
  const workingPathResolver = (connectionId: string): string | null => {
    const project = findOwningProject(connectionId)
    return project && project.directoryPath ? project.directoryPath : null
  }

  // Bundle every importable editor in the owning project as a source so
  // `import movie_sources;` resolves through DictImportResolver instead of
  // the server's filesystem. Studio ties sources to a connection's attached
  // model (curated); explorer treats *all* project editors as importable.
  // The alias matches what the trilogy parser will look up — strip the
  // file extension so `import movie_sources;` finds `movie_sources.preql`.
  const sourcesResolver = (connectionId: string): ContentInput[] => {
    const project = findOwningProject(connectionId)
    if (!project) return []
    const out: ContentInput[] = []
    for (const editorId of project.editorIds) {
      const editor = editorStore.editors[editorId]
      if (!editor || editor.deleted) continue
      if (!IMPORTABLE_EDITOR_TYPES.has(editor.type)) continue
      out.push({
        alias: ModelSource.normalizeAlias(editor.name),
        contents: editor.contents ?? '',
      })
    }
    return out
  }

  // Advertise the project's data files (CSVs today; parquet/etc. when we add
  // those editor types) to the trilogy resolver as `data_files`. This is a
  // resolver-side hint only — it has nothing to do with the connection's
  // engine-side file registration. The Tauri Rust DuckDB worker reads paths
  // straight off disk, anchored at `working_path`; it doesn't need anything
  // registered. But the (typically remote) resolver does, otherwise its
  // `Path.exists` check on `file '...'` addresses drops the datasource at
  // parse time and the concept ends up unbacked.
  const filesResolver = (connectionId: string): string[] => {
    const project = findOwningProject(connectionId)
    if (!project) return []
    const out: string[] = []
    for (const editorId of project.editorIds) {
      const editor = editorStore.editors[editorId]
      if (!editor || editor.deleted) continue
      if (editor.type === 'csv') out.push(editor.name)
    }
    return out
  }

  const provider = new ConnectionStoreExecutionConnectionProvider(
    connectionStore,
    workingPathResolver,
    sourcesResolver,
    filesResolver,
  )
  const queryExecutionService = new QueryExecutionService(trilogyResolver, provider, false)

  // Inside the Tauri shell, the lib's RemoteWorkerConnection routes through
  // the query-bridge sidecar in src-tauri. Register synchronously so any
  // already-persisted RemoteWorkerConnection that gets rehydrated below
  // finds the host on its first connect() call.
  if (isTauri()) {
    registerRemoteWorkerHost(tauriRemoteWorkerHost)
  }

  onMounted(async () => {
    settingsStore.loadSettings()
    if (!settingsStore.settings.trilogyResolver) {
      settingsStore.settings.trilogyResolver = settingsStore.defaults.trilogyResolver
    }

    const loaded = await storage.loadConnections()
    for (const conn of Object.values(loaded)) {
      if (!connectionStore.connections[conn.id]) {
        connectionStore.addConnection(conn)
      }
    }

    // First-run UX: when running in Tauri, make sure there's at least one
    // working data connection so the user can immediately try a query. We
    // seed an in-memory native DuckDB session named `local-duckdb`. The
    // user can rename / delete it freely; we only seed when no connection
    // with that exact name exists yet.
    // First-run seed: only when the user has *no* connections at all. Once
    // any connection exists (the seed itself, or one the user added), this
    // path is a no-op forever — so deleting the seed makes it stay gone.
    if (isTauri() && Object.keys(connectionStore.connections).length === 0) {
      try {
        const seeded = connectionStore.newConnection(
          DEFAULT_LOCAL_DUCKDB_NAME,
          'remote-worker-duckdb',
          {},
        )
        // Mark dirty so the persistence watch picks it up on the next tick;
        // otherwise the seed evaporates on reload and we'd seed again.
        seeded.changed = true
      } catch (err) {
        console.warn('Failed to seed default local-duckdb connection', err)
      }
    }
  })

  let flushTimer: ReturnType<typeof setTimeout> | null = null
  watch(
    () => connectionStore.connections,
    () => {
      if (flushTimer) clearTimeout(flushTimer)
      flushTimer = setTimeout(() => {
        const dirty = Object.values(connectionStore.connections).filter(
          (conn) => conn.changed || conn.deleted,
        )
        if (dirty.length === 0) return
        storage
          .saveConnections(dirty)
          .then(() => connectionStore.purgeDeletedConnections())
          .catch((e) => console.error('saveConnections failed', e))
      }, 250)
    },
    { deep: true },
  )

  // Push the owning project's directoryPath through to the connection so
  // its remote worker can resolve `read_csv('foo.csv')` (basename, the
  // shape the trilogy resolver renders for explorer queries) against the
  // user's actual project directory. The connection caches the value and
  // re-applies it on reconnect, so we don't need to retry on connect-state
  // changes here.
  //
  // We include `connectionType` and `connectionPresent` in the watched
  // value so a connection-swap (e.g. ProjectEngineSection.applyEngine
  // replacing a wasm DuckDBConnection with a RemoteWorkerConnection at the
  // same id) actually re-fires the watcher. Without this, deep equality
  // sees `{connectionId, directory}` unchanged and skips the push, so the
  // newly-installed RemoteWorker never gets told about the project's
  // directoryPath.
  watch(
    () => {
      const out: Array<{
        connectionId: string
        directory: string
        connectionType: string | null
        connectionPresent: boolean
      }> = []
      for (const project of Object.values(projectStore.projects)) {
        if (project.deleted || !project.dataConnectionId || !project.directoryPath) continue
        const conn = connectionStore.connections[project.dataConnectionId] as
          | { type?: string }
          | undefined
        out.push({
          connectionId: project.dataConnectionId,
          directory: project.directoryPath,
          connectionType: conn?.type ?? null,
          connectionPresent: Boolean(conn),
        })
      }
      return out
    },
    (entries) => {
      console.log(`[setWorkingDirectory:watcher] entries=`, entries)
      for (const { connectionId, directory } of entries) {
        const conn = connectionStore.connections[connectionId] as
          | { setWorkingDirectory?: (directory: string) => Promise<void> }
          | undefined
        if (!conn) {
          console.log(`[setWorkingDirectory:watcher] no connection for id=${connectionId}`)
          continue
        }
        if (typeof conn.setWorkingDirectory !== 'function') {
          console.log(
            `[setWorkingDirectory:watcher] connection ${connectionId} has no setWorkingDirectory method — skipping`,
          )
          continue
        }
        conn.setWorkingDirectory(directory).catch((err) => {
          console.warn(`setWorkingDirectory failed for ${connectionId}: ${err}`)
        })
      }
    },
    { deep: true, immediate: true },
  )

  return {
    queryExecutionService,
    trilogyResolver,
  }
}
