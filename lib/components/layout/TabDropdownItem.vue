<!-- TabDropdownItem.vue -->
<template>
  <div
    :class="[
      'tab-dropdown-item-wrapper',
      {
        swiping: isSwiping,
        closing: isClosing,
      },
    ]"
    @touchstart="onTouchStart"
    @touchmove="onTouchMove"
    @touchend="onTouchEnd"
    :style="swipeStyle"
  >
    <div :class="['tab-dropdown-item', { active: isActive }]" @click="handleClick">
      <i :class="icon" class="tab-dropdown-icon"></i>
      <span class="tab-dropdown-title">{{ tab.title }}</span>
    </div>

    <!-- Swipe action reveal -->
    <div v-if="isSwiping || isClosing" class="swipe-action">
      <i class="mdi mdi-close"></i>
    </div>
  </div>
</template>

<script lang="ts">
import { type Tab } from '../../stores/useScreenNavigation'

export default {
  name: 'TabDropdownItem',
  props: {
    tab: {
      type: Object as () => Tab,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: false,
    },
    icon: {
      type: String,
      required: true,
    },
    swipeThreshold: {
      type: Number,
      default: 100,
    },
    disabled: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['select', 'close'],
  data() {
    return {
      isSwiping: false,
      isClosing: false,
      swipeStartX: 0,
      swipeCurrentX: 0,
      swipePosition: 0,
      maxSwipeDistance: 150,
    }
  },
  computed: {
    swipeStyle() {
      return {
        transform: `translateX(${this.swipePosition}px)`,
        transition: this.isSwiping ? 'none' : 'transform 0.2s ease-out',
      }
    },
  },
  methods: {
    handleClick() {
      if (!this.isSwiping && !this.isClosing && !this.disabled) {
        this.$emit('select', this.tab)
      }
    },

    onTouchStart(event: TouchEvent) {
      if (this.disabled || this.isActive || event.touches.length !== 1) return

      this.swipeStartX = event.touches[0].clientX
      this.swipeCurrentX = this.swipeStartX
      this.isSwiping = true

      // Prevent text selection
      event.preventDefault()
    },

    onTouchMove(event: TouchEvent) {
      if (!this.isSwiping || event.touches.length !== 1) return

      event.preventDefault() // Prevent scrolling while swiping

      this.swipeCurrentX = event.touches[0].clientX
      const deltaX = this.swipeCurrentX - this.swipeStartX

      // Only allow left swipe (negative deltaX)
      if (deltaX < 0) {
        this.swipePosition = Math.max(deltaX, -this.maxSwipeDistance)
      } else {
        this.swipePosition = 0
      }
    },

    onTouchEnd(_: TouchEvent) {
      if (!this.isSwiping) return

      const deltaX = this.swipeCurrentX - this.swipeStartX

      if (Math.abs(deltaX) > this.swipeThreshold) {
        // Trigger close
        this.closeTab()
      } else {
        // Snap back to original position
        // emit a click
        this.$emit('select', this.tab)
        this.resetSwipe()
      }
    },

    closeTab() {
      this.isClosing = true
      this.swipePosition = -300 // Animate full swipe out

      setTimeout(() => {
        this.$emit('close', this.tab.id)
      }, 200)
    },

    resetSwipe() {
      this.swipePosition = 0
      setTimeout(() => {
        this.isSwiping = false
      }, 200)
    },

    // Public method for programmatic closing (for batch operations)
    triggerClose() {
      if (this.isActive) return
      this.closeTab()
    },
  },
}
</script>

<style scoped>
.tab-dropdown-item-wrapper {
  position: relative;
  overflow: hidden;
  user-select: none;
  -webkit-user-select: none;

  &.swiping {
    z-index: 10;
  }

  &.closing {
    z-index: 10;
  }
}

.tab-dropdown-item {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  cursor: pointer;
  color: var(--text-color);
  transition: background-color 0.2s ease;
  border-left: 3px solid transparent;
  background-color: var(--bg-color);

  &:hover {
    background-color: var(--button-mouseover);
  }

  &.active {
    background-color: var(--query-window-bg);
    border-left-color: var(--accent-color, #007acc);
  }
}

.tab-dropdown-icon {
  font-size: 16px;
  margin-right: 8px;
  color: var(--text-color);
  flex-shrink: 0;
}

.tab-dropdown-title {
  font-size: var(--small-font-size);
  color: var(--text-color);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  flex: 1;
}

.swipe-action {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 60px;
  background-color: var(--error-color, #dc3545);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;

  i {
    font-size: 20px;
  }
}

/* Prevent selection during swipe */
.tab-dropdown-item-wrapper.swiping * {
  user-select: none;
  -webkit-user-select: none;
  pointer-events: none;
}

.tab-dropdown-item-wrapper.swiping .tab-dropdown-item {
  pointer-events: auto;
}
</style>
