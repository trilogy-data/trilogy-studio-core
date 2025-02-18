<template>
  <div class="loading-container">
    <div class="loading-animation">
      <div class="circle"></div>
      <div class="circle"></div>
      <div class="circle"></div>
    </div>
    <div class="loading-text">Running query{{ dots }}</div>
    <div class="cancel-container">
      <button v-if="cancel" @click="handleCancel" class="cancel-button">Cancel</button>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, onMounted, onBeforeUnmount } from 'vue'

interface Props {
  cancel?: (() => void) | null
}

export default defineComponent({
  name: 'LoadingPlaceholder',
  props: {
    cancel: {
      type: Function,
      required: false,
    },
  },
  setup(props: Props) {
    const dots = ref('')
    let intervalId: number

    const animateDots = () => {
      intervalId = window.setInterval(() => {
        dots.value = dots.value.length >= 3 ? '' : dots.value + '.'
      }, 500)
    }

    const handleCancel = () => {
      if (props.cancel) {
        props.cancel()
      }
    }

    onMounted(() => {
      animateDots()
    })

    onBeforeUnmount(() => {
      clearInterval(intervalId)
    })

    return {
      dots,
      handleCancel,
    }
  },
})
</script>

<style scoped>
.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 2rem;
  background: var(--bg-light);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  height: 100%;
}

.loading-animation {
  display: flex;
  gap: 8px;
  margin-bottom: 1rem;
}

.circle {
  width: 12px;
  height: 12px;
  background-color: #3498db;
  border-radius: 50%;
  animation: bounce 0.6s infinite;
}

.circle:nth-child(2) {
  animation-delay: 0.2s;
}

.circle:nth-child(3) {
  animation-delay: 0.4s;
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
  background-color: #e74c3c;
  color: white;
  border: none;
  cursor: pointer;
  transition: background-color 0.2s;
  height: 24px !important;
  width: 100px;
}

.cancel-button:hover {
  background-color: #c0392b;
}

.cancel-container {
  height: 10px;
}
</style>
