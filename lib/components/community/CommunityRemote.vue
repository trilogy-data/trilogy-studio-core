<template>
  <div class="model-page">
    <community-model-header
      v-model:searchQuery="searchQuery"
      v-model:selectedEngine="selectedEngine"
      v-model:importStatus="importStatus"
      :availableEngines="availableEngines"
      :loading="loading"
      :remote="remote"
      :engineDisabled="!!props.engine"
      @refresh="refreshData"
    />
    <div class="model-content">
      <div v-if="filteredFiles.length">
        <community-model-card
          v-for="file in filteredFiles"
          :key="file.name"
          :file="file"
          :initialCreatorExpanded="creatorIsExpanded[file.name] || false"
          :initialComponentsExpanded="isExpanded[file.downloadUrl] || false"
          :initialDescriptionExpanded="getInitialDescriptionExpanded(file.name)"
          @creator-toggled="creatorIsExpanded[file.name] = $event"
          @components-toggled="isExpanded[file.downloadUrl] = $event"
          @description-toggled="descriptionExpanded[file.name] = $event"
          @dashboard-link-copied="handleDashboardLinkCopy"
        />
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
import { ref, onMounted, computed, inject, watch, type PropType } from 'vue'
import { type ModelConfigStoreType } from '../../stores/modelStore'
import { type CommunityApiStoreType } from '../../stores/communityApiStore'
import CommunityModelHeader from './CommunityModelHeader.vue'
import CommunityModelCard from './CommunityModelCard.vue'

const props = defineProps({
  initialSearch: {
    type: String,
    default: '',
  },
  remote: {
    type: [String, null] as PropType<string | null>,
    required: true,
  },
  engine: {
    type: [String, null, undefined] as PropType<string | null | undefined>,
    default: '',
  },
})

const communityApiStore = inject('communityApiStore') as CommunityApiStoreType
const { errors, refreshData, availableEngines } = communityApiStore

const error = props.remote ? errors[props.remote] : null

const modelStore = inject<ModelConfigStoreType>('modelStore')
if (!modelStore) {
  throw new Error('ModelConfigStore not found in context')
}

// State management for card expansions
const creatorIsExpanded = ref<Record<string, boolean>>({})
const isExpanded = ref<Record<string, boolean>>({})
const descriptionExpanded = ref<Record<string, boolean>>({})

const searchQuery = ref(props.initialSearch)
const selectedEngine = ref(props.engine || '')
const importStatus = ref<'all' | 'imported' | 'not-imported'>('all')

const hasInitialSearch = computed(() => !!props.initialSearch)

// Watch for changes to the engine prop and update selectedEngine accordingly
watch(
  () => props.engine,
  (newEngine) => {
    selectedEngine.value = newEngine || ''
  },
  { immediate: true },
)

const loading = computed(() => communityApiStore.loading)

const filteredFiles = computed(() => {
  return communityApiStore.filteredFiles(
    searchQuery.value,
    selectedEngine.value,
    importStatus.value,
    modelStore,
    props.remote,
  )
})

// Helper method for initial description expansion
const getInitialDescriptionExpanded = (fileName: string): boolean => {
  // If there's an initial search and only one result, expand by default
  if (hasInitialSearch.value && filteredFiles.value.length === 1) {
    return descriptionExpanded.value[fileName] !== false
  }
  return descriptionExpanded.value[fileName] === true
}

// Event handlers
const handleDashboardLinkCopy = (component: any): void => {
  // Handle any additional logic for dashboard link copying if needed
  console.log('Dashboard link copied for component:', component.name)
}

onMounted(async () => {
  let refresh = false
  // Check if we need to refresh data for any stores
  for (const store of communityApiStore.stores) {
    if (!communityApiStore.filesByStore[store.id]) {
      refresh = true
      break
    }
  }
  if (refresh) {
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

.text-loading {
  color: var(--text-faint);
  font-size: 24px;
}

.text-faint {
  color: var(--text-faint);
}

.text-error {
  color: var(--error-color, #e53935);
}

.bg-button {
  background-color: var(--button-bg);
}

.bg-button-hover:hover {
  background-color: var(--button-hover-bg);
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
}
</style>
