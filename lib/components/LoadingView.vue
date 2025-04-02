<template>
  <div class="loading-container">
    <img :src="trilogyIcon" class="trilogy-icon" />
    <div class="loading-text">{{ text }} ({{ elapsedTime }})</div>
    <div class="cancel-container">
      <button v-if="cancel" @click="handleCancel" class="cancel-button">Cancel</button>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, onMounted, onBeforeUnmount, type PropType } from 'vue'
import trilogyIcon from '../static/trilogy.png'

interface Props {
  cancel?: (() => void) | null
  text: string
  startTime: number
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
    const elapsedTime = ref('0.0 sec')
    let interval: ReturnType<typeof setInterval> | null = null

    const updateElapsedTime = () => {
      const ms = Date.now() - props.startTime
      const seconds = (ms / 1000).toFixed(1) // Show tenths of a second

      if (ms < 1000) {
        elapsedTime.value = `${ms} ms`
      } else if (ms < 60000) {
        elapsedTime.value = `${seconds} sec`
      } else {
        const minutes = Math.floor(ms / 60000)
        const remainingSeconds = ((ms % 60000) / 1000).toFixed(1)
        elapsedTime.value =
          remainingSeconds !== '0.0' ? `${minutes} min ${remainingSeconds} sec` : `${minutes} min`
      }
    }

    const handleCancel = () => {
      if (props.cancel) {
        props.cancel()
      }
    }

    onMounted(() => {
      interval = setInterval(updateElapsedTime, 100) // Update every 100ms
    })

    onBeforeUnmount(() => {
      if (interval) clearInterval(interval)
    })

    return {
      handleCancel,
      trilogyIcon,
      elapsedTime,
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
  align-items: center;
  padding-top: 40px;
  padding: 2rem;
  background: var(--bg-light);
  height: 100%;
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
  margin-bottom: 1rem;
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
