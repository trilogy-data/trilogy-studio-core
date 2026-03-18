<template>
  <loading-button
    class="refresh-button sidebar-icon-button"
    :action="handleRefresh"
    :data-testid="`refresh-connection-${connection.name}`"
    :useDefaultStyle="false"
    :testId="`refresh-connection-${connection.name}`"
    @click.stop
  >
    <i :class="buttonIcon" class="refresh-icon"></i>
  </loading-button>
</template>

<script setup lang="ts">
import { computed, inject } from 'vue'
import LoadingButton from '../LoadingButton.vue'
import type { ConnectionStoreType } from '../../stores/connectionStore'
import type { LLMConnectionStoreType } from '../../stores/llmStore'

export interface RefreshButtonProps {
  connection: {
    name: string
    connected: boolean
  }
  type?: string
  isConnected?: boolean
}

const props = defineProps<RefreshButtonProps>()
const emit = defineEmits<{
  (e: 'refresh', connectionName: string): void
}>()
let connectionStore: ConnectionStoreType | LLMConnectionStoreType | undefined
if (props.type === 'llm') {
  connectionStore = inject<ConnectionStoreType>('llmConnectionStore')
} else {
  connectionStore = inject<ConnectionStoreType>('connectionStore')
}

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
    throw error
    // Optionally handle error state
  }
}
</script>

<style scoped>
.refresh-button {
  border-radius: var(--radius-sm);
}

.refresh-icon {
  font-size: 15px;
}
</style>
