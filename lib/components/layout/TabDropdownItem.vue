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
    @touchcancel="onTouchCancel"
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

/** How far a finger must travel before we decide it's a swipe and not a scroll. */
const DIRECTION_SLOP = 10

/** Matches the CSS transition on the wrapper, so the row is gone once it lands. */
const CLOSE_ANIMATION_MS = 200

/**
 * 'idle'    - no touch in progress, or this row declined the gesture
 * 'pending' - touch down, direction not yet known
 * 'swipe'   - we own the gesture and are dragging the row
 * 'scroll'  - the list owns the gesture; stay out of its way
 */
type Gesture = 'idle' | 'pending' | 'swipe' | 'scroll'

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
  },
  emits: ['select', 'close'],
  data() {
    return {
      gesture: 'idle' as Gesture,
      isSwiping: false,
      isClosing: false,
      swipeStartX: 0,
      swipeStartY: 0,
      swipePosition: 0,
      maxSwipeDistance: 150,
      closeTimer: null as ReturnType<typeof setTimeout> | null,
      resetTimer: null as ReturnType<typeof setTimeout> | null,
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
      if (!this.isSwiping && !this.isClosing) {
        this.$emit('select', this.tab)
      }
    },

    onTouchStart(event: TouchEvent) {
      // The active row can't be swiped away, and a row already animating out is
      // no longer interactive; both leave the gesture to the list.
      if (this.isActive || this.isClosing || event.touches.length !== 1) {
        this.gesture = 'idle'
        return
      }

      this.gesture = 'pending'
      this.swipeStartX = event.touches[0].clientX
      this.swipeStartY = event.touches[0].clientY
    },

    onTouchMove(event: TouchEvent) {
      if ((this.gesture !== 'pending' && this.gesture !== 'swipe') || event.touches.length !== 1) {
        return
      }

      const deltaX = event.touches[0].clientX - this.swipeStartX
      const deltaY = event.touches[0].clientY - this.swipeStartY

      if (this.gesture === 'pending') {
        // Hold off until the finger commits to a direction. Claiming every touch
        // up front meant a drag anywhere on a row was swallowed as a swipe, so a
        // long tab list could only be scrolled by grabbing the container padding.
        if (Math.abs(deltaX) < DIRECTION_SLOP && Math.abs(deltaY) < DIRECTION_SLOP) return

        // Rightward drags are not a close gesture: the row can't travel that way,
        // so treating them as one closed tabs with no visible warning.
        if (Math.abs(deltaY) >= Math.abs(deltaX) || deltaX > 0) {
          this.gesture = 'scroll'
          return
        }

        this.gesture = 'swipe'
        this.isSwiping = true
      }

      // Only suppress scrolling once the gesture is provably ours.
      event.preventDefault()
      this.swipePosition = Math.min(0, Math.max(deltaX, -this.maxSwipeDistance))
    },

    onTouchEnd() {
      const wasSwiping = this.gesture === 'swipe'
      this.gesture = 'idle'
      if (!wasSwiping) return

      // Test the rendered offset, not the raw delta, so the decision matches what
      // the user actually saw the row do.
      if (this.swipePosition <= -this.swipeThreshold) {
        this.closeTab()
      } else {
        // A short swipe just snaps back. It used to fall through to `select`, so
        // a close attempt that came up short navigated somewhere instead.
        this.resetSwipe()
      }
    },

    onTouchCancel() {
      if (this.gesture === 'swipe') this.resetSwipe()
      this.gesture = 'idle'
    },

    closeTab() {
      this.isClosing = true
      this.swipePosition = -300 // Animate full swipe out

      this.closeTimer = setTimeout(() => {
        this.closeTimer = null
        this.$emit('close', this.tab.id)
      }, CLOSE_ANIMATION_MS)
    },

    resetSwipe() {
      this.swipePosition = 0
      // Held past the animation so the trailing click doesn't read as a tap.
      this.resetTimer = setTimeout(() => {
        this.resetTimer = null
        this.isSwiping = false
      }, CLOSE_ANIMATION_MS)
    },
  },

  beforeUnmount() {
    if (this.closeTimer) clearTimeout(this.closeTimer)
    if (this.resetTimer) clearTimeout(this.resetTimer)
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
