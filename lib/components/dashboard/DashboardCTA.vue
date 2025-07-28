<script lang="ts" setup>
import { ref, inject, computed } from 'vue'

import { CELL_TYPES } from '../../dashboards/base'
import type { DashboardStoreType } from '../../stores/dashboardStore'
import type { LLMConnectionStoreType } from '../../stores/llmStore'
import QueryExecutionService from '../../stores/queryExecutionService'
import type { EditorStoreType } from '../../stores/editorStore'

const dashboardStore = inject<DashboardStoreType>('dashboardStore') as DashboardStoreType
const editorStore = inject<EditorStoreType>('editorStore') as EditorStoreType
const llmStore = inject<LLMConnectionStoreType>('llmConnectionStore') as LLMConnectionStoreType
const queryExecutionService = inject<QueryExecutionService>(
  'queryExecutionService',
) as QueryExecutionService
const saveDashboards = inject<CallableFunction>('saveDashboards') as CallableFunction
if (!dashboardStore || !llmStore || !queryExecutionService || !saveDashboards) {
  throw new Error('DashboardStore, LLMConnectionStore, or QueryExecutionService not provided')
}
// Props definition
const props = defineProps<{
  dashboardId: string
}>()

const hasLlmConnection = computed(() => {
  return llmStore.activeConnection
})

// Emits
const emit = defineEmits<{
  (e: 'template-selected', templateName: string): void
  (e: 'description-updated', description: string): void
}>()

// Dashboard description
const description = ref('')
// Dashboard prompt for LLM
const dashboardPrompt = ref('')
// LLM generation loading state
const isGenerating = ref(false)
// LLM generation error state
const generationError = ref('')

// Template selection state
const selectedTemplate = ref<string | null>(null)

const width = 20
const fourth = width / 4
// Define dashboard template options
const templates = [
  {
    id: 'summary',
    name: 'Summary Dashboard',
    description: 'High-level metrics and KPIs with key visualizations',
    icon: 'mdi-view-dashboard',
    layout: [
      { i: 'title', x: 0, y: 0, w: width, h: 3, type: CELL_TYPES.MARKDOWN },
      { i: 'kpi1', x: 0, y: 3, w: width / 4, h: 4, type: CELL_TYPES.CHART },
      { i: 'kpi2', x: fourth, y: 3, w: width / 4, h: 4, type: CELL_TYPES.CHART },
      { i: 'kpi3', x: fourth * 2, y: 3, w: width / 4, h: 4, type: CELL_TYPES.CHART },
      { i: 'kpi4', x: fourth * 3, y: 3, w: width / 4, h: 4, type: CELL_TYPES.CHART },
      { i: 'trend', x: 0, y: 7, w: width / 2, h: 8, type: CELL_TYPES.CHART },
      { i: 'breakdown', x: width / 2, y: 7, w: width / 2, h: 8, type: CELL_TYPES.CHART },
    ],
  },
  {
    id: 'drilldown',
    name: 'Drill-Down Analysis',
    description: 'Hierarchical data exploration with filtering capabilities',
    icon: 'mdi-magnify-expand',
    layout: [
      { i: 'filters', x: 0, y: 0, w: width, h: 3, type: CELL_TYPES.MARKDOWN },
      { i: 'overview', x: 0, y: 3, w: width, h: 5, type: CELL_TYPES.CHART },
      { i: 'detail1', x: 0, y: 8, w: width / 2, h: 8, type: CELL_TYPES.CHART },
      { i: 'detail2', x: width / 2, y: 10, w: width / 2, h: 8, type: CELL_TYPES.CHART },
      { i: 'datatable', x: 0, y: 20, w: width, h: 8, type: CELL_TYPES.TABLE },
    ],
  },
  {
    id: 'comparison',
    name: 'Comparison Dashboard',
    description: 'Side-by-side comparisons of metrics across dimensions',
    icon: 'mdi-compare',
    layout: [
      { i: 'title', x: 0, y: 0, w: width, h: 3, type: CELL_TYPES.MARKDOWN },
      { i: 'compare1', x: 0, y: 3, w: width / 2, h: 6, type: CELL_TYPES.CHART },
      { i: 'compare2', x: width / 2, y: 3, w: width / 2, h: 6, type: CELL_TYPES.CHART },
      { i: 'compare3', x: 0, y: 9, w: width / 2, h: 6, type: CELL_TYPES.CHART },
      { i: 'compare4', x: width / 2, y: 9, w: width / 2, h: 6, type: CELL_TYPES.CHART },
      { i: 'summary', x: 0, y: 15, w: width, h: 5, type: CELL_TYPES.MARKDOWN },
    ],
  },
  {
    id: 'trends',
    name: 'Time Series Analysis',
    description: 'Visualization of trends and patterns over time',
    icon: 'mdi-chart-timeline-variant',
    layout: [
      { i: 'headline', x: 0, y: 0, w: width, h: 3, type: CELL_TYPES.MARKDOWN },
      { i: 'maintrend', x: 0, y: 3, w: width, h: 8, type: CELL_TYPES.CHART },
      { i: 'breakdown1', x: 0, y: 11, w: width / 3, h: 6, type: CELL_TYPES.CHART },
      { i: 'breakdown2', x: width / 3, y: 11, w: width / 3, h: 6, type: CELL_TYPES.CHART },
      { i: 'breakdown3', x: (width / 3) * 2, y: 11, w: width / 3, h: 6, type: CELL_TYPES.CHART },
      { i: 'forecast', x: 0, y: 17, w: width, h: 6, type: CELL_TYPES.CHART },
    ],
  },
  //   {
  //     id: 'custom',
  //     name: 'Start from Scratch',
  //     description: 'Build your dashboard completely from scratch',
  //     icon: 'mdi-pencil-outline',
  //     layout: []
  //   }
]

// Select a template and apply it
function selectTemplate(templateId: string): void {
  selectedTemplate.value = templateId
  const template = templates.find((t) => t.id === templateId)

  if (template && props.dashboardId) {
    // Emit the template selected event
    for (const cell of template.layout) {
      dashboardStore.addItemToDashboard(
        props.dashboardId,
        cell.type,
        cell.x,
        cell.y,
        cell.w,
        cell.h,
      )
    }
    emit('template-selected', templateId)
  }
}

// Update dashboard description
function updateDescription(): void {
  if (props.dashboardId && description.value) {
    // In a real implementation, this would update the dashboard description
    dashboardStore.updateDashboardDescription(props.dashboardId, description.value)

    // Emit the description updated event
    emit('description-updated', description.value)
  }
}

// Fully implemented LLM generation function
async function generateDashboardWithLLM(): Promise<void> {
  if (!dashboardPrompt.value.trim()) {
    generationError.value = 'Please provide a prompt for the dashboard generation.'
    return
  }

  try {
    isGenerating.value = true
    generationError.value = ''

    // Generate the prompt specification based on user input
    const promptSpec = await dashboardStore.generatePromptSpec(
      dashboardPrompt.value,
      llmStore,
      queryExecutionService,
      editorStore,
    )
    console.log('Prompt spec generated:', promptSpec)

    if (promptSpec) {
      // Populate the dashboard with the generated specification
      await dashboardStore.populateFromPromptSpec(
        props.dashboardId,
        promptSpec,
        llmStore,
        queryExecutionService,
        editorStore,
      )

      // Update the dashboard description if not already set
      if (!description.value && promptSpec.description) {
        description.value = promptSpec.description
        updateDescription()
      }

      // Save the dashboards
      saveDashboards()
    } else {
      generationError.value = 'Failed to generate dashboard specification.'
    }
  } catch (error) {
    console.error('Error generating dashboard with LLM:', error)
    generationError.value = 'An error occurred while generating the dashboard.'
  } finally {
    isGenerating.value = false
  }
}
</script>

<template>
  <div class="dashboard-setup">
    <div class="setup-header">
      <h2 class="setup-title">An Empty Dashboard</h2>
      <p class="setup-subtitle">
        Choose a template or start from scratch by using the 'add item' button to add charts,
        tables, and more.
      </p>
    </div>

    <div class="setup-section">
      <h3 class="section-title">Description</h3>
      <textarea
        v-model="description"
        placeholder="What is this dashboard for? Add context to help viewers understand the data..."
        rows="3"
        class="description-input"
      ></textarea>
      <button
        @click="updateDescription"
        class="action-button save-button"
        data-testid="dashboard-description-save"
      >
        <i class="mdi mdi-content-save"></i> Save
      </button>
    </div>

    <div v-if="hasLlmConnection" class="setup-section">
      <h3 class="section-title">AI Copilot</h3>
      <p class="section-desc">
        Let AI help build your dashboard based on your data and description
      </p>
      <textarea
        v-model="dashboardPrompt"
        placeholder="Describe the dashboard you want to create. For example: 'Create a sales performance dashboard with monthly trends, regional breakdown, and top product metrics.'"
        rows="4"
        class="description-input"
        data-testid="dashboard-prompt-input"
      ></textarea>
      <div class="action-row">
        <button
          @click="generateDashboardWithLLM"
          class="action-button llm-button"
          :disabled="isGenerating || !dashboardPrompt.trim()"
          data-testid="generate-with-llm-button"
        >
          <i class="mdi" :class="isGenerating ? 'mdi-loading mdi-spin' : 'mdi-creation'"></i>
          {{ isGenerating ? 'Generating...' : 'Generate with AI' }}
        </button>
        <div v-if="generationError" class="error-message">
          {{ generationError }}
        </div>
      </div>
    </div>

    <div class="setup-section">
      <h3 class="section-title">Templates</h3>
      <div class="templates-grid">
        <div
          v-for="template in templates"
          :key="template.id"
          :class="['template-card', { selected: selectedTemplate === template.id }]"
          @click="selectTemplate(template.id)"
          :data-testid="`template-card-${template.id}`"
        >
          <div class="template-icon">
            <i :class="['mdi', template.icon]"></i>
          </div>
          <div class="template-info">
            <h4 class="template-title">{{ template.name }}</h4>
            <p class="template-desc">{{ template.description }}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- <div class="setup-section">
      <h3 class="section-title">Resources</h3>
      <div class="resource-links">
        <a href="#" class="resource-link"><i class="mdi mdi-book-open-variant"></i> Docs</a>
        <a href="#" class="resource-link"><i class="mdi mdi-video"></i> Tutorials</a>
        <a href="#" class="resource-link"><i class="mdi mdi-lightbulb-on"></i> Examples</a>
      </div>
    </div> -->
  </div>
</template>

<style>
.dashboard-setup {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  max-width: 1500px;
  margin: 0 auto;
  padding: 1.5rem;
  background-color: var(--bg-color);
  color: var(--text-color);
}

.setup-header {
  text-align: left;
  margin-bottom: 0.5rem;
}

.setup-title {
  font-size: 1.6rem;
  font-weight: 500;
  margin-bottom: 0.25rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.setup-subtitle {
  font-size: 1rem;
  opacity: 0.7;
  margin: 0;
}

.setup-section {
  background: var(--result-window-bg);
  padding: 1.25rem;
  border: 1px solid var(--border-light);
}

.section-title {
  font-size: 1.1rem;
  font-weight: 500;
  margin-top: 0;
  margin-bottom: 1rem;
}

.section-desc {
  font-size: 0.9rem;
  margin-bottom: 1rem;
  opacity: 0.8;
}

.description-input {
  width: 100%;
  background: var(--bg-color);
  box-sizing: border-box;
  border: 1px solid var(--border-light);
  padding: 0.75rem;
  font-size: 0.9rem;
  color: var(--text-color);
  resize: vertical;
  margin-bottom: 1rem;
  font-family: inherit;
}

.description-input:focus {
  outline: none;
  border-color: var(--special-text);
}

.action-row {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.error-message {
  color: #e53935;
  font-size: 0.85rem;
}

.templates-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
}

.template-card {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 1rem;
  background: var(--bg-color);
  border: 1px solid var(--border-light);
  cursor: pointer;
  transition: all 0.2s ease;
}

.template-card:hover {
  border-color: var(--special-text);
}

.template-card.selected {
  border: 1px solid var(--special-text);
  background-color: rgba(var(--special-text-rgb, 0, 102, 204), 0.05);
}

.template-icon {
  font-size: 1.5rem;
  color: var(--special-text);
  margin-top: 0.25rem;
}

.template-info {
  flex: 1;
}

.template-title {
  margin: 0 0 0.25rem 0;
  font-size: 1rem;
  font-weight: 500;
}

.template-desc {
  font-size: 0.85rem;
  margin: 0;
  opacity: 0.7;
  line-height: 1.4;
}

.action-button {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border: none;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s;
  background-color: var(--special-text);
  color: white;
}

.action-button:hover {
  opacity: 0.9;
}

.action-button:disabled {
  background-color: var(--border-light);
  cursor: not-allowed;
  opacity: 0.7;
}

.resource-links {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.resource-link {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: var(--bg-color);
  border: 1px solid var(--border-light);
  color: var(--text-color);
  text-decoration: none;
  font-size: 0.85rem;
  transition: all 0.2s;
}

.resource-link:hover {
  color: var(--special-text);
  border-color: var(--special-text);
}

/* Mobile Responsiveness */
@media (max-width: 768px) {
  .dashboard-setup {
    padding: 1rem;
    gap: 1rem;
  }

  .templates-grid {
    grid-template-columns: 1fr;
  }

  .resource-links {
    flex-direction: column;
  }

  .resource-link {
    width: 100%;
  }

  .setup-title {
    font-size: 1.3rem;
  }

  .section-title {
    font-size: 1rem;
  }
}
</style>
