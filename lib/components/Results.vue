<template>
  <div class="results-container">
    <div class="tabs">
      <button
        class="tab-button"
        :class="{ active: activeTab === 'results' }"
        @click="setTab('results')"
        data-testid="results-tab-button"
      >
        Results (<span v-if="error">Error</span
        ><span v-else data-testid="query-results-length">{{ results.data.length }}</span
        >)
      </button>
      <button
        class="tab-button"
        v-if="!(type === 'sql')"
        :class="{ active: activeTab === 'visualize' }"
        @click="setTab('visualize')"
      >
        Visualize
      </button>
      <button
        class="tab-button"
        v-if="!(type === 'sql')"
        :class="{ active: activeTab === 'sql' }"
        @click="setTab('sql')"
      >
        Generated SQL
      </button>
    </div>
    <div class="tab-content">
      <div v-if="activeTab === 'visualize'" class="sql-view">
        <vega-lite-chart
          :data="results.data"
          :columns="results.headers"
          :containerHeight="containerHeight"
        />
      </div>
      <div v-else-if="activeTab === 'sql'" class="sql-view">
        <code-block :language="'sql'" :content="generatedSql || ''" />
        <!-- <pre><code ref="codeBlock" class="language-sql">{{ generatedSql }}</code></pre> -->
      </div>
      <error-message v-else-if="error">
        {{ error }}
        <template #action v-if="error === 'Connection is not active.'">
          <loading-button :action="handleReconnect">
            Reconnect
            {{ connection }}
          </loading-button>
        </template>
      </error-message>
      <data-table
        v-else
        :headers="results.headers"
        :results="results.data"
        :containerHeight="containerHeight"
      />
    </div>
  </div>
</template>

<script lang="ts">
import DataTable from './DataTable.vue'
import { Results } from '../editors/results'
// import type {ChartConfig} from '../editors/results'
import { ref, onMounted, onUpdated, inject } from 'vue'
import Prism from 'prismjs'
import VegaLiteChart from './VegaLiteChart.vue'
import { getDefaultValueFromHash, pushHashToUrl } from '../stores/urlStore'
import type { ConnectionStoreType } from '../stores/connectionStore'
import ErrorMessage from './ErrorMessage.vue'
import LoadingButton from './LoadingButton.vue'
import CodeBlock from './CodeBlock.vue'

export default {
  name: 'ResultsContainer',
  components: { DataTable, VegaLiteChart, ErrorMessage, LoadingButton, CodeBlock },
  props: {
    type: {
      type: String,
      required: true,
    },
    results: {
      type: Results,
      required: true,
    },
    chartConfig: {
      required: false,
    },
    error: {
      type: String,
      required: false,
    },
    connection: {
      type: String,
      required: false,
    },
    containerHeight: Number,
    generatedSql: String,
  },
  data() {
    return {
      activeTab: getDefaultValueFromHash('activeEditorTab', 'results'),
    }
  },
  methods: {
    setTab(tab: string) {
      this.activeTab = tab
      pushHashToUrl('activeEditorTab', tab)
    },
    handleReconnect() {
      if (this.connection) {
        return this.connectionStore.resetConnection(this.connection).then(() => {})
      }
      return Promise.resolve()
    },
  },
  setup() {
    const connectionStore = inject<ConnectionStoreType>('connectionStore')

    if (!connectionStore) {
      throw new Error('Requires injection of connection store')
    }

    const codeBlock = ref<HTMLElement | null>(null)
    const updateRefs = () => {
      if (codeBlock.value) {
        if (Array.isArray(codeBlock.value)) {
          codeBlock.value.forEach((block) => {
            if (block) Prism.highlightElement(block)
          })
        } else if (codeBlock.value) {
          Prism.highlightElement(codeBlock.value)
        }
      }
    }
    onMounted(() => {
      updateRefs()
    })
    onUpdated(() => {
      updateRefs()
    })

    return {
      codeBlock,
      connectionStore,
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
  min-height: 30px;
  z-index: 99;
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
}

.sql-view pre {
  margin: 0;

  white-space: pre-wrap;
  word-wrap: break-word;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.875rem;
  line-height: 1.5;
  height: 100%;
}
</style>
