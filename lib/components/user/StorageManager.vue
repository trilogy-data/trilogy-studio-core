<template>
  <div class="storage-container">
    <div class="intro">
      <p>
        Large data (chats, editors, dashboards, model config) is stored in IndexedDB.
        Smaller items (connections, LLM settings, user settings, credentials) stay in
        localStorage. Clear individual keys or prune old chats below.
      </p>
      <button class="button" @click="refresh" :disabled="loading">Refresh</button>
    </div>

    <div v-if="loading" class="empty">Loading…</div>
    <div v-else-if="!rows.length" class="empty">Nothing stored.</div>
    <table v-else class="usage-table">
      <thead>
        <tr>
          <th>Key</th>
          <th>Backend</th>
          <th class="numeric">Size</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="`${row.backend}:${row.key}`">
          <td class="key">{{ row.key }}</td>
          <td><span class="backend-badge" :class="row.backend">{{ row.backend }}</span></td>
          <td class="numeric">{{ formatBytes(row.bytes) }}</td>
          <td>
            <button
              class="button button-small"
              @click="deleteKey(row.key, row.backend)"
              :disabled="loading"
            >
              Delete
            </button>
          </td>
        </tr>
      </tbody>
      <tfoot>
        <tr>
          <td colspan="2"><strong>Total</strong></td>
          <td class="numeric"><strong>{{ formatBytes(totalBytes) }}</strong></td>
          <td></td>
        </tr>
      </tfoot>
    </table>

    <div class="section">
      <h3>Prune old chats</h3>
      <p class="muted">
        Deletes chats whose last activity is older than the selected age. Artifact
        payloads stored in chats are the most common cause of quota errors.
      </p>
      <div class="prune-row">
        <label for="prune-days">Delete chats older than</label>
        <select id="prune-days" v-model.number="pruneDays">
          <option :value="7">7 days</option>
          <option :value="30">30 days</option>
          <option :value="90">90 days</option>
          <option :value="180">180 days</option>
          <option :value="365">1 year</option>
        </select>
        <button class="button" @click="pruneChats" :disabled="loading">
          Prune
        </button>
      </div>
      <div v-if="pruneMessage" class="prune-message">{{ pruneMessage }}</div>
    </div>
  </div>
</template>
<script lang="ts">
import { defineComponent, inject, onMounted, ref, computed } from 'vue'
import LocalStorage from '../../data/localStorage'
import type AbstractStorage from '../../data/storage'

type UsageRow = {
  key: string
  bytes: number
  backend: 'indexeddb' | 'localstorage'
}

export default defineComponent({
  name: 'StorageManager',
  setup() {
    const storageSources = inject<AbstractStorage[]>('storageSources', [])
    const local = (storageSources || []).find(
      (s) => s instanceof LocalStorage,
    ) as LocalStorage | undefined

    const rows = ref<UsageRow[]>([])
    const loading = ref(false)
    const pruneDays = ref(30)
    const pruneMessage = ref('')

    const totalBytes = computed(() =>
      rows.value.reduce((sum, r) => sum + r.bytes, 0),
    )

    async function refresh() {
      if (!local) return
      loading.value = true
      try {
        rows.value = await local.getStorageUsage()
      } finally {
        loading.value = false
      }
    }

    async function deleteKey(key: string, backend: 'indexeddb' | 'localstorage') {
      if (!local) return
      if (!confirm(`Delete "${key}" from ${backend}? This cannot be undone.`)) return
      loading.value = true
      try {
        await local.deleteStorageKey(key, backend)
        await refresh()
      } finally {
        loading.value = false
      }
    }

    async function pruneChats() {
      if (!local) return
      const cutoff = new Date(Date.now() - pruneDays.value * 24 * 60 * 60 * 1000)
      if (!confirm(`Delete all chats last updated before ${cutoff.toLocaleDateString()}?`)) return
      loading.value = true
      try {
        const removed = await local.pruneChatsOlderThan(cutoff)
        pruneMessage.value =
          removed === 0
            ? 'No chats matched the cutoff.'
            : `Removed ${removed} chat${removed === 1 ? '' : 's'}.`
        await refresh()
      } finally {
        loading.value = false
      }
    }

    function formatBytes(bytes: number): string {
      if (bytes < 1024) return `${bytes} B`
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
      return `${(bytes / 1024 / 1024).toFixed(2)} MB`
    }

    onMounted(refresh)

    return {
      rows,
      loading,
      pruneDays,
      pruneMessage,
      totalBytes,
      refresh,
      deleteKey,
      pruneChats,
      formatBytes,
    }
  },
})
</script>
<style scoped>
.storage-container {
  height: 100%;
}

.intro {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 20px;
  margin-bottom: 15px;
}

.intro p {
  margin: 0;
  flex: 1;
}

.empty {
  padding: 20px 0;
  color: var(--text-muted, #888);
}

.usage-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9em;
  margin-bottom: 25px;
}

.usage-table th,
.usage-table td {
  padding: 6px 10px;
  text-align: left;
  border-bottom: 1px solid var(--border-color, #333);
}

.usage-table th {
  font-weight: 600;
  text-transform: uppercase;
  font-size: 0.75em;
  letter-spacing: 0.05em;
}

.usage-table .numeric {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.usage-table .key {
  font-family: var(--code-font, monospace);
  word-break: break-all;
}

.usage-table tfoot td {
  border-bottom: none;
  border-top: 2px solid var(--border-color, #333);
}

.backend-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 3px;
  font-size: 0.75em;
  font-weight: 600;
  text-transform: uppercase;
}

.backend-badge.indexeddb {
  background: var(--badge-info-bg, #1e40af);
  color: var(--badge-info-text, #fff);
}

.backend-badge.localstorage {
  background: var(--badge-neutral-bg, #555);
  color: var(--badge-neutral-text, #fff);
}

.button-small {
  padding: 3px 10px;
  font-size: 0.85em;
}

.section {
  margin-top: 20px;
  padding-top: 15px;
  border-top: 1px solid var(--border-color, #333);
}

.section h3 {
  margin: 0 0 6px 0;
  font-size: 1em;
}

.muted {
  color: var(--text-muted, #888);
  font-size: 0.9em;
  margin: 0 0 10px 0;
}

.prune-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.prune-message {
  margin-top: 10px;
  font-size: 0.9em;
  color: var(--text-muted, #888);
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
