<template>
  <sidebar-list title="Editors">
    <template #header>
      <div class="editors-header-row">
        <h3 v-if="!isMobile" class="font-sans sidebar-header">Editors</h3>
        <button
          class="sidebar-control-button sidebar-header-action sidebar-primary-create"
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
        @editor-selected="revealEditor"
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

    <mobile-tree-list
      list-id="editors"
      ref="mobileTree"
      :items="contentList"
      id-field="key"
      label-field="label"
      :enabled="isMobile"
      :flat="!!searchQuery"
      :is-branch="isEditorBranch"
      @expand="expandMobileBranch"
      @select="selectMobileItem"
    >
      <template #item="{ item }">
        <editor-list-item
          :item="item"
          :active-editor="activeEditor"
          :is-collapsed="isCollapsed(item.key)"
          :is-mobile="isMobile"
          @item-click="handleTreeItemClick(item)"
          @delete-editor="showDeleteConfirmation"
          @refresh-store="refreshStore"
        />
      </template>
    </mobile-tree-list>

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
import { useCollapseState, EXPAND_ALL } from './collapseState'
import type { EditorStoreType } from '../../stores/editorStore'
import type { ConnectionStoreType } from '../../stores/connectionStore'
import type { ModelConfigStoreType } from '../../stores/modelStore'
import { useCommunityApiStore, useJobsApiStore } from '../../stores'
import EditorCreatorInline from '../editor/EditorCreatorInline.vue'
import SidebarList from './SidebarList.vue'
import LoadingButton from '../LoadingButton.vue'
import { EditorTag } from '../../editors'
import type { Editor } from '../../editors'
import { getDefaultValueFromHash, URL_HASH_KEYS } from '../../stores/urlStore'
import { buildEditorTree } from '../../editors'
import EditorListItem from './EditorListItem.vue'
import ConfirmDialog from '../ConfirmDialog.vue'
import { useConfirmationState } from '../useConfirmationState'
import type Storage from '../../data/storage'
import type RemoteStoreStorage from '../../data/remoteStoreStorage'
import { removeRemoteStoreFromIde, syncRemoteStoreIntoIde } from '../../remotes/remoteStoreSync'
import { useIsMobile } from '../useIsMobile'
import MobileTreeList from './MobileTreeList.vue'

export default {
  name: 'EditorList',
  props: {
    activeEditor: String,
    testTag: {
      type: String,
      default: '',
    },
    mobileSearchQuery: {
      type: String,
      default: '',
    },
  },
  setup(props) {
    const communityStore = useCommunityApiStore()
    const jobsStore = useJobsApiStore()
    const editorStore = inject<EditorStoreType>('editorStore')
    const connectionStore = inject<ConnectionStoreType>('connectionStore')
    const modelStore = inject<ModelConfigStoreType>('modelStore')
    const storageSources = inject<Storage[]>('storageSources', [])
    const isMobile = useIsMobile()
    if (!editorStore || !connectionStore || !modelStore) {
      throw new Error('Editor store is not provided!')
    }

    const remoteStorage = storageSources.find((source) => source.type === 'remote') as
      RemoteStoreStorage | undefined

    const hiddenTags = ref<Set<string>>(new Set([]))
    const creatorVisible = ref(false)
    const filterMenuOpen = ref(false)
    const filterDropdown = ref<HTMLElement | null>(null)

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
    const current = getDefaultValueFromHash(URL_HASH_KEYS.EDITORS) || ''

    // Helper function to get all folder paths for an editor
    const getFolderPaths = (
      editorName: string,
      storage: string,
      connectionKey: string,
    ): string[] => {
      const pathParts = editorName.split('/')
      const folderPaths: string[] = []

      for (let i = 0; i < pathParts.length - 1; i++) {
        const folderPath = pathParts.slice(0, i + 1).join('/')
        folderPaths.push(`f-${storage}-${connectionKey}-${folderPath}`)
      }

      return folderPaths
    }

    // Keys that start open. A computed rather than a seeded map, so it re-derives
    // as editors hydrate — see useCollapseState.
    const openContainers = computed(() => {
      const editors = Object.values(editorStore.editors)
      // Live selection first, URL hash only as the pre-hydration fallback. This
      // has to track the selection rather than snapshot it: creating an editor
      // makes it active without touching the hash, and a chain that only ever
      // reflected load-time state would file the new editor into a shut folder.
      const selected = props.activeEditor || current
      const active = selected ? editors.find((editor) => editor.id === selected) : undefined
      if (active) {
        // Reveal the whole chain down to the selected editor.
        const connectionKeyPart = active.connectionId || active.connection
        return new Set([
          `s-${active.storage}`,
          `c-${active.storage}-${connectionKeyPart}`,
          ...getFolderPaths(active.name, active.storage, connectionKeyPart),
        ])
      }

      // Nothing selected: open the storage and connection only when there is
      // exactly one of each, so the sidebar never opens on an arbitrary "first"
      // editor. Folders stay shut — the choice of which one to open would be
      // just as arbitrary.
      const storages = new Set(editors.map((editor) => `s-${editor.storage}`))
      const connections = new Set(
        editors.map((editor) => `c-${editor.storage}-${editor.connectionId || editor.connection}`),
      )
      if (storages.size !== 1 || connections.size !== 1) return new Set<string>()
      return new Set([...storages, ...connections])
    })

    const {
      overrides: collapsed,
      isCollapsed,
      toggle: toggleCollapse,
      open: openKey,
    } = useCollapseState((key) => openContainers.value.has(key))

    // Creating an editor does not select it, so the default-open chain above
    // would not cover it and a new `a/b/c` editor would land inside two shut
    // folders with no feedback that anything happened. Open its chain outright:
    // this is a user action, so it outranks the defaults like any other toggle.
    const revealEditor = (name: string) => {
      const editor = editorStore.getEditorByName(name)
      if (!editor) return
      const connectionKeyPart = editor.connectionId || editor.connection
      openKey(`s-${editor.storage}`)
      openKey(`c-${editor.storage}-${connectionKeyPart}`)
      getFolderPaths(editor.name, editor.storage, connectionKeyPart).forEach(openKey)
    }

    onMounted(() => {
      document.addEventListener('click', handleDocumentClick)
    })

    onBeforeUnmount(() => {
      document.removeEventListener('click', handleDocumentClick)
    })

    const searchQuery = computed(() => props.mobileSearchQuery.trim().toLocaleLowerCase())

    const contentList = computed(() => {
      // While searching, build the tree fully expanded — buildEditorTree prunes
      // the children of collapsed nodes, so filtering the collapsed tree would
      // silently miss every editor inside a closed connection or folder.
      const list = buildEditorTree(
        Object.values(connectionStore.connections),
        Object.values(editorStore.editors),
        // MobileTreeList owns disclosure on mobile and needs the complete flat
        // tree to calculate counts and navigate without expanding desktop rows.
        isMobile.value || searchQuery.value ? EXPAND_ALL : isCollapsed,
        hiddenTags.value,
      )
      if (!searchQuery.value) return list
      // Results are a flat list of matching editors, not a tree slice.
      return list.filter(
        (item) =>
          item.type === 'editor' && item.label.toLocaleLowerCase().includes(searchQuery.value),
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
      searchQuery,
      toggleCollapse,
      collapsed,
      isCollapsed,
      revealEditor,
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
    isEditorBranch(item: any) {
      return !['editor', 'creator'].includes(item.type)
    },
    handleTreeItemClick(item: any) {
      if (this.isMobile) {
        ;(this.$refs.mobileTree as any)?.openItem(item)
      } else {
        this.clickAction(item.type, item.objectKey, item.key)
      }
    },
    expandMobileBranch(item: any) {
      if (this.isCollapsed(item.key)) this.toggleCollapse(item.key)
    },
    selectMobileItem(item: any) {
      this.clickAction(item.type, item.objectKey, item.key)
    },
  },
  components: {
    EditorCreatorInline,
    SidebarList,
    LoadingButton,
    EditorListItem,
    ConfirmDialog,
    MobileTreeList,
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
