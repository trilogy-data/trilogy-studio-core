<template>
  <div class="view-container">
    <CommunityRemote
      v-if="selectedType === 'root'"
      :remote="selectedRootKey"
      :initial-search="initialSearch"
    />
    <CommunityRemote
      v-else-if="selectedType === 'engine'"
      :engine="selectedEngine"
      :remote="selectedRootKey"
      :initial-search="initialSearch"
    />
    <div v-else-if="selectedType === 'model'" class="single-model-view">
      <community-model-card
        v-if="modelFile"
        :key="modelFile.name"
        :file="modelFile"
        :initialCreatorExpanded="false"
        :initialComponentsExpanded="true"
        :initialDescriptionExpanded="true"
        @creator-toggled="handleCreatorToggle"
        @components-toggled="handleComponentsToggle"
        @description-toggled="handleDescriptionToggle"
        @dashboard-link-copied="handleDashboardLinkCopy"
      />
      <div v-else class="loading-state">
        <p v-if="isLoading" class="text-loading">Loading model...</p>
        <p v-else class="text-error">Model not found</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, watch, ref } from 'vue'
import CommunityRemote from './CommunityRemote.vue'
import CommunityModelCard from './CommunityModelCard.vue'
import { KeySeparator } from '../../data/constants'
import { type CommunityApiStoreType } from '../../stores/communityApiStore'
import type { ModelFile } from '../../remotes/models'

const props = defineProps<{
  activeCommunityModelKey: string
  initialSearch?: string
}>()

const emit = defineEmits<{
  (
    e: 'model-interaction',
    interaction: {
      type: 'creator-toggle' | 'components-toggle' | 'description-toggle' | 'dashboard-link-copy'
      modelName: string
      data?: any
    },
  ): void
}>()

// Inject the community API store to get model data
const communityApiStore = inject('communityApiStore') as CommunityApiStoreType

const isLoading = ref(false)

const selectedType = computed(() => {
  const separatorCount = props.activeCommunityModelKey.split(KeySeparator).length
  if (separatorCount === 1) {
    return 'root'
  } else if (separatorCount === 2) {
    return 'engine'
  } else if (separatorCount === 3) {
    return 'model'
  }
  return null
})

const selectedRootKey = computed(() => {
  if (selectedType.value === 'root') {
    return props.activeCommunityModelKey
  } else if (selectedType.value === 'engine' || selectedType.value === 'model') {
    const parts = props.activeCommunityModelKey.split(KeySeparator)
    return parts[0]
  }
  return null
})

const selectedEngine = computed(() => {
  if (selectedType.value === 'engine') {
    const parts = props.activeCommunityModelKey.split(KeySeparator)
    return parts[1]
  }
  return null
})

const selectedModelName = computed(() => {
  if (selectedType.value === 'model') {
    const parts = props.activeCommunityModelKey.split(KeySeparator)
    return parts[2]
  }
  return null
})

const modelFile = computed((): ModelFile | null => {
  if (selectedType.value !== 'model' || !selectedRootKey.value || !selectedModelName.value) {
    return null
  }

  const filesForRoot = communityApiStore.filesByRoot[selectedRootKey.value]
  if (!filesForRoot) {
    return null
  }

  return filesForRoot.find((file) => file.name === selectedModelName.value) || null
})

// Event handlers
const handleCreatorToggle = (isExpanded: boolean) => {
  emit('model-interaction', {
    type: 'creator-toggle',
    modelName: selectedModelName.value || '',
    data: { isExpanded },
  })
}

const handleComponentsToggle = (isExpanded: boolean) => {
  emit('model-interaction', {
    type: 'components-toggle',
    modelName: selectedModelName.value || '',
    data: { isExpanded },
  })
}

const handleDescriptionToggle = (isExpanded: boolean) => {
  emit('model-interaction', {
    type: 'description-toggle',
    modelName: selectedModelName.value || '',
    data: { isExpanded },
  })
}

const handleDashboardLinkCopy = (component: any) => {
  emit('model-interaction', {
    type: 'dashboard-link-copy',
    modelName: selectedModelName.value || '',
    data: { component },
  })
}

// Watch for changes to load data if needed
watch(
  () => [selectedRootKey.value, selectedType.value],
  async ([newRootKey, newType]) => {
    if (newType === 'model' && newRootKey && !communityApiStore.filesByRoot[newRootKey]) {
      isLoading.value = true
      try {
        await communityApiStore.refreshData()
      } finally {
        isLoading.value = false
      }
    }
  },
  { immediate: true },
)
</script>

<style scoped>
.view-container {
  height: 100%;
  width: 100%;
  background-color: var(--query-window-bg);
}

.single-model-view {
  padding: 16px;
  height: 100%;
  overflow-y: auto;
}

.loading-state {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 200px;
}

.text-loading {
  color: var(--text-faint);
  font-size: 18px;
}

.text-error {
  color: var(--error-color, #e53935);
  font-size: 18px;
}
/* on mobile, remove single model view padding */
@media (max-width: 768px) {
  .single-model-view {
    padding: 0px;
    border: 0px;
  }
}
</style>
