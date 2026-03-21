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
    <span v-if="!props.connection.connected" class="connect-label">Connect</span>
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

const buttonClass = computed(() =>
  props.connection.connected ? 'sidebar-icon-button' : 'sidebar-connect-button',
)

const buttonTestId = computed(() =>
  props.connection.connected
    ? `refresh-connection-${props.connection.name}`
    : `connect-connection-${props.connection.name}`,
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

.sidebar-connect-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 26px;
  padding: 4px 10px;
  border: 1px solid var(--border-light);
  background: transparent;
  color: var(--text-color);
  font-size: 12px;
}

.refresh-icon {
  font-size: 15px;
}

.connect-label {
  line-height: 1;
}
</style>
