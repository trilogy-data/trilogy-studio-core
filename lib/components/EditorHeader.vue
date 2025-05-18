<template>
  <div class="menu-bar">
    <div class="menu-left">
      <div class="menu-title" @click="startEditing">
        <span v-if="!isEditing" class="editable-text">
          {{ name }}
          <span class="edit-indicator" data-testid="edit-editor-name">✎</span>
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
      <button
        v-if="editorType === 'sql'"
        class="toggle-button tag-inactive action-item"
        :class="{ tag: tags.includes(EditorTag.STARTUP_SCRIPT) }"
        @click="$emit('toggle-tag', EditorTag.STARTUP_SCRIPT)"
        data-testid="editor-set-startup-script"
      >
        {{ tags.includes(EditorTag.STARTUP_SCRIPT) ? 'Is' : 'Set as' }} Startup Script
      </button>
      <loading-button
        v-if="editorType !== 'sql' && connectionHasModel"
        class="toggle-button tag-inactive action-item"
        :class="{ tag: tags.includes(EditorTag.SOURCE) }"
        :action="() => $emit('toggle-tag', EditorTag.SOURCE)"
        data-testid="editor-set-source"
      >
        {{ tags.includes(EditorTag.SOURCE) ? 'Is' : 'Set as' }} Source
      </loading-button>
      <button class="action-item" @click="$emit('save')">Save</button>
      <loading-button
        v-if="editorType !== 'sql'"
        :useDefaultStyle="false"
        class="action-item"
        :action="() => $emit('validate')"
        >Parse
      </loading-button>
      <loading-button
        v-if="editorType !== 'sql'"
        :useDefaultStyle="false"
        class="action-item"
        :action="() => $emit('generate')"
        data-testid="editor-generate-button"
        >Generate
      </loading-button>
      <button
        @click="() => (loading ? $emit('cancel') : $emit('run'))"
        class="action-item"
        :class="{ 'button-cancel': loading }"
        data-testid="editor-run-button"
      >
        {{ loading ? 'Cancel' : 'Run' }}
      </button>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import LoadingButton from './LoadingButton.vue'
import { EditorTag } from '../editors'

export default defineComponent({
  name: 'EditorHeader',
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
  emits: ['name-update', 'save', 'validate', 'run', 'cancel', 'toggle-tag', 'generate'],
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
  background-color: var(--sidebar-bg);
  display: flex;
  flex-shrink: 0;
  flex-direction: row;
  gap: 0.5rem;
  padding: 0.25rem;
  justify-content: space-between;
  padding-right: 0.5rem;
  height: 40px;
}

.menu-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.15rem;
  align-items: center;
  flex-grow: 1;
}

.action-item {
  height: 25px;
  width: 80px;
  font-weight: 500;
  cursor: pointer;
  border-radius: 0px;
  border: 1px solid var(--border-color);
  cursor: pointer;
  transition:
    background-color 0.3s ease,
    color 0.3s ease;
}

.menu-left {
  display: flex;
  align-items: center;
  gap: 1.5rem;
}

.menu-title {
  font-weight: 500;
  cursor: pointer;
  padding: 0.375rem;
  border-radius: 4px;
  display: flex;
  align-items: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.menu-title:hover .edit-indicator {
  opacity: 1;
}

.editable-text {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.edit-indicator {
  opacity: 0;
  font-size: 0.875rem;
  transition: opacity 0.2s ease;
}

.name-input {
  background: var(--bg-color);
  border: 1px solid #ced4da;
  border-radius: 4px;
  padding: 0.375rem 0.75rem;
  font-size: inherit;
  font-weight: 500;
  width: auto;
  min-width: 200px;
}

.name-input:focus {
  outline: none;
  border-color: #339af0;
  box-shadow: 0 0 0 2px rgba(51, 154, 240, 0.1);
}

.button-cancel {
  background-color: var(--error-color);
  color: white;
  border: 1px solid var(--error-color);
}

.tag {
  font-size: 8px;
  border-radius: 3px;
  padding: 2px;
  background-color: hsl(210, 100%, 50%, 0.25);
  border: 1px solid hsl(210, 100%, 50%, 0.5);
  color: var(--tag-font);
  line-height: 10px;
}

.tag-inactive {
  font-size: 8px;
  border-radius: var(--border-radius);
  padding: 2px;
  color: var(--tag-font);
  line-height: 10px;
}

/* device specific */
@media screen and (max-width: 768px) {
  .menu-bar {
    height: 60px;
    display: block;
  }

  .menu-left {
    justify-content: center;
    width: 100%;
  }

  .menu-actions {
    display: flex;
    justify-content: center;
    flex-wrap: nowrap;
    gap: 0.1rem;
    align-items: center;
    width: 100%;
  }

  .action-item {
    height: 25px;
    flex-grow: 1;
    width: auto;
    font-weight: 500;
    cursor: pointer;
    border-radius: 0px;
    border: 1px solid var(--border);
    cursor: pointer;
    margin-left: 0rem;
    transition:
      background-color 0.3s ease,
      color 0.3s ease;
  }
}
</style>
