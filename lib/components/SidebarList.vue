<template>
  <div class="sidebar-list">
    <h3 v-if="!isMobile" class="font-sans mb-1">{{ title }}</h3>
    <slot name="actions"> </slot>
    <div>
      <slot></slot>
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
.mb-1 {
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
