<template>
  <div class="report-shell">
    <header class="report-toolbar">
      <div class="report-title-block">
        <span class="report-eyebrow">Report</span>
        <input
          v-if="editable"
          v-model="titleDraft"
          class="report-title-input"
          placeholder="Untitled report"
          @blur="commitTitle"
          @keyup.enter="commitTitle"
        />
        <h1 v-else class="report-title">{{ dashboard?.name || 'Untitled report' }}</h1>
      </div>
      <div class="report-actions">
        <button
          v-if="!viewMode"
          class="report-btn"
          :class="{ 'report-btn-active': editable }"
          @click="toggleEdit"
          :title="editable ? 'Lock report (publish)' : 'Edit report'"
        >
          <i :class="editable ? 'mdi mdi-lock-open-variant' : 'mdi mdi-pencil'" class="icon"></i>
          <span>{{ editable ? 'Editing' : 'Edit' }}</span>
        </button>
        <button
          v-if="!externalChat"
          class="report-btn"
          @click="toggleChat"
          :title="chatOpen ? 'Hide agent' : 'Show agent'"
        >
          <i class="mdi mdi-robot-outline icon"></i>
          <span>Agent</span>
        </button>
      </div>
    </header>

    <div class="report-body" :class="{ 'with-chat': chatOpen && !externalChat }">
      <article class="report-flow">
        <div v-if="!hasContent" class="report-empty-state">
          <h2 class="empty-headline">Brief the agent</h2>
          <p class="empty-sub">
            Reports are agent-authored analytical memos. Describe the question this report should
            answer; the agent will produce an executive memo, claim sections, and provenance.
          </p>
          <form
            class="empty-form"
            @submit.prevent="
              () => {
                if (briefDraft.trim()) onCtaSubmit(briefDraft)
              }
            "
          >
            <textarea
              v-model="briefDraft"
              class="empty-input"
              :placeholder="ctaPlaceholder"
              rows="3"
            />
            <div class="empty-actions">
              <button
                type="submit"
                class="report-btn report-btn-active"
                :disabled="!briefDraft.trim() || !hasLlmConnection"
              >
                <i class="mdi mdi-send icon"></i> Brief the agent
              </button>
              <span v-if="!hasLlmConnection" class="empty-warn"
                >Configure an LLM provider to enable the agent.</span
              >
            </div>
          </form>
        </div>

        <div
          v-for="block in blocks"
          :key="block.layout.i"
          class="report-block"
          :class="{
            'report-block-memo': block.kind === 'memo',
            'report-block-claim': block.kind === 'claim',
            'report-block-evidence': block.kind === 'evidence',
            'report-block-appendix': block.kind === 'appendix',
            'report-block-table': block.kind === 'table',
            'report-block-markdown': block.kind === 'markdown',
            'report-block-section': block.kind === 'section',
          }"
        >
          <component
            :is="block.component"
            v-if="block.component"
            :dashboardId="dashboardId"
            :itemId="block.layout.i"
            :getItemData="getItemData"
            :setItemData="setItemData"
            :getDashboardQueryExecutor="getDashboardQueryExecutor"
            :editMode="editable"
            :symbols="globalCompletion"
            @dimension-click="setCrossFilter"
            @background-click="(itemId: string) => unSelect(itemId)"
          />
          <div v-else-if="block.kind === 'section'" class="report-section-header">
            <span class="report-section-label">{{ getSectionLabel(block.layout.i) }}</span>
          </div>

          <DashboardProvenance
            v-if="block.showProvenance"
            :provenance="block.provenance"
            :initiallyOpen="block.kind === 'memo' || block.kind === 'claim'"
          />

          <div v-if="editable" class="report-block-actions">
            <button
              class="block-action"
              @click="moveBlock(block.layout.i, 'up')"
              :disabled="!canMoveUp(block.layout.i)"
              title="Move up"
            >
              <i class="mdi mdi-chevron-up icon"></i>
            </button>
            <button
              class="block-action"
              @click="moveBlock(block.layout.i, 'down')"
              :disabled="!canMoveDown(block.layout.i)"
              title="Move down"
            >
              <i class="mdi mdi-chevron-down icon"></i>
            </button>
            <button
              class="block-action danger"
              @click="confirmRemove(block.layout.i)"
              title="Remove"
            >
              <i class="mdi mdi-delete-outline icon"></i>
            </button>
          </div>
        </div>

        <div v-if="hasContent && editable" class="report-add-rail">
          <button class="report-add-btn" @click="openAddItemModal">
            <i class="mdi mdi-plus icon"></i> Add block
          </button>
        </div>
      </article>

      <aside v-if="chatOpen && !externalChat" class="report-chat">
        <DashboardChatPanel
          v-if="dashboard"
          :dashboard="dashboard"
          :get-dashboard-query-executor="getDashboardQueryExecutor"
          :refresh-item="handleRefreshItem"
          :initial-prompt="chatInitialPrompt"
          @close="chatOpen = false"
        />
      </aside>

      <!-- External-chat mode: the same engine, renderless. Queued briefs and
           CTA submissions flow through initial-prompt exactly as embedded. -->
      <DashboardChatPanel
        v-if="externalChat && dashboard"
        headless
        :dashboard="dashboard"
        :get-dashboard-query-executor="getDashboardQueryExecutor"
        :refresh-item="handleRefreshItem"
        :initial-prompt="chatInitialPrompt"
      />
    </div>

    <DashboardAddItemModal :show="showAddItemModal" @add="onAddItem" @close="closeAddModal" />

    <Teleport to="body" v-if="showQueryEditor && editingItem">
      <ChartEditor
        :connectionName="getItemData(editingItem.i, dashboardId).connectionName || ''"
        :imports="getItemData(editingItem.i, dashboardId).imports || []"
        :rootContent="getItemData(editingItem.i, dashboardId).rootContent || []"
        :content="getItemData(editingItem.i, dashboardId).content"
        @save="onSaveContent"
        @cancel="closeEditors"
      />
    </Teleport>

    <Teleport to="body" v-if="showMarkdownEditor && editingItem">
      <MarkdownEditor
        :connectionName="getItemData(editingItem.i, dashboardId).connectionName || ''"
        :imports="getItemData(editingItem.i, dashboardId).imports || []"
        :rootContent="getItemData(editingItem.i, dashboardId).rootContent || []"
        :content="getItemData(editingItem.i, dashboardId).structured_content"
        @save="onSaveContent"
        @cancel="closeEditors"
      />
    </Teleport>
  </div>
</template>

<script lang="ts" setup>
import { computed, inject, ref, watch } from 'vue'
import { useDashboard } from './useDashboard'
import { useDashboardStore } from '../../stores/dashboardStore'
import { CELL_TYPES, type LayoutItem, type CellType } from '../../dashboards/base'
import { getProvenance, type Provenance } from '../../dashboards/provenance'
import DashboardChart from './DashboardChart.vue'
import DashboardTable from './DashboardTable.vue'
import DashboardMarkdown from './DashboardMarkdown.vue'
import DashboardFilter from './DashboardFilter.vue'
import DashboardMemo from './DashboardMemo.vue'
import DashboardClaim from './DashboardClaim.vue'
import DashboardAppendixHeader from './DashboardAppendixHeader.vue'
import DashboardProvenance from './DashboardProvenance.vue'
import DashboardChatPanel from './DashboardChatPanel.vue'
import DashboardAddItemModal from './DashboardAddItemModal.vue'
import ChartEditor from './DashboardChartEditor.vue'
import MarkdownEditor from './DashboardMarkdownEditor.vue'
import type { LLMConnectionStoreType } from '../../stores/llmStore'

interface ReportLayoutProps {
  /** Dashboard id (matches the `name` prop of Dashboard.vue for symmetry). */
  name: string
  connectionId?: string
  viewMode?: boolean
  /** The host app surfaces the report's agent conversation in its own chat
   *  UI (reading the shared chatStore record). Suppresses the embedded chat
   *  sidebar and toggle; the agent engine still runs headless so queued
   *  briefs and CTA submissions execute exactly as in embedded mode. */
  externalChat?: boolean
}

const props = defineProps<ReportLayoutProps>()
const emit = defineEmits<{ fullScreen: [enabled: boolean] }>()

const dashboardStore = useDashboardStore()
const dashboardId = computed(() => props.name)

const dashboard = computed(() => {
  return Object.values(dashboardStore.dashboards).find((d) => d.id === props.name) || null
})

const {
  layout,
  editMode,
  globalCompletion,
  showAddItemModal,
  showQueryEditor,
  showMarkdownEditor,
  editingItem,
  openAddItemModal,
  addItem,
  closeAddModal,
  removeItem,
  saveContent,
  closeEditors,
  toggleMode,
  getDashboardQueryExecutor,
  getItemData,
  setItemData,
  setCrossFilter,
  unSelect,
  updateTitle,
  onLayoutUpdated,
  handleRefresh,
} = useDashboard(
  dashboard,
  {
    connectionId: props.connectionId,
    viewMode: props.viewMode,
    isMobile: false,
  },
  {
    layoutUpdated: (newLayout) => onLayoutUpdated(newLayout),
    dimensionsUpdate: () => {},
    triggerResize: () => {},
    fullScreen: (enabled) => emit('fullScreen', enabled),
  },
)

const llmStore = inject<LLMConnectionStoreType>('llmConnectionStore')
const hasLlmConnection = computed(() => !!llmStore?.activeConnection)

const editable = computed(() => editMode.value && !props.viewMode)
const titleDraft = ref('')
watch(
  () => dashboard.value?.name,
  (n) => {
    titleDraft.value = n || ''
  },
  { immediate: true },
)

function commitTitle() {
  const next = titleDraft.value.trim()
  if (!next || next === dashboard.value?.name) return
  updateTitle(next)
}

function toggleEdit() {
  toggleMode(editable.value ? 'published' : 'editing')
}

const chatOpen = ref(false)
const chatInitialPrompt = ref<string | null>(null)
const briefDraft = ref('')
function toggleChat() {
  chatOpen.value = !chatOpen.value
}
function onCtaSubmit(prompt: string) {
  if (!prompt.trim()) return
  chatInitialPrompt.value = prompt
  chatOpen.value = true
  briefDraft.value = ''
}
watch(
  dashboard,
  (current) => {
    if (!current) return
    const pending = dashboardStore.consumePendingChatPrompt(current.id)
    if (pending) {
      chatInitialPrompt.value = pending
      chatOpen.value = true
    }
  },
  { immediate: true },
)

const ctaPlaceholder =
  "What's the question this report should answer? Examples: 'Why did Q3 revenue slow?', 'Did the new onboarding flow improve activation?'"

const hasContent = computed(() => {
  return Object.keys(dashboard.value?.gridItems || {}).length > 0
})

type BlockKind =
  | 'memo'
  | 'claim'
  | 'evidence'
  | 'table'
  | 'markdown'
  | 'section'
  | 'appendix'
  | 'unknown'

interface ReportBlock {
  layout: LayoutItem
  kind: BlockKind
  component: any
  provenance: Provenance
  showProvenance: boolean
}

function classify(type: CellType): BlockKind {
  switch (type) {
    case CELL_TYPES.MEMO:
      return 'memo'
    case CELL_TYPES.CLAIM:
      return 'claim'
    case CELL_TYPES.CHART:
      return 'evidence'
    case CELL_TYPES.TABLE:
      return 'table'
    case CELL_TYPES.MARKDOWN:
      return 'markdown'
    case CELL_TYPES.SECTION_HEADER:
      return 'section'
    case CELL_TYPES.APPENDIX_HEADER:
      return 'appendix'
    case CELL_TYPES.FILTER:
      return 'unknown'
    default:
      return 'unknown'
  }
}

function componentFor(type: CellType) {
  switch (type) {
    case CELL_TYPES.MEMO:
      return DashboardMemo
    case CELL_TYPES.CLAIM:
      return DashboardClaim
    case CELL_TYPES.CHART:
      return DashboardChart
    case CELL_TYPES.TABLE:
      return DashboardTable
    case CELL_TYPES.MARKDOWN:
      return DashboardMarkdown
    case CELL_TYPES.FILTER:
      return DashboardFilter
    case CELL_TYPES.APPENDIX_HEADER:
      return DashboardAppendixHeader
    case CELL_TYPES.SECTION_HEADER:
      return null // rendered inline as a divider
    default:
      return null
  }
}

const blocks = computed<ReportBlock[]>(() => {
  const dash = dashboard.value
  if (!dash) return []
  // Sort by y first (then x) to honor the y-position the agent sets.
  // Then promote the memo to the very top (ignores its layout y) and push
  // appendix-header + everything below it to the bottom.
  const sorted = [...layout.value].sort((a, b) => a.y - b.y || a.x - b.x)
  const memo: LayoutItem[] = []
  const body: LayoutItem[] = []
  const appendix: LayoutItem[] = []
  let inAppendix = false
  for (const li of sorted) {
    const item = dash.gridItems[li.i]
    if (!item) continue
    if (item.type === CELL_TYPES.MEMO) {
      memo.push(li)
      continue
    }
    if (item.type === CELL_TYPES.APPENDIX_HEADER) {
      inAppendix = true
      appendix.push(li)
      continue
    }
    if (inAppendix) appendix.push(li)
    else body.push(li)
  }
  const ordered = [...memo, ...body, ...appendix]
  const result: ReportBlock[] = []
  for (const li of ordered) {
    const item = dash.gridItems[li.i]
    if (!item) continue
    const kind = classify(item.type as CellType)
    const provenance = getProvenance(li.i, item, dash)
    // Provenance footer rules: every claim/evidence/table gets one. Memo gets
    // one too (confidence rationale lives there). Pure markdown / section /
    // appendix headers don't.
    const showProvenance =
      kind === 'memo' ||
      kind === 'claim' ||
      kind === 'evidence' ||
      kind === 'table' ||
      (kind === 'markdown' && !!provenance.query)
    result.push({
      layout: li,
      kind,
      component: componentFor(item.type as CellType),
      provenance,
      showProvenance,
    })
  }
  return result
})

function getSectionLabel(itemId: string): string {
  const item = dashboard.value?.gridItems[itemId]
  if (!item) return ''
  return (item.name || '').replace(/^#+\s*/, '').trim()
}

function canMoveUp(itemId: string): boolean {
  return blocks.value.findIndex((b) => b.layout.i === itemId) > 0
}
function canMoveDown(itemId: string): boolean {
  const idx = blocks.value.findIndex((b) => b.layout.i === itemId)
  return idx >= 0 && idx < blocks.value.length - 1
}
function moveBlock(itemId: string, direction: 'up' | 'down') {
  const dash = dashboard.value
  if (!dash) return
  const idx = blocks.value.findIndex((b) => b.layout.i === itemId)
  if (idx < 0) return
  const targetIdx = direction === 'up' ? idx - 1 : idx + 1
  if (targetIdx < 0 || targetIdx >= blocks.value.length) return
  // Swap y values — the layout sort keys off y, so this reorders without
  // touching unrelated blocks.
  const a = dash.layout.find((l) => l.i === itemId)
  const b = dash.layout.find((l) => l.i === blocks.value[targetIdx].layout.i)
  if (!a || !b) return
  const ay = a.y
  a.y = b.y
  b.y = ay
  // Persist via store action so changed flag is set.
  dashboardStore.updateDashboardLayout(dash.id, [...dash.layout])
}

function confirmRemove(itemId: string) {
  const item = dashboard.value?.gridItems[itemId]
  const name = item?.name || `Item ${itemId}`
  if (confirm(`Remove "${name}" from the report?`)) {
    removeItem(itemId)
  }
}

function onAddItem(type: CellType) {
  addItem(type)
}

function onSaveContent(content: any) {
  saveContent(content)
}

function handleRefreshItem(itemId: string): string | undefined {
  return handleRefresh(itemId)
}
</script>

<style scoped>
.report-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  background: var(--bg, #f6f8fb);
  color: var(--fg, #1f2937);
  overflow: hidden;
}

.report-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 28px;
  border-bottom: 1px solid var(--border, #d6dde6);
  background: var(--bg, #ffffff);
  flex-shrink: 0;
}

.report-title-block {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.report-eyebrow {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted, #64748b);
}

.report-title {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin: 0;
  line-height: 1.2;
  color: var(--fg, #0f172a);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.report-title-input {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.02em;
  background: transparent;
  border: none;
  border-bottom: 1px dashed transparent;
  padding: 0 0 2px;
  color: var(--fg, #0f172a);
  outline: none;
  width: 100%;
}
.report-title-input:hover,
.report-title-input:focus {
  border-bottom-color: var(--accent, #2563eb);
}

.report-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.report-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 11px;
  font-size: 12px;
  font-weight: 600;
  border-radius: 8px;
  border: 1px solid var(--border, #d6dde6);
  background: var(--bg, #ffffff);
  color: var(--fg, #1f2937);
  cursor: pointer;
}
.report-btn:hover {
  background: rgba(127, 127, 127, 0.06);
}
.report-btn-active {
  background: rgba(59, 130, 246, 0.1);
  border-color: rgba(59, 130, 246, 0.45);
  color: var(--accent, #2563eb);
}

.report-body {
  flex: 1;
  display: flex;
  min-height: 0;
  overflow: hidden;
}

.report-flow {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 28px max(28px, calc((100% - 880px) / 2));
  overflow-y: auto;
  min-width: 0;
}

.report-block {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.report-block-memo {
  margin-bottom: 18px;
}

.report-block-claim {
  /* Pull adjacent evidence chart visually closer */
  margin-bottom: -6px;
}
.report-block-claim + .report-block-evidence {
  margin-top: 0;
}

.report-block-evidence,
.report-block-table {
  /* Charts and tables need a real height to render — they normally live in a
   * grid item that gives them their box. In report flow we set a sensible
   * default here. */
  min-height: 320px;
}
.report-block-evidence > :first-child,
.report-block-table > :first-child {
  min-height: 320px;
  height: 360px;
  background: var(--bg, #ffffff);
  border-radius: 12px;
  box-shadow: inset 0 0 0 1px var(--border, #d6dde6);
  overflow: hidden;
  position: relative;
  display: flex;
  flex-direction: column;
}

.report-block-markdown > :first-child {
  background: var(--bg, #ffffff);
  border-radius: 12px;
  box-shadow: inset 0 0 0 1px var(--border, #d6dde6);
  padding: 14px 22px;
}

.report-section-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 0;
}
.report-section-header::before,
.report-section-header::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--border, #d6dde6);
}
.report-section-label {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--muted, #64748b);
}

.report-block-actions {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s ease;
}
.report-block:hover .report-block-actions {
  opacity: 1;
}
.block-action {
  width: 26px;
  height: 26px;
  border-radius: 6px;
  border: 1px solid var(--border, #d6dde6);
  background: var(--bg, #ffffff);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.block-action:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.block-action.danger:hover {
  background: #fef2f2;
  border-color: #fecaca;
  color: #b91c1c;
}

.report-empty-state {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 32px 28px;
  background: var(--bg, #ffffff);
  border-radius: 14px;
  box-shadow: inset 0 0 0 1px var(--border, #d6dde6);
}
.empty-headline {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.empty-sub {
  margin: 0;
  color: var(--muted, #64748b);
  font-size: 14px;
  line-height: 1.5;
  max-width: 60ch;
}
.empty-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.empty-input {
  width: 100%;
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid var(--border, #d6dde6);
  font-family: inherit;
  font-size: 14px;
  resize: vertical;
  background: var(--bg, #ffffff);
  color: var(--fg, #1f2937);
}
.empty-input:focus {
  outline: none;
  border-color: var(--accent, #2563eb);
}
.empty-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.empty-warn {
  font-size: 12px;
  color: #b45309;
}

.report-add-rail {
  display: flex;
  justify-content: center;
  padding: 18px 0 32px;
}
.report-add-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 999px;
  border: 1px dashed var(--border, #d6dde6);
  background: transparent;
  color: var(--muted, #64748b);
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
}
.report-add-btn:hover {
  border-color: var(--accent, #2563eb);
  color: var(--accent, #2563eb);
}

.report-chat {
  width: 420px;
  flex-shrink: 0;
  border-left: 1px solid var(--border, #d6dde6);
  background: var(--bg, #ffffff);
  display: flex;
}

.icon {
  font-size: 14px;
}
</style>
