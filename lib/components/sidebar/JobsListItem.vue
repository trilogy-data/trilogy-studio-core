<template>
  <sidebar-item
    :item-id="item.key"
    :name="item.label"
    :indent="item.indent"
    :is-selected="activeJobsKey === item.key"
    :is-collapsible="item.type === 'store' || item.type === 'directory'"
    :is-collapsed="isCollapsed"
    itemType="jobs"
    @click="handleItemClick"
    @toggle="handleToggle"
  >
    <template #icon>
      <i v-if="item.type === 'store'" class="mdi mdi-server-network sidebar-icon"></i>
      <i v-else-if="item.type === 'directory'" class="mdi mdi-folder-outline sidebar-icon"></i>
      <i v-else class="mdi mdi-file-outline sidebar-icon"></i>
    </template>

    <template #extra-content>
      <template v-if="item.type === 'store' && item.store">
        <span class="tag-container">
          <tooltip content="Remove Store" position="left">
            <span
              class="remove-btn hover-icon sidebar-icon-button danger"
              @click.stop="emit('delete-store', item.store)"
            >
              <i class="mdi mdi-trash-can-outline"></i>
            </span>
          </tooltip>
          <tooltip content="Refresh Store" position="left">
            <span
              class="hover-icon sidebar-icon-button"
              @click.stop="emit('refresh-store', item.store.id)"
            >
              <i class="mdi mdi-refresh"></i>
            </span>
          </tooltip>
          <status-icon
            :status="getStoreStatus(item.store.id)"
            :message="getStoreStatusMessage(item.store.id)"
            :test-name="item.store.id"
          />
        </span>
      </template>
    </template>
  </sidebar-item>
</template>

<script setup lang="ts">
import SidebarItem from './GenericSidebarItem.vue'
import StatusIcon from '../StatusIcon.vue'
import Tooltip from '../Tooltip.vue'
import { useJobsApiStore } from '../../stores'
import type { GenericModelStore } from '../../remotes/models'
import type { JobsTreeNode } from '../../remotes/jobs'
import type { Status } from '../StatusIcon.vue'

const props = withDefaults(
  defineProps<{
    item: JobsTreeNode & { store?: GenericModelStore }
    activeJobsKey?: string
    isCollapsed?: boolean
  }>(),
  {
    activeJobsKey: '',
    isCollapsed: false,
  },
)

const emit = defineEmits<{
  'item-click': [item: JobsTreeNode]
  'item-toggle': [item: JobsTreeNode]
  'delete-store': [store: GenericModelStore]
  'refresh-store': [storeId: string]
}>()

const jobsStore = useJobsApiStore()

const handleItemClick = () => {
  emit('item-click', props.item)
}

const handleToggle = () => {
  emit('item-toggle', props.item)
}

const getStoreStatus = (storeId: string): Status => jobsStore.getStoreStatus(storeId) as Status

const getStoreStatusMessage = (storeId: string): string | undefined => {
  const error = jobsStore.errors[storeId]
  if (error) {
    return error
  }

  const status = jobsStore.getStoreStatus(storeId)
  if (status === 'connected') {
    return 'Ready'
  }
  if (status === 'running') {
    return 'Polling active jobs'
  }
  return undefined
}
</script>

<style scoped src="./sidebarItemChrome.css"></style>
<style scoped>
.sidebar-icon {
  padding-right: 6px;
}
</style>
