<template>
  <sidebar-item
    :item-id="item.key"
    :name="item.label"
    :indent="item.indent"
    :is-selected="activeModel === item.key"
    :is-collapsible="!['model'].includes(item.type)"
    :is-collapsed="isCollapsed"
    :icon="getItemIcon()"
    @click="handleItemClick"
    @toggle="handleToggle"
  >
    <!-- Custom content slot for icons and additional elements -->
    <template #icon>
      <template v-if="item.type === 'root'">
        <i class="mdi mdi-source-repository sidebar-icon"></i>
      </template>
      <template v-else-if="item.type === 'engine'">
        <connection-icon :connection-type="item.label" />
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
        <span class="tag-container hover-icon">
          <!-- Add any root-specific actions here -->
        </span>
      </template>
    </template>
  </sidebar-item>
</template>

<script lang="ts">
import SidebarItem from './GenericSidebarItem.vue'
import ConnectionIcon from './ConnectionIcon.vue'

export default {
  name: 'ModelListItem',
  props: {
    item: {
      type: Object,
      required: true,
    },
    activeModel: {
      type: String,
      default: '',
    },
    isCollapsed: {
      type: Boolean,
      default: false,
    },
    isMobile: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['item-click', 'model-selected', 'model-details', 'item-toggle'],
  setup(props, { emit }) {
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

    return {
      handleItemClick,
      handleToggle,
      getItemIcon,
    }
  },
  components: {
    SidebarItem,
    ConnectionIcon,
  },
}
</script>

<style scoped>
.details-btn {
  margin-left: auto;
  cursor: pointer;
  flex: 1;
}

.tag-container {
  margin-left: auto;
  display: flex;
  padding: 4px;
}

.tag {
  font-size: 7px;
  border-radius: 3px;
  margin: 2px;
  padding: 1px;
  background-color: hsla(210, 100%, 50%, 0.516);
  border: 1px solid hsl(210, 100%, 50%, 0.5);
  color: var(--tag-font);
  line-height: 10px;
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