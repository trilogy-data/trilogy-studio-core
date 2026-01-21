<template>
  <div class="results-container">
    <div class="tabs">
      <div class="tabs-left">
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
      <div class="tabs-right">
        <button
          v-if="showChatButton"
          class="chat-button"
          @click="$emit('open-chat')"
          title="Open AI Chat"
        >
          <i class="mdi mdi-chat-outline"></i>
        </button>
      </div>
    </div>
    <div class="tab-content">
      <drilldown-pane
        v-if="activeDrilldown"
        :drilldown-remove="activeDrilldown.remove"
        :drilldown-filter="activeDrilldown.filter"
        @close="activeDrilldown = null"
        :symbols="symbols || []"
        @submit="submitDrilldown"
      />

      <div v-else-if="displayTab === 'visualize'" class="sql-view">
        <vega-lite-chart
          :data="results.data"
          :columns="results.headers"
          :containerHeight="tabContentHeight"
          :initialConfig="chartConfig"
          :onChartConfigChange="onChartChange"
          @refresh-click="handleLocalRefresh"
          @drilldown-click="activateDrilldown"
        />
      </div>
      <div v-else-if="displayTab === 'sql'" class="sql-view">
        <code-block :language="'sql'" :content="generatedSql || ''" />
        <!-- <pre><code ref="codeBlock" class="language-sql">{{ generatedSql }}</code></pre> -->
      </div>
      <error-message
        v-else-if="error"
        :type="
          error === 'Connection is not active... Attempting to automatically reconnect.'
            ? 'information'
            : 'error'
        "
      >
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
        :containerHeight="tabContentHeight"
        @drilldown-click="activateDrilldown"
      />
    </div>
  </div>
</template>

<script lang="ts">
import DataTable from '../DataTable.vue'
import { Results } from '../../editors/results'
// import type {ChartConfig} from '../editors/results'
import { ref, onMounted, onUpdated, inject, type PropType } from 'vue'
import Prism from 'prismjs'
import VegaLiteChart from '../VegaLiteChart.vue'
import { getDefaultValueFromHash, pushHashToUrl } from '../../stores/urlStore'
import type { ConnectionStoreType } from '../../stores/connectionStore'
import ErrorMessage from '../ErrorMessage.vue'
import LoadingButton from '../LoadingButton.vue'
import CodeBlock from '../CodeBlock.vue'
import DrilldownPane from '../DrilldownPane.vue'
import type { ChartConfig } from '../../editors/results'
import type { CompletionItem } from '../../stores/resolver'
import { objectToSqlExpression } from '../../dashboards/conditions'
import type { DrillDownTriggerEvent } from '../../events/display'

export interface Drilldown {
  remove: string
  filter: string
}

export default {
  name: 'ResultsContainer',
  components: { DataTable, VegaLiteChart, ErrorMessage, LoadingButton, CodeBlock, DrilldownPane },
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
      type: Object as PropType<ChartConfig | null>,
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
    symbols: {
      type: Object as PropType<CompletionItem[]>,
      required: false,
    },
    containerHeight: Number,
    generatedSql: String,
    defaultTab: {
      type: String,
      required: false,
      default: null,
    },
    showChatButton: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['config-change', 'drilldown-click', 'refresh-click', 'open-chat'],
  data() {
    return {
      activeTab: this.defaultTab || getDefaultValueFromHash('activeEditorTab', 'results'),
      activeDrilldown: null as Drilldown | null,
      TABS_HEIGHT: 30, // Height of the tabs header
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
    onChartChange(config: any) {
      this.$emit('config-change', config)
    },
    activateDrilldown(e: DrillDownTriggerEvent) {
      let remove = Object.keys(e.filters)[0]
      let filterString = objectToSqlExpression(e.filters)
      if (!remove) {
        return
      }
      this.activeDrilldown = { remove, filter: filterString }
    },
    submitDrilldown(selected: string[]) {
      this.$emit('drilldown-click', {
        remove: this.activeDrilldown?.remove,
        filter: this.activeDrilldown?.filter,
        add: selected,
      })
    },
    handleLocalRefresh() {
      this.$emit('refresh-click')
    },
  },
  computed: {
    tabContentHeight(): number {
      // Subtract tabs height from container height for components that need explicit heights
      return this.containerHeight ? this.containerHeight - this.TABS_HEIGHT : 0
    },
    eligibleTabs() {
      const tabs: string[] = ['results']

      if (this.type !== 'sql') {
        if (!this.error) {
          tabs.push('visualize')
        }
        tabs.push('sql')
      }

      return tabs
    },
    displayTab() {
      return this.eligibleTabs.filter((tab) => this.activeTab === tab)[0]
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
  overflow: hidden;
}

.tabs {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--border-light);
  background: var(--sidebar-bg);
  min-height: 30px;
  height: 30px;
  z-index: 99;
}

.tabs-left {
  display: flex;
  align-items: center;
}

.tabs-right {
  display: flex;
  align-items: center;
  padding-right: 8px;
}

.chat-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--text-faint);
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.15s ease;
}

.chat-button:hover {
  background: var(--border-light);
  color: var(--special-text);
}

.chat-button i {
  font-size: 16px;
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
  border-radius: 0px;
  /* max-width:100px; */
}

.tab-button:hover {
  color: #0ea5e9;
}

.tab-button.active {
  color: #0ea5e9;
  border-bottom: 2px solid #0ea5e9;
  border-radius: 0px;
}

.tab-content {
  flex: 1;
  overflow: auto;
}

.sql-view {
  background: var(--result-window-bg);
  color: var(--text-color);
  height: 100%;
  overflow: auto;
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
