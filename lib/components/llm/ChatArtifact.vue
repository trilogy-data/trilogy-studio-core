<template>
  <div class="chat-artifact" :class="{ expanded: isExpanded }">
    <div class="artifact-header" @click="toggleExpanded">
      <span class="artifact-type-icon">
        <i :class="typeIcon"></i>
      </span>
      <span class="artifact-title">{{ title }}</span>
      <div class="artifact-actions">
        <button
          v-if="canExpand"
          class="artifact-action-btn"
          @click.stop="$emit('expand', artifact)"
          title="Open in full view"
        >
          <i class="mdi mdi-arrow-expand"></i>
        </button>
        <button
          class="artifact-action-btn"
          @click.stop="toggleExpanded"
          :title="isExpanded ? 'Collapse' : 'Expand'"
        >
          <i :class="isExpanded ? 'mdi mdi-chevron-up' : 'mdi mdi-chevron-down'"></i>
        </button>
      </div>
    </div>

    <div v-show="isExpanded" class="artifact-content">
      <!-- Results/Table Display -->
      <template v-if="artifact.type === 'results' && results">
        <div class="artifact-tabs">
          <button
            class="artifact-tab"
            :class="{ active: activeTab === 'table' }"
            @click="activeTab = 'table'"
          >
            Table ({{ results.data.length }})
          </button>
          <button
            class="artifact-tab"
            :class="{ active: activeTab === 'chart' }"
            @click="activeTab = 'chart'"
          >
            Chart
          </button>
        </div>

        <div class="artifact-display" :style="{ height: displayHeight + 'px' }">
          <data-table
            v-if="activeTab === 'table'"
            :headers="results.headers"
            :results="results.data"
            :containerHeight="displayHeight"
          />
          <vega-lite-chart
            v-else-if="activeTab === 'chart'"
            :data="results.data"
            :columns="results.headers"
            :containerHeight="displayHeight"
            :initialConfig="chartConfig"
            :showControls="true"
            @config-change="handleChartConfigChange"
          />
        </div>
      </template>

      <!-- Chart-only Display -->
      <template v-else-if="artifact.type === 'chart' && results">
        <div class="artifact-display" :style="{ height: displayHeight + 'px' }">
          <vega-lite-chart
            :data="results.data"
            :columns="results.headers"
            :containerHeight="displayHeight"
            :initialConfig="chartConfig"
            :showControls="true"
            @config-change="handleChartConfigChange"
          />
        </div>
      </template>

      <!-- Code Display -->
      <template v-else-if="artifact.type === 'code'">
        <code-block :language="artifact.config?.language || 'sql'" :content="artifact.data || ''" />
      </template>

      <!-- Custom/Unknown -->
      <template v-else>
        <div class="artifact-custom">
          <slot :artifact="artifact">
            <pre>{{ JSON.stringify(artifact.data, null, 2) }}</pre>
          </slot>
        </div>
      </template>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, computed, type PropType } from 'vue'
import DataTable from '../DataTable.vue'
import VegaLiteChart from '../VegaLiteChart.vue'
import CodeBlock from '../CodeBlock.vue'
import { Results, type ChartConfig } from '../../editors/results'
import type { ChatArtifact } from './LLMChat.vue'

export default defineComponent({
  name: 'ChatArtifactComponent',
  components: {
    DataTable,
    VegaLiteChart,
    CodeBlock,
  },
  props: {
    artifact: {
      type: Object as PropType<ChatArtifact>,
      required: true,
    },
    defaultExpanded: {
      type: Boolean,
      default: true,
    },
    canExpand: {
      type: Boolean,
      default: true,
    },
    height: {
      type: Number,
      default: 300,
    },
  },
  emits: ['expand', 'config-change'],
  setup(props, { emit }) {
    const isExpanded = ref(props.defaultExpanded)
    const activeTab = ref<'table' | 'chart'>('table')

    const title = computed(() => {
      if (props.artifact.config?.title) {
        return props.artifact.config.title
      }
      switch (props.artifact.type) {
        case 'results':
          return 'Query Results'
        case 'chart':
          return 'Chart'
        case 'code':
          return 'Code'
        default:
          return 'Artifact'
      }
    })

    const typeIcon = computed(() => {
      switch (props.artifact.type) {
        case 'results':
          return 'mdi mdi-table'
        case 'chart':
          return 'mdi mdi-chart-bar'
        case 'code':
          return 'mdi mdi-code-braces'
        default:
          return 'mdi mdi-file-document-outline'
      }
    })

    const results = computed(() => {
      if (!props.artifact.data) return null

      // If already a Results instance, return it
      if (props.artifact.data instanceof Results) {
        return props.artifact.data
      }

      // Try to construct Results from raw data
      if (props.artifact.data.headers && props.artifact.data.data) {
        return Results.fromJSON(props.artifact.data)
      }

      return null
    })

    const chartConfig = computed<ChartConfig | undefined>(() => {
      return props.artifact.config?.chartConfig
    })

    const displayHeight = computed(() => {
      return props.height - 40 // Account for header and tabs
    })

    const toggleExpanded = () => {
      isExpanded.value = !isExpanded.value
    }

    const handleChartConfigChange = (config: ChartConfig) => {
      emit('config-change', config)
    }

    return {
      isExpanded,
      activeTab,
      title,
      typeIcon,
      results,
      chartConfig,
      displayHeight,
      toggleExpanded,
      handleChartConfigChange,
    }
  },
})
</script>

<style scoped>
.chat-artifact {
  border: 1px solid var(--border-light);
  background-color: var(--bg-color);
  overflow: hidden;
  margin-top: 8px;
}

.artifact-header {
  display: flex;
  align-items: center;
  padding: 6px 10px;
  background-color: var(--sidebar-bg);
  border-bottom: 1px solid var(--border-light);
  cursor: pointer;
  gap: 8px;
}

.artifact-header:hover {
  background-color: var(--button-mouseover);
}

.artifact-type-icon {
  color: var(--special-text);
  font-size: 14px;
}

.artifact-title {
  flex: 1;
  font-size: var(--font-size);
  font-weight: 500;
  color: var(--text-color);
}

.artifact-actions {
  display: flex;
  gap: 4px;
}

.artifact-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--text-color);
  cursor: pointer;
  border-radius: 2px;
}

.artifact-action-btn:hover {
  background-color: var(--border-light);
}

.artifact-content {
  overflow: hidden;
}

.artifact-tabs {
  display: flex;
  border-bottom: 1px solid var(--border-light);
  background-color: var(--sidebar-bg);
}

.artifact-tab {
  padding: 6px 12px;
  border: none;
  background: transparent;
  color: var(--text-color);
  font-size: var(--small-font-size);
  cursor: pointer;
  border-bottom: 2px solid transparent;
}

.artifact-tab:hover {
  color: var(--special-text);
}

.artifact-tab.active {
  color: var(--special-text);
  border-bottom-color: var(--special-text);
}

.artifact-display {
  overflow: auto;
}

.artifact-custom {
  padding: 10px;
  overflow: auto;
}

.artifact-custom pre {
  margin: 0;
  white-space: pre-wrap;
  font-size: var(--font-size);
  color: var(--text-color);
}

.chat-artifact.expanded .artifact-content {
  display: block;
}
</style>
