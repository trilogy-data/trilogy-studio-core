<template>
  <div class="sidebar-list">
    <div class="sidebar-header-container">
      <slot v-if="$slots.header" name="header"></slot>
      <h3 v-else-if="!isMobile" class="font-sans sidebar-header">{{ title }}</h3>
    </div>
    <div class="action-slot">
      <slot name="actions"> </slot>
    </div>
    <div class="sidebar-content">
      <slot :isMobile="isMobile"></slot>
    </div>
  </div>
</template>

<style scoped>
.sidebar-list {
  border-radius: 0px;
  padding-left: 0;
  padding-right: 0;

  /* height: 100%; */
}

.sidebar-content {
  display: flex;
  flex-direction: column;
  margin-left: 0;
  margin-right: 0;
}

.sidebar-header-container {
  padding: 0 16px 6px;
}

.action-slot {
  padding: 0 16px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.sidebar-header {
  font-weight: 600;
  font-size: 16px;
  color: var(--text-color);
  margin: 0;
  padding-left: 0;
  padding-right: 0;
}

.action-slot :deep(.button-container) {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sidebar-control-gap);
}

.action-slot :deep(.button-container > button),
.action-slot :deep(.button-container > .btn) {
  min-height: var(--sidebar-control-height);
  height: var(--sidebar-control-height);
  padding: 0 12px;
  background-color: transparent;
  border-color: var(--border-light);
  border-radius: var(--sidebar-control-radius);
}

.action-slot :deep(.creator-container) {
  padding-top: 2px;
}
</style>
<script lang="ts">
import { defineComponent, inject } from 'vue'

export default defineComponent({
  name: 'SidebarList',
  props: {
    title: {
      type: String,
      required: true,
    },
  },
  setup(props) {
    const isMobile = inject<boolean>('isMobile')
    return {
      title: props.title,
      isMobile,
    }
  },
})
</script>
