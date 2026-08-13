<template>
  <sidebar-list title="External Models">
    <template #header>
      <div class="community-header">
        <h3 class="font-sans sidebar-header">External Models</h3>
        <button
          class="sidebar-control-button sidebar-header-action sidebar-primary-create"
          @click="communityStore.openAddStoreModal()"
          data-testid="community-store-add"
        >
          <i class="mdi mdi-plus"></i>
          New
        </button>
      </div>
    </template>
    <template #actions>
      <div class="button-container">
        <button
          class="sidebar-control-button sidebar-header-action"
          @click="communityStore.refreshData()"
          :disabled="communityStore.loading"
          data-testid="community-store-refresh"
        >
          <i class="mdi mdi-refresh"></i>
          {{ communityStore.loading ? 'Refreshing' : 'Refresh' }}
        </button>
      </div>
    </template>

    <!-- Error Display -->
    <div v-if="communityStore.hasErrors" class="error-container">
      <div v-for="error in communityStore.errorList" :key="error.root" class="error-item">
        <span class="error-text">{{ error.name }}: {{ error.error }}</span>
        <button @click="communityStore.clearStoreError(error.root)" class="clear-error">×</button>
      </div>
    </div>

    <!-- Model List -->
    <mobile-tree-list
      list-id="community"
      ref="mobileTree"
      :items="displayTree"
      id-field="key"
      label-field="label"
      :enabled="isMobile"
      :is-branch="isCommunityBranch"
      :is-selectable="isCommunityBranch"
      @expand="expandMobileBranch"
      @select="selectMobileItem"
    >
      <template #item="{ item }">
        <CommunityModelListItem
          :key="item.key"
          :item="item"
          :mobile-tree-mode="isMobile"
          :is-collapsed="isCollapsed(item.key)"
          :active-model="navigationStore.activeCommunityModelKey.value"
          @item-click="handleItemClick"
          @item-toggle="handleItemToggle"
          @model-selected="handleModelSelected"
          @delete-store="showDeleteStoreConfirmation"
          @mobile-item-click="handleMobileItemClick"
        />
      </template>
    </mobile-tree-list>

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
import { ref, onMounted, computed, defineComponent, inject } from 'vue'

import { useCommunityApiStore, useScreenNavigation } from '../../stores'
import { KeySeparator } from '../../data/constants'
import { useCollapseState } from './collapseState'
import SidebarList from './SidebarList.vue'
import CommunityModelListItem from './CommunityModelListItem.vue'
import AddStoreModal from '../community/AddStoreModal.vue'
import type { ModelFile, ModelRoot, AnyModelStore } from '../../remotes/models'
import { buildCommunityModelTree } from '../../remotes/displayHelpers'
import ConfirmDialog from '../ConfirmDialog.vue'
import { useConfirmationState } from '../useConfirmationState'
import type { EditorStoreType } from '../../stores/editorStore'
import type { ConnectionStoreType } from '../../stores/connectionStore'
import type { ModelConfigStoreType } from '../../stores/modelStore'
import { removeRemoteStoreFromIde } from '../../remotes/remoteStoreSync'
import { useIsMobile } from '../useIsMobile'
import MobileTreeList from './MobileTreeList.vue'

export default defineComponent({
  name: 'CommunityModelList',
  setup() {
    const communityStore = useCommunityApiStore()
    const navigationStore = useScreenNavigation()
    const editorStore = inject<EditorStoreType>('editorStore')
    const connectionStore = inject<ConnectionStoreType>('connectionStore')
    const modelStore = inject<ModelConfigStoreType>('modelStore')
    const isMobile = useIsMobile()
    const mobileTree = ref<any>(null)

    // Get the currently active model key
    const activeKey = navigationStore.activeCommunityModelKey.value || ''

    // Keys that start open: the store and engine above the active model, or —
    // with nothing active — a lone store, so the panel is never empty-looking
    // but never picks arbitrarily between several. Computed rather than seeded,
    // so it survives stores arriving after mount.
    const openKeys = computed(() => {
      if (activeKey) {
        // Keys are formatted as storeId+engine+model.
        const [storeId, engine] = activeKey.split(KeySeparator)
        return new Set(engine ? [storeId, `${storeId}${KeySeparator}${engine}`] : [storeId])
      }
      const stores = communityStore.stores
      return stores.length === 1 ? new Set([stores[0].id]) : new Set<string>()
    })

    const {
      overrides: collapsed,
      isCollapsed,
      toggle: toggleKey,
      open: openKey,
    } = useCollapseState((key) => openKeys.value.has(key))

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
      if (store.type === 'generic') {
        if (editorStore && connectionStore && modelStore) {
          removeRemoteStoreFromIde(store.id, editorStore, connectionStore, modelStore)
        }
      }
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
      toggleKey(key)
    }

    const displayTree = computed(() => {
      return buildCommunityModelTree(
        isCollapsed,
        communityStore.stores,
        communityStore.filesByStore,
      )
    })
    const isCommunityBranch = (item: any) => ['root', 'engine'].includes(item.type)
    const expandMobileBranch = (item: any) => {
      if (isCollapsed(item.key)) openKey(item.key)
    }
    const selectMobileItem = (item: any) => {
      if (item.type === 'model') handleModelSelected(item.model, item.key, item.modelRoot)
      else handleItemClick(item.type, item.key, item.modelRoot)
    }
    const handleMobileItemClick = (item: any) => mobileTree.value?.openItem(item)

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
      isCollapsed,
      displayTree,
      isMobile,
      mobileTree,
      isCommunityBranch,
      expandMobileBranch,
      selectMobileItem,
      handleMobileItemClick,
    }
  },
  components: {
    SidebarList,
    CommunityModelListItem,
    AddStoreModal,
    ConfirmDialog,
    MobileTreeList,
  },
})
</script>

<style scoped>
.community-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.community-header .sidebar-header {
  margin: 0;
}

/* "External Models" is wide enough to wrap at the default sidebar width; without
   this the button gets squeezed and clipped by the sidebar edge instead. */
.community-header .sidebar-primary-create {
  flex: 0 0 auto;
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
