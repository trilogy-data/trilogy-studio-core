<template>
  <div
    :class="{
      'sidebar-item': true,
    }"
    @click="handleItemClick"
  >
    <div
      v-for="_ in item.indent"
      class="sidebar-padding"
    ></div>
    <i
      v-if="!['model'].includes(item.type)"
      :class="isCollapsed ? 'mdi mdi-menu-right' : 'mdi mdi-menu-down'"
    >
    </i>

    <span class="truncate-text">
      {{ item.label }}
    </span>
  </div>
</template>

<script lang="ts">
import { inject } from 'vue';

export default {
  name: 'CommunityModelListItem',
  props: {
    item: {
      type: Object,
      required: true,
    },
    isCollapsed: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['item-click', 'model-selected'],
  setup(props, { emit }) {
    const isMobile = inject('isMobile');

    const handleItemClick = () => {
      if (props.item.type === 'model' && isMobile) {
        emit('model-selected', props.item.label);
      } else {
        emit('item-click', props.item.type, props.item.objectKey, props.item.key);
      }
    };

    return {
      handleItemClick,
    };
  },
};
</script>
