<template>
  <sidebar-list title="Editors">
    <template #header>
      <div class="editors-header-row">
        <h3 v-if="!isMobile" class="font-sans sidebar-header-local">Editors</h3>
        <button
          class="editors-new-button"
          @click="creatorVisible = !creatorVisible"
          :data-testid="testTag ? `editor-creator-add-${testTag}` : 'editor-creator-add'"
        >
          <i v-if="!creatorVisible" class="mdi mdi-plus"></i>
          {{ creatorVisible ? 'Hide' : 'New' }}
        </button>
      </div>
    </template>
    <template #actions>
      <editor-creator-inline
        :visible="creatorVisible"
        @close="creatorVisible = !creatorVisible"
        :testTag="testTag"
      />
      <div ref="filterDropdown" class="tag-filter-dropdown">
        <button
          class="tag-filter-button"
          type="button"
          @click="filterMenuOpen = !filterMenuOpen"
          :aria-expanded="filterMenuOpen"
        >
          <span class="tag-filter-button-scope">Scope:</span>
          <span class="tag-filter-button-label">{{ filterSummary }}</span>
          <i class="mdi mdi-chevron-down tag-filter-chevron" :class="{ open: filterMenuOpen }"></i>
        </button>

        <div v-if="filterMenuOpen" class="tag-filter-menu">
          <label v-for="tag in EditorTag" :key="tag" class="tag-filter-option">
            <input type="checkbox" :checked="!hiddenTags.has(tag)" @change="toggleTagFilter(tag)" />
            <span>{{ formatEditorTag(tag) }} Editors</span>
          </label>
        </div>
      </div>
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
import { inject, ref, computed, onMounted, onBeforeUnmount } from 'vue'
import type { EditorStoreType } from '../../stores/editorStore'
import type { ConnectionStoreType } from '../../stores/connectionStore'
import EditorCreatorInline from '../editor/EditorCreatorInline.vue'
import SidebarList from './SidebarList.vue'
import LoadingButton from '../LoadingButton.vue'
import { EditorTag, Editor } from '../../editors'
import { getDefaultValueFromHash } from '../../stores/urlStore'
import { buildEditorTree } from '../../editors'
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
    const filterMenuOpen = ref(false)
    const filterDropdown = ref<HTMLElement | null>(null)
    const toggleCollapse = (key: string) => {
      if (collapsed.value[key] === undefined) {
        collapsed.value[key] = false
      }
      collapsed.value[key] = !collapsed.value[key]
    }

    const toggleTagFilter = (tag: string) => {
      hiddenTags.value.has(tag) ? hiddenTags.value.delete(tag) : hiddenTags.value.add(tag)
    }

    const filterSummary = computed(() => {
      const hiddenCount = hiddenTags.value.size
      if (hiddenCount === 0) {
        return 'All editors'
      }
      const visibleTags = Object.values(EditorTag).filter((tag) => !hiddenTags.value.has(tag))
      if (visibleTags.length === 0) {
        return 'No editors'
      }
      if (visibleTags.length === 1) {
        return `${
          visibleTags.map((tag) =>
            tag
              .split('_')
              .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
              .join(' '),
          )[0]
        } only`
      }
      return `${visibleTags.length} types`
    })

    const handleDocumentClick = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (filterDropdown.value && target && !filterDropdown.value.contains(target)) {
        filterMenuOpen.value = false
      }
    }
    const current = getDefaultValueFromHash('editor') || ''

    // Helper function to get all folder paths for an editor
    const getFolderPaths = (editorName: string, storage: string, connection: string): string[] => {
      const pathParts = editorName.split('/')
      const folderPaths: string[] = []

      for (let i = 0; i < pathParts.length - 1; i++) {
        const folderPath = pathParts.slice(0, i + 1).join('/')
        folderPaths.push(`f-${storage}-${connection}-${folderPath}`)
      }

      return folderPaths
    }

    onMounted(() => {
      let anyOpen = false
      const editorsArray = Object.values(editorStore.editors)

      editorsArray.forEach((editor) => {
        const storageKey = `s-${editor.storage}`
        const connectionKey = `c-${editor.storage}-${editor.connection}`
        const folderPaths = getFolderPaths(editor.name, editor.storage, editor.connection)
        if (current === editor.id) {
          // If this is the current editor, open all parent containers
          collapsed.value[storageKey] = false
          collapsed.value[connectionKey] = false
          folderPaths.forEach((folderPath) => {
            collapsed.value[folderPath] = false
          })
          anyOpen = true
        } else {
          // Set default states for storage and connection
          if (collapsed.value[storageKey] === undefined) {
            collapsed.value[storageKey] = true
          }
          if (collapsed.value[connectionKey] === undefined) {
            collapsed.value[connectionKey] = true
          }

          // Set default states for folders (collapsed by default)
          folderPaths.forEach((folderPath) => {
            if (collapsed.value[folderPath] === undefined) {
              collapsed.value[folderPath] = true
            }
          })
        }
      })

      // If no editor is currently selected but we have editors, open the first one's containers
      if (!anyOpen && editorsArray.length > 0) {
        const firstEditor = editorsArray[0]
        const storageKey = `s-${firstEditor.storage}`
        const connectionKey = `c-${firstEditor.storage}-${firstEditor.connection}`
        const folderPaths = getFolderPaths(
          firstEditor.name,
          firstEditor.storage,
          firstEditor.connection,
        )

        collapsed.value[storageKey] = false
        collapsed.value[connectionKey] = false
        folderPaths.forEach((folderPath) => {
          collapsed.value[folderPath] = false
        })
      }

      document.addEventListener('click', handleDocumentClick)
    })

    onBeforeUnmount(() => {
      document.removeEventListener('click', handleDocumentClick)
    })

    const contentList = computed(() => {
      return buildEditorTree(
        Object.values(connectionStore.connections),
        Object.values(editorStore.editors),
        collapsed.value,
        hiddenTags.value,
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
      filterMenuOpen,
      filterDropdown,
      filterSummary,
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
        this.editorStore.editors[this.editorToDelete].delete()
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
        // Handle clicks on storage, connection, or folder items
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
.editors-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.sidebar-header-local {
  font-weight: 600;
  font-size: 16px;
  color: var(--text-color);
  margin: 0;
  min-width: 0;
}

.editors-new-button {
  flex-shrink: 0;
  min-height: var(--sidebar-control-height);
  height: var(--sidebar-control-height);
  padding: 0 12px;
  background-color: transparent;
  border-color: var(--border-light);
  border-radius: var(--sidebar-control-radius);
}

.tag-filter-dropdown {
  position: relative;
  width: fit-content;
  max-width: 100%;
}

.tag-filter-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 0 10px;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-faint);
  background-color: transparent;
  border: 1px solid var(--border-light);
  border-radius: 8px;
  line-height: 1;
}

.tag-filter-button:hover {
  color: var(--text-color);
}

.tag-filter-button-scope {
  color: var(--text-faint);
}

.tag-filter-button-label {
  white-space: nowrap;
  color: var(--text-color);
}

.tag-filter-chevron {
  font-size: 14px;
  transition: transform 0.16s ease;
}

.tag-filter-chevron.open {
  transform: rotate(180deg);
}

.tag-filter-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 20;
  min-width: 180px;
  padding: 8px;
  background-color: var(--query-window-bg);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: var(--surface-shadow);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tag-filter-option {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 28px;
  padding: 0 6px;
  border-radius: 8px;
  color: var(--text-color);
  cursor: pointer;
  font-size: 12px;
}

.tag-filter-option:hover {
  background-color: var(--button-mouseover);
}

.tag-filter-option input {
  margin: 0;
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
  background-color: var(--bg-color);
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
