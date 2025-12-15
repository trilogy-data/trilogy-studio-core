<template>
  <sidebar-list title="Community Models">
    <template #actions>
      <div class="button-container">
        <button @click="communityStore.refreshData()" :disabled="communityStore.loading">
          {{ communityStore.loading ? 'Refreshing...' : 'Refresh' }}
        </button>
        <button @click="communityStore.openAddStoreModal()" :disabled="communityStore.loading">
          Add Store
        </button>
      </div>
    </template>

    <!-- Error Display -->
    <div v-if="communityStore.hasErrors" class="error-container">
      <div v-for="error in communityStore.errorList" :key="error.root" class="error-item">
        <span class="error-text">{{ error.root }}: {{ error.error }}</span>
        <button @click="communityStore.clearStoreError(error.root)" class="clear-error">×</button>
      </div>
    </div>

    <!-- Model List -->
    <CommunityModelListItem
      v-for="item in displayTree"
      :key="item.key"
      :item="item"
      :is-collapsed="collapsed[item.key]"
      :active-model="navigationStore.activeCommunityModelKey.value"
      @item-click="handleItemClick"
      @item-toggle="handleItemToggle"
      @model-selected="handleModelSelected"
      @delete-store="showDeleteStoreConfirmation"
    />

    <!-- Add Store Modal -->
    <AddStoreModal
      :show="communityStore.showAddStoreModal"
      :loading="communityStore.addingStore"
      @close="communityStore.closeAddStoreModal()"
      @add="handleAddStoreSubmit"
    />

    <!-- Delete Store Confirmation Modal -->
    <div
      v-if="showDeleteConfirmationState"
      class="confirmation-overlay"
      @click.self="cancelDeleteStore"
    >
      <div class="confirmation-dialog">
        <h3>Confirm Store Removal</h3>
        <p>Are you sure you want to remove this store? This will not delete any imported models.</p>
        <div class="dialog-actions">
          <button class="cancel-btn" data-testid="cancel-store-deletion" @click="cancelDeleteStore">
            Cancel
          </button>
          <button
            class="confirm-btn"
            data-testid="confirm-store-deletion"
            @click="confirmDeleteStore"
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  </sidebar-list>
</template>

<script lang="ts">
import { ref, onMounted, computed } from 'vue'

import { useCommunityApiStore, useScreenNavigation } from '../../stores'
import SidebarList from './SidebarList.vue'
import CommunityModelListItem from './CommunityModelListItem.vue'
import AddStoreModal from '../community/AddStoreModal.vue'
import type { ModelFile, ModelRoot, AnyModelStore } from '../../remotes/models'
import { buildCommunityModelTree } from '../../remotes/displayHelpers'

export default {
  name: 'CommunityModelList',
  setup() {
    const communityStore = useCommunityApiStore()
    const navigationStore = useScreenNavigation()
    const collapsed = ref<Record<string, boolean>>({})

    // Get the currently active model key
    const activeKey = navigationStore.activeCommunityModelKey.value || ''

    // Helper to expand ancestors of active key
    const expandAncestors = (key: string) => {
      // Parse the key to get store/root, engine, and model parts
      // Keys are formatted as: storeId+engine+model
      const parts = key.split('+')

      if (parts.length > 0) {
        // Expand the root/store
        collapsed.value[parts[0]] = false

        if (parts.length > 1) {
          // Expand the engine
          const engineKey = `${parts[0]}+${parts[1]}`
          collapsed.value[engineKey] = false
        }
      }
    }

    // Initialize collapsed state for stores (collapsed by default)
    for (const store of communityStore.stores) {
      collapsed.value[store.id] = true
    }

    // Expand ancestors of active item if there is one
    if (activeKey) {
      expandAncestors(activeKey)
    } else {
      // If no active key, expand the first store by default
      if (communityStore.stores.length > 0) {
        collapsed.value[communityStore.stores[0].id] = false
      }
    }

    // Local state for error handling in the modal
    const addError = ref<string | null>(null)

    // State for delete confirmation
    const showDeleteConfirmationState = ref(false)
    const storeToDelete = ref<AnyModelStore | null>(null)

    // Handle adding a store from the modal
    const handleAddStoreSubmit = async (store: any) => {
      addError.value = null
      try {
        await communityStore.addStore(store)
        communityStore.closeAddStoreModal()
      } catch (error) {
        addError.value = error instanceof Error ? error.message : 'Failed to add store'
      }
    }

    // Handle store deletion
    const showDeleteStoreConfirmation = (store: AnyModelStore) => {
      storeToDelete.value = store
      showDeleteConfirmationState.value = true
    }

    const cancelDeleteStore = () => {
      showDeleteConfirmationState.value = false
      storeToDelete.value = null
    }

    const confirmDeleteStore = () => {
      if (storeToDelete.value) {
        communityStore.removeStore(storeToDelete.value.id)
      }
      showDeleteConfirmationState.value = false
      storeToDelete.value = null
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
        collapsed.value,
        communityStore.stores,
        communityStore.filesByStore,
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
      handleAddStoreSubmit,
      showDeleteStoreConfirmation,
      cancelDeleteStore,
      confirmDeleteStore,
      showDeleteConfirmationState,
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
    AddStoreModal,
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

.form-group input,
.form-group select {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  font-size: 0.875rem;
  box-sizing: border-box;
}

.form-group input:focus,
.form-group select:focus {
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
