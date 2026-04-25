<template>
  <loading-button
    class="refresh-button"
    :class="buttonClass"
    :action="handleRefresh"
    :data-testid="buttonTestId"
    :useDefaultStyle="false"
    :testId="buttonTestId"
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
// Use an explicit connect action when the connection is currently idle/disconnected.
const buttonIcon = computed(() =>
  props.connection.connected ? 'mdi mdi-refresh' : 'mdi mdi-power-plug-outline',
)

const buttonClass = 'sidebar-icon-button'

const buttonTestId = computed(() =>
  props.connection.connected
    ? `refresh-connection-${props.connection.name}`
    : `connect-connection-${props.connection.name}`,
)

const handleRefresh = async () => {
  try {
    await connectionStore.resetConnection(props.connection.id)
    emit('refresh', props.connection.name)
  } catch (error) {
    console.error('Refresh failed:', error)
    throw error
    // Optionally handle error state
  }
}
</script>

<style scoped>
.refresh-icon {
  font-size: 13px;
}
</style>
