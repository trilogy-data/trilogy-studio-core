<script lang="ts" setup>
import { ref, computed, watch } from 'vue'
import SimpleEditor from '../SimpleEditor.vue'
import DashboardEditorDialog from './DashboardEditorDialog.vue'
import { type Import } from '../../stores/resolver'
import type { ContentInput } from '../../stores/resolver'
import type { FreeformData } from '../../dashboards/base'
import { MAX_FREEFORM_HTML_LENGTH, FREEFORM_CDN_ORIGINS } from '../../dashboards/freeform/types'

interface EditorRef {
  getContent: () => string
}

export interface DashboardFreeformEditorProps {
  content: FreeformData | null
  connectionName: string
  imports: Import[]
  rootContent: ContentInput[]
  initialWidth?: number
  initialHeight?: number
}

const props = defineProps<DashboardFreeformEditorProps>()

const emit = defineEmits(['save', 'cancel'])

const contentData = computed<FreeformData>(() => ({
  html: props.content?.html || '',
  query: props.content?.query || '',
}))

const htmlText = ref(contentData.value.html)
const queryEditorContent = ref(contentData.value.query)
const imports = ref(props.imports)
const editor = ref(null as EditorRef | null)
const activeTab = ref('html')

const tooLong = computed(() => htmlText.value.length > MAX_FREEFORM_HTML_LENGTH)

const themeVariables = [
  { name: '--widget-text', description: 'primary text' },
  { name: '--widget-text-muted', description: 'labels, axis text, secondary detail' },
  { name: '--widget-bg', description: 'page background (the frame is transparent by default)' },
  { name: '--widget-surface', description: 'raised or inset surfaces — cards, headers, wells' },
  { name: '--widget-border', description: 'borders; --widget-border-light for subtler dividers' },
  { name: '--widget-accent', description: 'accent color' },
  {
    name: '--widget-accent-rgb',
    description: 'accent as "r, g, b" for rgba(var(--widget-accent-rgb), 0.12) tints',
  },
  { name: '--widget-positive / --widget-negative', description: 'up/down, good/bad' },
  { name: '--widget-series-1 … -6', description: 'categorical palette for multi-series charts' },
  { name: '--widget-font / --widget-font-size', description: 'already applied to body' },
]

watch(
  () => props.content,
  (newContent) => {
    htmlText.value = newContent?.html || ''
    queryEditorContent.value = newContent?.query || ''
  },
)

watch(activeTab, (_, oldTab) => {
  if (oldTab === 'query' && editor.value) {
    queryEditorContent.value = editor.value.getContent()
  }
})

function saveContent(): void {
  if (tooLong.value) return
  if (activeTab.value === 'query' && editor.value) {
    queryEditorContent.value = editor.value.getContent()
  }

  emit('save', {
    html: htmlText.value,
    query: queryEditorContent.value,
  })
}

function cancel(): void {
  emit('cancel')
}

function switchTab(tab: string): void {
  if (activeTab.value === 'query' && editor.value) {
    queryEditorContent.value = editor.value.getContent()
  }
  activeTab.value = tab
}
</script>

<template>
  <DashboardEditorDialog
    :initialWidth="props.initialWidth"
    :initialHeight="props.initialHeight"
    saveLabel="Save Widget"
    saveTestId="save-dashboard-freeform"
    @save="saveContent"
    @cancel="cancel"
  >
    <div class="tab-header">
      <button
        @click="switchTab('html')"
        :class="{ active: activeTab === 'html' }"
        class="tab-button"
      >
        <i class="mdi mdi-code-tags"></i>
        <span>Widget HTML</span>
      </button>
      <button
        @click="switchTab('query')"
        :class="{ active: activeTab === 'query' }"
        class="tab-button"
      >
        <i class="mdi mdi-magnify"></i>
        <span>Data Query</span>
      </button>
      <button @click="switchTab('api')" :class="{ active: activeTab === 'api' }" class="tab-button">
        <i class="mdi mdi-book-open-variant"></i>
        <span>API</span>
      </button>
    </div>

    <div class="editor-body">
      <div v-if="activeTab === 'html'" class="tab-content">
        <div class="editor-help">
          <p>
            Runs in a sandboxed frame with no network access and no access to the rest of the app.
            Use <code>window.trilogy</code> to read data and drive dashboard interaction — see the
            API tab.
          </p>
        </div>
        <textarea
          v-model="htmlText"
          data-testid="freeform-html-editor"
          placeholder="Author a self-contained HTML fragment. Subscribe to trilogy state, render, then call trilogy.ready()."
          class="html-editor"
        ></textarea>
        <div v-if="tooLong" class="editor-warning" data-testid="freeform-too-long">
          Widget HTML is {{ htmlText.length.toLocaleString() }} characters — the limit is
          {{ MAX_FREEFORM_HTML_LENGTH.toLocaleString() }}. Trim it before saving.
        </div>
      </div>

      <div v-if="activeTab === 'query'" class="tab-content">
        <div class="editor-help">
          <p>
            The query runs through the normal dashboard pipeline — global filters and cross-filters
            apply automatically. Its rows are pushed to the widget; the widget never issues queries
            of its own.
          </p>
        </div>
        <SimpleEditor
          class="editor-content"
          :initContent="queryEditorContent"
          :connectionName="connectionName"
          :imports="imports"
          :rootContent="rootContent"
          ref="editor"
        />
      </div>

      <div v-if="activeTab === 'api'" class="tab-content api-tab">
        <h4>window.trilogy</h4>
        <dl>
          <dt><code>subscribe(fn)</code></dt>
          <dd>
            Called with the current state and on every change. Returns an unsubscribe function.
            State is
            <code>{ status, columns, rows, rowCount, truncated, filters, error }</code>.
          </dd>

          <dt><code>ready()</code></dt>
          <dd>
            Call once the widget has rendered. Required — without it the cell reports a failure.
          </dd>

          <dt><code>filters.eq(field, value)</code></dt>
          <dd>
            Cross-filter the dashboard on a single value, like clicking a chart mark. Pass the
            column name as it appears in <code>rows</code>; the host resolves it to the underlying
            concept address.
          </dd>

          <dt><code>filters.set(map)</code> / <code>filters.append(map)</code></dt>
          <dd>
            Map of field →
            <code>{ op: 'eq' | 'in' | 'range' | 'is_null', value }</code>. Fields must be concepts
            the dashboard exposes; anything else is ignored.
          </dd>

          <dt><code>filters.clear()</code></dt>
          <dd>Drop this widget's cross-filter selection.</dd>

          <dt><code>refresh()</code></dt>
          <dd>Re-run the backing query.</dd>

          <dt><code>resize(px)</code></dt>
          <dd>Request a frame height in pixels.</dd>

          <dt><code>theme</code></dt>
          <dd><code>{ mode, vars }</code> — see the theme contract below.</dd>

          <dt><code>log(...)</code></dt>
          <dd>Forwarded to the host console, prefixed with the item id.</dd>
        </dl>

        <h4>Theme contract</h4>
        <p class="api-note">
          These custom properties are set on <code>:root</code> inside the frame and re-pushed when
          the user switches light/dark. Use them for every color — a widget with hardcoded colors
          breaks in the other mode.
        </p>
        <ul class="theme-list">
          <li v-for="variable in themeVariables" :key="variable.name">
            <code>{{ variable.name }}</code> — {{ variable.description }}
          </li>
        </ul>

        <h4>Sandbox limits</h4>
        <ul>
          <li>No network: <code>fetch</code>, XHR, and remote images are blocked.</li>
          <li>No storage: <code>localStorage</code> and cookies are unavailable.</li>
          <li>No access to the parent page, and no popups, forms, or top-level navigation.</li>
          <li>
            Libraries may be loaded from
            <code v-for="origin in FREEFORM_CDN_ORIGINS" :key="origin">{{ origin }}</code
            >.
          </li>
        </ul>
      </div>
    </div>
  </DashboardEditorDialog>
</template>

<style scoped>
.tab-header {
  display: flex;
  gap: 18px;
  padding: 0 2px;
  margin-bottom: 12px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.tab-button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 2px 11px;
  border: none;
  border-bottom: 3px solid transparent;
  border-radius: 0;
  background-color: transparent;
  color: var(--text-color);
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition:
    color 0.18s ease,
    border-color 0.18s ease;
}

.tab-button:hover {
  color: var(--special-text);
}

.tab-button.active {
  border-bottom-color: var(--special-text);
  color: var(--special-text);
}

.editor-body {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.tab-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.editor-help {
  background-color: var(--panel-header-bg);
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  margin-bottom: 12px;
  font-size: 13px;
  color: var(--dashboard-helper-text);
  flex-shrink: 0;
}

.editor-help p {
  margin: 0;
}

.editor-warning {
  margin-top: 8px;
  padding: 8px 12px;
  border-radius: 10px;
  font-size: 13px;
  color: var(--delete-color, #dc2626);
  background-color: rgba(220, 38, 38, 0.08);
  flex-shrink: 0;
}

.html-editor {
  width: 100%;
  flex: 1;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  resize: none;
  background-color: var(--query-window-bg);
  color: var(--query-window-font);
  font-size: var(--font-size);
  line-height: 1.5;
  overflow-y: auto;
  white-space: pre;
}

.html-editor:focus {
  outline: 2px solid var(--special-text);
  outline-offset: -2px;
}

.editor-content {
  height: 100%;
  width: 100%;
  flex: 1;
}

.api-tab {
  overflow-y: auto;
  font-size: 13px;
  line-height: 1.55;
}

.api-tab h4 {
  margin: 12px 0 6px;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--dashboard-helper-text);
}

.api-tab dt {
  margin-top: 10px;
  font-weight: 600;
}

.api-tab dd {
  margin: 2px 0 0 16px;
  color: var(--dashboard-helper-text);
}

.api-tab code {
  padding: 1px 5px;
  border-radius: 6px;
  background-color: var(--panel-header-bg);
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 12px;
}

.api-tab ul {
  margin: 4px 0 0;
  padding-left: 20px;
  color: var(--dashboard-helper-text);
}

.api-note {
  margin: 0 0 6px;
  color: var(--dashboard-helper-text);
}

.theme-list li {
  margin-bottom: 2px;
}

@media screen and (max-width: 768px) {
  .tab-button {
    font-size: 12px;
    padding: 8px 2px 9px;
  }
}
</style>
