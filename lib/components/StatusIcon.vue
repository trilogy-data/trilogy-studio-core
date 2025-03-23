<script setup lang="ts">
import { computed } from 'vue'
import Tooltip from './Tooltip.vue'

export type Status = 'connected' | 'running' | 'failed' | 'idle' | 'disabled'

const props = defineProps<{ status: Status; message?: string; testName?: string }>()

const statusClasses = computed(() => {
  return (
    {
      connected: 'connected',
      running: 'running',
      failed: 'failed',
      idle: 'idle',
      disabled: 'disabled',
    }[props.status] || 'idle'
  )
})
</script>

<template>
  <tooltip class="indicator-container" v-if="message" :content="message" position="left">
    <span class="indicator" :class="statusClasses" :data-testid="`status-icon-${testName}`"></span>
  </tooltip>
  <span
    v-else
    class="indicator"
    :class="statusClasses"
    :data-testid="`status-icon-${testName}`"
  ></span>
</template>

<style scoped>
.indicator {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  box-shadow: 0 0 8px currentColor;
  animation: pulse 1.5s infinite alternate;
  display: inline-block;
  line-height: inherit;
  vertical-align: middle;
  text-align: center;
  padding: 1px;
  margin: 4px;
}

.indicator-container {
  display: inline-block;
  line-height: inherit;
  vertical-align: middle;
  text-align: center;
}

.connected {
  background-color: green;
  color: green;
}

.running {
  background-color: blue;
  color: blue;
}

.failed {
  background-color: red;
  color: red;
}

.idle {
  background-color: gray;
  color: gray;
}

.disabled {
  background-color: lightgray;
  color: lightgray;
}

@keyframes pulse {
  from {
    opacity: 1;
  }
  to {
    opacity: 0.5;
  }
}
</style>
