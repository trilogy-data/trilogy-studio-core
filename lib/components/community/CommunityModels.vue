<template>
  <div class="model-page">
    <div class="model-content">
      <div class="model-header">
        <div class="model-title">Community Models</div>

        <button
          class="refresh-button"
          @click="refreshData"
          :disabled="loading"
          data-testid="refresh-models-button"
        >
          <span v-if="!loading">Refresh</span>
          <span v-else>Refreshing...</span>
        </button>
      </div>
      <FeedbackBanner />
      <div class="filters my-4">
        <div class="filter-row flex gap-4 mb-2">
          <div class="search-box flex-grow">
            <label class="text-faint filter-label">Name</label>
            <input
              type="text"
              data-testid="community-model-search"
              v-model="searchQuery"
              placeholder="Search by model name..."
            />
          </div>

          <div class="engine-filter">
            <label class="text-faint filter-label">Model Engine</label>
            <select v-model="selectedEngine" class="px-3 py-2 border rounded">
              <option value="">All Engines</option>
              <option v-for="engine in availableEngines" :key="engine" :value="engine">
                {{ engine }}
              </option>
            </select>
          </div>

          <div class="import-status-filter">
            <label class="text-faint filter-label">Import Status</label>
            <select v-model="importStatus" class="px-3 py-2 border rounded">
              <option value="all">All Models</option>
              <option value="imported">Imported Only</option>
              <option value="not-imported">Not Imported</option>
            </select>
          </div>
        </div>
      </div>

      <div v-if="filteredFiles.length">
        <div v-for="file in filteredFiles" :key="file.name" class="model-item">
          <div class="model-item-header">
            <div class="model-info">
              <div class="font-semibold flex items-center">
                <span
                  class="imported-indicator mr-2"
                  v-if="modelExists(file.name)"
                  :data-testid="`imported-${file.name}`"
                >
                  <i class="mdi mdi-check check-icon"></i>
                </span>
                {{ file.name }} <span class="text-faint">({{ file.engine }})</span>
              </div>
              <div class="model-actions">
                <button
                  @click="creatorIsExpanded[file.name] = !creatorIsExpanded[file.name]"
                  :data-testid="`import-${file.name}`"
                  class="action-button"
                >
                  {{
                    creatorIsExpanded[file.name]
                      ? 'Hide'
                      : modelExists(file.name)
                        ? 'Reload'
                        : 'Import'
                  }}
                </button>
              </div>
            </div>
            <button
              class="expand-button"
              @click="toggleComponents(file.downloadUrl)"
              :class="{ expanded: isExpanded[file.downloadUrl] }"
              :title="isExpanded[file.downloadUrl] ? 'Hide Content' : 'Show Content'"
            >
              <i class="mdi mdi-chevron-down expand-icon"></i>
              <span class="expand-text"
                >{{ isExpanded[file.downloadUrl] ? 'Hide' : 'Show' }}
                {{ file.components.length }}</span
              >
            </button>
          </div>

          <div class="model-creator-container" v-if="creatorIsExpanded[file.name]">
            <model-creator
              :formDefaults="{
                importAddress: file.downloadUrl,
                connection: getDefaultConnection(file.engine),
                name: file.name,
              }"
              :absolute="false"
              :visible="creatorIsExpanded[file.name]"
              @close="creatorIsExpanded[file.name] = !creatorIsExpanded[file.name]"
            />
          </div>

          <div class="model-description">
            <div class="description-content">
              <div
                :class="[
                  'description-text',
                  {
                    'description-truncated':
                      !isDescriptionExpanded(file.name) &&
                      shouldTruncateDescription(file.description),
                  },
                ]"
              >
                <markdown-renderer :markdown="file.description" />
              </div>
              <button
                v-if="shouldTruncateDescription(file.description)"
                @click="toggleDescription(file.name)"
                class="description-toggle-button"
              >
                {{ isDescriptionExpanded(file.name) ? 'Show Less' : 'Show More' }}
              </button>
            </div>
          </div>

          <div class="model-content-expanded" v-if="isExpanded[file.downloadUrl]">
            <div class="content-header">
              <h4>Model Components</h4>
            </div>
            <div class="components-grid">
              <div v-for="component in file.components" :key="component.url" class="component-item">
                <div class="component-main">
                  <i :class="getComponentIcon(component.type)" class="component-icon"></i>
                  <div class="component-info">
                    <a :href="component.url" target="_blank" class="component-link">
                      {{ component.name || 'Unnamed Component' }}
                    </a>
                    <span v-if="component.purpose" class="component-purpose">{{
                      component.purpose
                    }}</span>
                  </div>
                </div>
                <div v-if="component.type === 'dashboard'" class="dashboard-actions">
                  <button
                    @click="copyDashboardImportLink(component, file)"
                    class="copy-import-button"
                    :title="'Copy import link for ' + component.name"
                  >
                    <i class="mdi mdi-content-copy"></i>
                    Copy Share Link
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <p v-if="error" class="text-error">{{ error }}</p>
      <p v-else-if="loading" class="text-loading">Loading community models...</p>
      <p v-else-if="!filteredFiles.length" class="text-faint mt-4">
        No models match your search criteria.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, defineProps, inject, watch } from 'vue'
import ModelCreator from '../model/ModelCreator.vue'
import FeedbackBanner from '../FeedbackBanner.vue'
import { type ModelConfigStoreType } from '../../stores/modelStore'
import { type CommunityApiStoreType } from '../../stores/communityApiStore'
import { getDefaultConnection as getDefaultConnectionService } from '../../models/githubApiService'
import MarkdownRenderer from '../MarkdownRenderer.vue'

import useScreenNavigation from '../../stores/useScreenNavigation'

const props = defineProps({
  initialSearch: {
    type: String,
    default: '',
  },
})

const communityApiStore = inject('communityApiStore') as CommunityApiStoreType
const { error, refreshData, availableEngines } = communityApiStore
const navigation = useScreenNavigation()

const isExpanded = ref<Record<string, boolean>>({})
const creatorIsExpanded = ref<Record<string, boolean>>({})
const descriptionExpanded = ref<Record<string, boolean>>({})
const searchQuery = ref(navigation.initialSearch.value || props.initialSearch)
const selectedEngine = ref('')
const importStatus = ref<'all' | 'imported' | 'not-imported'>('all')

const modelStore = inject<ModelConfigStoreType>('modelStore')
if (!modelStore) {
  throw new Error('ModelConfigStore not found in context')
}

watch(
  () => navigation.activeCommunityModelFilter.value,
  (newFilter) => {
    console.log('Active community model filter changed:', newFilter)
    if (newFilter) {
      searchQuery.value = newFilter
    } else {
      selectedEngine.value = ''
    }
  },
  { immediate: true },
)

const modelExists = (name: string): boolean => {
  return name in modelStore.models
}

const loading = computed(() => communityApiStore.loading)

const toggleComponents = (index: string): void => {
  isExpanded.value[index] = !isExpanded.value[index]
}

const getDefaultConnection = (engine: string): string => {
  return getDefaultConnectionService(engine)
}

const getComponentIcon = (type: string): string => {
  switch (type) {
    case 'dashboard':
      return 'mdi mdi-view-dashboard'
    case 'trilogy':
      return 'mdi mdi-database'
    case 'sql':
      return 'mdi mdi-code-tags'
    default:
      return 'mdi mdi-file'
  }
}

const copyDashboardImportLink = async (component: any, file: any): Promise<void> => {
  // Get current base URL
  const currentBase = window.location.origin + window.location.pathname

  // Construct the import link
  const importLink = `${currentBase}#screen=dashboard-import&model=${encodeURIComponent(file.downloadUrl)}&dashboard=${encodeURIComponent(component.name)}&modelName=${encodeURIComponent(file.name)}&connection=${encodeURIComponent(file.engine)}`

  try {
    await navigator.clipboard.writeText(importLink)
    // You might want to show a toast notification here
    console.log('Dashboard import link copied to clipboard:', importLink)
  } catch (err) {
    console.error('Failed to copy dashboard import link:', err)
    // Fallback: create a temporary textarea and copy from it
    const textArea = document.createElement('textarea')
    textArea.value = importLink
    document.body.appendChild(textArea)
    textArea.select()
    document.execCommand('copy')
    document.body.removeChild(textArea)
  }
}

// Description truncation functions
const shouldTruncateDescription = (description: string): boolean => {
  if (!description) return false
  const lines = description.split('\n')
  return lines.length > 5
}

const isDescriptionExpanded = (fileName: string): boolean => {
  // If there's an initial search and only one result, expand by default
  if ((navigation.initialSearch.value || props.initialSearch) && filteredFiles.value.length === 1) {
    return descriptionExpanded.value[fileName] !== false
  }
  return descriptionExpanded.value[fileName] === true
}

const toggleDescription = (fileName: string): void => {
  // If there's an initial search and only one result, we need to handle the default expansion state
  if ((navigation.initialSearch.value || props.initialSearch) && filteredFiles.value.length === 1) {
    descriptionExpanded.value[fileName] =
      descriptionExpanded.value[fileName] === false ? true : false
  } else {
    descriptionExpanded.value[fileName] = !descriptionExpanded.value[fileName]
  }
}

const filteredFiles = computed(() => {
  return communityApiStore.filteredFiles(
    searchQuery.value,
    selectedEngine.value,
    importStatus.value,
    modelStore,
  )
})

onMounted(async () => {
  if (communityApiStore.files.length === 0) {
    await refreshData()
  }
})
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

.model-name {
  font-weight: 600;
  font-size: var(--big-font-size);
  color: var(--heading-color);
}

.model-engine-badge {
  font-size: 12px;
  padding: 3px 8px;
  border-radius: 12px;
  background-color: var(--accent-color-faint);
  color: var(--accent-color);
}

.font-semibold {
  font-weight: 500;
  font-size: var(--big-font-size);
}

.filter-label {
  padding-right: 4px;
}

.model-page {
  width: 100%;
  height: 100%;
  background-color: var(--editor-bg-color);
}

.model-content {
  padding: 10px;
}

.model-item {
  border: 1px solid var(--border);
  padding: 16px;
  margin-bottom: 20px;
  transition: box-shadow 0.2s ease;
  background-color: var(--card-bg-color, rgba(255, 255, 255, 0.03));
}

.model-item:hover {
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}

/* New layout for model item header */
.model-item-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
}

.model-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.model-actions {
  display: flex;
  gap: 8px;
}

.action-button {
  background-color: var(--button-bg, #2563eb);
  color: var(--text-color);
  padding: 6px 12px;
  border: none;
  font-size: 14px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.action-button:hover {
  background-color: var(--button-hover-bg, #1d4ed8);
}

/* Enhanced expand button */
.expand-button {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border: 1px solid var(--border);
  background-color: var(--card-bg-color, rgba(255, 255, 255, 0.05));
  color: var(--text-color);
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 14px;
  min-width: 60px;
  justify-content: center;
}

.expand-button:hover {
  background-color: var(--button-hover-bg, rgba(255, 255, 255, 0.1));
  border-color: var(--accent-color);
}

.expand-button.expanded {
  background-color: var(--accent-color-faint, rgba(59, 130, 246, 0.1));
  border-color: var(--accent-color);
  color: var(--accent-color);
}

.expand-icon {
  font-size: 16px;
  transition: transform 0.2s ease;
}

.expand-button.expanded .expand-icon {
  transform: rotate(180deg);
}

.expand-text {
  font-weight: 500;
  font-size: 12px;
}

.model-description {
  margin-bottom: 12px;
}

.description-content {
  margin-top: 4px;
}

.description-text {
  position: relative;
  overflow: hidden;
  transition: max-height 0.3s ease;
}

.description-text.description-truncated {
  max-height: calc(1.4em * 5);
  /* Approximate 5 lines */
  position: relative;
}

.description-text.description-truncated::after {
  content: '';
  position: absolute;
  bottom: 0;
  right: 0;
  left: 0;
  height: 1.4em;
  background: linear-gradient(transparent, var(--card-bg-color, rgba(255, 255, 255, 0.03)));
  pointer-events: none;
}

.description-toggle-button {
  background: none;
  border: none;
  color: var(--accent-color);
  cursor: pointer;
  font-size: 14px;
  padding: 4px 0;
  margin-top: 4px;
  text-decoration: underline;
  transition: color 0.2s ease;
}

.description-toggle-button:hover {
  color: var(--accent-color-hover, #1d4ed8);
}

.model-content-expanded {
  border-top: 1px solid var(--border);
  padding-top: 16px;
  margin-top: 16px;
}

.content-header {
  margin-bottom: 12px;
}

.content-header h4 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--heading-color);
}

.components-grid {
  display: grid;
  gap: 12px;
}

.text-loading {
  color: var(--text-faint);
  font-size: 24px;
}

.text-faint {
  color: var(--text-faint);
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

.text-error {
  color: var(--error-color, #e53935);
}

.branch-selector {
  margin-top: 8px;
}

.bg-button {
  background-color: var(--button-bg);
}

.bg-button-hover:hover {
  background-color: var(--button-hover-bg);
}

/* Updated styles for the imported model indicator using MDI */
.imported-indicator {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.check-icon {
  color: #22c55e;
  /* Green color for the checkmark */
  font-size: 16px;
}

/* Updated styles for component items */
.component-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  border: 1px solid var(--border);
  background-color: var(--card-bg-color, rgba(255, 255, 255, 0.02));
  transition: background-color 0.2s ease;
}

.component-item:hover {
  background-color: var(--card-bg-color, rgba(255, 255, 255, 0.05));
}

.component-main {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
}

.component-icon {
  font-size: 18px;
  color: var(--text-faint);
  min-width: 24px;
}

.component-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.component-link {
  color: var(--link-color);
  text-decoration: none;
  font-weight: 500;
}

.component-link:hover {
  text-decoration: underline;
}

.component-purpose {
  color: var(--text-faint);
  font-style: italic;
  font-size: 12px;
}

.dashboard-actions {
  flex-shrink: 0;
}

.copy-import-button {
  background-color: var(--button-bg, #2563eb);
  color: var(--button-text, white);
  border: none;
  padding: 6px 10px;
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: background-color 0.2s;
}

.copy-import-button:hover {
  background-color: var(--button-hover-bg, #1d4ed8);
}

.copy-import-button i {
  font-size: 14px;
}

/* Make filter row more responsive */
.filter-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

@media (max-width: 768px) {
  .filter-row > div {
    flex: 1 0 100%;
    margin-bottom: 8px;
  }

  .model-item-header {
    flex-direction: column;
    gap: 12px;
  }

  .expand-button {
    align-self: flex-start;
  }

  .component-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  .dashboard-actions {
    align-self: flex-start;
  }
}
</style>
