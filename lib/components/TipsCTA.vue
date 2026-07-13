<template>
  <button
    class="tips-cta"
    :class="{ pulsing }"
    data-testid="tips-cta-button"
    aria-label="Show tips"
    title="Show tips"
    @click="emit('expand')"
  >
    <svg
      class="tips-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M9 18h6" />
      <path d="M10 22h4" />
      <path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.4 1 2.3h6c0-.9.4-1.8 1-2.3A7 7 0 0 0 12 2z" />
    </svg>
    <span v-if="count > 0" class="tips-count" data-testid="tips-cta-count">{{ count }}</span>
  </button>
</template>

<script setup lang="ts">
defineProps({
  pulsing: {
    type: Boolean,
    default: false,
  },
  count: {
    type: Number,
    default: 0,
  },
})

const emit = defineEmits(['expand'])
</script>

<style scoped>
.tips-cta {
  position: fixed;
  bottom: 20px;
  right: 20px;
  /* Below modal overlays (1000) so an open dialog covers it */
  z-index: 900;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background-color: var(--special-text);
  color: white;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  transition: transform 0.15s ease;
}

.tips-cta:hover {
  transform: scale(1.08);
}

.tips-icon {
  width: 22px;
  height: 22px;
}

.tips-count {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border-radius: 9px;
  background-color: #e11d48;
  color: white;
  font-size: 11px;
  font-weight: bold;
  line-height: 18px;
  text-align: center;
}

.pulsing .tips-icon {
  animation: tips-flash 1.6s ease-in-out infinite;
}

.pulsing::after {
  content: '';
  position: absolute;
  inset: -3px;
  border-radius: 50%;
  border: 2px solid var(--special-text);
  animation: tips-pulse 1.6s ease-out infinite;
  pointer-events: none;
}

@keyframes tips-pulse {
  0% {
    transform: scale(0.9);
    opacity: 0.9;
  }
  100% {
    transform: scale(1.6);
    opacity: 0;
  }
}

@keyframes tips-flash {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
</style>
