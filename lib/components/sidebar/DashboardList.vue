<!-- DashboardList.vue -->
<template>
  <sidebar-list title="Dashboards">
    <template #actions>
      <div class="button-container">
        <button
          @click="creatorVisible = !creatorVisible"
          :data-testid="testTag ? `dashboard-creator-add-${testTag}` : 'dashboard-creator-add'"
        >
          {{ creatorVisible ? 'Hide' : 'New' }}
        </button>
        <button
          @click="importPopupVisible = true"
          class="import-button"
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

    <div v-if="showDeleteConfirmationState" class="confirmation-overlay" @click.self="cancelDelete">
      <div class="confirmation-dialog">
        <h3>Confirm Deletion</h3>
        <p>Are you sure you want to delete this dashboard? Contents cannot be recovered.</p>
        <div class="dialog-actions">
          <button class="cancel-btn" data-testid="cancel-dashboard-deletion" @click="cancelDelete">
            Cancel
          </button>
          <button
            class="confirm-btn"
            data-testid="confirm-dashboard-deletion"
            @click="confirmDelete"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  </sidebar-list>
</template>

<script lang="ts">
import { inject, ref, computed, onMounted } from 'vue'
import type { DashboardStoreType } from '../../stores/dashboardStore'
import type { ConnectionStoreType } from '../../stores/connectionStore'
import DashboardCreatorInline from '../dashboard/DashboardCreatorInline.vue'
import DashboardImportPopup from '../dashboard/DashboardImportPopup.vue'
import DashboardListItem from './DashboardListItem.vue'
import { DashboardModel } from '../../dashboards'
import SidebarList from './SidebarList.vue'
import LoadingButton from '../LoadingButton.vue'
import { getDefaultValueFromHash } from '../../stores/urlStore'

// Helper function to build dashboard tree
function buildDashboardTree(dashboards: any[], collapsed: Record<string, boolean>) {
  const tree: any[] = []

  // Group by storage first
  const storageMap: Record<string, any[]> = {}

  dashboards.forEach((dashboard) => {
    const storage = dashboard.storage || 'local'
    if (dashboard.deleted) {
      return // Skip deleted dashboards
    }
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

        // If not collapsed, add dashboards
        if (!collapsed[connectionKey]) {
          connectionItems.forEach((dashboard) => {
            tree.push({
              type: 'dashboard',
              label: dashboard.name,
              id: dashboard.id,
              key: `d-${dashboard.id}`,
              indent: 2,
              dashboard: dashboard,
            })
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

    const current = getDefaultValueFromHash('dashboard') || ''

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

    return {
      connectionStore,
      dashboardStore,
      contentList,
      toggleCollapse,
      collapsed,
      creatorVisible,
      importPopupVisible,
      saveDashboards,
    }
  },
  data() {
    return {
      showDeleteConfirmationState: false,
      dashboardToDelete: null as string | null,
    }
  },
  methods: {
    showDeleteConfirmation(dashboard: DashboardModel) {
      this.dashboardToDelete = dashboard.id
      this.showDeleteConfirmationState = true
    },
    cancelDelete() {
      this.showDeleteConfirmationState = false
      this.dashboardToDelete = null
    },
    confirmDelete() {
      if (this.dashboardToDelete) {
        // Mark as deleted for sync (if that property exists)
        if (this.dashboardStore.dashboards[this.dashboardToDelete]) {
          this.dashboardStore.dashboards[this.dashboardToDelete].delete()
        }
      }
      this.showDeleteConfirmationState = false
      this.dashboardToDelete = null
    },
    dashboardCreated(id: string) {
      console.log('Dashboard created event received:', id)
      this.$emit('dashboard-key-selected', id)
    },
    clickAction(item: any) {
      if (item.type === 'dashboard') {
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
  },
}
</script>

<style scoped>
.import-button {
  background-color: var(--button-bg);
  color: var(--text-color);
  border: none;
  cursor: pointer;
}

.import-button:hover {
  background-color: var(--button-hover-bg);
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
  width: 300px;
  background-color: var(--bg-color);
  padding: 20px;
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.3);
}

.confirmation-dialog h3 {
  margin-top: 0;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}

.dialog-actions button {
  padding: 8px 16px;
  margin-left: 10px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.cancel-btn {
  background-color: var(--button-bg);
  color: var(--text-color);
}

.confirm-btn {
  background-color: var(--delete-color);
  color: white;
}
</style>
