<template>
  <div
    class="loading-container"
    :class="{ 'loading-container-subtle': subtle }"
    ref="containerRef"
  >
    <template v-if="isCompact">
      <p class="display-text">
        <img :src="trilogyIcon" class="trilogy-icon" />
        <span>{{ statusText }}</span>
      </p>
      <button v-if="cancel" @click="handleCancel" class="cancel-button">Cancel</button>
    </template>
    <template v-else>
      <img :src="trilogyIcon" class="trilogy-icon" />
      <div class="loading-text">{{ statusText }}</div>
      <div class="cancel-container">
        <button v-if="cancel" @click="handleCancel" class="cancel-button">Cancel</button>
      </div>
    </template>
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
  subtle?: boolean
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
    subtle: {
      type: Boolean,
      required: false,
      default: false,
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
    const statusText = computed(() => {
      const label = props.text.trim()
      return label ? `${label} (${elapsedTime.value})` : elapsedTime.value
    })

    const updateContainerHeight = () => {
      if (containerRef.value) {
        let parent = containerRef.value.parentElement
        if (parent && parent.clientHeight > 0) {
          containerHeight.value = parent.clientHeight
          return
        }
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
      containerHeight,
      handleCancel,
      trilogyIcon,
      elapsedTime,
      isCompact,
      statusText,
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
  height: 24px;
  width: 24px;
  flex: 0 0 auto;
}

.loading-container {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 0.45rem;
  padding: 1rem;
  background: var(--bg-light);
  box-sizing: border-box;
  height: 100%;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

/* Compact mode styles */
.loading-container:has(.loading-text:not([style*='display: none'])) {
  /* Normal mode - keep existing styles */
}

/* When in compact mode, adjust container styles */
.loading-container {
  min-height: 30px;
}

.display-text {
  font-size: 0.95rem;
  text-align: center;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  flex-wrap: wrap;
  margin: 0;
  max-width: 100%;
  line-height: 1.2;
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
  font-size: 0.95rem;
  text-align: center;
  max-width: 100%;
  min-width: 0;
  line-height: 1.2;
  color: var(--dashboard-helper-text, var(--text-color-muted, var(--text)));
  overflow-wrap: anywhere;
}

.loading-container-subtle {
  padding: 0.5rem 0.75rem;
  background: transparent;
}

.loading-container-subtle .trilogy-icon {
  height: 16px;
  width: 16px;
  opacity: 0.5;
}

.loading-container-subtle .loading-text,
.loading-container-subtle .display-text {
  font-size: 0.68rem;
  color: var(--dashboard-helper-text, var(--text-color-muted, var(--text)));
  opacity: 0.65;
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
