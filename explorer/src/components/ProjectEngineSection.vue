<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  BigQueryOauthConnection,
  DuckDBConnection,
  MotherDuckConnection,
  SQLiteConnection,
  SnowflakeJwtConnection,
} from '@lib/connections'
import type Connection from '@lib/connections/base'
import useConnectionStore from '@lib/stores/connectionStore'
import useEditorStore from '@lib/stores/editorStore'
import useProjectStore from '@lib/stores/projectStore'

type EngineKind = 'duckdb' | 'sqlite' | 'motherduck' | 'bigquery-oauth' | 'snowflake'

interface EngineOption {
  value: EngineKind
  label: string
}

const props = defineProps<{ projectId: string }>()

const projectStore = useProjectStore()
const connectionStore = useConnectionStore()
const editorStore = useEditorStore()

const ENGINES: EngineOption[] = [
  { value: 'duckdb', label: 'DuckDB' },
  { value: 'sqlite', label: 'SQLite' },
  { value: 'motherduck', label: 'MotherDuck' },
  { value: 'bigquery-oauth', label: 'BigQuery' },
  { value: 'snowflake', label: 'Snowflake' },
]

const selectedEngine = ref<EngineKind>('duckdb')
const mdToken = ref('')
const bigQueryProjectId = ref('')
const snowflakeAccount = ref('')
const snowflakeUsername = ref('')
const snowflakeWarehouse = ref('')
const snowflakeRole = ref('')
const snowflakeDatabase = ref('')
const snowflakeSchema = ref('')
const snowflakePrivateKey = ref('')
const error = ref('')
const busy = ref(false)

const project = computed(() => projectStore.projects[props.projectId] || null)
const connection = computed(() => {
  const id = project.value?.dataConnectionId
  return id ? connectionStore.connections[id] || null : null
})
const status = computed(() => connectionStore.connectionStateToStatus(connection.value))
const engineLabel = computed(
  () => ENGINES.find((engine) => engine.value === selectedEngine.value)?.label || 'Engine',
)

const needsConfig = computed(() =>
  ['motherduck', 'bigquery-oauth', 'snowflake'].includes(selectedEngine.value),
)

const canApply = computed(() => {
  if (busy.value) return false
  if (selectedEngine.value === 'motherduck') return mdToken.value.trim().length > 0
  if (selectedEngine.value === 'bigquery-oauth') return bigQueryProjectId.value.trim().length > 0
  if (selectedEngine.value === 'snowflake') {
    return (
      snowflakeAccount.value.trim().length > 0 &&
      snowflakeUsername.value.trim().length > 0 &&
      snowflakeWarehouse.value.trim().length > 0 &&
      snowflakePrivateKey.value.trim().length > 0
    )
  }
  return true
})

function projectConnectionName(projectId: string): string {
  return `project:${projectId}:engine`
}

function markExistingConnectionDeleted(conn: Connection | null) {
  if (!conn) return
  conn.delete()
  delete connectionStore.connections[conn.id]
}

function updateProjectEditors(connectionName: string) {
  const p = project.value
  if (!p) return
  for (const editorId of p.editorIds) {
    const editor = editorStore.editors[editorId]
    if (!editor || editor.deleted) continue
    editor.setConnection(connectionName)
  }
}

function createConnection(kind: EngineKind): Connection {
  const name = projectConnectionName(props.projectId)
  if (kind === 'duckdb') return new DuckDBConnection(name)
  if (kind === 'sqlite') return new SQLiteConnection(name)
  if (kind === 'motherduck') {
    return new MotherDuckConnection(name, mdToken.value.trim(), undefined, true)
  }
  if (kind === 'bigquery-oauth') {
    return new BigQueryOauthConnection(name, bigQueryProjectId.value.trim())
  }
  return new SnowflakeJwtConnection(name, {
    account: snowflakeAccount.value.trim(),
    username: snowflakeUsername.value.trim(),
    privateKey: snowflakePrivateKey.value.trim(),
    warehouse: snowflakeWarehouse.value.trim(),
    role: snowflakeRole.value.trim(),
    database: snowflakeDatabase.value.trim(),
    schema: snowflakeSchema.value.trim(),
  })
}

function syncFormFromConnection(conn: Connection | null) {
  if (!conn) {
    selectedEngine.value = 'duckdb'
    return
  }
  selectedEngine.value = conn.type as EngineKind

  if (conn instanceof MotherDuckConnection) {
    mdToken.value = conn.mdToken && conn.mdToken !== 'saved' ? conn.mdToken : mdToken.value
  } else if (conn instanceof BigQueryOauthConnection) {
    bigQueryProjectId.value = conn.projectId || ''
  } else if (conn instanceof SnowflakeJwtConnection) {
    snowflakeAccount.value = conn.config.account || ''
    snowflakeUsername.value = conn.config.username || ''
    snowflakeWarehouse.value = conn.config.warehouse || ''
    snowflakeRole.value = conn.config.role || ''
    snowflakeDatabase.value = conn.config.database || ''
    snowflakeSchema.value = conn.config.schema || ''
    snowflakePrivateKey.value =
      conn.config.privateKey && conn.config.privateKey !== 'saved'
        ? conn.config.privateKey
        : snowflakePrivateKey.value
  }
}

async function applyEngine(kind = selectedEngine.value) {
  if (!project.value || !canApply.value) return
  error.value = ''
  busy.value = true
  try {
    const previous = connection.value
    markExistingConnectionDeleted(previous)
    const next = createConnection(kind)
    next.changed = true
    connectionStore.addConnection(next)
    projectStore.setProjectDataConnection(props.projectId, next.id)
    updateProjectEditors(next.name)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

async function pickEngine(kind: EngineKind) {
  selectedEngine.value = kind
  error.value = ''
  if (kind === 'duckdb' || kind === 'sqlite') {
    await applyEngine(kind)
  }
}

async function connect() {
  const conn = connection.value
  if (!conn) return
  error.value = ''
  busy.value = true
  try {
    await connectionStore.connectConnection(conn.id)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

async function ensureProjectConnection() {
  if (!project.value) return
  const existing = connection.value
  if (existing) {
    syncFormFromConnection(existing)
    return
  }
  if (project.value.dataConnectionId) {
    return
  }
  selectedEngine.value = 'duckdb'
  await applyEngine('duckdb')
}

onMounted(ensureProjectConnection)

watch(
  () => props.projectId,
  () => {
    error.value = ''
    ensureProjectConnection()
  },
)

watch(connection, syncFormFromConnection, { immediate: true })
</script>

<template>
  <div class="engine-section">
    <div class="section-head">
      <span class="section-label">Engine</span>
      <span class="engine-status" :class="`status-${status}`">{{ status }}</span>
    </div>

    <select
      class="engine-picker"
      aria-label="Project engine"
      :value="selectedEngine"
      :disabled="busy"
      @change="pickEngine(($event.target as HTMLSelectElement).value as EngineKind)"
    >
      <option v-for="engine in ENGINES" :key="engine.value" :value="engine.value">
        {{ engine.label }}
      </option>
    </select>

    <div v-if="selectedEngine === 'motherduck'" class="engine-fields">
      <label>
        Token
        <input v-model="mdToken" type="password" autocomplete="off" placeholder="mdt_..." />
      </label>
    </div>

    <div v-else-if="selectedEngine === 'bigquery-oauth'" class="engine-fields">
      <label>
        Project ID
        <input v-model="bigQueryProjectId" type="text" autocomplete="off" />
      </label>
    </div>

    <div v-else-if="selectedEngine === 'snowflake'" class="engine-fields">
      <label>
        Account
        <input v-model="snowflakeAccount" type="text" autocomplete="off" />
      </label>
      <label>
        Username
        <input v-model="snowflakeUsername" type="text" autocomplete="off" />
      </label>
      <label>
        Warehouse
        <input v-model="snowflakeWarehouse" type="text" autocomplete="off" />
      </label>
      <label>
        Role
        <input v-model="snowflakeRole" type="text" autocomplete="off" />
      </label>
      <label>
        Database
        <input v-model="snowflakeDatabase" type="text" autocomplete="off" />
      </label>
      <label>
        Schema
        <input v-model="snowflakeSchema" type="text" autocomplete="off" />
      </label>
      <label>
        Private key
        <textarea v-model="snowflakePrivateKey" autocomplete="off" rows="3" />
      </label>
    </div>

    <div class="engine-actions">
      <button
        v-if="needsConfig"
        class="engine-action"
        type="button"
        :disabled="!canApply"
        @click="applyEngine()"
      >
        {{ busy ? 'Saving...' : `Use ${engineLabel}` }}
      </button>
      <button
        class="engine-action secondary"
        type="button"
        :disabled="busy || !connection"
        @click="connect"
      >
        Connect
      </button>
    </div>

    <p v-if="connection?.error" class="engine-error">{{ connection.error }}</p>
    <p v-if="error" class="engine-error">{{ error }}</p>
  </div>
</template>

<style scoped>
.engine-section {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.05rem;
}

.section-label {
  font-size: 0.66rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted);
  font-weight: 600;
}

.engine-status {
  font-size: 0.62rem;
  line-height: 1;
  padding: 0.18rem 0.35rem;
  border-radius: 999px;
  text-transform: uppercase;
  color: var(--muted);
  background: rgba(127, 127, 127, 0.1);
}

.status-connected {
  color: #059669;
  background: rgba(16, 185, 129, 0.14);
}

.status-running {
  color: #d97706;
  background: rgba(245, 158, 11, 0.16);
}

.status-failed {
  color: #dc2626;
  background: rgba(220, 38, 38, 0.12);
}

.engine-picker {
  width: 100%;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--fg);
  border-radius: 4px;
  padding: 0.32rem 0.42rem;
  font-size: 0.72rem;
  line-height: 1.1;
  cursor: pointer;
}

.engine-picker:hover:not(:disabled) {
  background: rgba(59, 130, 246, 0.08);
}

.engine-action {
  min-width: 0;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--fg);
  border-radius: 4px;
  padding: 0.32rem 0.42rem;
  font-size: 0.72rem;
  line-height: 1.1;
  cursor: pointer;
}

.engine-action:hover:not(:disabled) {
  background: rgba(59, 130, 246, 0.08);
}

.engine-picker:disabled,
.engine-action:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.engine-fields {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.engine-fields label {
  display: flex;
  flex-direction: column;
  gap: 0.18rem;
  color: var(--muted);
  font-size: 0.68rem;
}

.engine-fields input,
.engine-fields textarea {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg);
  color: var(--fg);
  font: inherit;
  font-size: 0.74rem;
  padding: 0.32rem 0.42rem;
  resize: vertical;
}

.engine-actions {
  display: flex;
  gap: 0.25rem;
}

.engine-action {
  flex: 1;
  color: var(--accent);
}

.engine-action.secondary {
  color: var(--muted);
}

.engine-error {
  margin: 0;
  color: #dc2626;
  font-size: 0.68rem;
  line-height: 1.35;
  white-space: pre-wrap;
}
</style>
