<script setup lang="ts">
import { computed, provide, ref, watch } from 'vue'
import useProjectStore from '@lib/stores/projectStore'
import useChatStore from '@lib/stores/chatStore'
import useEditorStore from '@lib/stores/editorStore'
import useLLMConnectionStore from '@lib/stores/llmStore'
import useConnectionStore from '@lib/stores/connectionStore'
import useModelConfigStore from '@lib/stores/modelStore'
import useUserSettingsStore from '@lib/stores/userSettingsStore'
import useScreenNavigation from '@lib/stores/useScreenNavigation'
import { useAnalyticsStore } from '@lib/stores/analyticsStore'
import { useDashboardStore } from '@lib/stores/dashboardStore'
import { Chat } from '@lib/chats/chat'
import { useProjectPersistence } from './composables/useProjectPersistence'
import { useChatPersistence } from './composables/useChatPersistence'
import { useLLMPersistence } from './composables/useLLMPersistence'
import { useEditorPersistence } from './composables/useEditorPersistence'
import { useDashboardPersistence } from './composables/useDashboardPersistence'
import { useExecutionContext } from './composables/useExecutionContext'
import ProjectSidebar from './components/ProjectSidebar.vue'
import OverseerPanel from './components/OverseerPanel.vue'
import ProviderSetup from './components/ProviderSetup.vue'
import PromptManager from './components/PromptManager.vue'
import SubchatViewer from './components/SubchatViewer.vue'
import ArtifactsView from './components/ArtifactsView.vue'
import FileEditor from './components/FileEditor.vue'
import ReportView from './components/ReportView.vue'
import ResizeHandle from './components/ResizeHandle.vue'

const { ready: projectsReady } = useProjectPersistence()
const { ready: chatsReady } = useChatPersistence()
useEditorPersistence()
useLLMPersistence()
useDashboardPersistence()
const { queryExecutionService, trilogyResolver } = useExecutionContext()

const projectStore = useProjectStore()
const chatStore = useChatStore()
const editorStore = useEditorStore()
const llmStore = useLLMConnectionStore()
const connectionStore = useConnectionStore()
const modelStore = useModelConfigStore()
const userSettingsStore = useUserSettingsStore()
const dashboardStore = useDashboardStore()
// Lib's userSettingsStore defaults theme to 'dark' — force it to 'light'
// so lib's CodeEditor selects the `trilogyStudiolight` Monaco theme that
// matches the rest of the explorer chrome.
userSettingsStore.settings.theme = 'light'
const navigationStore = useScreenNavigation()
const analyticsStore = useAnalyticsStore()

// Provide everything lib's Editor.vue (and friends) inject. Without these
// the in-pane Trilogy/SQL editor throws on mount. Stores are reactive; the
// service refs unwrap to instances when they resolve in onMounted.
provide('editorStore', editorStore)
provide('connectionStore', connectionStore)
provide('modelStore', modelStore)
provide('llmConnectionStore', llmStore)
provide('userSettingsStore', userSettingsStore)
provide('analyticsStore', analyticsStore)
provide('navigationStore', navigationStore)
provide('chatStore', chatStore)
provide('dashboardStore', dashboardStore)
provide('setActiveEditor', (id: string) => {
  editorStore.activeEditorId = id
})
provide('queryExecutionService', queryExecutionService)
provide('trilogyResolver', trilogyResolver)
// Slim-column editor — suppress the symbols sidepane that lib normally
// mounts. Studio shows it; explorer's center column is too narrow.
provide('hideEditorSymbols', true)

const OVERSEER_ID = 'overseer-singleton'

const hasProvider = computed(() => Object.keys(llmStore.connections).length > 0)
const overseer = computed(() => chatStore.chats[OVERSEER_ID] || null)

// ----- column widths (persisted) -----
function loadWidth(key: string, fallback: number): number {
  const v = Number(localStorage.getItem(key))
  return Number.isFinite(v) && v > 0 ? v : fallback
}
const leftWidth = ref(loadWidth('explorer:leftWidth', 280))
const rightWidth = ref(loadWidth('explorer:rightWidth', 420))
watch(leftWidth, (v) => localStorage.setItem('explorer:leftWidth', String(v)))
watch(rightWidth, (v) => localStorage.setItem('explorer:rightWidth', String(v)))

// ----- center pane view (workspace | file | analysis | dashboard) -----
// Driven entirely from the left-hand nav — the sidebar is the single
// navigation surface for the center column. 'workspace' is the aggregated
// artifacts view; 'analysis' narrows it to one subchat's artifacts;
// 'dashboard' shows a report-mode dashboard in ReportView.
type CenterView =
  | { type: 'workspace' }
  | { type: 'file'; id: string }
  | { type: 'analysis'; id: string }
  | { type: 'dashboard'; id: string }
const centerView = ref<CenterView>({ type: 'workspace' })
const centerFileId = computed(() => (centerView.value.type === 'file' ? centerView.value.id : ''))
const centerAnalysisId = computed(() =>
  centerView.value.type === 'analysis' ? centerView.value.id : '',
)
const centerDashboardId = computed(() =>
  centerView.value.type === 'dashboard' ? centerView.value.id : '',
)

// Recently-viewed files/analyses/reports (most recent first), persisted per
// project so quick-nav survives a reload. The sidebar renders these as a
// "Recent" section; dead ids are filtered out at render time there.
interface RecentItem {
  type: 'file' | 'analysis' | 'dashboard'
  id: string
}
const recents = ref<RecentItem[]>([])
function recentsKey(projectId: string): string {
  return `explorer:recents:${projectId}`
}
function loadRecents() {
  const pid = projectStore.activeProjectId
  if (!pid) {
    recents.value = []
    return
  }
  try {
    const raw = localStorage.getItem(recentsKey(pid))
    recents.value = raw ? JSON.parse(raw) : []
  } catch {
    recents.value = []
  }
}
watch(() => projectStore.activeProjectId, loadRecents, { immediate: true })

function pushRecent(item: RecentItem) {
  const pid = projectStore.activeProjectId
  if (!pid) return
  recents.value = [
    item,
    ...recents.value.filter((r) => !(r.type === item.type && r.id === item.id)),
  ].slice(0, 8)
  localStorage.setItem(recentsKey(pid), JSON.stringify(recents.value))
}

function onSelectFile(id: string) {
  centerView.value = { type: 'file', id }
  pushRecent({ type: 'file', id })
}
function onSelectAnalysis(id: string) {
  centerView.value = { type: 'analysis', id }
  pushRecent({ type: 'analysis', id })
}
function onSelectDashboard(id: string) {
  centerView.value = { type: 'dashboard', id }
  pushRecent({ type: 'dashboard', id })
}
function onSelectWorkspace() {
  centerView.value = { type: 'workspace' }
}
// Fall back to the workspace if the viewed file/analysis/report is detached,
// deleted, or the project switches away.
watch([() => projectStore.activeProject?.id, centerView], () => {
  const view = centerView.value
  const project = projectStore.activeProject
  if (view.type === 'file') {
    const ed = editorStore.editors[view.id]
    if (!ed || ed.deleted || !project || !project.editorIds.includes(view.id)) {
      centerView.value = { type: 'workspace' }
    }
  } else if (view.type === 'analysis') {
    const chat = chatStore.chats[view.id]
    if (!chat || chat.deleted || !project || !project.subchatIds.includes(view.id)) {
      centerView.value = { type: 'workspace' }
    }
  } else if (view.type === 'dashboard') {
    const dash = dashboardStore.dashboards[view.id]
    if (!dash || dash.deleted || !project || !project.dashboardIds.includes(view.id)) {
      centerView.value = { type: 'workspace' }
    }
  }
})

// Reconcile orphan subchat references once both stores are hydrated. The
// project flush and chat flush are independent debouncers, so a tab close
// during a streaming subchat can persist the project's subchatIds entry
// before the chat itself ever reaches IndexedDB. On reload we'd surface
// "missing" subchats to the overseer; prune those dangling refs here so
// downstream tooling sees a consistent view.
function reconcileOrphanSubchats() {
  for (const project of Object.values(projectStore.projects)) {
    if (project.deleted) continue
    const orphans = project.subchatIds.filter((id) => {
      const c = chatStore.chats[id]
      return !c || c.deleted
    })
    if (orphans.length === 0) continue
    for (const id of orphans) projectStore.removeSubchatFromProject(project.id, id)
    console.warn(
      `Pruned ${orphans.length} orphan subchat ref(s) from project ${project.id}:`,
      orphans,
    )
  }
}
watch(
  () => projectsReady.value && chatsReady.value,
  (ready) => {
    if (ready) reconcileOrphanSubchats()
  },
  { immediate: true },
)

// Boot the singleton overseer chat — only after chat persistence has
// finished loading so the merge-on-load can't race-overwrite it.
function ensureOverseer() {
  if (!hasProvider.value || !chatsReady.value) return
  if (chatStore.chats[OVERSEER_ID]) return
  const provider = llmStore.activeConnection || Object.keys(llmStore.connections)[0]
  const chat = new Chat({
    id: OVERSEER_ID,
    name: 'Overseer',
    llmConnectionName: provider,
    dataConnectionName: '',
    dataConnectionId: '',
    kind: 'overseer',
  })
  chatStore.addChat(chat)
}
watch([hasProvider, chatsReady], ensureOverseer, { immediate: true })

// Subchat modal viewer state
const viewingSubchatId = ref<string>('')
function onSelectSubchat(id: string) {
  viewingSubchatId.value = id
}
function closeSubchat() {
  viewingSubchatId.value = ''
}

// Overseer settings modal — first-time setup, updating an existing key, and
// per-project agent prompt management. Tabs let the user pivot between
// connection config and prompt overrides without leaving the modal.
const showProviderSettings = ref(false)
type SettingsTab = 'connection' | 'prompts'
const settingsTab = ref<SettingsTab>('connection')
function openProviderSettings() {
  settingsTab.value = 'connection'
  showProviderSettings.value = true
}
function closeProviderSettings() {
  showProviderSettings.value = false
}
function onProviderAdded() {
  closeProviderSettings()
}
</script>

<template>
  <div class="app-root">
    <div class="left-column" :style="{ width: leftWidth + 'px' }">
      <ProjectSidebar
        :activeView="centerView"
        :recents="recents"
        @select-subchat="onSelectSubchat"
        @select-file="onSelectFile"
        @select-analysis="onSelectAnalysis"
        @select-workspace="onSelectWorkspace"
        @select-dashboard="onSelectDashboard"
      />
    </div>
    <ResizeHandle v-model="leftWidth" side="left" :min="200" :max="500" />

    <main class="main-pane">
      <ProviderSetup v-if="!hasProvider" @added="onProviderAdded" />
      <template v-else>
        <FileEditor v-if="centerFileId" :editorId="centerFileId" @close="onSelectWorkspace" />
        <ReportView
          v-else-if="centerDashboardId"
          :dashboardId="centerDashboardId"
          @close="onSelectWorkspace"
        />
        <ArtifactsView v-else :subchatId="centerAnalysisId" />

        <ResizeHandle v-model="rightWidth" side="right" :min="320" :max="640" />

        <div class="right-column" :style="{ width: rightWidth + 'px' }">
          <OverseerPanel
            v-if="overseer"
            :overseer="overseer"
            :queryExecutionService="queryExecutionService"
            @open-settings="openProviderSettings"
          />
          <div v-else class="overseer-pending">
            <span>Setting up overseer…</span>
          </div>
        </div>
      </template>
    </main>

    <SubchatViewer v-if="viewingSubchatId" :chatId="viewingSubchatId" @close="closeSubchat" />

    <div v-if="showProviderSettings" class="settings-backdrop" @click.self="closeProviderSettings">
      <div class="settings-modal" role="dialog">
        <header class="settings-head">
          <span>Overseer settings</span>
          <nav class="settings-tabs">
            <button
              :class="{ active: settingsTab === 'connection' }"
              @click="settingsTab = 'connection'"
            >
              Connection
            </button>
            <button :class="{ active: settingsTab === 'prompts' }" @click="settingsTab = 'prompts'">
              Prompts
            </button>
          </nav>
          <button class="close-btn" @click="closeProviderSettings" title="Close">×</button>
        </header>
        <div class="settings-body">
          <ProviderSetup v-if="settingsTab === 'connection'" @added="onProviderAdded" />
          <PromptManager v-else />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app-root {
  display: flex;
  height: 100vh;
}

.left-column {
  flex-shrink: 0;
  height: 100%;
  display: flex;
  overflow: hidden;
}

.main-pane {
  flex: 1;
  display: flex;
  flex-direction: row;
  overflow: hidden;
  min-width: 0;
}

.right-column {
  flex-shrink: 0;
  height: 100%;
  display: flex;
  overflow: hidden;
}

.overseer-pending {
  display: flex;
  align-items: center;
  height: var(--explorer-header-height);
  padding: 0 var(--explorer-header-padding-inline);
  font-size: var(--explorer-header-title-font-size);
  font-weight: var(--explorer-header-title-font-weight);
  letter-spacing: var(--explorer-header-title-letter-spacing);
  line-height: var(--explorer-header-title-line-height);
  text-transform: var(--explorer-header-title-text-transform);
  color: var(--muted);
  border-bottom: 1px solid var(--border);
  background: var(--panel-header-bg);
}

.settings-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}

.settings-modal {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  width: min(880px, 94vw);
  height: min(720px, 90vh);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.35);
}

.settings-tabs {
  display: flex;
  gap: 0.3rem;
  margin-left: 1.4rem;
  flex: 1;
}

.settings-tabs button {
  border: none;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 0.3rem 0.7rem;
  border-radius: 4px;
  line-height: 1;
}

.settings-tabs button:hover {
  background: rgba(127, 127, 127, 0.12);
  color: var(--fg);
}

.settings-tabs button.active {
  color: var(--accent);
  background: rgba(59, 130, 246, 0.12);
}

.settings-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--explorer-header-height);
  padding: 0 var(--explorer-header-padding-inline);
  border-bottom: 1px solid var(--border);
  background: var(--panel-header-bg);
  color: var(--explorer-header-title-color);
  font-size: var(--explorer-header-title-font-size);
  font-weight: var(--explorer-header-title-font-weight);
  letter-spacing: var(--explorer-header-title-letter-spacing);
  line-height: var(--explorer-header-title-line-height);
  text-transform: var(--explorer-header-title-text-transform);
}

.close-btn {
  border: none;
  background: transparent;
  color: var(--muted);
  font-size: 1.4rem;
  cursor: pointer;
  line-height: 1;
  padding: 0 0.3rem;
}

.close-btn:hover {
  color: var(--fg);
}

.settings-body {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
</style>
