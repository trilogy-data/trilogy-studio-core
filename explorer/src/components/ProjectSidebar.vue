<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useProjectStore } from '@lib/stores/projectStore'
import useEditorStore from '@lib/stores/editorStore'
import useChatStore from '@lib/stores/chatStore'
import { useDashboardStore } from '@lib/stores/dashboardStore'
import { getEditorTypeForPath } from '@lib/editors/fileTypes'
import { useFileIngestion } from '../composables/useFileIngestion'
import { isTauri } from '../storage/tauriKvBackend'
import ProjectEngineSection from './ProjectEngineSection.vue'

type SidebarSection = 'reports' | 'files' | 'subchats'

const COLLAPSE_KEY = 'explorer:sidebarCollapsed'

function loadCollapsed(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

const collapsedMap = ref<Record<string, boolean>>(loadCollapsed())
watch(
  collapsedMap,
  (v) => {
    try {
      localStorage.setItem(COLLAPSE_KEY, JSON.stringify(v))
    } catch {
      // localStorage may be unavailable (private mode, quota); collapse state
      // is non-essential — silently drop the persistence attempt.
    }
  },
  { deep: true },
)

function collapseKey(projectId: string, section: SidebarSection): string {
  return `${projectId}:${section}`
}
function isCollapsed(projectId: string, section: SidebarSection): boolean {
  return !!collapsedMap.value[collapseKey(projectId, section)]
}
function toggleCollapsed(projectId: string, section: SidebarSection): void {
  const k = collapseKey(projectId, section)
  if (collapsedMap.value[k]) delete collapsedMap.value[k]
  else collapsedMap.value[k] = true
}
function expandSection(projectId: string, section: SidebarSection): void {
  const k = collapseKey(projectId, section)
  if (collapsedMap.value[k]) delete collapsedMap.value[k]
}

/**
 * Workspace navigator. Each project expands inline to show its files and
 * subchats — no separate file/subchat panels elsewhere in the app.
 *
 * The overseer chat is global (not per project), so it does not appear here.
 *
 * Emits 'select-subchat' when a subchat row is clicked so the host can open
 * a read-only viewer.
 */
const props = defineProps<{
  activeDashboardId?: string
}>()

const emit = defineEmits<{
  'select-subchat': [chatId: string]
  'select-file': [editorId: string]
  'select-dashboard': [dashboardId: string]
}>()

const activeDashboardId = computed(() => props.activeDashboardId || '')

const store = useProjectStore()
const editorStore = useEditorStore()
const chatStore = useChatStore()
const dashboardStore = useDashboardStore()
const { attachFile, importDirectory } = useFileIngestion()

const renameTargetId = ref<string | null>(null)
const renameDraft = ref('')
const busyProjectId = ref<string | null>(null)
const ingestionStatus = ref<{ projectId: string; text: string } | null>(null)
const ingestionError = ref<{ projectId: string; text: string } | null>(null)
// Inline new-file affordance: when set, the project's file list renders an
// input row instead of a button. Type is derived from the extension the user
// types; nameless or unrecognized extensions default to .preql.
const creatingInProjectId = ref<string | null>(null)
const newFileDraft = ref('')

const projects = computed(() => store.projectList)

function projectFiles(projectId: string) {
  const project = store.projects[projectId]
  if (!project) return []
  return project.editorIds.map((id) => editorStore.editors[id]).filter((e) => e && !e.deleted)
}

function projectSubchats(projectId: string) {
  const project = store.projects[projectId]
  if (!project) return []
  return project.subchatIds.map((id) => chatStore.chats[id]).filter((c) => c && !c.deleted)
}

function projectReports(projectId: string) {
  const project = store.projects[projectId]
  if (!project) return []
  return project.dashboardIds
    .map((id) => dashboardStore.dashboards[id])
    .filter((d) => d && !d.deleted)
}

const creatingReportInProjectId = ref<string | null>(null)
const newReportDraft = ref('')
const reportError = ref<{ projectId: string; text: string } | null>(null)

function startNewReport(projectId: string) {
  creatingReportInProjectId.value = projectId
  newReportDraft.value = ''
  reportError.value = null
  expandSection(projectId, 'reports')
}

function cancelNewReport() {
  creatingReportInProjectId.value = null
  newReportDraft.value = ''
}

function commitNewReport(projectId: string) {
  const name = newReportDraft.value.trim()
  if (!name) {
    cancelNewReport()
    return
  }
  const project = store.projects[projectId]
  if (!project) {
    cancelNewReport()
    return
  }
  // Dashboard ids are derived from name, so collisions across the whole store
  // (not just this project) need to be caught.
  if (dashboardStore.dashboards[name]) {
    reportError.value = { projectId, text: `A dashboard named "${name}" already exists.` }
    return
  }
  try {
    const dashboard = dashboardStore.newReport(name, project.dataConnectionId || '')
    store.addDashboardToProject(projectId, dashboard.id)
    cancelNewReport()
    emit('select-dashboard', dashboard.id)
  } catch (e) {
    reportError.value = {
      projectId,
      text: e instanceof Error ? e.message : String(e),
    }
  }
}

function removeReport(projectId: string, dashboardId: string) {
  const dashboard = dashboardStore.dashboards[dashboardId]
  if (!dashboard) {
    store.removeDashboardFromProject(projectId, dashboardId)
    return
  }
  if (!confirm(`Delete report "${dashboard.name}"?`)) return
  dashboard.delete()
  store.removeDashboardFromProject(projectId, dashboardId)
}

function handleNew() {
  store.newProject()
}

function handleSelect(projectId: string) {
  if (renameTargetId.value === projectId) return
  store.setActiveProject(projectId)
}

function handleDelete(projectId: string) {
  store.removeProject(projectId)
}

function startRename(projectId: string, currentName: string) {
  renameTargetId.value = projectId
  renameDraft.value = currentName
}

function commitRename() {
  if (renameTargetId.value && renameDraft.value.trim()) {
    store.renameProject(renameTargetId.value, renameDraft.value.trim())
  }
  renameTargetId.value = null
  renameDraft.value = ''
}

function cancelRename() {
  renameTargetId.value = null
  renameDraft.value = ''
}

// ---------- File ingestion (per project) ----------

function fileInputId(projectId: string): string {
  return `file-input-${projectId}`
}

function pickFiles(projectId: string) {
  expandSection(projectId, 'files')
  const el = document.getElementById(fileInputId(projectId)) as HTMLInputElement | null
  el?.click()
}

async function onFilesPicked(projectId: string, files: FileList | null) {
  if (!files || files.length === 0) return
  busyProjectId.value = projectId
  ingestionError.value = null
  ingestionStatus.value = null
  let attached = 0
  const rejected: string[] = []
  for (const file of Array.from(files)) {
    const type = getEditorTypeForPath(file.name)
    if (!type) {
      rejected.push(file.name)
      continue
    }
    try {
      const contents = await file.text()
      await attachFile({
        projectId,
        name: file.name,
        type,
        contents,
      })
      attached += 1
    } catch (e) {
      ingestionError.value = {
        projectId,
        text: `${file.name}: ${e instanceof Error ? e.message : String(e)}`,
      }
    }
  }
  if (attached > 0 || rejected.length > 0) {
    const parts: string[] = []
    if (attached > 0) parts.push(`+${attached}`)
    if (rejected.length > 0) parts.push(`skipped ${rejected.length}`)
    ingestionStatus.value = { projectId, text: parts.join(', ') }
  }
  busyProjectId.value = null
}

async function openFolder(projectId: string) {
  expandSection(projectId, 'files')
  busyProjectId.value = projectId
  ingestionError.value = null
  ingestionStatus.value = null
  try {
    const result = await importDirectory({ projectId })
    if (result) {
      const parts: string[] = [`+${result.attached}`]
      if (result.skipped.length > 0) parts.push(`skipped ${result.skipped.length}`)
      if (result.errors.length > 0) parts.push(`failed ${result.errors.length}`)
      ingestionStatus.value = { projectId, text: parts.join(', ') }
      if (result.errors.length > 0) {
        ingestionError.value = {
          projectId,
          text: result.errors.map((e) => `${e.name}: ${e.error}`).join('\n'),
        }
      }
    }
  } catch (e) {
    ingestionError.value = {
      projectId,
      text: e instanceof Error ? e.message : String(e),
    }
  } finally {
    busyProjectId.value = null
  }
}

function startNewFile(projectId: string) {
  creatingInProjectId.value = projectId
  newFileDraft.value = ''
  ingestionError.value = null
  expandSection(projectId, 'files')
}

function cancelNewFile() {
  creatingInProjectId.value = null
  newFileDraft.value = ''
}

async function commitNewFile(projectId: string) {
  const raw = newFileDraft.value.trim()
  if (!raw) {
    cancelNewFile()
    return
  }
  // Derive type from extension. If unrecognized / missing, default to .preql.
  const detected = getEditorTypeForPath(raw)
  const finalName = detected ? raw : `${raw}.preql`
  const finalType = detected ?? 'preql'
  // CSVs come in via the file picker — they need contents and DuckDB
  // registration. Block creating an empty .csv editor here.
  if (finalType === 'csv') {
    ingestionError.value = {
      projectId,
      text: 'CSV files attach via the + button, not as empty placeholders.',
    }
    return
  }
  const project = store.projects[projectId]
  if (!project) {
    cancelNewFile()
    return
  }
  const collision = project.editorIds
    .map((id) => editorStore.editors[id])
    .some((e) => e && !e.deleted && e.name === finalName)
  if (collision) {
    ingestionError.value = { projectId, text: `"${finalName}" already exists.` }
    return
  }
  try {
    await attachFile({ projectId, name: finalName, type: finalType, contents: '' })
    cancelNewFile()
  } catch (e) {
    ingestionError.value = {
      projectId,
      text: e instanceof Error ? e.message : String(e),
    }
  }
}

function detachEditor(projectId: string, editorId: string) {
  store.removeEditorFromProject(projectId, editorId)
  const editor = editorStore.editors[editorId]
  if (editor) {
    editor.deleted = true
    editor.changed = true
  }
}

function statusOf(chatId: string): 'running' | 'idle' {
  return chatStore.isChatExecuting(chatId) ? 'running' : 'idle'
}

function clearSubchat(projectId: string, chatId: string) {
  // Mirror the overseer's delete_subchat guard: live loops own resources and
  // pending injections, so we wait for them to finish (user can Stop first).
  if (chatStore.isChatExecuting(chatId)) return
  chatStore.removeChat(chatId)
  store.removeSubchatFromProject(projectId, chatId)
}

const tauri = isTauri()
</script>

<template>
  <aside class="sidebar">
    <header class="sidebar-header">
      <span class="sidebar-title">Projects</span>
      <button class="new-btn" @click="handleNew" title="New project">+</button>
    </header>

    <ul class="project-list">
      <li v-if="projects.length === 0" class="empty">No projects yet.</li>

      <li
        v-for="p in projects"
        :key="p.id"
        class="project-item"
        :class="{ active: p.id === store.activeProjectId }"
      >
        <div class="project-row" @click="handleSelect(p.id)" @dblclick="startRename(p.id, p.name)">
          <input
            v-if="renameTargetId === p.id"
            v-model="renameDraft"
            class="rename-input"
            @keydown.enter="commitRename"
            @keydown.escape="cancelRename"
            @blur="commitRename"
            @click.stop
            autofocus
          />
          <span v-else class="project-name" :title="p.name">{{ p.name }}</span>
          <button
            v-if="renameTargetId !== p.id"
            class="delete-btn"
            @click.stop="handleDelete(p.id)"
            title="Delete project"
          >
            ×
          </button>
        </div>

        <!-- Inline expansion for the active project: directory, files, subchats -->
        <div v-if="p.id === store.activeProjectId" class="project-detail">
          <div v-if="p.directoryPath" class="dir-path" :title="p.directoryPath">
            📁 {{ p.directoryPath }}
          </div>

          <div class="section">
            <ProjectEngineSection :projectId="p.id" />
          </div>

          <div class="section">
            <div
              class="section-head section-head-clickable"
              @click="toggleCollapsed(p.id, 'reports')"
              role="button"
              :aria-expanded="!isCollapsed(p.id, 'reports')"
            >
              <i
                class="mdi section-chevron"
                :class="isCollapsed(p.id, 'reports') ? 'mdi-chevron-right' : 'mdi-chevron-down'"
              ></i>
              <span class="section-label">Reports</span>
              <span class="section-count" v-if="projectReports(p.id).length > 0">
                {{ projectReports(p.id).length }}
              </span>
              <span class="section-actions" @click.stop>
                <button
                  class="mini-btn"
                  :disabled="creatingReportInProjectId === p.id"
                  @click="startNewReport(p.id)"
                  title="New report (agent-authored analytical memo)"
                >
                  +
                </button>
              </span>
            </div>

            <div v-show="!isCollapsed(p.id, 'reports')" class="section-body">
              <ul
                v-if="projectReports(p.id).length > 0 || creatingReportInProjectId === p.id"
                class="nested-list"
              >
                <li v-if="creatingReportInProjectId === p.id" class="nested-row file-row creating">
                  <span class="type-tag kind-report">rpt</span>
                  <input
                    v-model="newReportDraft"
                    class="rename-input"
                    placeholder="report title…"
                    @keydown.enter="commitNewReport(p.id)"
                    @keydown.escape="cancelNewReport"
                    @blur="commitNewReport(p.id)"
                    @click.stop
                    autofocus
                  />
                  <button class="mini-x" @click.stop.prevent="cancelNewReport" title="Cancel">
                    ×
                  </button>
                </li>
                <li
                  v-for="d in projectReports(p.id)"
                  :key="d.id"
                  class="nested-row file-row"
                  :class="{ active: d.id === activeDashboardId }"
                  @click.stop="emit('select-dashboard', d.id)"
                >
                  <span
                    class="type-tag"
                    :class="d.layoutType === 'report' ? 'kind-report' : 'kind-grid'"
                    >{{ d.layoutType === 'report' ? 'rpt' : 'dash' }}</span
                  >
                  <span class="nested-name" :title="d.name">{{ d.name }}</span>
                  <button
                    class="mini-x"
                    @click.stop="removeReport(p.id, d.id)"
                    title="Delete report"
                  >
                    ×
                  </button>
                </li>
              </ul>
              <p
                v-if="projectReports(p.id).length === 0 && creatingReportInProjectId !== p.id"
                class="nested-empty"
              >
                none yet
              </p>
              <p v-if="reportError && reportError.projectId === p.id" class="ingest-error">
                {{ reportError.text }}
              </p>
            </div>
          </div>

          <div class="section">
            <div
              class="section-head section-head-clickable"
              @click="toggleCollapsed(p.id, 'files')"
              role="button"
              :aria-expanded="!isCollapsed(p.id, 'files')"
            >
              <i
                class="mdi section-chevron"
                :class="isCollapsed(p.id, 'files') ? 'mdi-chevron-right' : 'mdi-chevron-down'"
              ></i>
              <span class="section-label">Files</span>
              <span class="section-count" v-if="projectFiles(p.id).length > 0">
                {{ projectFiles(p.id).length }}
              </span>
              <span class="section-actions" @click.stop>
                <button
                  v-if="tauri"
                  class="mini-btn"
                  :disabled="busyProjectId === p.id"
                  @click="openFolder(p.id)"
                  :title="p.directoryPath ? 'Re-sync folder' : 'Open folder'"
                >
                  📁
                </button>
                <button
                  class="mini-btn"
                  :disabled="busyProjectId === p.id || creatingInProjectId === p.id"
                  @click="startNewFile(p.id)"
                  title="New file (type the name; extension determines type)"
                >
                  📝
                </button>
                <button
                  class="mini-btn"
                  :disabled="busyProjectId === p.id"
                  @click="pickFiles(p.id)"
                  title="Attach files"
                >
                  +
                </button>
                <input
                  :id="fileInputId(p.id)"
                  type="file"
                  multiple
                  accept=".preql,.sql,.py,.md,.markdown,.txt,.csv"
                  style="display: none"
                  @change="(e) => onFilesPicked(p.id, (e.target as HTMLInputElement).files)"
                />
              </span>
            </div>

            <div v-show="!isCollapsed(p.id, 'files')" class="section-body">
              <ul
                v-if="projectFiles(p.id).length > 0 || creatingInProjectId === p.id"
                class="nested-list"
              >
                <li v-if="creatingInProjectId === p.id" class="nested-row file-row creating">
                  <span class="type-tag type-new">new</span>
                  <input
                    v-model="newFileDraft"
                    class="rename-input"
                    placeholder="filename.sql, .preql, .py, .md…"
                    @keydown.enter="commitNewFile(p.id)"
                    @keydown.escape="cancelNewFile"
                    @blur="commitNewFile(p.id)"
                    @click.stop
                    autofocus
                  />
                  <button class="mini-x" @click.stop.prevent="cancelNewFile" title="Cancel">
                    ×
                  </button>
                </li>
                <li
                  v-for="ed in projectFiles(p.id)"
                  :key="ed.id"
                  class="nested-row file-row"
                  @click.stop="emit('select-file', ed.id)"
                >
                  <span class="type-tag" :class="`type-${ed.type}`">{{ ed.type }}</span>
                  <span class="nested-name" :title="ed.name">{{ ed.name }}</span>
                  <button class="mini-x" @click.stop="detachEditor(p.id, ed.id)" title="Detach">
                    ×
                  </button>
                </li>
              </ul>
              <p
                v-if="projectFiles(p.id).length === 0 && creatingInProjectId !== p.id"
                class="nested-empty"
              >
                none yet
              </p>

              <p v-if="ingestionStatus && ingestionStatus.projectId === p.id" class="ingest-status">
                {{ ingestionStatus.text }}
              </p>
              <p v-if="ingestionError && ingestionError.projectId === p.id" class="ingest-error">
                {{ ingestionError.text }}
              </p>
            </div>
          </div>

          <div class="section">
            <div
              class="section-head section-head-clickable"
              @click="toggleCollapsed(p.id, 'subchats')"
              role="button"
              :aria-expanded="!isCollapsed(p.id, 'subchats')"
            >
              <i
                class="mdi section-chevron"
                :class="isCollapsed(p.id, 'subchats') ? 'mdi-chevron-right' : 'mdi-chevron-down'"
              ></i>
              <span class="section-label">Subchats</span>
              <span class="section-count" v-if="projectSubchats(p.id).length > 0">
                {{ projectSubchats(p.id).length }}
              </span>
            </div>
            <div v-show="!isCollapsed(p.id, 'subchats')" class="section-body">
              <ul v-if="projectSubchats(p.id).length > 0" class="nested-list">
                <li
                  v-for="s in projectSubchats(p.id)"
                  :key="s.id"
                  class="nested-row subchat-row"
                  :class="`status-${statusOf(s.id)}`"
                  @click.stop="emit('select-subchat', s.id)"
                >
                  <span class="type-tag" :class="`kind-${s.kind}`">{{ s.kind }}</span>
                  <span class="nested-name" :title="s.name">{{ s.name }}</span>
                  <span v-if="statusOf(s.id) === 'running'" class="dot running" />
                  <button
                    class="mini-x"
                    :disabled="statusOf(s.id) === 'running'"
                    :title="
                      statusOf(s.id) === 'running'
                        ? 'Stop the subchat before clearing it'
                        : 'Clear from list'
                    "
                    @click.stop="clearSubchat(p.id, s.id)"
                  >
                    ×
                  </button>
                </li>
              </ul>
              <p v-else class="nested-empty">none yet</p>
            </div>
          </div>
        </div>
      </li>
    </ul>

    <footer class="sidebar-footer">
      <span v-if="store.unsavedProjects > 0" class="unsaved">
        {{ store.unsavedProjects }} unsaved
      </span>
    </footer>
  </aside>
</template>

<style scoped>
.sidebar {
  width: 100%;
  height: 100vh;
  border-right: 1px solid var(--border);
  background: var(--bg);
  display: flex;
  flex-direction: column;
  font-size: 0.9rem;
  overflow: hidden;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--explorer-header-height);
  padding: 0 var(--explorer-header-padding-inline);
  border-bottom: 1px solid var(--border);
  background: var(--panel-header-bg);
  flex-shrink: 0;
}

.sidebar-title {
  color: var(--explorer-header-title-color);
  font-size: var(--explorer-header-title-font-size);
  font-weight: var(--explorer-header-title-font-weight);
  letter-spacing: var(--explorer-header-title-letter-spacing);
  line-height: var(--explorer-header-title-line-height);
  text-transform: var(--explorer-header-title-text-transform);
}

.new-btn {
  border: none;
  background: transparent;
  color: var(--accent);
  font-size: 1rem;
  cursor: pointer;
  padding: 0.1rem 0.45rem;
  line-height: 1;
  border-radius: 4px;
}

.new-btn:hover {
  background: rgba(127, 127, 127, 0.12);
}

.project-list {
  list-style: none;
  margin: 0;
  padding: 0.25rem;
  flex: 1;
  overflow-y: auto;
}

.empty {
  color: var(--muted);
  padding: 1rem;
  font-size: 0.85rem;
  text-align: center;
}

.project-item {
  margin-bottom: 0.15rem;
  border-radius: 4px;
}

.project-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem;
  padding: 0.45rem 0.6rem;
  border-radius: 4px;
  cursor: pointer;
  user-select: none;
}

.project-row:hover {
  background: rgba(127, 127, 127, 0.08);
}

.project-item.active > .project-row {
  background: rgba(59, 130, 246, 0.12);
  color: var(--accent);
  font-weight: 500;
}

.project-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.rename-input {
  flex: 1;
  background: var(--bg);
  border: 1px solid var(--accent);
  border-radius: 3px;
  padding: 0.15rem 0.4rem;
  color: var(--fg);
  font-size: 0.9rem;
  outline: none;
}

.delete-btn {
  border: none;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
  padding: 0 0.3rem;
  visibility: hidden;
  border-radius: 3px;
}

.project-row:hover .delete-btn {
  visibility: visible;
}

.delete-btn:hover {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.1);
}

/* Inline expansion */

.project-detail {
  padding: 0.4rem 0.5rem 0.6rem 1rem;
  border-left: 2px solid rgba(59, 130, 246, 0.18);
  margin: 0.15rem 0 0.3rem 0.5rem;
}

.dir-path {
  font-size: 0.7rem;
  color: var(--muted);
  font-family: ui-monospace, SFMono-Regular, monospace;
  margin-bottom: 0.45rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.section {
  margin-bottom: 0.55rem;
}

.section-head {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 0.2rem;
}

.section-head-clickable {
  cursor: pointer;
  user-select: none;
  border-radius: 3px;
  padding: 1px 2px;
}

.section-head-clickable:hover {
  background: rgba(127, 127, 127, 0.06);
}

.section-chevron {
  font-size: 14px;
  color: var(--muted);
  width: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: transform 0.12s ease;
}

.section-count {
  font-size: 0.6rem;
  font-weight: 600;
  color: var(--muted);
  padding: 0 5px;
  border-radius: 999px;
  background: rgba(127, 127, 127, 0.12);
  letter-spacing: 0.04em;
}

.section-body {
  /* Mounted-but-hidden sections use v-show, so they stay in the DOM and keep
   * scroll/text input state across collapse cycles. */
}

.section-label {
  font-size: 0.66rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted);
  font-weight: 600;
}

.section-actions {
  display: flex;
  gap: 0.2rem;
  margin-left: auto;
}

.mini-btn {
  border: 1px solid var(--border);
  background: transparent;
  color: var(--accent);
  border-radius: 3px;
  padding: 0.1rem 0.4rem;
  font-size: 0.78rem;
  cursor: pointer;
  line-height: 1;
}

.mini-btn:hover:not(:disabled) {
  background: rgba(59, 130, 246, 0.08);
}

.mini-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.nested-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.nested-row {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.2rem 0.4rem;
  border-radius: 3px;
  font-size: 0.8rem;
  cursor: default;
}

.nested-row.subchat-row,
.nested-row.file-row {
  cursor: pointer;
}

.subchat-row:hover,
.file-row:hover {
  background: rgba(127, 127, 127, 0.08);
}

.nested-name {
  flex: 1;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.nested-empty {
  margin: 0.1rem 0 0;
  font-size: 0.72rem;
  color: var(--muted);
  font-style: italic;
}

.type-tag {
  font-size: 0.6rem;
  text-transform: uppercase;
  font-weight: 700;
  padding: 0.05rem 0.3rem;
  border-radius: 3px;
  letter-spacing: 0.04em;
  background: rgba(127, 127, 127, 0.12);
  color: var(--muted);
}

.type-tag.type-csv {
  background: rgba(234, 88, 12, 0.18);
  color: #ea580c;
}

.type-tag.type-preql,
.type-tag.type-trilogy {
  background: rgba(59, 130, 246, 0.18);
  color: var(--accent);
}

.type-tag.type-sql {
  background: rgba(16, 185, 129, 0.18);
  color: #059669;
}

.type-tag.type-markdown {
  background: rgba(245, 158, 11, 0.18);
  color: #d97706;
}

.type-tag.type-python {
  background: rgba(168, 85, 247, 0.18);
  color: #9333ea;
}

.type-tag.type-new {
  background: rgba(100, 116, 139, 0.18);
  color: #475569;
}

.type-tag.kind-architect {
  background: rgba(168, 85, 247, 0.18);
  color: #9333ea;
}

.type-tag.kind-analyst {
  background: rgba(16, 185, 129, 0.18);
  color: #059669;
}

.type-tag.kind-report {
  background: rgba(37, 99, 235, 0.18);
  color: #1d4ed8;
}

.type-tag.kind-grid {
  background: rgba(99, 102, 241, 0.18);
  color: #4f46e5;
}

.file-row.active {
  background: rgba(59, 130, 246, 0.12);
  color: var(--accent);
}

.mini-x {
  border: none;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  font-size: 0.9rem;
  line-height: 1;
  padding: 0 0.2rem;
  visibility: hidden;
}

.nested-row:hover .mini-x {
  visibility: visible;
}

.mini-x:hover:not(:disabled) {
  color: #ef4444;
}

.mini-x:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.dot.running {
  background: #f59e0b;
  animation: pulse 1.4s infinite;
}

@keyframes pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.6);
  }
  70% {
    box-shadow: 0 0 0 6px rgba(245, 158, 11, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(245, 158, 11, 0);
  }
}

.ingest-status {
  margin: 0.3rem 0 0;
  font-size: 0.72rem;
  color: var(--muted);
}

.ingest-error {
  margin: 0.3rem 0 0;
  font-size: 0.72rem;
  color: #ef4444;
  white-space: pre-wrap;
}

.sidebar-footer {
  padding: 0.5rem 1rem;
  border-top: 1px solid var(--border);
  font-size: 0.75rem;
  color: var(--muted);
  min-height: 1.8rem;
}

.unsaved {
  color: #f59e0b;
}
</style>
