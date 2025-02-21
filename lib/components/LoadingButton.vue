<template>
  <div class="relative inline-block button-wrapper">
    <button
      :class="[{ 'btn flex': useDefaultStyle }, $attrs.class]"
      v-bind="$attrs"
      :disabled="isLoading"
      @click="handleClick"
    >
      <transition name="fade" mode="out-in">
        <span v-if="status === 'success'" class="green">✔</span>
        <span v-else-if="status === 'error'" class="red">✖ ({{ errorMessage }})</span>
        <span v-else-if="isLoading" class="spinner"></span>
        <span v-else>
          <slot></slot>
        </span>
      </transition>
    </button>
  </div>
</template>

<script lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

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
  },

  setup(props) {
    const isLoading = ref(false)
    const errorMessage = ref<string | null>(null)
    const status = ref<'success' | 'error' | null>(null)
    const keysPressed = new Set<string>()

    const handleKeydown = (event: KeyboardEvent) => {
      if (!props.keyCombination) return
      keysPressed.add(event.key.toLowerCase())
      const requiredKeys = new Set(props.keyCombination.map((key) => key.toLowerCase()))
      if (Array.from(requiredKeys).every((key) => keysPressed.has(key))) {
        keysPressed.clear() // Clear the keys after the combination is detected
        event.preventDefault() // Prevent default browser action
        handleClick() // Call the action
      }
    }
    const handleKeyup = (event: KeyboardEvent) => {
      // Remove the key from the set
      keysPressed.delete(event.key.toLowerCase())
    }
    const handleClick = async () => {
      isLoading.value = true
      status.value = null // Reset status before running action
      const startTime = Date.now()
      let localStatus: 'success' | 'error' | null = null
      try {
        await props.action()
        localStatus = 'success'
      } catch (error) {
        localStatus = 'error'
        if (error instanceof Error) {
          errorMessage.value = error.message
        }
      } finally {
        const elapsedTime = Date.now() - startTime
        const remainingTime = Math.max(500 - elapsedTime, 0)
        await new Promise((resolve) => setTimeout(resolve, remainingTime))
        status.value = localStatus
        isLoading.value = false
        // Clear status after a brief delay
        setTimeout(() => {
          status.value = null
          errorMessage.value = null
        }, 1500)
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

<style>
.button-wrapper {
  flex: 1;
}

.red {
  color: red;
}

.green {
  color: green;
}

.btn {
  /* min-height: 24px; */
  border: 2px solid transparent;
  /* width: 100%; */
}

.spinner {
  display: inline-block;
  height: 45%;
  aspect-ratio: 1 / 1;
  border: 2px solid transparent;
  border-top-color: var(--color);
  border-radius: 50%;
  animation: spin 0.75s linear infinite;
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
