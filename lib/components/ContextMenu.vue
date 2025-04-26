<template>
  <div v-if="isVisible" :style="positionStyle" class="context-menu">
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
    id: {
      type: String,
      default: '',
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
      setTimeout(() => {
        document.addEventListener('click', handleClickOutside)
        // document.addEventListener('contextmenu', handleClickOutside)
      }, 300) // 300ms delay, adjust as needed
    })

    onUnmounted(() => {
      document.removeEventListener('click', handleClickOutside)
      // document.removeEventListener('contextmenu', handleClickOutside)
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
  /* position: fixed; */
  position: absolute;
  background-color: var(--sidebar-bg);
  border: 1px solid var(--border-color);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
  z-index: 1000;
  min-width: 150px;
}

.context-menu-item {
  padding: 4px 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--text-color);
  transition: background-color 0.2s;
}

.context-menu-item:hover {
  background-color: var(--border-color);
}

.context-menu-item.danger {
  color: var(--error-color);
}

.context-menu-item.danger:hover {
  background-color: var(--border-color);
}
</style>
