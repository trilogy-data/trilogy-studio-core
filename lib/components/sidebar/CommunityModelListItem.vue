<template>
  <div :class="{
    'sidebar-item': true,
    'sidebar-item-selected': activeModel === item.key,
  }" @click="handleItemClick"
  :data-testid="item.key"
  >
    <div v-for="_ in item.indent" class="sidebar-padding"></div>

    <i v-if="!['model'].includes(item.type)" :class="isCollapsed ? 'mdi mdi-menu-right' : 'mdi mdi-menu-down'"></i>

    <template v-if="item.type === 'root'">
      <i class="mdi mdi-source-repository sidebar-icon"></i>

    </template>
    <template v-else-if="item.type === 'engine'">
      <connection-icon :connection-type="item.label" />
    </template>
    <!-- <template v-else-if="item.type === 'model'">
      <i class="mdi mdi-sitemap-outline sidebar-icon"></i>
    </template> -->

    <span class="truncate-text title">
      {{ item.label }}

      <!-- <span class="text-light" v-if="item.type === 'model' && item.model?.description">
        ({{ item.model.description }})
      </span> -->
    </span>

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
    <!-- 
    <tooltip v-if="item.type === 'model'" :content="item.model.description" position="bottom">

      <span
        class="details-btn hover-icon"
        @click.stop="$emit('model-details', item.model)"
        :data-testid="`model-details-${item.label}`"
      >
        <i class="mdi mdi-information-outline"></i>
      </span>
    </tooltip> -->
  </div>
</template>

<script lang="ts">
import Tooltip from '../Tooltip.vue'
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
  emits: ['item-click', 'model-selected', 'model-details'],
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

    return {
      handleItemClick,
    }
  },
  components: {
    Tooltip,
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

.sidebar-item {
  display: flex;
  align-items: center;
  cursor: pointer;
  width: 100%;
}


.sidebar-item:hover .hover-icon {
  opacity: 1;
}

.sidebar-padding {
  width: 16px;
  flex-shrink: 0;
}

.title {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding-left: 3px;
}
</style>