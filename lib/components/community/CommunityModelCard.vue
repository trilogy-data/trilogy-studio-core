<template>
  <div class="model-item">
    <!-- Import/Reload button in top right -->
    <button
      @click="toggleCreator"
      :data-testid="`import-${file.name}`"
      class="action-button-topright"
    >
      {{ creatorIsExpanded ? 'Hide' : modelExists ? 'Reload' : 'Import' }}
    </button>

    <div class="model-item-header">
      <div class="model-info">
        <div class="font-semibold flex items-center">
          <span
            class="imported-indicator mr-2"
            v-if="modelExists"
            :data-testid="`imported-${file.name}`"
          >
            <i class="mdi mdi-check check-icon"></i>
          </span>
          {{ file.name }} <span class="text-faint">({{ file.engine }})</span>
        </div>

        <!-- Expand button below title -->
        <button
          v-if="!initialComponentsExpanded"
          class="expand-button"
          @click="toggleComponents"
          :class="{ expanded: isComponentsExpanded }"
          :title="isComponentsExpanded ? 'Hide Content' : 'Show Content'"
        >
          <i class="mdi mdi-chevron-down expand-icon"></i>
          <span class="expand-text"
            >{{ isComponentsExpanded ? 'Hide' : 'Expand' }} ({{
              file.components.length
            }}
            items)</span
          >
        </button>
      </div>
    </div>

    <div class="model-creator-container" v-if="creatorIsExpanded">
      <model-creator
        :formDefaults="{
          importAddress: file.downloadUrl,
          connection: defaultConnection,
          name: file.name,
        }"
        :absolute="false"
        :visible="creatorIsExpanded"
        @close="toggleCreator"
      />
    </div>

    <div class="model-description">
      <div class="description-content">
        <div
          :class="[
            'description-text',
            {
              'description-truncated': !isDescriptionExpanded && shouldTruncateDescription,
            },
          ]"
        >
          <markdown-renderer :markdown="file.description" />
        </div>
        <button
          v-if="shouldTruncateDescription"
          @click="toggleDescription"
          class="description-toggle-button"
        >
          {{ isDescriptionExpanded ? 'Show Less' : 'Show More' }}
        </button>
      </div>
    </div>

    <div class="model-content-expanded" v-if="isComponentsExpanded">
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
              @click="copyDashboardLink(component)"
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
</template>

<script setup lang="ts">
import { ref, computed, inject } from 'vue'
import ModelCreator from '../model/ModelCreator.vue'
import MarkdownRenderer from '../MarkdownRenderer.vue'
import { getDefaultConnection as getDefaultConnectionService } from '../../remotes/githubApiService'
import type { ModelFile } from '../../remotes/models'
import { type ModelConfigStoreType } from '../../stores/modelStore'

interface Props {
  file: ModelFile
  // Optional overrides for initial state
  initialCreatorExpanded?: boolean
  initialComponentsExpanded?: boolean
  initialDescriptionExpanded?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  initialCreatorExpanded: false,
  initialComponentsExpanded: false,
  initialDescriptionExpanded: false,
})

const emit = defineEmits<{
  (e: 'creator-toggled', isExpanded: boolean): void
  (e: 'components-toggled', isExpanded: boolean): void
  (e: 'description-toggled', isExpanded: boolean): void
  (e: 'dashboard-link-copied', component: any): void
}>()

// Inject stores
const modelStore = inject<ModelConfigStoreType>('modelStore')
if (!modelStore) {
  throw new Error('ModelConfigStore not found in context')
}

// Internal state management
const creatorIsExpanded = ref(props.initialCreatorExpanded)
const isComponentsExpanded = ref(props.initialComponentsExpanded)
const isDescriptionExpanded = ref(props.initialDescriptionExpanded)

// Computed properties
const modelExists = computed(() => {
  return props.file.name in modelStore.models
})

const defaultConnection = computed(() => {
  return getDefaultConnectionService(props.file.engine)
})

const shouldTruncateDescription = computed(() => {
  if (!props.file.description) return false
  const lines = props.file.description.split('\n')
  return lines.length > 5
})

// Utility functions
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

// Action methods
const toggleCreator = () => {
  creatorIsExpanded.value = !creatorIsExpanded.value
  emit('creator-toggled', creatorIsExpanded.value)
}

const toggleComponents = () => {
  isComponentsExpanded.value = !isComponentsExpanded.value
  emit('components-toggled', isComponentsExpanded.value)
}

const toggleDescription = () => {
  isDescriptionExpanded.value = !isDescriptionExpanded.value
  emit('description-toggled', isDescriptionExpanded.value)
}

const copyDashboardLink = async (component: any): Promise<void> => {
  // Get current base URL
  const currentBase = window.location.origin + window.location.pathname

  // Construct the import link
  const importLink = `${currentBase}#screen=dashboard-import&model=${encodeURIComponent(props.file.downloadUrl)}&dashboard=${encodeURIComponent(component.name)}&modelName=${encodeURIComponent(props.file.name)}&connection=${encodeURIComponent(props.file.engine)}`

  try {
    await navigator.clipboard.writeText(importLink)
    emit('dashboard-link-copied', component)
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
    emit('dashboard-link-copied', component)
  }
}

// Expose methods for parent components that need to control state
defineExpose({
  toggleCreator,
  toggleComponents,
  toggleDescription,
  creatorIsExpanded: () => creatorIsExpanded.value,
  isComponentsExpanded: () => isComponentsExpanded.value,
  isDescriptionExpanded: () => isDescriptionExpanded.value,
})
</script>

<style scoped>
.model-item {
  border: 1px solid var(--border);
  padding: 16px;
  margin-bottom: 20px;
  transition: box-shadow 0.2s ease;
  background-color: var(--card-bg-color, rgba(255, 255, 255, 0.03));
  position: relative;
}

.model-item:hover {
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}

/* Import/Reload button in top right */
.action-button-topright {
  position: absolute;
  top: 16px;
  right: 16px;
  cursor: pointer;
  z-index: 10;
}

.model-item-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
  padding-right: 100px; /* Make room for the top-right button */
}

.model-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.font-semibold {
  font-weight: 500;
  font-size: var(--big-font-size);
  display: flex;
  align-items: center;
  gap: 8px;
}

.text-faint {
  color: var(--text-faint);
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
  align-self: flex-start;
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

.imported-indicator {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.check-icon {
  color: #22c55e;
  font-size: 16px;
}

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

@media (max-width: 768px) {
  .model-item-header {
    flex-direction: column;
    gap: 12px;
    padding-right: 0;
  }

  .action-button-topright {
    position: static;
    align-self: flex-start;
    margin-bottom: 8px;
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
