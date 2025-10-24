<template>
  <sidebar-list title="Community Models">
    <template #actions>
      <div class="button-container">
        <button @click="communityStore.refreshData()" :disabled="communityStore.loading">
          {{ communityStore.loading ? 'Refreshing...' : 'Refresh' }}
        </button>
        <!-- <button @click="communityStore.openAddRepositoryModal()" :disabled="communityStore.loading">
          Add Repository
        </button> -->
      </div>
    </template>

    <!-- Error Display -->
    <div v-if="communityStore.hasErrors" class="error-container">
      <div v-for="error in communityStore.errorList" :key="error.root" class="error-item">
        <span class="error-text">{{ error.root }}: {{ error.error }}</span>
        <button @click="communityStore.clearRepositoryError(getModelRootByKey(error.root))" class="clear-error">
          ×
        </button>
      </div>
    </div>

    <!-- Model List -->
    <CommunityModelListItem v-for="item in displayTree" :key="item.key" :item="item" :is-collapsed="collapsed[item.key]"
      :active-model="navigationStore.activeCommunityModelKey.value" @item-click="handleItemClick"
      @item-toggle="handleItemToggle" @model-selected="handleModelSelected" />

    <!-- Add Repository Modal -->
    <div v-if="communityStore.showAddRepositoryModal" class="confirmation-overlay"
      @click="communityStore.closeAddRepositoryModal()">
      <div class="confirmation-dialog" @click.stop>
        <h3>Add Model Repository</h3>
        <form @submit.prevent="handleAddRepository">
          <div class="form-group">
            <label>Repository Owner: <span class="required">*</span></label>
            <input v-model="communityStore.newRepo.owner" type="text" placeholder="e.g., trilogy-data" required />
          </div>
          <div class="form-group">
            <label>Repository Name: <span class="required">*</span></label>
            <input v-model="communityStore.newRepo.repo" type="text" placeholder="e.g., trilogy-public-models"
              required />
          </div>
          <div class="form-group">
            <label>Branch: <span class="required">*</span></label>
            <input v-model="communityStore.newRepo.branch" type="text" placeholder="e.g., main" required />
          </div>
          <div class="form-group">
            <label>Display Name (optional):</label>
            <input v-model="communityStore.newRepo.displayName" type="text" placeholder="e.g., My Custom Models" />
          </div>
          <div v-if="addError" class="form-error">
            {{ addError }}
          </div>
          <div class="dialog-actions">
            <button type="button" class="cancel-btn" @click="communityStore.closeAddRepositoryModal()">
              Cancel
            </button>
            <button type="submit" class="confirm-btn" :disabled="communityStore.addingRepository">
              {{ communityStore.addingRepository ? 'Adding...' : 'Add Repository' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </sidebar-list>
</template>

<script lang="ts">
import { ref, onMounted, computed } from 'vue'

import { useCommunityApiStore, useScreenNavigation } from '../../stores'
import SidebarList from './SidebarList.vue'
import CommunityModelListItem from './CommunityModelListItem.vue'
import type { ModelFile, ModelRoot } from '../../remotes/models'
import { buildCommunityModelTree } from '../../remotes/displayHelpers'

export default {
  name: 'CommunityModelList',
  setup() {
    const communityStore = useCommunityApiStore()
    const navigationStore = useScreenNavigation()
    const collapsed = ref<Record<string, boolean>>({})

    for (const key in communityStore.modelRoots) {
      collapsed.value[
        `${communityStore.modelRoots[key].owner}-${communityStore.modelRoots[key].repo}-${communityStore.modelRoots[key].branch}`
      ] = false
    }

    // Local state for error handling in the modal
    const addError = ref<string | null>(null)

    // Helper function to get model root by key (for error display)
    const getModelRootByKey = (rootKey: string): ModelRoot => {
      // Parse the rootKey to extract owner, repo, branch
      const match = rootKey.match(/^(.+)-(.+)-(.+)$/)
      if (match) {
        return {
          owner: match[1],
          repo: match[2],
          branch: match[3],
        }
      }
      // Fallback
      return { owner: '', repo: '', branch: 'main' }
    }

    // Handle adding a repository with error management
    const handleAddRepository = async () => {
      addError.value = null
      try {
        await communityStore.handleAddRepository()
      } catch (error) {
        addError.value = error instanceof Error ? error.message : 'Failed to add repository'
      }
    }

    // Handle model selection
    const handleModelSelected = (model: ModelFile, key: string, modelRoot: ModelRoot) => {
      navigationStore.openTab('community-models', model.name, key)
      console.log('Selected model:', model.name, 'from root:', modelRoot)
    }

    // Handle item clicks (for collapsing/expanding)
    const handleItemClick = (_: string, key: string, __: ModelRoot) => {
      navigationStore.openTab('community-models', null, key)
    }

    const handleItemToggle = (_: string, key: string, __: ModelRoot) => {
      collapsed.value[key] = !collapsed.value[key]
    }

    const displayTree = computed(() => {
      return buildCommunityModelTree(
        communityStore.modelRoots,
        communityStore.filesByRoot,
        collapsed.value,

      )
    })

    // Initialize store on component mount
    onMounted(async () => {
      await communityStore.initialize()
    })

    return {
      communityStore,
      navigationStore,
      addError,
      getModelRootByKey,
      handleAddRepository,
      handleModelSelected,
      handleItemClick,
      handleItemToggle,
      collapsed,
      displayTree,
    }
  },
  components: {
    SidebarList,
    CommunityModelListItem,
  },
}
</script>

<style scoped>
.button-container {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.error-container {
  margin-bottom: 16px;
}

.error-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  margin-bottom: 4px;
  background: #fee2e2;
  border: 1px solid #fca5a5;
  border-radius: 4px;
  font-size: 0.875rem;
}

.error-text {
  color: #dc2626;
  flex: 1;
}

.clear-error {
  background: none;
  border: none;
  color: #dc2626;
  cursor: pointer;
  font-size: 1.25rem;
  padding: 0;
  margin-left: 8px;
  line-height: 1;
}

.clear-error:hover {
  color: #991b1b;
}

.confirmation-overlay {
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

.confirmation-dialog {
  background-color: var(--bg-color);
  padding: 20px;
  border-radius: 5px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  max-width: 400px;
  width: 100%;
}

.confirmation-dialog h3 {
  margin: 0 0 16px 0;
  font-size: 1.25rem;
  font-weight: 600;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 4px;
  font-weight: 500;
  font-size: 0.875rem;
}

.required {
  color: #dc2626;
}

.form-group input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  font-size: 0.875rem;
  box-sizing: border-box;
}

.form-group input:focus {
  outline: none;
  border-color: #2563eb;
  box-shadow: 0 0 0 1px #2563eb;
}

.form-error {
  padding: 8px 12px;
  background: #fee2e2;
  border: 1px solid #fca5a5;
  border-radius: 4px;
  color: #dc2626;
  font-size: 0.875rem;
  margin-bottom: 16px;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
  gap: 10px;
}

.cancel-btn {
  padding: 8px 16px;
  background-color: #f0f0f0;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.confirm-btn {
  padding: 8px 16px;
  background-color: #dc3545;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.confirm-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
