<!-- DashboardList.vue -->
<template>
  <sidebar-list title="Dashboards">
    <template #header>
      <div class="dashboards-header">
        <h3 class="font-sans sidebar-header">Dashboards</h3>
        <button
          class="sidebar-control-button sidebar-header-action"
          @click="creatorVisible = !creatorVisible"
          :data-testid="testTag ? `dashboard-creator-add-${testTag}` : 'dashboard-creator-add'"
        >
          <i class="mdi mdi-plus"></i>
          {{ creatorVisible ? 'Close' : 'New' }}
        </button>
      </div>
    </template>
    <template #actions>
      <div class="button-container">
        <button
          class="sidebar-control-button sidebar-header-action"
          @click="importPopupVisible = true"
          data-testid="dashboard-import-button"
        >
          Import
        </button>
      </div>
      <dashboard-creator-inline
        :visible="creatorVisible"
        @close="creatorVisible = !creatorVisible"
        :testTag="testTag"
        @dashboard-created="dashboardCreated"
      />
      <dashboard-import-popup :isOpen="importPopupVisible" @close="importPopupVisible = false" />
    </template>

    <dashboard-list-item
      v-for="item in contentList"
      :key="item.key"
      :item="item"
      :is-active="activeDashboardKey === item.id"
      :is-collapsed="collapsed[item.key]"
      @click="clickAction(item)"
      @delete="showDeleteConfirmation"
    />

    <ConfirmDialog
      :show="showDeleteConfirmationState"
      title="Confirm Deletion"
      message="Are you sure you want to delete this dashboard? Contents cannot be recovered."
      confirm-label="Delete"
      cancel-test-id="cancel-dashboard-deletion"
      confirm-test-id="confirm-dashboard-deletion"
      @close="cancelDelete"
      @confirm="confirmDelete"
    />
  </sidebar-list>
</template>

<script lang="ts">
import { inject, ref, computed, onMounted } from 'vue'
import type { DashboardStoreType } from '../../stores/dashboardStore'
import type { ConnectionStoreType } from '../../stores/connectionStore'
import type { ChatStoreType } from '../../stores/chatStore'
import DashboardCreatorInline from '../dashboard/DashboardCreatorInline.vue'
import DashboardImportPopup from '../dashboard/DashboardImportPopup.vue'
import DashboardListItem from './DashboardListItem.vue'
import type { DashboardModel } from '../../dashboards'
import SidebarList from './SidebarList.vue'
import LoadingButton from '../LoadingButton.vue'
import { getDefaultValueFromHash, URL_HASH_KEYS } from '../../stores/urlStore'
import ConfirmDialog from '../ConfirmDialog.vue'
import { useConfirmationState } from '../useConfirmationState'

// Helper function to build dashboard tree
function buildDashboardTree(dashboards: any[], collapsed: Record<string, boolean>) {
  const tree: any[] = []

  // Group by storage first — only include root dashboards (not investigations)
  const storageMap: Record<string, any[]> = {}
  // Build a lookup of investigations by parent
  const investigationsByParent: Record<string, any[]> = {}

  dashboards.forEach((dashboard) => {
    if (dashboard.deleted) return

    if (dashboard.parentDashboardId) {
      // This is an investigation — group by parent
      if (!investigationsByParent[dashboard.parentDashboardId]) {
        investigationsByParent[dashboard.parentDashboardId] = []
      }
      investigationsByParent[dashboard.parentDashboardId].push(dashboard)
      return
    }

    const storage = dashboard.storage || 'local'
    if (!storageMap[storage]) {
      storageMap[storage] = []
    }
    storageMap[storage].push(dashboard)
  })

  // Then group by connection within each storage
  Object.entries(storageMap).forEach(([storage, storageItems]) => {
    // Add storage header
    const storageKey = `s-${storage}`
    tree.push({
      type: 'storage',
      label: storage === 'local' ? 'Browser Storage' : 'Remote Storage',
      key: storageKey,
      id: storageKey,
      indent: 0,
    })

    // If not collapsed, add connections
    if (!collapsed[storageKey]) {
      // Group by connection
      const connectionMap: Record<string, any[]> = {}

      storageItems.forEach((dashboard) => {
        const connection = dashboard.connection || 'default'
        if (!connectionMap[connection]) {
          connectionMap[connection] = []
        }
        connectionMap[connection].push(dashboard)
      })

      // Add connection headers and dashboards
      Object.entries(connectionMap).forEach(([connection, connectionItems]) => {
        // Add connection header
        const connectionKey = `c-${storage}-${connection}`
        tree.push({
          type: 'connection',
          id: connectionKey,
          label: connection,
          key: connectionKey,
          indent: 1,
        })

        // If not collapsed, add dashboards and their investigations
        if (!collapsed[connectionKey]) {
          connectionItems.forEach((dashboard) => {
            const hasInvestigations = (investigationsByParent[dashboard.id] || []).length > 0
            const dashboardKey = `d-${dashboard.id}`
            tree.push({
              type: 'dashboard',
              label: dashboard.name,
              id: dashboard.id,
              key: dashboardKey,
              indent: 2,
              dashboard: dashboard,
              hasInvestigations,
            })

            // Add investigations nested under the dashboard
            if (hasInvestigations && !collapsed[dashboardKey]) {
              investigationsByParent[dashboard.id].forEach((investigation: any) => {
                tree.push({
                  type: 'investigation',
                  label: investigation.investigationName || investigation.name,
                  id: investigation.id,
                  key: `i-${investigation.id}`,
                  indent: 3,
                  dashboard: investigation,
                })
              })
            }
          })
        }
      })
    }
  })

  return tree
}

export default {
  name: 'DashboardList',
  props: {
    activeDashboardKey: String,
    testTag: {
      type: String,
      default: '',
    },
  },
  setup() {
    const dashboardStore = inject<DashboardStoreType>('dashboardStore')
    const connectionStore = inject<ConnectionStoreType>('connectionStore')
    const chatStore = inject<ChatStoreType>('chatStore', null as any)
    const saveDashboards = inject<Function>('saveDashboards')

    if (!dashboardStore || !connectionStore || !saveDashboards) {
      throw new Error('Dashboard or connection store is not provided!')
    }

    const collapsed = ref<Record<string, boolean>>({})
    const creatorVisible = ref(false)
    const importPopupVisible = ref(false)

    const toggleCollapse = (key: string) => {
      if (collapsed.value[key] === undefined) {
        collapsed.value[key] = false
      }
      collapsed.value[key] = !collapsed.value[key]
    }

    const current = getDefaultValueFromHash(URL_HASH_KEYS.DASHBOARD) || ''

    onMounted(() => {
      let anyOpen = false
      Object.values(dashboardStore.dashboards).forEach((item) => {
        let storageKey = `s-${item.storage}`
        let connectionKey = `c-${item.storage}-${item.connection}`

        if (current === item.id) {
          collapsed.value[storageKey] = false
          collapsed.value[connectionKey] = false
        } else {
          // if it's not in collapsed, default to true
          // but if it is, keep it false if it's false
          if (collapsed.value[storageKey] === undefined) {
            collapsed.value[storageKey] = true
          } else if (collapsed.value[storageKey] === false) {
            collapsed.value[storageKey] = false
          }

          if (collapsed.value[connectionKey] === undefined) {
            collapsed.value[connectionKey] = true
          } else if (collapsed.value[connectionKey] === false) {
            collapsed.value[connectionKey] = false
          }
        }
      })
      if (!anyOpen && Object.keys(dashboardStore.dashboards).length > 0) {
        const firstDashboard = Object.values(dashboardStore.dashboards)[0]
        collapsed.value[`s-${firstDashboard.storage}`] = false
      }
    })

    const contentList = computed(() => {
      return buildDashboardTree(Object.values(dashboardStore.dashboards), collapsed.value)
    })

    const {
      isOpen: showDeleteConfirmationState,
      openConfirmation: showDeleteConfirmation,
      closeConfirmation: cancelDelete,
      confirm: confirmDelete,
    } = useConfirmationState<DashboardModel>((dashboard) => {
      // Soft-delete any owned dashboard chat so it doesn't linger as an orphan
      // under the "Dashboard Chats" filter in the AI sidebar.
      if (chatStore && dashboard.chatId && chatStore.chats[dashboard.chatId]) {
        chatStore.removeChat(dashboard.chatId)
      }
      dashboard.delete()
    })

    return {
      connectionStore,
      dashboardStore,
      contentList,
      toggleCollapse,
      collapsed,
      creatorVisible,
      importPopupVisible,
      saveDashboards,
      showDeleteConfirmationState,
      showDeleteConfirmation,
      cancelDelete,
      confirmDelete,
    }
  },
  methods: {
    dashboardCreated(id: string) {
      console.log('Dashboard created event received:', id)
      this.$emit('dashboard-key-selected', id)
    },
    clickAction(item: any) {
      if (item.type === 'dashboard') {
        // If dashboard has investigations, toggle collapse; click on the name still navigates
        this.$emit('dashboard-key-selected', item.id)
      } else if (item.type === 'investigation') {
        this.$emit('dashboard-key-selected', item.id)
      } else {
        this.toggleCollapse(item.key)
      }
    },
  },
  components: {
    DashboardCreatorInline,
    DashboardImportPopup,
    DashboardListItem,
    SidebarList,
    LoadingButton,
    ConfirmDialog,
  },
}
</script>

<style scoped>
.dashboards-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.dashboards-header .sidebar-header {
  margin: 0;
}

.import-button:hover {
  background-color: var(--button-hover-bg);
}
</style>
