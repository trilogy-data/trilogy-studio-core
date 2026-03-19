<template>
  <sidebar-list title="Community Models">
    <template #header>
      <div class="community-header">
        <h3 class="font-sans sidebar-header">Community Models</h3>
        <div class="community-header-actions">
          <button
            class="sidebar-control-button sidebar-header-action"
            @click="communityStore.refreshData()"
            :disabled="communityStore.loading"
          >
            <i class="mdi mdi-refresh"></i>
            {{ communityStore.loading ? 'Refreshing' : 'Refresh' }}
          </button>
          <button
            class="sidebar-control-button sidebar-header-action"
            @click="communityStore.openAddStoreModal()"
            :disabled="communityStore.loading"
          >
            <i class="mdi mdi-plus"></i>
            Add Store
          </button>
        </div>
      </div>
    </template>
    <template #actions> </template>

    <!-- Error Display -->
    <div v-if="communityStore.hasErrors" class="error-container">
      <div v-for="error in communityStore.errorList" :key="error.root" class="error-item">
        <span class="error-text">{{ error.name }}: {{ error.error }}</span>
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

    <ConfirmDialog
      :show="showDeleteConfirmationState"
      title="Confirm Store Removal"
      message="Are you sure you want to remove this store? This will not delete any imported models."
      confirm-label="Remove"
      cancel-test-id="cancel-store-deletion"
      confirm-test-id="confirm-store-deletion"
      @close="cancelDeleteStore"
      @confirm="confirmDeleteStore"
    />
  </sidebar-list>
</template>

<script lang="ts">
import { ref, onMounted, computed, defineComponent } from 'vue'

import { useCommunityApiStore, useScreenNavigation } from '../../stores'
import SidebarList from './SidebarList.vue'
import CommunityModelListItem from './CommunityModelListItem.vue'
import AddStoreModal from '../community/AddStoreModal.vue'
import type { ModelFile, ModelRoot, AnyModelStore } from '../../remotes/models'
import { buildCommunityModelTree } from '../../remotes/displayHelpers'
import ConfirmDialog from '../ConfirmDialog.vue'
import { useConfirmationState } from '../useConfirmationState'

export default defineComponent({
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

    // Handle adding a store from the modal
    const handleAddStoreSubmit = async (store: any) => {
      try {
        await communityStore.addStore(store)
        communityStore.closeAddStoreModal()
      } catch (error) {
        console.error('Failed to add store:', error)
      }
    }

    const {
      isOpen: showDeleteConfirmationState,
      openConfirmation: showDeleteStoreConfirmation,
      closeConfirmation: cancelDeleteStore,
      confirm: confirmDeleteStore,
    } = useConfirmationState<AnyModelStore>((store) => {
      communityStore.removeStore(store.id)
    })

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
    ConfirmDialog,
  },
})
</script>

<style scoped>
.community-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.community-header .sidebar-header {
  margin: 0;
}

.community-header-actions {
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
</style>
