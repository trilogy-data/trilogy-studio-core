<template>
  <teleport to="body">
    <div v-if="visibleErrors.length" class="connection-error-stack">
      <div
        v-for="item in visibleErrors"
        :key="item.id"
        class="connection-error-card"
        role="alert"
        :data-testid="`connection-error-popup-${item.name}`"
      >
        <div class="card-header">
          <span class="card-badge">Connection Failed</span>
          <span class="card-title">{{ item.name }}</span>
          <button
            class="dismiss-button"
            aria-label="Dismiss connection error"
            :data-testid="`dismiss-connection-error-${item.name}`"
            @click="dismiss(item)"
          >
            ×
          </button>
        </div>
        <pre class="card-error">{{ item.error }}</pre>
      </div>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue'
import type { ConnectionStoreType } from '../stores/connectionStore'

interface ConnectionError {
  id: string
  name: string
  error: string
}

const connectionStore = inject<ConnectionStoreType>('connectionStore')
if (!connectionStore) {
  throw new Error('Connection store is not provided!')
}

// Keyed by connection id + error text: dismissing hides that exact failure,
// but a new/different error on the same connection pops again.
const dismissed = ref<Record<string, boolean>>({})

const errorKey = (item: ConnectionError) => `${item.id}::${item.error}`

const activeErrors = computed<ConnectionError[]>(() =>
  Object.values(connectionStore.connections)
    .filter((connection) => connection.error && !connection.deleted)
    .map((connection) => ({
      id: connection.id,
      name: connection.name,
      error: connection.error as string,
    })),
)

const visibleErrors = computed(() =>
  activeErrors.value.filter((item) => !dismissed.value[errorKey(item)]),
)

// Once a connection recovers (error cleared), forget its dismissals so a
// later identical failure is surfaced again instead of staying hidden.
watch(activeErrors, (errors) => {
  const liveKeys = new Set(errors.map(errorKey))
  for (const key of Object.keys(dismissed.value)) {
    if (!liveKeys.has(key)) {
      delete dismissed.value[key]
    }
  }
})

const dismiss = (item: ConnectionError) => {
  dismissed.value[errorKey(item)] = true
}
</script>

<style scoped>
.connection-error-stack {
  position: fixed;
  bottom: 16px;
  right: 16px;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: min(440px, calc(100vw - 32px));
}

.connection-error-card {
  background-color: var(--bg-color);
  border: 1px solid var(--border);
  border-left: 4px solid #ef4444;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  padding: 12px 14px;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.card-badge {
  color: #ef4444;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  white-space: nowrap;
}

.card-title {
  color: var(--text-color);
  font-size: 13px;
  font-weight: 600;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dismiss-button {
  background: none;
  border: none;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  color: var(--text-color);
  opacity: 0.6;
  padding: 0;
  width: 22px;
  height: 22px;
  flex-shrink: 0;
}

.dismiss-button:hover {
  opacity: 1;
}

.card-error {
  margin: 8px 0 0 0;
  color: var(--text-color);
  font-size: 12px;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 160px;
  overflow-y: auto;
  font-family: inherit;
}
</style>
