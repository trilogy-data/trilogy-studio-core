<template>
  <button
    :class="[useDefaultStyle ? 'default-style' : '', $attrs.class, 'btn']"
    v-bind="$attrs"
    :disabled="disabled || isLoading"
    @click.stop="handleClick"
    :data-testid="effectiveTestId"
  >
    <span :class="{ 'hidden-text': isLoading, contents: true }">
      <slot></slot>
    </span>
    <span v-if="status === 'success'" class="success status_overlay">✔</span>
    <span
      v-else-if="status === 'error'"
      class="error status_overlay"
      :data-testid="`${effectiveTestId}-error`"
      >✖</span
    >
    <span v-else-if="isLoading" class="loading status_overlay">
      <span class="spinner"></span>
    </span>
  </button>

  <ModalDialog
    :show="showErrorModal"
    title="Action failed"
    max-width="560px"
    :test-id="effectiveTestId ? `${effectiveTestId}-error-modal` : 'loading-button-error-modal'"
    @close="dismissError"
  >
    <p
      class="error-message"
      :data-testid="effectiveTestId ? `${effectiveTestId}-error-message` : 'loading-button-error-message'"
    >
      {{ errorMessage }}
    </p>
    <template #footer>
      <button
        type="button"
        class="okay-button"
        :data-testid="effectiveTestId ? `${effectiveTestId}-error-okay` : 'loading-button-error-okay'"
        @click="dismissError"
      >
        Okay
      </button>
      <button
        type="button"
        class="retry-button"
        :data-testid="effectiveTestId ? `${effectiveTestId}-error-retry` : 'loading-button-error-retry'"
        @click="retryAction"
      >
        Retry
      </button>
    </template>
  </ModalDialog>
</template>

<script lang="ts">
import { ref, computed, useAttrs, onMounted, onUnmounted } from 'vue'
import ModalDialog from './ModalDialog.vue'

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
    ModalDialog,
  },
  setup(props) {
    // The template is multi-root (button + error modal), so callers' data-testid
    // no longer falls through automatically — resolve it from the prop or $attrs
    const attrs = useAttrs()
    const effectiveTestId = computed(
      () =>
        props.testId ||
        (typeof attrs['data-testid'] === 'string' ? (attrs['data-testid'] as string) : ''),
    )
    const isLoading = ref(false)
    const errorMessage = ref<string | null>(null)
    const status = ref<'success' | 'error' | null>(null)
    const showErrorModal = ref(false)
    const keysPressed = new Set<string>()
    let statusTimeout: ReturnType<typeof setTimeout> | null = null

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

    const dismissError = () => {
      showErrorModal.value = false
      status.value = null
      errorMessage.value = null
    }

    const handleClick = async () => {
      if (isLoading.value || showErrorModal.value) return

      if (statusTimeout) {
        clearTimeout(statusTimeout)
        statusTimeout = null
      }
      isLoading.value = true
      status.value = null
      errorMessage.value = null
      const startTime = Date.now()
      let localStatus: 'success' | 'error' | null = null
      try {
        await props.action()
        localStatus = 'success'
      } catch (error) {
        localStatus = 'error'
        if (error instanceof Error) {
          errorMessage.value = error.message
        } else if (typeof error === 'string') {
          errorMessage.value = error
        } else {
          errorMessage.value = 'An unknown error occurred'
        }
      } finally {
        const elapsedTime = Date.now() - startTime
        const remainingTime = Math.max(500 - elapsedTime, 0)
        await new Promise((resolve) => setTimeout(resolve, remainingTime))
        status.value = localStatus
        isLoading.value = false

        if (localStatus === 'error') {
          showErrorModal.value = true
        } else {
          statusTimeout = setTimeout(() => {
            status.value = null
            statusTimeout = null
          }, 1500)
        }
      }
    }

    const retryAction = () => {
      dismissError()
      void handleClick()
    }

    onMounted(() => {
      window.addEventListener('keydown', handleKeydown)
      window.addEventListener('keyup', handleKeyup)
    })

    onUnmounted(() => {
      window.removeEventListener('keydown', handleKeydown)
      window.removeEventListener('keyup', handleKeyup)
      if (statusTimeout) clearTimeout(statusTimeout)
    })

    return {
      effectiveTestId,
      errorMessage,
      isLoading,
      status,
      showErrorModal,
      handleClick,
      handleKeydown,
      dismissError,
      retryAction,
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

.error-message {
  max-height: min(50vh, 360px);
  margin: 0;
  overflow: auto;
  color: var(--text-color);
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.okay-button {
  background-color: var(--button-bg-color);
  color: var(--text-color);
  border: 1px solid var(--border);
}

.retry-button {
  background-color: var(--special-text);
  color: white;
  border: 1px solid var(--special-text);
}

.btn {
  /* width: 100%; */
  position: relative;
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
