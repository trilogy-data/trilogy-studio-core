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
import { Chat } from '@lib/chats/chat'
import { useProjectPersistence } from './composables/useProjectPersistence'
import { useChatPersistence } from './composables/useChatPersistence'
import { useLLMPersistence } from './composables/useLLMPersistence'
import { useEditorPersistence } from './composables/useEditorPersistence'
import { useExecutionContext } from './composables/useExecutionContext'
import ProjectSidebar from './components/ProjectSidebar.vue'
import OverseerPanel from './components/OverseerPanel.vue'
import ProviderSetup from './components/ProviderSetup.vue'
import SubchatViewer from './components/SubchatViewer.vue'
import ArtifactsView from './components/ArtifactsView.vue'
import FileEditor from './components/FileEditor.vue'
import ResizeHandle from './components/ResizeHandle.vue'

useProjectPersistence()
const { ready: chatsReady } = useChatPersistence()
useEditorPersistence()
useLLMPersistence()
const { queryExecutionService, trilogyResolver } = useExecutionContext()

const projectStore = useProjectStore()
const chatStore = useChatStore()
const editorStore = useEditorStore()
const llmStore = useLLMConnectionStore()
const connectionStore = useConnectionStore()
const modelStore = useModelConfigStore()
const userSettingsStore = useUserSettingsStore()
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

// ----- selected file (center pane) -----
const selectedFileId = ref<string>('')
function onSelectFile(id: string) {
  selectedFileId.value = id
}
function closeFile() {
  selectedFileId.value = ''
}
// Auto-clear selection if the file gets detached / project switched away
watch([() => projectStore.activeProject?.id, selectedFileId], () => {
  const id = selectedFileId.value
  if (!id) return
  const ed = editorStore.editors[id]
  const project = projectStore.activeProject
  if (!ed || ed.deleted || !project || !project.editorIds.includes(id)) {
    selectedFileId.value = ''
  }
})

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

// Provider settings modal — first-time setup + updating an existing key.
const showProviderSettings = ref(false)
function openProviderSettings() {
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
      <ProjectSidebar @select-subchat="onSelectSubchat" @select-file="onSelectFile" />
    </div>
    <ResizeHandle v-model="leftWidth" side="left" :min="200" :max="500" />

    <main class="main-pane">
      <ProviderSetup v-if="!hasProvider" @added="onProviderAdded" />
      <template v-else>
        <FileEditor v-if="selectedFileId" :editorId="selectedFileId" @close="closeFile" />
        <ArtifactsView v-else />

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
          <span>LLM providers</span>
          <button class="close-btn" @click="closeProviderSettings" title="Close">×</button>
        </header>
        <div class="settings-body">
          <ProviderSetup @added="onProviderAdded" />
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
  width: min(560px, 92vw);
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.35);
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
}
</style>
