<template>
  <div class="sidebar-list">
    <div class="sidebar-header-container">
      <h3 v-if="!isMobile" class="font-sans sidebar-header">{{ title }}</h3>
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
  padding-left: 4px;
  padding-right: 4px;

  /* height: 100%; */
}

.sidebar-content {
  display: flex;
  flex-direction: column;
}

.action-slot {
  padding-bottom: 5px;
}

.sidebar-header {
  font-weight: 400;
  font-size: 14px;
  margin-top: 5px;
  margin-bottom: 5px;
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
