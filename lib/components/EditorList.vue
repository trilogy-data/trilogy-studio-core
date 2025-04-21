<template>
  <sidebar-list title="Editors">
    <template #actions>
      <div class="button-container">
        <button
          @click="creatorVisible = !creatorVisible"
          :data-testid="testTag ? `editor-creator-add-${testTag}` : 'editor-creator-add'"
        >
          {{ creatorVisible ? 'Hide' : 'New' }}
        </button>
        <loading-button :action="saveEditors" :keyCombination="['control', 's']">
          Save
        </loading-button>
      </div>
      <editor-creator-inline
        :visible="creatorVisible"
        @close="creatorVisible = !creatorVisible"
        :testTag="testTag"
      />
      <span
        v-for="tag in EditorTag"
        :key="tag"
        :class="{ 'tag-excluded': hiddenTags.has(tag) }"
        class="tag"
        @click="toggleTagFilter(tag)"
      >
        {{ formatEditorTag(tag) }} Editors
      </span>
    </template>
    
    <editor-list-item
      v-for="item in contentList"
      :key="item.key"
      :item="item"
      :active-editor="activeEditor"
      :is-collapsed="collapsed[item.key]"
      :is-mobile="isMobile"
      @item-click="clickAction"
      @delete-editor="showDeleteConfirmation"
    />
    
    <div v-if="showDeleteConfirmationState" class="confirmation-overlay" @click.self="cancelDelete">
      <div class="confirmation-dialog">
        <h3>Confirm Deletion</h3>
        <p>Are you sure you want to delete this editor? Contents cannot be recovered.</p>
        <div class="dialog-actions">
          <button class="cancel-btn" data-testid="cancel-editor-deletion" @click="cancelDelete">
            Cancel
          </button>
          <button class="confirm-btn" data-testid="confirm-editor-deletion" @click="confirmDelete">
            Delete
          </button>
        </div>
      </div>
    </div>
  </sidebar-list>
</template>

<script lang="ts">
import { inject, ref, computed, onMounted } from 'vue'
import type { EditorStoreType } from '../stores/editorStore'
import type { ConnectionStoreType } from '../stores/connectionStore'
import EditorCreatorInline from './EditorCreatorInline.vue'
import SidebarList from './SidebarList.vue'
import LoadingButton from './LoadingButton.vue'
import { EditorTag, Editor } from '../editors'
import { getDefaultValueFromHash } from '../stores/urlStore'
import { buildEditorTree } from '../editors'
import EditorListItem from './EditorListItem.vue'

export default {
  name: 'EditorList',
  props: {
    activeEditor: String,
    testTag: {
      type: String,
      default: '',
    },
  },
  setup() {
    const editorStore = inject<EditorStoreType>('editorStore')
    const connectionStore = inject<ConnectionStoreType>('connectionStore')
    const isMobile = inject<boolean>('isMobile', false)
    if (!editorStore || !connectionStore) {
      throw new Error('Editor store is not provided!')
    }

    const collapsed = ref<Record<string, boolean>>({})
    const hiddenTags = ref<Set<string>>(new Set([]))
    const creatorVisible = ref(false)
    const toggleCollapse = (key: string) => {
      if (collapsed.value[key] === undefined) {
        collapsed.value[key] = false
      }
      collapsed.value[key] = !collapsed.value[key]
    }

    const toggleTagFilter = (tag: string) => {
      hiddenTags.value.has(tag) ? hiddenTags.value.delete(tag) : hiddenTags.value.add(tag)
    }
    const current = getDefaultValueFromHash('editor') || ''

    onMounted(() => {
      Object.values(editorStore.editors).forEach((item) => {
        let storageKey = `s-${item.storage}`
        let connectionKey = `c-${item.storage}-${item.connection}`
        if (current === item.id) {
          collapsed.value[storageKey] = false
          collapsed.value[connectionKey] = false
        } else {
          // if it's not in collapsed, default to true
          // but if it is, keep it false if it's false
          if (collapsed.value[storageKey] === undefined) {
            collapsed.value[storageKey] = true
          } else if (collapsed.value[storageKey] === false) {
            collapsed.value[storageKey] = false
          }

          if (collapsed.value[connectionKey] === undefined) {
            collapsed.value[connectionKey] = true
          } else if (collapsed.value[connectionKey] === false) {
            collapsed.value[connectionKey] = false
          }
        }
      })
    })

    const contentList = computed(() => {
      return buildEditorTree(
        Object.values(editorStore.editors),
        collapsed.value,
        hiddenTags.value,
        new Set(
          Object.values(connectionStore.connections)
            .filter((c) => c.connected)
            .map((c) => c.name),
        ),
      )
    })

    return {
      isMobile,
      connectionStore,
      editorStore,
      EditorTag,
      toggleTagFilter,
      contentList,
      toggleCollapse,
      collapsed,
      hiddenTags,
      creatorVisible,
    }
  },
  data() {
    return {
      showDeleteConfirmationState: false,
      editorToDelete: null as string | null,
    }
  },
  methods: {
    formatEditorTag(tag: string) {
      // Split the tag by underscores and convert to array
      const words: string[] = tag.split('_')
      // Capitalize the first letter of each word and join with spaces
      return words
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ')
    },
    showDeleteConfirmation(editor: Editor) {
      this.editorToDelete = editor.id
      this.showDeleteConfirmationState = true
    },
    cancelDelete() {
      this.showDeleteConfirmationState = false
      this.editorToDelete = null
    },
    confirmDelete() {
      if (this.editorToDelete) {
        this.editorStore.editors[this.editorToDelete].deleted = true
        // sync the deletion
        this.saveEditors()
        // and purge
        this.editorStore.removeEditor(this.editorToDelete)
      }
      this.showDeleteConfirmationState = false
      this.editorToDelete = null
    },
    saveEditors() {
      this.$emit('save-editors')
    },
    clickAction(type: string, objectKey: string, key: string) {
      if (type === 'editor') {
        this.$emit('editor-selected', objectKey)
      } else {
        this.toggleCollapse(key)
      }
    },
  },
  components: {
    EditorCreatorInline,
    SidebarList,
    LoadingButton,
    EditorListItem,
  },
}
</script>

<style scoped>
.tag {
  font-size: 8px;
  border-radius: 3px;
  padding: 2px;
  background-color: hsla(210, 100%, 50%, 0.516);
  border: 1px solid hsl(210, 100%, 50%, 0.5);
  color: var(--tag-font);
  line-height: 10px;
  cursor: pointer;
}

.tag-excluded {
  background-color: hsla(0, 0%, 69%, 0.1);
  border: 1px solid hsl(210, 100%, 50%, 0.25);
}

.tag:hover {
  background-color: hsl(210, 100%, 50%, 0.5);
  border: 1px solid hsl(210, 100%, 50%, 0.75);
}

.confirmation-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.confirmation-dialog {
  background-color: white;
  padding: 20px;
  border-radius: 5px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  max-width: 400px;
  width: 100%;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
  gap: 10px;
}

.cancel-btn {
  padding: 8px 16px;
  background-color: #f0f0f0;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.confirm-btn {
  padding: 8px 16px;
  background-color: #dc3545;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}
</style>