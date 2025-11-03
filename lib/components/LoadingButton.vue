<template>
  <button
    :class="[useDefaultStyle ? 'default-style' : '', $attrs.class, 'btn']"
    v-bind="$attrs"
    :disabled="disabled || isLoading"
    @click.stop="handleClick"
    :data-testid="`${testId}`"
  >
    <span :class="{ 'hidden-text': isLoading, contents: true }">
      <slot></slot>
    </span>
    <span v-if="status === 'success'" class="success status_overlay">✔</span>
    <tooltip
      v-else-if="status === 'error'"
      :content="errorMessage || ''"
      :inline="false"
      position="left"
      class="error status_overlay"
      ><span class="error status_overlay" :data-testid="`${testId}-error`">✖</span>
    </tooltip>
    <span v-else-if="isLoading" class="loading status_overlay">
      <span class="spinner"></span>
    </span>
  </button>
</template>

<script lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import Tooltip from './Tooltip.vue'

export default {
  props: {
    action: {
      type: Function,
      required: true,
    },
    useDefaultStyle: {
      type: Boolean,
      default: true,
    },
    keyCombination: {
      type: Array<string>,
      default: null, // Optional property
    },
    disabled: {
      type: Boolean,
      default: false,
    },
    testId: {
      type: String,
      default: '',
    },
  },
  components: {
    Tooltip,
  },
  setup(props) {
    const isLoading = ref(false)
    const errorMessage = ref<string | null>(null)
    const status = ref<'success' | 'error' | null>(null)
    const keysPressed = new Set<string>()

    const handleKeydown = (event: KeyboardEvent) => {
      if (!props.keyCombination) return
      if (!event.key) return
      keysPressed.add(event.key.toLowerCase())
      const requiredKeys = new Set(props.keyCombination.map((key) => key.toLowerCase()))
      if (Array.from(requiredKeys).every((key) => keysPressed.has(key))) {
        keysPressed.clear() // Clear the keys after the combination is detected
        event.preventDefault() // Prevent default browser action
        handleClick() // Call the action
      }
    }
    const handleKeyup = (event: KeyboardEvent) => {
      if (!props.keyCombination) return
      if (!event.key) return
      keysPressed.delete(event.key.toLowerCase())
    }
    const handleClick = async () => {
      isLoading.value = true
      status.value = null // Reset status before running action
      const startTime = Date.now()
      let localStatus: 'success' | 'error' | null = null
      let resetTimeout = 1500
      try {
        await props.action()
        localStatus = 'success'
      } catch (error) {
        localStatus = 'error'
        if (error instanceof Error) {
          errorMessage.value = error.message
        } else {
          errorMessage.value = 'An unknown error occurred'
        }
        resetTimeout = 10000
      } finally {
        const elapsedTime = Date.now() - startTime
        const remainingTime = Math.max(500 - elapsedTime, 0)
        await new Promise((resolve) => setTimeout(resolve, remainingTime))
        status.value = localStatus
        // Clear status after a brief delay
        setTimeout(() => {
          status.value = null
          isLoading.value = false
          errorMessage.value = null
        }, resetTimeout)
      }
    }
    onMounted(() => {
      window.addEventListener('keydown', handleKeydown)
      window.addEventListener('keyup', handleKeyup)
    })

    onUnmounted(() => {
      window.removeEventListener('keydown', handleKeydown)
      window.removeEventListener('keyup', handleKeyup)
    })

    return {
      errorMessage,
      isLoading,
      status,
      handleClick,
      handleKeydown,
    }
  },
}
</script>

<style scoped>
.hidden-text {
  visibility: hidden;
}

.status_overlay {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.success {
  color: green;
}

.error {
  color: red;
}

.btn {
  /* width: 100%; */
  position: relative;
  padding: 0px;
  margin: 0px;
  /* height:100%; */
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.spinner {
  display: inline-block;
  aspect-ratio: 1 / 1;
  border: 2px solid transparent;
  border-top-color: var(--color);
  border-radius: 50%;
  animation: spin 0.75s linear infinite;
  padding: 0px;
  margin: 0px;
  height: 50%;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.05s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0 0.05s ease;
}
</style>
