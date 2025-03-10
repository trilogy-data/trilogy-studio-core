<template>
  <loading-button class="refresh-button" :action="handleRefresh">
    <i :class="buttonIcon" class="refresh-icon"></i>
  </loading-button>
</template>

<script setup lang="ts">
import { computed, inject } from 'vue'
import LoadingButton from './LoadingButton.vue'
import type { ConnectionStoreType } from '../stores/connectionStore'

interface RefreshButtonProps {
  connection: {
    name: string
    connected: boolean
  }
  isConnected?: boolean
}

const props = defineProps<RefreshButtonProps>()
const emit = defineEmits<{
  (e: 'refresh', connectionName: string): void
}>()

const connectionStore = inject<ConnectionStoreType>('connectionStore')
if (!connectionStore) {
  throw new Error('Connection store is not provided!')
}
// Compute the appropriate icon based on connection status
const buttonIcon = computed(() =>
  props.connection.connected ? 'mdi mdi-refresh' : 'mdi mdi-connection',
)

const handleRefresh = async () => {
  try {
    await connectionStore.resetConnection(props.connection.name)
    emit('refresh', props.connection.name)
  } catch (error) {
    console.error('Refresh failed:', error)
    // Optionally handle error state
  }
}
</script>

<style scoped>
.refresh-button {
  line-height: var(--sidebar-list-item-height);
  height: var(--sidebar-list-item-height);
  min-height: var(--sidebar-list-item-height);
}

.refresh-icon {
  font-size: 16px;
}
</style>
