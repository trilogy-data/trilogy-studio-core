<template>
  <sidebar-item
    :item-id="item.key"
    :name="item.label"
    :indent="item.indent"
    :is-selected="activeModel === item.key"
    :is-collapsible="!['model'].includes(item.type)"
    :is-collapsed="isCollapsed"
    :icon="getItemIcon()"
    itemType="community"
    @click="handleItemClick"
    @toggle="handleToggle"
  >
    <!-- Custom content slot for icons and additional elements -->
    <template #icon>
      <template v-if="item.type === 'root'">
        <i class="mdi mdi-source-repository sidebar-icon"></i>
      </template>
      <template v-else-if="item.type === 'engine'">
        <span class="right-pad"><connection-icon :connection-type="item.label" /></span>
      </template>
    </template>

    <!-- Custom content slot for additional info after the name -->
    <template #extra-content>
      <template v-if="item.type === 'model'">
        <span class="tag-container">
          <span v-for="tag in item.model?.tags || []" :key="tag" class="tag">{{ tag }}</span>
        </span>
      </template>
      <template v-else-if="item.type === 'engine'">
        <span class="tag-container hover-icon">
          <!-- Add any engine-specific actions here -->
        </span>
      </template>
      <template v-else-if="item.type === 'root'">
        <span class="tag-container">
          <!-- Only show delete button for non-default stores -->
          <tooltip
            v-if="item.store && !isDefaultStore(item.store)"
            content="Remove Store"
            position="left"
          >
            <span
              class="remove-btn hover-icon"
              @click.stop="emit('delete-store', item.store)"
              :data-testid="`delete-store-${item.store.id}`"
            >
              <i class="mdi mdi-trash-can-outline"></i>
            </span>
          </tooltip>
          <!-- Store status icon should always be visible -->
          <status-icon
            v-if="item.store"
            :status="getStoreStatus(item.store)"
            :message="getStoreStatusMessage(item.store)"
            :test-name="item.store.id"
          />
        </span>
      </template>
    </template>
  </sidebar-item>
</template>

<script setup lang="ts">
import SidebarItem from './GenericSidebarItem.vue'
import ConnectionIcon from './ConnectionIcon.vue'
import StatusIcon from '../StatusIcon.vue'
import Tooltip from '../Tooltip.vue'
import { DEFAULT_GITHUB_STORE } from '../../remotes/models'
import type { AnyModelStore } from '../../remotes/models'
import { useCommunityApiStore } from '../../stores'
import type { Status } from '../StatusIcon.vue'

interface Props {
  item: any
  activeModel?: string
  isCollapsed?: boolean
  isMobile?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  activeModel: '',
  isCollapsed: false,
  isMobile: false,
})

const emit = defineEmits<{
  'item-click': [type: string, key: string, modelRoot: any]
  'model-selected': [model: any, key: string, modelRoot: any]
  'model-details': [model: any]
  'item-toggle': [type: string, key: string, modelRoot: any]
  'delete-store': [store: AnyModelStore]
}>()

const communityStore = useCommunityApiStore()

const handleItemClick = () => {
  if (props.item.type === 'model') {
    // Pass the entire model object for more detailed information
    emit('model-selected', props.item.model, props.item.key, props.item.modelRoot)
  } else {
    // For root and engine types, emit the click to toggle collapse
    emit('item-click', props.item.type, props.item.key, props.item.modelRoot)
  }
}

const handleToggle = () => {
  // Only emit toggle for collapsible items (not models)
  if (!['model'].includes(props.item.type)) {
    emit('item-toggle', props.item.type, props.item.key, props.item.modelRoot)
  }
}

const getItemIcon = () => {
  // Return empty string since we're using custom icon slot
  // The SidebarItem will handle the chevron for collapsible items
  return ''
}

const isDefaultStore = (store: AnyModelStore): boolean => {
  return store.id === DEFAULT_GITHUB_STORE.id
}

const getStoreStatus = (store: AnyModelStore): Status => {
  const status = communityStore.getStoreStatus(store.id)
  return status as Status
}

const getStoreStatusMessage = (store: AnyModelStore): string | undefined => {
  const error = communityStore.errors[store.id]
  if (error) {
    return `Connection failed: ${error}`
  }
  const status = communityStore.getStoreStatus(store.id)
  if (status === 'connected') {
    return 'Connected'
  }
  return undefined
}
</script>

<style scoped>
.details-btn {
  margin-left: auto;
  cursor: pointer;
  flex: 1;
}

.remove-btn {
  margin-left: auto;
  cursor: pointer;
  flex: 1;
}

.tag-container {
  margin-left: auto;
  display: flex;
  padding: 4px;
}
.right-pad {
  padding-right: 5px;
}
.tag {
  font-size: 6px;
  border-radius: 3px;
  margin-left: 2px;
  padding: 2px;
  background-color: hsla(210, 100%, 50%, 0.516);
  border: 1px solid hsl(210, 100%, 50%, 0.5);
  color: var(--tag-font);
  line-height: 9px;
  cursor: pointer;
}

.text-light {
  color: var(--text-faint);
}

.hover-icon {
  opacity: 0;
  transition: opacity 0.2s;
}

.sidebar-icon {
  padding-right: 5px;
}

/* Show hover icons when parent sidebar item is hovered */
:deep(.sidebar-item:hover) .hover-icon {
  opacity: 1;
}
</style>
