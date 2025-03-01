<template>
  <div class="results-container">
    <div class="tabs">
      <button
        class="tab-button"
        :class="{ active: activeTab === 'results' }"
        @click="activeTab = 'results'"
      >
        Results ({{ results.data.length }})
      </button>
      <button
        class="tab-button"
        :class="{ active: activeTab === 'sql' }"
        @click="activeTab = 'sql'"
      >
        Generated SQL
      </button>
    </div>
    <div class="tab-content">
      <data-table
        v-if="activeTab === 'results'"
        :headers="results.headers"
        :results="results.data"
        :containerHeight="containerHeight"
      />
      <div v-else class="sql-view">
        <pre>{{ generatedSql }}</pre>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import DataTable from './DataTable.vue'
import { Results } from '../editors/results'

export default {
  name: 'ResultsContainer',
  components: { DataTable },
  props: {
    results: {
      type: Results,
      required: true,
    },
    containerHeight: Number,
    generatedSql: String,
  },
  data() {
    return {
      activeTab: 'results',
    }
  },
}
</script>

<style scoped>
.results-container {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.tabs {
  /* display: flex; */
  border-bottom: 1px solid var(--border-light);
  background: var(--sidebar-bg);
}

.tab-button {
  border: none;
  background: none;
  cursor: pointer;
  font-size: 0.875rem;
  border-bottom: 2px solid transparent;
  padding-left: 20px;
  padding-right: 20px;
  color: var(--text-color);
  /* max-width:100px; */
}

.tab-button:hover {
  color: #0ea5e9;
}

.tab-button.active {
  color: #0ea5e9;
  border-bottom: 2px solid #0ea5e9;
}

.tab-content {
  flex: 1;
  overflow: auto;
}

.sql-view {
  background: var(--result-window-bg);
  color: var(--text-color);
  padding: 1rem;
  height: 100%;
}

.sql-view pre {
  margin: 0;

  white-space: pre-wrap;
  word-wrap: break-word;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.875rem;
  line-height: 1.5;
  height:100%;
}
</style>
