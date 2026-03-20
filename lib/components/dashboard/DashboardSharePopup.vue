<script setup lang="ts">
import { ref, watch } from 'vue'
import ModalDialog from '../ModalDialog.vue'
import { type Dashboard } from '../../dashboards/base'

export interface DashboardSharePopupProps {
  dashboard: Dashboard | null
  isOpen: boolean
}

const props = defineProps<DashboardSharePopupProps>()
const emit = defineEmits<{
  close: []
}>()

const jsonString = ref<string>('')
const copySuccess = ref(false)

const filterDashboard = (dashboard: Dashboard): Record<string, unknown> | null => {
  if (!dashboard) return null

  const dashboardCopy = JSON.parse(JSON.stringify(dashboard)) as Record<string, any>

  delete dashboardCopy.id
  delete dashboardCopy.connection
  delete dashboardCopy.storage
  delete dashboardCopy.changed
  delete dashboardCopy.deleted

  if (dashboardCopy.layout && Array.isArray(dashboardCopy.layout)) {
    dashboardCopy.layout = dashboardCopy.layout.map((item: Record<string, unknown>) => {
      const itemCopy = { ...item }
      delete itemCopy.static
      delete itemCopy.moved
      delete itemCopy.state
      return itemCopy
    })
  }

  if (dashboardCopy.gridItems && typeof dashboardCopy.gridItems === 'object') {
    for (const [itemId, gridItem] of Object.entries(dashboardCopy.gridItems)) {
      const itemCopy = { ...(gridItem as Record<string, any>) }
      delete itemCopy.results
      delete itemCopy.loading
      delete itemCopy.loadStartTime
      delete itemCopy.error

      if (!itemCopy.filters) delete itemCopy.filters
      if (!itemCopy.crossFilters) delete itemCopy.crossFilters
      if (!itemCopy.chartFilters) delete itemCopy.chartFilters
      if (!itemCopy.conceptFilters) delete itemCopy.conceptFilters
      if (itemCopy.chartConfig) {
        delete itemCopy.chartConfig.showDebug
      }

      dashboardCopy.gridItems[itemId] = itemCopy
    }
  }

  if (dashboardCopy.imports && Array.isArray(dashboardCopy.imports)) {
    dashboardCopy.imports = dashboardCopy.imports.map((imp: Record<string, unknown>) => {
      const impCopy = { ...imp }
      delete impCopy.id
      return impCopy
    })
  }

  return dashboardCopy
}

watch(
  [() => props.dashboard, () => props.isOpen],
  ([newDashboard, isOpen]) => {
    if (isOpen && newDashboard) {
      const filteredDashboard = filterDashboard(newDashboard)
      jsonString.value = JSON.stringify(filteredDashboard, null, 2)
      copySuccess.value = false
    } else if (!isOpen) {
      jsonString.value = ''
      copySuccess.value = false
    }
  },
  { immediate: true },
)

const copyToClipboard = (): void => {
  navigator.clipboard
    .writeText(jsonString.value)
    .then(() => {
      copySuccess.value = true
      setTimeout(() => {
        copySuccess.value = false
      }, 2000)
    })
    .catch((err: Error) => {
      console.error('Could not copy text: ', err)
    })
}
</script>

<template>
  <ModalDialog
    :show="isOpen"
    title="Export Definition"
    max-width="860px"
    test-id="dashboard-share-popup"
    @close="emit('close')"
  >
    <div class="share-popup-body">
      <p class="share-popup-description">
        Copy a definition of this dashboard; it can be imported by others with the same model
        defined. Existing runtime/results info is removed automatically.
      </p>

      <div class="json-container">
        <div class="json-toolbar">
          <span class="json-toolbar-label">dashboard.json</span>
        </div>
        <pre data-testid="dashboard-json" class="json-code">{{ jsonString }}</pre>
      </div>
    </div>

    <template #footer>
      <button class="secondary-button" @click="emit('close')">Close</button>
      <button @click="copyToClipboard" class="dashboard-copy-button" data-testid="copy-json-button">
        <i
          class="mdi"
          :class="copySuccess ? 'mdi-check-circle-outline' : 'mdi-content-copy'"
          aria-hidden="true"
        ></i>
        <span>{{ copySuccess ? 'Copied' : 'Copy JSON' }}</span>
      </button>
    </template>
  </ModalDialog>
</template>

<style scoped>
.share-popup-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.share-popup-description {
  margin: 0;
  color: var(--text-faint);
  line-height: 1.55;
}

.json-container {
  border: 1px solid var(--markdown-code-border, var(--border));
  border-radius: 14px;
  overflow: hidden;
  background:
    linear-gradient(
      180deg,
      rgba(var(--special-text-rgb, 37, 99, 235), 0.05),
      rgba(var(--special-text-rgb, 37, 99, 235), 0.015)
    ),
    var(--editor-bg-color, var(--editor-bg, var(--query-window-bg)));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
}

.json-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.18);
  background: rgba(15, 23, 42, 0.08);
}

.json-toolbar-label {
  color: var(--text-faint);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.json-code {
  margin: 0;
  max-height: min(56vh, 560px);
  padding: 16px 18px;
  overflow: auto;
  white-space: pre;
  color: var(--prism-text, var(--text-color));
  font-family:
    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
    monospace;
  font-size: 13px;
  line-height: 1.55;
}

.secondary-button,
.dashboard-copy-button {
  height: 40px;
  min-width: 108px;
  padding: 0 16px;
  border-radius: 10px;
  border: 1px solid transparent;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease;
}

.secondary-button {
  background-color: var(--button-bg-color);
  color: var(--text-color);
  border-color: var(--border);
}

.dashboard-copy-button {
  background-color: var(--special-text);
  color: white;
  border-color: var(--special-text);
}

@media (max-width: 640px) {
  .json-toolbar {
    padding: 10px;
  }

  .json-code {
    max-height: 48vh;
    padding: 14px;
    font-size: 12px;
  }

  :deep(.modal-footer) {
    gap: 8px;
  }
}

@media (max-width: 480px) {
  :deep(.modal-footer) {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }

  .secondary-button,
  .dashboard-copy-button {
    width: 100%;
    min-width: 0;
  }
}
</style>
