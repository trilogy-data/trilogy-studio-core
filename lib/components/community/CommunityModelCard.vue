<template>
  <div class="model-item">
    <!-- Import/Reload button in top right -->
    <button
      @click="$emit('toggle-creator', file.name)"
      :data-testid="`import-${file.name}`"
      class="action-button-topright"
    >
      {{ creatorIsExpanded ? 'Hide' : modelExists(file.name) ? 'Reload' : 'Import' }}
    </button>

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

        <!-- Expand button below title -->
        <button
          class="expand-button"
          @click="$emit('toggle-components', file.downloadUrl)"
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
          connection: getDefaultConnection(file.engine),
          name: file.name,
        }"
        :absolute="false"
        :visible="creatorIsExpanded"
        @close="$emit('toggle-creator', file.name)"
      />
    </div>

    <div class="model-description">
      <div class="description-content">
        <div
          :class="[
            'description-text',
            {
              'description-truncated':
                !isDescriptionExpanded && shouldTruncateDescription(file.description),
            },
          ]"
        >
          <markdown-renderer :markdown="file.description" />
        </div>
        <button
          v-if="shouldTruncateDescription(file.description)"
          @click="$emit('toggle-description', file.name)"
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
              @click="$emit('copy-dashboard-link', component, file)"
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
import ModelCreator from '../model/ModelCreator.vue'
import MarkdownRenderer from '../MarkdownRenderer.vue'

defineProps<{
  file: any
  modelExists: (name: string) => boolean
  creatorIsExpanded: boolean
  isComponentsExpanded: boolean
  isDescriptionExpanded: boolean
  getDefaultConnection: (engine: string) => string
  getComponentIcon: (type: string) => string
  shouldTruncateDescription: (description: string) => boolean
}>()

defineEmits<{
  (e: 'toggle-creator', name: string): void
  (e: 'toggle-components', url: string): void
  (e: 'toggle-description', name: string): void
  (e: 'copy-dashboard-link', component: any, file: any): void
}>()
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
