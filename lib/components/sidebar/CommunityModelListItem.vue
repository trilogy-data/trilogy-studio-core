<template>
  <div
    :class="{
      'sidebar-item': true,
    }"
    @click="$emit('item-click', item.type, item.objectKey, item.key)"
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
  emits: ['item-click'],
};
</script>
