<template>
  <div
    class="tooltip-wrapper"
    ref="wrapperRef"
    @mouseenter="onMouseEnter"
    @mouseleave="onMouseLeave"
  >
    <slot></slot>
    <Teleport to="body">
      <Transition appear>
        <span v-if="visible" ref="tooltipRef" class="tooltip-popup" :style="tooltipStyle">{{ content }}</span>
      </Transition>
    </Teleport>
  </div>
</template>

<script lang="ts">
export default {
  props: {
    content: {
      type: String,
      required: true,
    },
    position: {
      type: String,
      default: 'right',
    },
    inline: {
      type: Boolean,
      default: true,
    },
  },
  data() {
    return {
      visible: false,
      hoverTimeout: null as ReturnType<typeof setTimeout> | null,
      tooltipStyle: {} as Record<string, string>,
    }
  },
  methods: {
    async onMouseEnter() {
      this.hoverTimeout = setTimeout(async () => {
        this.computePosition()
        this.visible = true
        await this.$nextTick()
        this.clampToViewport()
      }, 100)
    },
    onMouseLeave() {
      if (this.hoverTimeout) clearTimeout(this.hoverTimeout)
      this.visible = false
    },
    computePosition() {
      const el = this.$refs.wrapperRef as HTMLElement
      if (!el) return

      const rect = el.getBoundingClientRect()
      const computed = window.getComputedStyle(el)
      const GAP = 6

      // Read theme-aware variables from the wrapper's computed styles.
      // CSS custom properties inherit, so these resolve to the active theme's
      // values even though the tooltip is teleported outside the styled tree.
      const bg =
        computed.getPropertyValue('--trilogy-embed-floating-surface-strong').trim() ||
        computed.getPropertyValue('--floating-surface-strong').trim() ||
        'rgba(255, 255, 255, 0.97)'
      const color =
        computed.getPropertyValue('--trilogy-embed-floating-text').trim() ||
        computed.getPropertyValue('--floating-text').trim() ||
        '#1f2937'
      const shadow =
        computed.getPropertyValue('--trilogy-embed-surface-shadow').trim() ||
        computed.getPropertyValue('--surface-shadow').trim() ||
        '0 1px 2px rgba(15, 23, 42, 0.08)'
      const border =
        computed.getPropertyValue('--trilogy-embed-overlay-border').trim() ||
        computed.getPropertyValue('--overlay-border').trim() ||
        'rgba(148, 163, 184, 0.14)'

      const base: Record<string, string> = {
        position: 'fixed',
        background: bg,
        color: color,
        boxShadow: `${shadow}, 0 4px 16px rgba(0, 0, 0, 0.08)`,
        border: `1px solid ${border}`,
        zIndex: '99999',
      }

      if (this.position === 'top') {
        this.tooltipStyle = {
          ...base,
          left: `${rect.left + rect.width / 2}px`,
          top: `${rect.top - GAP}px`,
          transform: 'translate(-50%, -100%)',
        }
      } else if (this.position === 'bottom') {
        this.tooltipStyle = {
          ...base,
          left: `${rect.left + rect.width / 2}px`,
          top: `${rect.bottom + GAP}px`,
          transform: 'translateX(-50%)',
        }
      } else if (this.position === 'left') {
        this.tooltipStyle = {
          ...base,
          left: `${rect.left - GAP}px`,
          top: `${rect.top + rect.height / 2}px`,
          transform: 'translate(-100%, -50%)',
        }
      } else {
        this.tooltipStyle = {
          ...base,
          left: `${rect.right + GAP}px`,
          top: `${rect.top + rect.height / 2}px`,
          transform: 'translateY(-50%)',
        }
      }
    },
    clampToViewport() {
      const tooltipEl = this.$refs.tooltipRef as HTMLElement
      if (!tooltipEl) return

      // getBoundingClientRect already accounts for CSS transform, so tipRect
      // reflects the actual painted position. We shift left/top by the overflow
      // amount on each edge without touching transform.
      const tipRect = tooltipEl.getBoundingClientRect()
      const MARGIN = 8

      const overflowRight = Math.max(0, tipRect.right - (window.innerWidth - MARGIN))
      const overflowLeft = Math.max(0, MARGIN - tipRect.left)
      const overflowBottom = Math.max(0, tipRect.bottom - (window.innerHeight - MARGIN))
      const overflowTop = Math.max(0, MARGIN - tipRect.top)

      if (overflowRight || overflowLeft || overflowBottom || overflowTop) {
        const left = parseFloat(this.tooltipStyle.left) - overflowRight + overflowLeft
        const top = parseFloat(this.tooltipStyle.top) - overflowBottom + overflowTop
        this.tooltipStyle = { ...this.tooltipStyle, left: `${left}px`, top: `${top}px` }
      }
    },
  },
}
</script>

<style scoped>
.v-enter-active,
.v-leave-active {
  transition: opacity 0.15s ease;
}

.v-enter-from,
.v-leave-to {
  opacity: 0;
}

.tooltip-wrapper {
  display: inline-block;
  position: relative;
}
</style>

<style>
.tooltip-popup {
  padding: 4px 9px;
  border-radius: 6px;
  font-size: 11.5px;
  font-weight: 500;
  line-height: 1.4;
  letter-spacing: 0.01em;
  white-space: nowrap;
  pointer-events: none;
}
</style>
