<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import useEditorStore from '@lib/stores/editorStore'
import LibEditor from '@lib/components/editor/Editor.vue'
import LibResults from '@lib/components/editor/Results.vue'
import LoadingView from '@lib/components/LoadingView.vue'
import MarkdownRenderer from '@lib/components/MarkdownRenderer.vue'

/**
 * Center-pane editor view for a project file. For Trilogy / SQL we mount
 * lib's full Editor.vue (Monaco + run/validate/format/results pane).
 * Markdown renders through lib's MarkdownRenderer with an edit toggle.
 * Other types (csv, python) fall back to a plain textarea — those don't
 * have execution semantics in lib yet.
 *
 * App.vue must `provide()` the stores Editor.vue injects.
 */
const props = defineProps<{ editorId: string }>()
const emit = defineEmits<{ close: [] }>()

const editorStore = useEditorStore()
const editor = computed(() => editorStore.editors[props.editorId] || null)

const useLibEditor = computed(() => {
  const t = editor.value?.type
  return t === 'preql' || t === 'trilogy' || t === 'sql'
})

const isMarkdown = computed(() => editor.value?.type === 'markdown')

// Markdown opens rendered; the pencil toggles into the raw-text editor.
const mdMode = ref<'preview' | 'edit'>('preview')

// Plain-textarea draft for the fallback path. Re-syncs when the file changes.
const draft = ref(editor.value?.contents ?? '')
watch(
  () => props.editorId,
  () => {
    draft.value = editor.value?.contents ?? ''
    mdMode.value = 'preview'
  },
)

let saveTimer: ReturnType<typeof setTimeout> | null = null
function onTextareaInput(e: Event) {
  const value = (e.target as HTMLTextAreaElement).value
  draft.value = value
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    const ed = editor.value
    if (!ed) return
    if (ed.contents !== value) {
      ed.contents = value
      ed.changed = true
    }
  }, 200)
}

const lineCount = computed(() => draft.value.split('\n').length)
const charCount = computed(() => draft.value.length)
</script>

<template>
  <section v-if="editor" class="file-editor">
    <header class="editor-head">
      <button class="back" @click="emit('close')" title="Close">
        <i class="mdi mdi-close" />
      </button>
      <span class="type-badge" :class="`type-${editor.type}`">{{ editor.type }}</span>
      <span class="filename" :title="editor.name">{{ editor.name }}</span>
      <span v-if="!useLibEditor" class="meta">{{ lineCount }} lines · {{ charCount }} chars</span>
      <button
        v-if="isMarkdown"
        class="back"
        @click="mdMode = mdMode === 'preview' ? 'edit' : 'preview'"
        :title="mdMode === 'preview' ? 'Edit markdown source' : 'Preview rendered markdown'"
      >
        <i :class="mdMode === 'preview' ? 'mdi mdi-pencil-outline' : 'mdi mdi-eye-outline'" />
      </button>
    </header>

    <div v-if="useLibEditor" class="lib-editor-stack">
      <div class="editor-region">
        <LibEditor :key="editor.id" context="explorer" :editor-id="editor.id" />
      </div>
      <div v-if="editor.loading || editor.results || editor.error" class="results-region">
        <LoadingView
          v-if="editor.loading"
          :startTime="editor.startTime"
          :cancel="editor.cancelCallback"
        />
        <LibResults
          v-else
          :type="editor.type"
          :results="editor.results"
          :chartConfig="editor.chartConfig"
          :error="editor.error || undefined"
          :connection="editor.connection"
          :generatedSql="editor.generated_sql || undefined"
          :trilogySource="editor.executed_contents || undefined"
        />
      </div>
    </div>
    <div v-else-if="isMarkdown && mdMode === 'preview'" class="markdown-preview">
      <MarkdownRenderer :markdown="draft" />
    </div>
    <textarea
      v-else
      class="editor-textarea"
      :value="draft"
      @input="onTextareaInput"
      spellcheck="false"
      autocomplete="off"
      autocorrect="off"
      autocapitalize="off"
    />
  </section>

  <section v-else class="file-editor missing">
    <header class="editor-head">
      <button class="back" @click="emit('close')" title="Close">
        <i class="mdi mdi-close" />
      </button>
      <span class="filename">File no longer exists</span>
    </header>
  </section>
</template>

<style scoped>
.file-editor {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  border-right: 1px solid var(--border);
  overflow: hidden;
}

.editor-head {
  display: flex;
  align-items: center;
  gap: var(--explorer-header-gap);
  height: var(--explorer-header-height);
  padding: 0 var(--explorer-header-padding-inline);
  border-bottom: 1px solid var(--border);
  background: var(--panel-header-bg);
  flex-shrink: 0;
}

.back {
  border: none;
  background: transparent;
  color: var(--muted);
  font-size: 1rem;
  cursor: pointer;
  padding: 0.15rem 0.4rem;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
}

.back:hover {
  background: rgba(127, 127, 127, 0.12);
  color: var(--fg);
}

.type-badge {
  font-size: 0.6rem;
  text-transform: uppercase;
  font-weight: 700;
  padding: 0.05rem 0.35rem;
  border-radius: 3px;
  letter-spacing: 0.04em;
  background: rgba(127, 127, 127, 0.12);
  color: var(--muted);
}

.type-badge.type-csv {
  background: rgba(234, 88, 12, 0.18);
  color: #ea580c;
}

.type-badge.type-preql,
.type-badge.type-trilogy {
  background: rgba(59, 130, 246, 0.18);
  color: var(--accent);
}

.type-badge.type-sql {
  background: rgba(16, 185, 129, 0.18);
  color: #059669;
}

.type-badge.type-markdown {
  background: rgba(245, 158, 11, 0.18);
  color: #d97706;
}

.type-badge.type-python {
  background: rgba(168, 85, 247, 0.18);
  color: #9333ea;
}

.filename {
  flex: 1;
  font-weight: 500;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.meta {
  font-size: 0.72rem;
  color: var(--muted);
}

.lib-editor-stack {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.editor-region {
  flex: 1 1 60%;
  min-height: 120px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.results-region {
  flex: 1 1 40%;
  min-height: 160px;
  min-width: 0;
  border-top: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.editor-region > :deep(*),
.results-region > :deep(*) {
  flex: 1;
  min-width: 0;
}

.editor-textarea {
  flex: 1;
  width: 100%;
  border: none;
  resize: none;
  padding: 1rem 1.25rem;
  font-family: ui-monospace, SFMono-Regular, 'JetBrains Mono', Menlo, Consolas, monospace;
  font-size: 0.85rem;
  line-height: 1.55;
  background: var(--bg);
  color: var(--fg);
  outline: none;
  tab-size: 2;
}

.markdown-preview {
  flex: 1;
  overflow-y: auto;
  padding: 1.25rem 1.5rem 2rem;
}

.markdown-preview > :deep(*) {
  max-width: 760px;
}

.missing {
  align-items: center;
  justify-content: center;
  color: var(--muted);
}
</style>
