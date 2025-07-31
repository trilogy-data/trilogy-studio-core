<template>
  <status-icon :message="statusMessage" :status="statusClass" :testName="connection.name" />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import StatusIcon from '../StatusIcon.vue'
export interface StatusIconProps {
  connection: {
    name: string
    connected: boolean
    error: string | null
  }
}

const props = defineProps<StatusIconProps>()

// Determine status class and message
const statusClass = computed(() => {
  if (!props.connection.connected) return 'idle'
  return props.connection.error ? 'failed' : 'connected'
})

const statusMessage = computed(() => {
  if (!props.connection.connected) return 'Disconnected'
  if (props.connection.error) return props.connection.error
  return 'Connected'
})
</script>

<style scoped></style>
