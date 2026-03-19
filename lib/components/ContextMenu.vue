<template>
  <div v-if="isVisible" :style="positionStyle" class="context-menu">
    <div v-for="item in items" :key="item.id">
      <div v-if="item.kind === 'separator'" class="context-menu-separator"></div>
      <div
        v-else
        class="context-menu-item"
        :class="{ danger: item.danger, disabled: item.disabled }"
        @click="handleItemClick(item)"
      >
        <i v-if="item.icon" :class="`mdi ${item.icon}`"></i>
        <span>{{ item.label }}</span>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, computed, onMounted, onUnmounted } from 'vue'
import type { PropType } from 'vue'

export interface Position {
  x: number
  y: number
}

export interface ContextMenuItem {
  id: string
  label?: string
  icon?: string
  danger?: boolean
  disabled?: boolean
  kind?: 'item' | 'separator'
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
      if (item.disabled || item.kind === 'separator') {
        return
      }
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
  position: fixed;
  background-color: var(--sidebar-bg);
  border: 1px solid var(--border-light);
  border-radius: 7px;
  box-shadow: 0 4px 10px rgba(15, 23, 42, 0.18);
  z-index: 1000;
  min-width: 150px;
  padding: 3px;
}

.context-menu-item {
  min-height: 27px;
  padding: 0 7px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-color);
  border-radius: 5px;
  font-size: 13px;
  font-weight: 400;
  line-height: 1.1;
  transition:
    background-color 0.16s ease,
    color 0.16s ease;
}

.context-menu-item i {
  width: 15px;
  min-width: 15px;
  font-size: 14px;
  line-height: 1;
  color: var(--text-faint);
}

.context-menu-separator {
  height: 1px;
  margin: 2px 2px 3px;
  background-color: var(--border-light);
}

.context-menu-item:hover {
  background-color: var(--button-mouseover);
}

.context-menu-item.danger {
  color: var(--error-color);
}

.context-menu-item.danger i {
  color: rgba(var(--delete-color-rgb), 0.62);
}

.context-menu-item.danger:hover {
  background-color: rgba(var(--delete-color-rgb), 0.08);
}

.context-menu-item.disabled {
  color: var(--text-faint);
  cursor: default;
}

.context-menu-item.disabled i {
  color: var(--text-faint);
}

.context-menu-item.disabled:hover {
  background-color: transparent;
}
</style>
