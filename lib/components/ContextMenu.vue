<template>
  <div v-show="isVisible" :style="positionStyle" class="context-menu">
    <div
      v-for="item in items"
      :key="item.id"
      class="context-menu-item"
      :class="{ danger: item.danger }"
      @click="handleItemClick(item)"
    >
      <i v-if="item.icon" :class="`mdi ${item.icon}`"></i>
      <span>{{ item.label }}</span>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, computed, onMounted, onUnmounted } from 'vue'
import type { PropType } from 'vue'

interface Position {
  x: number
  y: number
}

interface ContextMenuItem {
  id: string
  label: string
  icon?: string
  danger?: boolean
}

export default defineComponent({
  name: 'ContextMenu',
  props: {
    items: {
      type: Array as PropType<ContextMenuItem[]>,
      required: true,
    },
    position: {
      type: Object as PropType<Position>,
      default: () => ({ x: 0, y: 0 }),
    },
    isVisible: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['item-click', 'close'],
  setup(props, { emit }) {
    const positionStyle = computed(() => {
      return {
        left: `${props.position.x}px`,
        top: `${props.position.y}px`,
      }
    })

    const handleItemClick = (item: ContextMenuItem) => {
      emit('item-click', item)
      emit('close')
    }

    const handleClickOutside = (_: MouseEvent) => {
      _ = _
      if (props.isVisible) {
        emit('close')
      }
    }

    onMounted(() => {
      document.addEventListener('click', handleClickOutside)
      document.addEventListener('contextmenu', handleClickOutside)
    })

    onUnmounted(() => {
      document.removeEventListener('click', handleClickOutside)
      document.removeEventListener('contextmenu', handleClickOutside)
    })

    return {
      positionStyle,
      handleItemClick,
    }
  },
})
</script>

<style scoped>
.context-menu {
  position: fixed;
  background-color: var(--sidebar-bg);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
  z-index: 1000;
  min-width: 150px;
  padding: 4px 0;
}

.context-menu-item {
  padding: 8px 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-color);
  transition: background-color 0.2s;
}

.context-menu-item:hover {
  background-color: var(--primary-color-transparent);
}

.context-menu-item.danger {
  color: var(--error-color);
}

.context-menu-item.danger:hover {
  background-color: rgba(var(--error-color-rgb), 0.1);
}
</style>
