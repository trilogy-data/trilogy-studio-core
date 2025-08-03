<script setup lang="ts">
import { ref, watch } from 'vue'
import { type Dashboard } from '../../dashboards/base'
const props = defineProps<{
  dashboard: Dashboard | null
  isOpen: boolean
}>()
const emit = defineEmits<{
  close: []
}>()
// Create a ref for the formatted JSON string
const jsonString = ref<string>('')

// Function to filter out unwanted properties
const filterDashboard = (dashboard: Dashboard): any => {
  if (!dashboard) return null

  // Create a deep copy to avoid modifying the original
  const dashboardCopy = JSON.parse(JSON.stringify(dashboard))

  // Remove top level properties
  delete dashboardCopy.id
  delete dashboardCopy.connection
  delete dashboardCopy.storage
  delete dashboardCopy.changed
  delete dashboardCopy.deleted

  // Remove specified properties from each item if items exist
  if (dashboardCopy.layout && Array.isArray(dashboardCopy.layout)) {
    dashboardCopy.layout = dashboardCopy.layout.map((item: any) => {
      const itemCopy = { ...item }
      delete itemCopy.static
      delete itemCopy.moved
      return itemCopy
    })
  }

  // Iterate over gridItems: Record<string, GridItemData> and remove results objects
  if (dashboardCopy.gridItems && typeof dashboardCopy.gridItems === 'object') {
    for (const [itemId, gridItem] of Object.entries(dashboardCopy.gridItems)) {
      const itemCopy = { ...(gridItem as any) }
      delete itemCopy.results
      if (itemCopy.chartConfig) {
        delete itemCopy.chartConfig.showDebug
      }
      dashboardCopy.gridItems[itemId] = itemCopy
    }
  }

  if (dashboardCopy.imports && Array.isArray(dashboardCopy.imports)) {
    dashboardCopy.imports = dashboardCopy.imports.map((imp: any) => {
      const impCopy = { ...imp }
      delete impCopy.id
      return impCopy
    })
  }

  return dashboardCopy
}

// Format the dashboard object as pretty-printed JSON when it changes
watch(
  () => props.dashboard,
  (newDashboard) => {
    if (newDashboard) {
      // Filter the dashboard before stringifying
      const filteredDashboard = filterDashboard(newDashboard)
      jsonString.value = JSON.stringify(filteredDashboard, null, 2)
    }
  },
  { immediate: true, deep: true },
)

// Handle copy functionality
const copySuccess = ref<boolean>(false)
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

// Handle click outside to close popup
const popupContent = ref<HTMLElement | null>(null)
const handleClickOutside = (event: MouseEvent): void => {
  if (popupContent.value && !popupContent.value.contains(event.target as Node)) {
    emit('close')
  }
}
</script>
<template>
  <div v-if="isOpen" class="popup-overlay" @click="handleClickOutside">
    <div class="popup-content" ref="popupContent" data-testid="dashboard-share-popup">
      <div class="popup-header">
        <h3>Definition</h3>
        <button @click="emit('close')" class="close-button" data-testid="close-popup-button">
          ✕
        </button>
      </div>
      <div class="popup-body">
        <div class="json-container">
          <pre data-testid="dashboard-json">{{ jsonString }}</pre>
        </div>
      </div>
      <div class="popup-footer">
        <button @click="copyToClipboard" class="copy-button" data-testid="copy-json-button">
          {{ copySuccess ? 'Copied!' : 'Copy' }}
        </button>
      </div>
    </div>
  </div>
</template>
<style scoped>
.popup-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}
.popup-content {
  background-color: var(--sidebar-bg);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
  width: 90%;
  max-width: 800px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}
.popup-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px;
  border-bottom: 1px solid var(--border);
}
.popup-header h3 {
  margin: 0;
  color: var(--text-color);
}
.close-button {
  background: none;
  border: none;
  font-size: 18px;
  cursor: pointer;
  color: var(--text-color);
}
.popup-body {
  padding: 15px;
  flex: 1;
  overflow: auto;
}
.json-container {
  background-color: var(--sidebar-selector-bg);
  padding: 10px;
  overflow: auto;
  max-height: 50vh;
}
.json-container pre {
  margin: 0;
  color: var(--sidebar-selector-font);
  white-space: pre-wrap;
  font-family: monospace;
  font-size: 14px;
}
.popup-footer {
  padding: 15px;
  display: flex;
  justify-content: flex-end;
  border-top: 1px solid var(--border);
}
.copy-button {
  background-color: var(--special-text);
  color: white;
  border: none;
  padding: 8px 16px;
  cursor: pointer;
  font-weight: 500;
}
.copy-button:hover {
  opacity: 0.9;
}
/* Media queries for responsiveness */
@media (max-width: 768px) {
  .popup-content {
    width: 95%;
  }
  .json-container {
    max-height: 40vh;
  }
}
@media (max-width: 480px) {
  .popup-header {
    padding: 10px;
  }
  .popup-body {
    padding: 10px;
  }
  .popup-footer {
    padding: 10px;
  }
  .json-container {
    max-height: 30vh;
  }
}
</style>
