<template>
  <div class="loading-container" ref="containerRef">
    <img :src="trilogyIcon" class="trilogy-icon" />
    <div v-if="!isCompact" class="loading-text">{{ text }} ({{ elapsedTime }})</div>
    <div v-if="!isCompact" class="cancel-container">
      <button v-if="cancel" @click="handleCancel" class="cancel-button">Cancel</button>
    </div>
  </div>
</template>

<script lang="ts">
import {
  defineComponent,
  ref,
  onMounted,
  onBeforeUnmount,
  computed,
  nextTick,
  type PropType,
} from 'vue'
import trilogyIcon from '../static/trilogy.png'

interface Props {
  cancel?: (() => void) | null
  text: string
  startTime: number | null
}

export default defineComponent({
  name: 'LoadingPlaceholder',
  props: {
    cancel: {
      type: Function,
      required: false,
    },
    text: {
      type: String,
      required: false,
      default: 'Executing',
    },
    startTime: {
      type: Number as PropType<number | null>,
      required: false,
      default: Date.now(),
    },
  },
  setup(props: Props) {
    const containerRef = ref<HTMLElement | null>(null)
    const containerHeight = ref(0)
    const startTimeInternal = ref(props.startTime || Date.now())
    const elapsedTime = ref('0 ms')
    let timeout: ReturnType<typeof setTimeout> | null = null
    let resizeObserver: ResizeObserver | null = null

    const isCompact = computed(() => containerHeight.value < 45)

    const updateContainerHeight = () => {
      if (containerRef.value) {
        containerHeight.value = containerRef.value.clientHeight
      }
    }

    const getUpdateInterval = (_: number): number => {
      // if (elapsedMs < 1000) return 50 // Update every 50ms for first second
      // if (elapsedMs < 5000) return 100 // Update every 100ms for first 5 seconds
      // if (elapsedMs < 30000) return 500 // Update every 500ms for first 30 seconds
      return 100
    }

    const updateElapsedTime = () => {
      const ms = Date.now() - startTimeInternal.value
      if (ms < 1000) {
        elapsedTime.value = `${ms} ms`
      } else if (ms < 60000) {
        const seconds = (ms / 1000).toFixed(1)
        elapsedTime.value = `${seconds} sec`
      } else {
        const minutes = Math.floor(ms / 60000)
        const remainingSeconds = ((ms % 60000) / 1000).toFixed(1)
        elapsedTime.value =
          remainingSeconds !== '0.0' ? `${minutes} min ${remainingSeconds} sec` : `${minutes} min`
      }
      // Schedule next update with adaptive interval
      const nextInterval = getUpdateInterval(ms)
      timeout = setTimeout(updateElapsedTime, nextInterval)
    }

    const handleCancel = () => {
      if (props.cancel) {
        props.cancel()
      }
    }

    onMounted(async () => {
      startTimeInternal.value = props.startTime || Date.now()
      updateElapsedTime() // Start the adaptive timer

      // Wait for DOM to be ready
      await nextTick()
      updateContainerHeight()

      // Set up ResizeObserver to watch for height changes
      if (containerRef.value && window.ResizeObserver) {
        resizeObserver = new ResizeObserver(() => {
          updateContainerHeight()
        })
        resizeObserver.observe(containerRef.value)
      }
    })

    onBeforeUnmount(() => {
      if (timeout) clearTimeout(timeout)
      if (resizeObserver) resizeObserver.disconnect()
    })

    return {
      containerRef,
      handleCancel,
      trilogyIcon,
      elapsedTime,
      isCompact,
    }
  },
})
</script>

<style scoped>
@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.trilogy-icon {
  display: inline-block;
  animation: spin 1s linear infinite;
  height: 30px;
  width: 30px;
}

.loading-container {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding-top: 40px;
  padding: 2rem;
  background: var(--bg-light);
  height: 100%;
}

/* Compact mode styles */
.loading-container:has(.loading-text:not([style*='display: none'])) {
  /* Normal mode - keep existing styles */
}

/* When in compact mode, adjust container styles */
.loading-container {
  min-height: 30px;
}

@keyframes bounce {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-10px);
  }
}

.loading-text {
  font-size: 1.1rem;
  min-width: 120px;
  text-align: center;
  height: 24px;
}

.cancel-button {
  color: var(--text);
  border: none;
  cursor: pointer;
  transition: background-color 0.2s;
  border: 2px solid #e74d3c82;
  background-color: transparent;
  width: 100px;
}

.cancel-button:hover {
  background-color: #c0392b;
}

.cancel-container {
  height: 10px;
}
</style>
