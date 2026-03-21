<template>
  <sidebar-list title="Jobs">
    <template #header>
      <div class="jobs-header">
        <h3 class="font-sans sidebar-header">Jobs</h3>
        <button class="sidebar-control-button sidebar-header-action" @click="showAddStoreModal = true">
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

    <JobsListItem
      v-for="item in displayTree"
      :key="item.key"
      :item="item"
      :is-collapsed="collapsed[item.key]"
      :active-jobs-key="activeJobsKey"
      @item-click="handleItemClick"
      @item-toggle="handleItemToggle"
      @delete-store="showDeleteStoreConfirmation"
      @refresh-store="handleRefreshStore"
    />

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
import { computed, onMounted, ref } from 'vue'
import SidebarList from './SidebarList.vue'
import JobsListItem from './JobsListItem.vue'
import JobsAddStoreModal from '../jobs/JobsAddStoreModal.vue'
import ConfirmDialog from '../ConfirmDialog.vue'
import { useCommunityApiStore, useJobsApiStore, useScreenNavigation } from '../../stores'
import { useConfirmationState } from '../useConfirmationState'
import { KeySeparator } from '../../data/constants'
import type { GenericModelStore } from '../../remotes/models'
import type { JobsTreeNode, StoreDirectoryListing } from '../../remotes/jobs'

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
const collapsed = ref<Record<string, boolean>>({})
const showAddStoreModal = ref(false)

const genericStores = computed(() =>
  communityStore.stores.filter((store): store is GenericModelStore => store.type === 'generic'),
)

const hasErrors = computed(() => genericStores.value.some((store) => !!jobsStore.errors[store.id]))
const storesWithErrors = computed(() =>
  genericStores.value.filter((store) => !!jobsStore.errors[store.id]),
)

const buildDirectoryKey = (storeId: string, directory: string) =>
  `${storeId}${KeySeparator}directory${KeySeparator}${encodeURIComponent(directory)}`

const buildFileKey = (storeId: string, target: string) =>
  `${storeId}${KeySeparator}file${KeySeparator}${encodeURIComponent(target)}`

const expandAncestors = (key: string) => {
  const parts = key.split(KeySeparator)
  if (!parts.length) {
    return
  }

  collapsed.value[parts[0]] = false
  if (parts[1] === 'file') {
    const target = decodeURIComponent(parts[2] || '')
    if (target.includes('/')) {
      const directory = target.split('/').slice(0, -1).join('/')
      collapsed.value[buildDirectoryKey(parts[0], directory)] = false
    }
  }
}

const buildTreeForStore = (store: GenericModelStore): Array<JobsTreeNode & { store?: GenericModelStore }> => {
  const tree: Array<JobsTreeNode & { store?: GenericModelStore }> = [
    {
      type: 'store',
      label: store.name,
      key: store.id,
      indent: 0,
      storeId: store.id,
      store,
    },
  ]

  if (collapsed.value[store.id]) {
    return tree
  }

  const filesResponse = jobsStore.filesByStore[store.id]
  const directories = filesResponse?.directories || []
  const rootDirectory = directories.find((entry) => entry.directory === '')
  const nestedDirectories = directories
    .filter((entry) => entry.directory !== '')
    .sort((left, right) => left.directory.localeCompare(right.directory))

  const pushFiles = (files: string[], directory: string, indent: number) => {
    files
      .slice()
      .sort((left, right) => left.localeCompare(right))
      .forEach((fileName) => {
        const target = directory ? `${directory}/${fileName}` : fileName
        tree.push({
          type: 'file',
          label: fileName,
          key: buildFileKey(store.id, target),
          indent,
          storeId: store.id,
          target,
        })
      })
  }

  if (rootDirectory) {
    pushFiles(rootDirectory.files, '', 1)
  }

  nestedDirectories.forEach((directoryEntry: StoreDirectoryListing) => {
    const directoryKey = buildDirectoryKey(store.id, directoryEntry.directory)
    tree.push({
      type: 'directory',
      label: directoryEntry.directory,
      key: directoryKey,
      indent: 1,
      storeId: store.id,
      target: directoryEntry.directory,
    })

    if (!collapsed.value[directoryKey]) {
      pushFiles(directoryEntry.files, directoryEntry.directory, 2)
    }
  })

  return tree
}

const displayTree = computed(() => genericStores.value.flatMap((store) => buildTreeForStore(store)))

const handleAddStoreSubmit = async (store: GenericModelStore) => {
  try {
    await communityStore.addStore(store)
    await jobsStore.fetchFilesForStore(store.id)
    collapsed.value[store.id] = false
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
  communityStore.removeStore(store.id)
  jobsStore.clearStoreData(store.id)
})

const handleItemClick = (item: JobsTreeNode) => {
  navigationStore.openTab('jobs', null, item.key)
  emit('jobs-key-selected', item.key)
}

const handleItemToggle = (item: JobsTreeNode) => {
  collapsed.value[item.key] = !collapsed.value[item.key]
}

const handleRefreshStore = async (storeId: string) => {
  await jobsStore.fetchFilesForStore(storeId)
}

onMounted(async () => {
  communityStore.loadStoresFromStorage()

  genericStores.value.forEach((store) => {
    if (collapsed.value[store.id] === undefined) {
      collapsed.value[store.id] = true
    }
  })

  if (props.activeJobsKey) {
    expandAncestors(props.activeJobsKey)
  } else if (genericStores.value[0]) {
    collapsed.value[genericStores.value[0].id] = false
  }

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
