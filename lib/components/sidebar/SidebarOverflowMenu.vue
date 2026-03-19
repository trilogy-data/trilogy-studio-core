<template>
  <template v-if="items.length > 0">
    <context-menu
      :items="items"
      :position="contextMenuPosition"
      :is-visible="contextMenuVisible"
      :id="testIdBase"
      @item-click="handleItemClick"
      @close="contextMenuVisible = false"
    />
    <tooltip :content="tooltip" position="left">
      <button
        type="button"
        class="sidebar-icon-button sidebar-overflow-button"
        :class="buttonClass"
        @click.stop="openOverflowMenu"
        :title="tooltip"
        :data-testid="testIdBase ? `${testIdBase}-trigger` : undefined"
      >
        <i class="mdi mdi-dots-horizontal"></i>
      </button>
    </tooltip>
  </template>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import Tooltip from '../Tooltip.vue'
import ContextMenu from '../ContextMenu.vue'
import type { ContextMenuItem, Position } from '../ContextMenu.vue'

const props = withDefaults(defineProps<SidebarOverflowMenuProps>(), {
  tooltip: 'Actions',
  menuWidth: 160,
  buttonClass: '',
})

export interface SidebarOverflowMenuProps {
  items: ContextMenuItem[]
  tooltip?: string
  menuWidth?: number
  buttonClass?: string
  testIdBase?: string
}

const emit = defineEmits<{
  select: [item: ContextMenuItem]
}>()

const contextMenuVisible = ref(false)
const contextMenuPosition = ref<Position>({ x: 0, y: 0 })

const openOverflowMenu = (event: MouseEvent) => {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  contextMenuPosition.value = {
    x: rect.right - props.menuWidth,
    y: rect.bottom - 4,
  }
  contextMenuVisible.value = true
}

const handleItemClick = (item: ContextMenuItem) => {
  emit('select', item)
}
</script>

<style scoped>
.sidebar-overflow-button {
  opacity: 0.72;
}
</style>
