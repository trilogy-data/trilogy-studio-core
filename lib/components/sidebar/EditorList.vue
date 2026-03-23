<template>
  <sidebar-list title="Editors">
    <template #header>
      <div class="editors-header-row">
        <h3 v-if="!isMobile" class="font-sans sidebar-header">Editors</h3>
        <button
          class="sidebar-control-button sidebar-header-action"
          @click="creatorVisible = !creatorVisible"
          :data-testid="testTag ? `editor-creator-add-${testTag}` : 'editor-creator-add'"
        >
          <i class="mdi mdi-plus"></i>
          {{ creatorVisible ? 'Close' : 'New' }}
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
      @refresh-store="refreshStore"
    />

    <ConfirmDialog
      :show="showDeleteConfirmationState"
      title="Confirm Deletion"
      message="Are you sure you want to delete this editor? Contents cannot be recovered."
      confirm-label="Delete"
      cancel-test-id="cancel-editor-deletion"
      confirm-test-id="confirm-editor-deletion"
      @close="cancelDelete"
      @confirm="confirmDelete"
    />
  </sidebar-list>
</template>

<script lang="ts">
import { inject, ref, computed, onMounted, onBeforeUnmount } from 'vue'
import type { EditorStoreType } from '../../stores/editorStore'
import type { ConnectionStoreType } from '../../stores/connectionStore'
import type { ModelConfigStoreType } from '../../stores/modelStore'
import { useCommunityApiStore, useJobsApiStore } from '../../stores'
import EditorCreatorInline from '../editor/EditorCreatorInline.vue'
import SidebarList from './SidebarList.vue'
import LoadingButton from '../LoadingButton.vue'
import { EditorTag } from '../../editors'
import type { Editor } from '../../editors'
import { getDefaultValueFromHash } from '../../stores/urlStore'
import { buildEditorTree } from '../../editors'
import EditorListItem from './EditorListItem.vue'
import ConfirmDialog from '../ConfirmDialog.vue'
import { useConfirmationState } from '../useConfirmationState'
import type Storage from '../../data/storage'
import type RemoteStoreStorage from '../../data/remoteStoreStorage'
import { removeRemoteStoreFromIde, syncRemoteStoreIntoIde } from '../../remotes/remoteStoreSync'

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
    const communityStore = useCommunityApiStore()
    const jobsStore = useJobsApiStore()
    const editorStore = inject<EditorStoreType>('editorStore')
    const connectionStore = inject<ConnectionStoreType>('connectionStore')
    const modelStore = inject<ModelConfigStoreType>('modelStore')
    const storageSources = inject<Storage[]>('storageSources', [])
    const isMobile = inject<boolean>('isMobile', false)
    if (!editorStore || !connectionStore || !modelStore) {
      throw new Error('Editor store is not provided!')
    }

    const remoteStorage = storageSources.find((source) => source.type === 'remote') as
      | RemoteStoreStorage
      | undefined

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

    const {
      isOpen: showDeleteConfirmationState,
      openConfirmation: showDeleteConfirmation,
      closeConfirmation: cancelDelete,
      confirm: confirmDelete,
    } = useConfirmationState<Editor>((editor) => {
      editor.delete()
    })

    const refreshStore = async (storeId: string) => {
      await jobsStore.fetchFilesForStore(storeId)
      if (!remoteStorage) {
        return
      }

      const targetStore = communityStore.stores.find(
        (store): store is (typeof communityStore.stores)[number] & { type: 'generic' } =>
          store.type === 'generic' && store.id === storeId,
      )
      if (!targetStore) {
        return
      }

      removeRemoteStoreFromIde(storeId, editorStore, connectionStore, modelStore)
      await syncRemoteStoreIntoIde(remoteStorage, storeId, editorStore, connectionStore, modelStore)
    }

    return {
      isMobile,
      communityStore,
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
      showDeleteConfirmationState,
      showDeleteConfirmation,
      cancelDelete,
      confirmDelete,
      refreshStore,
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
    ConfirmDialog,
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

.editors-header-row .sidebar-header {
  margin: 0;
  min-width: 0;
}

.tag-filter-dropdown {
  position: relative;
  width: fit-content;
  max-width: 100%;
}

.tag-filter-button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 26px;
  padding: 0 9px;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-faint);
  background-color: transparent;
  border: 1px solid var(--border-light);
  border-radius: 7px;
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
  padding: 6px;
  background-color: var(--query-window-bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: var(--surface-shadow);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.tag-filter-option {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 24px;
  padding: 0 6px;
  border-radius: 6px;
  color: var(--text-color);
  cursor: pointer;
  font-size: 11px;
}

.tag-filter-option:hover {
  background-color: var(--button-mouseover);
}

.tag-filter-option input {
  margin: 0;
}
</style>
