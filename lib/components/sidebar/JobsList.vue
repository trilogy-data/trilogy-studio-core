<template>
  <sidebar-list title="Jobs">
    <template #header>
      <div class="jobs-header">
        <h3 class="font-sans sidebar-header">Jobs</h3>
        <button
          class="sidebar-control-button sidebar-header-action sidebar-primary-create"
          @click="showAddStoreModal = true"
        >
          <i class="mdi mdi-plus"></i>
          New
        </button>
      </div>
    </template>

    <div v-if="!genericStores.length" class="empty-state">
      Add a Trilogy local server to browse files and run jobs.
    </div>

    <div v-if="hasErrors" class="error-container">
      <div v-for="store in storesWithErrors" :key="store.id" class="error-item">
        <span class="error-text">{{ store.name }}: {{ jobsStore.errors[store.id] }}</span>
        <button @click="jobsStore.clearStoreError(store.id)" class="clear-error">x</button>
      </div>
    </div>

    <mobile-tree-list
      list-id="jobs"
      ref="mobileTree"
      :items="displayTree"
      id-field="key"
      label-field="label"
      :enabled="isMobile"
      :is-branch="isJobsBranch"
      :is-selectable="isJobsBranch"
      @expand="expandMobileBranch"
      @select="handleItemClick"
    >
      <template #item="{ item }">
        <JobsListItem
          :key="item.key"
          :item="item"
          :is-collapsed="isCollapsed(item.key)"
          :active-jobs-key="activeJobsKey"
          @item-click="handleJobsTreeClick"
          @item-toggle="handleItemToggle"
          @delete-store="showDeleteStoreConfirmation"
          @refresh-store="handleRefreshStore"
        />
      </template>
    </mobile-tree-list>

    <JobsAddStoreModal
      :show="showAddStoreModal"
      @close="showAddStoreModal = false"
      @add="handleAddStoreSubmit"
    />

    <ConfirmDialog
      :show="showDeleteConfirmationState"
      title="Confirm Store Removal"
      message="Remove this jobs store? Imported models remain untouched."
      confirm-label="Remove"
      @close="cancelDeleteStore"
      @confirm="confirmDeleteStore"
    />
  </sidebar-list>
</template>

<script setup lang="ts">
import { computed, inject, onMounted, ref } from 'vue'
import SidebarList from './SidebarList.vue'
import JobsListItem from './JobsListItem.vue'
import JobsAddStoreModal from '../jobs/JobsAddStoreModal.vue'
import ConfirmDialog from '../ConfirmDialog.vue'
import { useCommunityApiStore, useJobsApiStore, useScreenNavigation } from '../../stores'
import { useConfirmationState } from '../useConfirmationState'
import { KeySeparator } from '../../data/constants'
import type { GenericModelStore } from '../../remotes/models'
import { buildJobsTree, type JobsTreeNode } from '../../remotes/jobs'
import { useCollapseState } from './collapseState'
import type Storage from '../../data/storage'
import type RemoteStoreStorage from '../../data/remoteStoreStorage'
import type { EditorStoreType } from '../../stores/editorStore'
import type { ConnectionStoreType } from '../../stores/connectionStore'
import type { ModelConfigStoreType } from '../../stores/modelStore'
import { removeRemoteStoreFromIde, syncRemoteStoreIntoIde } from '../../remotes/remoteStoreSync'
import MobileTreeList from './MobileTreeList.vue'
import { useIsMobile } from '../useIsMobile'

const props = withDefaults(
  defineProps<{
    activeJobsKey?: string
  }>(),
  {
    activeJobsKey: '',
  },
)

const emit = defineEmits<{
  'jobs-key-selected': [key: string]
}>()

const communityStore = useCommunityApiStore()
const jobsStore = useJobsApiStore()
const navigationStore = useScreenNavigation()
const storageSources = inject<Storage[]>('storageSources', [])
const editorStore = inject<EditorStoreType>('editorStore')
const connectionStore = inject<ConnectionStoreType>('connectionStore')
const modelStore = inject<ModelConfigStoreType>('modelStore')
const showAddStoreModal = ref(false)
const isMobile = useIsMobile()
const mobileTree = ref<any>(null)

const remoteStorage = computed(
  () => storageSources.find((source) => source.type === 'remote') as RemoteStoreStorage | undefined,
)

const genericStores = computed(() =>
  communityStore.stores.filter((store): store is GenericModelStore => store.type === 'generic'),
)

const hasErrors = computed(() => genericStores.value.some((store) => !!jobsStore.errors[store.id]))
const storesWithErrors = computed(() =>
  genericStores.value.filter((store) => !!jobsStore.errors[store.id]),
)

// The store above the active file or directory. Directories below it do not
// need listing — they are open by default (see openByDefault).
const activeStoreId = computed(() => {
  const parts = (props.activeJobsKey || '').split(KeySeparator)
  return parts[0] || ''
})

const openByDefault = (key: string) => {
  // Directories open with their store. A jobs store is a shallow tree of
  // scripts, and making someone click through every intermediate directory to
  // reach one is worse than showing the structure at once. This is the one
  // tree here that opens below its root, so it says so explicitly rather than
  // relying on an unseeded map to do it by accident.
  if (key.includes(`${KeySeparator}directory${KeySeparator}`)) return true
  if (activeStoreId.value) return key === activeStoreId.value
  // Nothing active: open a lone store, never an arbitrary one of several.
  return genericStores.value.length === 1 && key === genericStores.value[0].id
}

const { isCollapsed, toggle: toggleKey, open: openKey } = useCollapseState(openByDefault)

const displayTree = computed(() =>
  buildJobsTree(isCollapsed, genericStores.value, jobsStore.filesByStore),
)

const handleAddStoreSubmit = async (store: GenericModelStore) => {
  try {
    await communityStore.addStore(store)
    await jobsStore.fetchFilesForStore(store.id)
    if (remoteStorage.value && editorStore && connectionStore && modelStore) {
      await syncRemoteStoreIntoIde(
        remoteStorage.value,
        store.id,
        editorStore,
        connectionStore,
        modelStore,
      )
    }
    openKey(store.id)
    showAddStoreModal.value = false
  } catch (error) {
    console.error('Failed to add jobs store:', error)
  }
}

const {
  isOpen: showDeleteConfirmationState,
  openConfirmation: showDeleteStoreConfirmation,
  closeConfirmation: cancelDeleteStore,
  confirm: confirmDeleteStore,
} = useConfirmationState<GenericModelStore>((store) => {
  if (editorStore && connectionStore && modelStore) {
    removeRemoteStoreFromIde(store.id, editorStore, connectionStore, modelStore)
  }
  communityStore.removeStore(store.id)
  jobsStore.clearStoreData(store.id)
})

const handleItemClick = (item: JobsTreeNode) => {
  navigationStore.openTab('jobs', null, item.key)
  emit('jobs-key-selected', item.key)
}

const handleItemToggle = (item: JobsTreeNode) => {
  toggleKey(item.key)
}
const isJobsBranch = (item: JobsTreeNode) => ['store', 'directory'].includes(item.type)
const expandMobileBranch = (item: JobsTreeNode) => {
  if (isCollapsed(item.key)) handleItemToggle(item)
}
const handleJobsTreeClick = (item: JobsTreeNode) => {
  if (isMobile.value) mobileTree.value?.openItem(item)
  else handleItemClick(item)
}

const handleRefreshStore = async (storeId: string) => {
  await jobsStore.fetchFilesForStore(storeId)
}

onMounted(async () => {
  communityStore.loadStoresFromStorage()
  await jobsStore.refreshAllStores()
})
</script>

<style scoped>
.jobs-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.jobs-header .sidebar-header {
  margin: 0;
}

.empty-state {
  padding: 12px;
  color: var(--text-faint);
  font-size: 0.9rem;
}

.error-container {
  margin-bottom: 16px;
}

.error-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  margin-bottom: 4px;
  background: #fee2e2;
  border: 1px solid #fca5a5;
  border-radius: 4px;
  font-size: 0.875rem;
}

.error-text {
  color: #dc2626;
  flex: 1;
}

.clear-error {
  background: none;
  border: none;
  color: #dc2626;
  cursor: pointer;
  font-size: 1rem;
}
</style>
