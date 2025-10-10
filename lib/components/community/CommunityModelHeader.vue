<template>
  <div>
    <div class="model-header">
      <div class="model-title">Community Models</div>
      <button
        class="refresh-button"
        @click="$emit('refresh')"
        :disabled="loading"
        data-testid="refresh-models-button"
      >
        <span v-if="!loading">Refresh</span>
        <span v-else>Refreshing...</span>
      </button>
    </div>

    <div class="filters my-4">
      <div class="filter-row flex gap-4 mb-2">
        <div class="search-box flex-grow">
          <label class="text-faint filter-label">Name</label>
          <input
            type="text"
            data-testid="community-model-search"
            :value="searchQuery"
            @input="$emit('update:searchQuery', ($event.target as HTMLInputElement)?.value)"
            placeholder="Search by model name..."
          />
        </div>

        <div class="engine-filter">
          <label class="text-faint filter-label">Model Engine</label>
          <select
            :value="selectedEngine"
            @change="$emit('update:selectedEngine', ($event.target as HTMLSelectElement)?.value)"
            class="px-3 py-2 border rounded"
          >
            <option value="">All Engines</option>
            <option v-for="engine in availableEngines" :key="engine" :value="engine">
              {{ engine }}
            </option>
          </select>
        </div>

        <div class="import-status-filter">
          <label class="text-faint filter-label">Import Status</label>
          <select
            :value="importStatus"
            @change="$emit('update:importStatus', ($event.target as HTMLSelectElement)?.value)"
            class="px-3 py-2 border rounded"
          >
            <option value="all">All Models</option>
            <option value="imported">Imported Only</option>
            <option value="not-imported">Not Imported</option>
          </select>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  searchQuery: string
  selectedEngine: string
  importStatus: string
  availableEngines: string[]
  loading: boolean
}>()

defineEmits<{
  (e: 'refresh'): void
  (e: 'update:searchQuery', value: string): void
  (e: 'update:selectedEngine', value: string): void
  (e: 'update:importStatus', value: string): void
}>()
</script>

<style scoped>
.model-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.refresh-button {
  background-color: var(--button-bg, #2563eb);
  color: var(--text-color);
  padding: 6px 12px;
  border: none;
  font-size: 14px;
  cursor: pointer;
  transition: background-color 0.2s;
  display: flex;
  align-items: center;
  gap: 4px;
}

.refresh-button:hover:not(:disabled) {
  background-color: var(--button-hover-bg, #1d4ed8);
}

.refresh-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.model-title {
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  font-size: 24px;
}

.filters {
  background-color: var(--sidebar-bg-color);
  padding: 12px;
}

.filter-label {
  padding-right: 4px;
}

.filter-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.text-faint {
  color: var(--text-faint);
}

@media (max-width: 768px) {
  .filter-row > div {
    flex: 1 0 100%;
    margin-bottom: 8px;
  }
}
</style>
