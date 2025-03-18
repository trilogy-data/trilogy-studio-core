<template>
  <div :class="{ inline: 'tooltip-wrapper' }" @mouseover="showTooltip" @mouseout="hideTooltip">
    <slot></slot>
    <transition appear>
      <span v-if="visible" :class="['tooltip', positionClass]">{{ content }}</span>
    </transition>
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
      default: 'right', // Position: top, bottom, left, right
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
    }
  },
  computed: {
    positionClass() {
      return `tooltip-${this.position}`
    },
  },
  methods: {
    showTooltip() {
      this.hoverTimeout = setTimeout(() => {
        this.visible = true
      }, 250) // 500ms delay
    },
    hideTooltip() {
      if (this.hoverTimeout) {
        clearTimeout(this.hoverTimeout)
      }
      this.visible = false
    },
  },
}
</script>

<style scoped>
/* Base transition styles */
.v-enter-active,
.v-leave-active {
  transition: opacity 0.5s ease;
}

.v-enter-from,
.v-leave-to {
  opacity: 0;
}

.tooltip-wrapper {
  display: inline-block;
  position: relative;
}

.tooltip {
  position: absolute;
  background-color: #333;
  color: white;
  padding: 5px 10px;
  border-radius: 4px;
  font-size: 12px;
  z-index: 10000;
  /* transition: opacity 5s ease-in-out; */
  white-space: nowrap;
}

.tooltip-top {
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
}

.tooltip-bottom {
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
}

.tooltip-left {
  top: 50%;
  right: 100%;
  transform: translateY(-50%);
}

.tooltip-right {
  top: 50%;
  left: 100%;
  transform: translateY(-50%);
}
</style>
