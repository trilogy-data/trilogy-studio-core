<template>
  <div class="menu-bar">
    <div class="menu-left">
      <div class="menu-title" @click="startEditing">
        <span v-if="!isEditing" class="editable-text" data-testid="editor-name-display">
          {{ name }}
          <span class="edit-indicator" data-testid="edit-editor-name">
            <i class="mdi mdi-pencil-outline"></i>
          </span>
        </span>
        <input
          v-else
          ref="nameInput"
          data-testid="editor-name-input"
          v-model="editableName"
          @blur="finishEditing"
          @keyup.enter="finishEditing"
          @keyup.esc="cancelEditing"
          class="name-input"
          type="text"
        />
      </div>
    </div>

    <div class="menu-actions">
      <div class="action-group action-group-scope">
        <button
          v-if="editorType === 'sql'"
          class="toggle-button action-item action-item-scope"
          :class="{ 'toggle-on': tags.includes(EditorTag.STARTUP_SCRIPT) }"
          :aria-pressed="tags.includes(EditorTag.STARTUP_SCRIPT)"
          @click="$emit('toggle-tag', EditorTag.STARTUP_SCRIPT)"
          data-testid="editor-set-startup-script"
          title="Run this script on connection startup"
          aria-label="Toggle startup script"
        >
          <span class="toggle-indicator"></span>
          <span class="action-label">Startup</span>
        </button>
        <loading-button
          v-if="supportsEditorSourceTag(editorType) && connectionHasModel"
          :useDefaultStyle="false"
          class="toggle-button action-item action-item-scope"
          :class="{ 'toggle-on': tags.includes(EditorTag.SOURCE) }"
          :aria-pressed="tags.includes(EditorTag.SOURCE)"
          :action="() => $emit('toggle-tag', EditorTag.SOURCE)"
          testId="editor-set-source"
          title="Include this editor as a source model"
          aria-label="Toggle source model"
        >
          <span class="toggle-indicator"></span>
          <span class="action-label">Source</span>
        </loading-button>
      </div>

      <div
        v-if="editorType === 'sql' || (supportsEditorSourceTag(editorType) && connectionHasModel)"
        class="toolbar-divider"
      ></div>

      <div class="action-group">
        <button
          class="action-item action-item-compact"
          @click="$emit('save')"
          data-testid="editor-save-button"
          title="Save editor"
          aria-label="Save editor"
        >
          <i class="mdi mdi-content-save-outline icon"></i>
          <span class="action-label">Save</span>
        </button>
        <loading-button
          v-if="supportsEditorValidation(editorType)"
          :useDefaultStyle="false"
          class="action-item action-item-compact"
          :action="() => $emit('validate')"
          testId="editor-validate-button"
          title="Parse editor"
          aria-label="Parse editor"
        >
          <i class="mdi mdi-code-braces icon"></i>
          <span class="action-label">Parse</span>
        </loading-button>
        <button
          v-if="supportsEditorFormatting(editorType)"
          class="action-item action-item-compact"
          @click="$emit('format')"
          data-testid="editor-format-button"
          title="Format editor"
          aria-label="Format editor"
        >
          <i class="mdi mdi-format-align-left icon"></i>
          <span class="action-label">Format</span>
        </button>
      </div>

      <div v-if="supportsEditorAssistant(editorType)" class="toolbar-divider"></div>

      <div v-if="supportsEditorAssistant(editorType)" class="action-group">
        <loading-button
          :useDefaultStyle="false"
          class="action-item action-item-ai action-item-compact"
          :action="() => $emit('generate')"
          testId="editor-generate-button"
          title="Open AI assistant"
          aria-label="Open AI assistant"
        >
          <i class="mdi mdi-creation-outline icon"></i>
          <span class="action-label">AI</span>
        </loading-button>
      </div>

      <div v-if="supportsEditorLocalExecution(editorType)" class="toolbar-divider"></div>

      <div
        v-if="supportsEditorLocalExecution(editorType)"
        class="action-group action-group-execute"
      >
        <button
          @click="() => (loading ? $emit('cancel') : $emit('run'))"
          class="action-item"
          :class="{ 'button-cancel': loading, 'button-run': !loading }"
          data-testid="editor-run-button"
          :title="loading ? 'Cancel query' : 'Run query'"
          :aria-label="loading ? 'Cancel query' : 'Run query'"
        >
          <i v-if="loading" class="mdi mdi-stop-circle-outline icon"></i>
          <i v-else class="mdi mdi-play-outline icon"></i>
          <span class="action-label">{{ loading ? 'Cancel' : 'Run' }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import LoadingButton from '../LoadingButton.vue'
import { EditorTag } from '../../editors'
import {
  supportsEditorAssistant,
  supportsEditorFormatting,
  supportsEditorLocalExecution,
  supportsEditorSourceTag,
  supportsEditorValidation,
} from '../../editors/fileTypes'

export default defineComponent({
  name: 'EditorHeader',
  setup() {
    return {
      supportsEditorAssistant,
      supportsEditorFormatting,
      supportsEditorLocalExecution,
      supportsEditorSourceTag,
      supportsEditorValidation,
    }
  },
  components: {
    LoadingButton,
  },
  props: {
    name: {
      type: String,
      required: true,
    },
    editorType: {
      type: String,
      required: true,
    },
    tags: {
      type: Array,
      required: true,
    },
    loading: {
      type: Boolean,
      default: false,
    },
    connectionHasModel: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['name-update', 'save', 'validate', 'format', 'run', 'cancel', 'toggle-tag', 'generate'],
  data() {
    return {
      isEditing: false,
      editableName: '',
      EditorTag,
    }
  },
  methods: {
    startEditing() {
      this.isEditing = true
      this.editableName = this.name
      this.$nextTick(() => {
        // @ts-ignore
        this.$refs.nameInput.focus()
      })
    },
    finishEditing() {
      this.isEditing = false
      this.$emit('name-update', this.editableName)
    },
    cancelEditing() {
      this.isEditing = false
    },
  },
})
</script>

<style scoped>
.menu-bar {
  background-color: var(--query-window-bg);
  display: flex;
  flex-shrink: 0;
  gap: 0.35rem;
  padding: 0 6px 0 10px;
  justify-content: space-between;
  min-height: 32px;
  border-bottom: 1px solid var(--border-light);
}

.menu-left {
  display: flex;
  align-items: center;
  min-width: 0;
  flex: 1 1 auto;
}

.menu-title {
  font-weight: 500;
  cursor: pointer;
  padding: 0.25rem 0;
  display: flex;
  align-items: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  width: 100%;
}

.menu-title:hover .edit-indicator {
  opacity: 1;
}

.editable-text {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  overflow: hidden;
  min-width: 0;
}

.edit-indicator {
  opacity: 0;
  font-size: 13px;
  transition: opacity 0.2s ease;
  flex-shrink: 0;
}

.name-input {
  background: var(--bg-color);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.3rem 0.6rem;
  font-size: inherit;
  font-weight: 500;
  width: auto;
  min-width: 100%;
  color: var(--text-color);
}

.name-input:focus {
  outline: none;
  border-color: rgba(var(--special-text-rgb, 37, 99, 235), 0.45);
  box-shadow: 0 0 0 3px rgba(var(--special-text-rgb, 37, 99, 235), 0.08);
}

.menu-actions {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
  align-items: center;
  flex-grow: 1;
  min-width: 0;
  flex-wrap: wrap;
}

.action-group {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.action-group-scope {
  margin-right: 2px;
}

.action-group-execute {
  margin-left: 2px;
}

.toolbar-divider {
  width: 1px;
  height: 14px;
  background: var(--border-light);
  flex-shrink: 0;
}

/* Buttons are targeted via `.menu-actions :deep(...)`: LoadingButton is a
   multi-root component, so its root <button> never receives this component's
   scope attribute and plain scoped selectors miss it — heights drift apart. */
.menu-actions :deep(.action-item) {
  min-height: 24px;
  height: 24px;
  width: auto;
  min-width: 0;
  padding: 0 9px;
  margin: 0;
  font-weight: 500;
  font-size: 12px;
  line-height: 1;
  box-sizing: border-box;
  cursor: pointer;
  transition:
    background-color 0.18s ease,
    color 0.18s ease,
    border-color 0.18s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.3rem;
  border-radius: 6px;
  border: 1px solid var(--border-light);
  background: transparent;
  color: var(--text-color);
  white-space: nowrap;
}

/* LoadingButton wraps slot content in a span, so the button's flex gap
   doesn't reach the icon/label — restore the same layout inside it */
.menu-actions :deep(.contents) {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}

.action-label {
  display: inline;
}

.menu-actions :deep(.action-item:hover) {
  background: var(--button-mouseover);
}

.menu-actions :deep(.action-item-scope) {
  padding: 0 10px;
  font-size: 11px;
  color: var(--text-faint);
}

.menu-actions :deep(.action-item.toggle-button) {
  border-radius: 999px;
}

.toggle-indicator {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--border);
  flex-shrink: 0;
  transition: background-color 0.18s ease;
}

.menu-actions :deep(.toggle-on) {
  background-color: rgba(var(--special-text-rgb, 37, 99, 235), 0.08);
  border-color: rgba(var(--special-text-rgb, 37, 99, 235), 0.26);
  color: var(--special-text);
}

.toggle-on .toggle-indicator {
  background: var(--special-text);
}

.menu-actions :deep(.action-item-ai) {
  color: var(--special-text);
  border-color: rgba(var(--special-text-rgb, 37, 99, 235), 0.16);
  background: rgba(var(--special-text-rgb, 37, 99, 235), 0.025);
}

.icon {
  font-size: 14px;
}

.menu-actions :deep(.button-cancel) {
  background-color: var(--error-color);
  color: white;
  border: 1px solid var(--error-color);
}

.menu-actions :deep(.button-run) {
  background-color: var(--special-text);
  color: white;
  border: 1px solid var(--special-text);
}

.menu-actions :deep(.button-run:hover) {
  background-color: rgba(var(--special-text-rgb, 37, 99, 235), 0.92);
  border-color: rgba(var(--special-text-rgb, 37, 99, 235), 0.92);
  box-shadow: 0 0 0 3px rgba(var(--special-text-rgb, 37, 99, 235), 0.12);
}

.menu-actions :deep(.button-cancel:hover) {
  filter: brightness(0.96);
}

@media screen and (max-width: 768px) {
  .menu-bar {
    min-height: 0;
    display: flex;
    padding: 6px;
  }

  .menu-left {
    display: none;
  }

  .menu-actions {
    display: flex;
    justify-content: flex-start;
    flex-wrap: nowrap;
    gap: 6px;
    align-items: stretch;
    width: 100%;
    overflow-x: auto;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
  }

  .menu-actions::-webkit-scrollbar {
    display: none;
  }

  .action-group {
    gap: 6px;
  }

  .menu-actions :deep(.action-item) {
    min-height: 40px;
    height: 40px;
    padding: 0 10px;
    border-radius: 10px;
  }

  .menu-actions :deep(.action-item.toggle-button) {
    border-radius: 999px;
  }

  .menu-actions :deep(.action-item-compact) {
    width: 40px;
    min-width: 40px;
    padding: 0;
    gap: 0;
  }

  .menu-actions :deep(.action-item-compact .action-label) {
    display: none;
  }

  .menu-actions :deep(.action-item-scope) {
    width: auto;
    min-width: 0;
    padding: 0 10px;
  }

  .action-group-execute {
    margin-left: auto;
  }

  .menu-actions :deep(.action-group-execute .action-item) {
    min-width: 72px;
    padding: 0 14px;
  }

  .menu-actions :deep(.action-group-execute .action-label) {
    display: inline;
  }

  .toolbar-divider {
    display: none;
  }
}

@media screen and (max-width: 520px) {
  .menu-bar {
    padding: 5px 4px;
  }

  .menu-title {
    padding: 0.15rem 0;
  }

  .menu-actions :deep(.action-item) {
    min-height: 38px;
    height: 38px;
  }

  .menu-actions :deep(.action-item-compact) {
    width: 38px;
    min-width: 38px;
  }

  .menu-actions :deep(.action-group-execute .action-item) {
    min-width: 68px;
  }
}
</style>
