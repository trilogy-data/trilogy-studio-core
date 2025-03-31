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
        <loading-button :action="saveDashboards" :keyCombination="['control', 'd']">
          Save
        </loading-button>
      </div>
      <dashboard-creator-inline
        :visible="creatorVisible"
        @close="creatorVisible = !creatorVisible"
        :testTag="testTag"
      />
    </template>
    <div
      v-for="item in contentList"
      :key="item.key"
      :data-testid="`dashboard-list-id-${item.key}`"
      :class="{
        'sidebar-item': item.type !== 'creator',
        'sidebar-item-selected': activeDashboardKey === item.id,
      }"
      @click="clickAction(item.type, item.id, item.key)"
    >
      <div
        v-if="!['creator'].includes(item.type) && !isMobile"
        v-for="_ in item.indent"
        class="sidebar-padding"
      ></div>
      <i
        v-if="!['dashboard', 'creator'].includes(item.type)"
        :class="collapsed[item.key] ? 'mdi mdi-menu-right' : 'mdi mdi-menu-down'"
      >
      </i>
      <template v-if="item.type === 'dashboard'">
        <tooltip content="Dashboard" position="right">
          <i class="mdi mdi-view-dashboard"></i>
        </tooltip>
      </template>

      <span class="truncate-text">
        {{ item.label }}
        <span class="text-light" v-if="item.type === 'connection'">
          ({{
            connectionStore.connections[item.label]?.model
              ? connectionStore.connections[item.label]?.model
              : 'No Model Set'
          }})</span
        >
      </span>

      <template v-if="item.type === 'connection'">
        <span class="tag-container">
          <dashboard-creator-icon :connection="item.label" title="New Dashboard" />
        </span>
        <status-icon :status="connectionStateToStatus(connectionStore.connections[item.label])" />
      </template>

      <tooltip v-if="item.type === 'dashboard'" content="Delete Dashboard" position="left">
        <span
          class="remove-btn"
          @click.stop="deleteDashboard(item.dashboard)"
          :data-testid="`delete-dashboard-${item.label}`"
        >
          <i class="mdi mdi-trash-can"></i>
        </span>
      </tooltip>
    </div>
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
import type { DashboardStoreType } from '../stores/dashboardStore'
import type { ConnectionStoreType } from '../stores/connectionStore'
import DashboardCreatorInline from './DashboardCreatorInline.vue'
import DashboardCreatorIcon from './DashboardCreatorIcon.vue'
import { DashboardModel } from '../dashboards'
import SidebarList from './SidebarList.vue'
import Tooltip from './Tooltip.vue'
import LoadingButton from './LoadingButton.vue'
import StatusIcon from './StatusIcon.vue'
import type { Connection } from '../connections'
import { getDefaultValueFromHash } from '../stores/urlStore'

// Helper function to build dashboard tree
function buildDashboardTree(dashboards: any[], collapsed: Record<string, boolean>) {
  const tree: any[] = []

  // Group by storage first
  const storageMap: Record<string, any[]> = {}

  dashboards.forEach((dashboard) => {
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
    const isMobile = inject<boolean>('isMobile', false)
    const saveDashboards = inject<Function>('saveDashboards')

    if (!dashboardStore || !connectionStore || !saveDashboards) {
      throw new Error('Dashboard or connection store is not provided!')
    }

    const collapsed = ref<Record<string, boolean>>({})
    const creatorVisible = ref(false)

    const toggleCollapse = (key: string) => {
      if (collapsed.value[key] === undefined) {
        collapsed.value[key] = false
      }
      collapsed.value[key] = !collapsed.value[key]
    }

    const current = getDefaultValueFromHash('dashboard') || ''

    const connectionStateToStatus = (connection: Connection | null) => {
      if (!connection) {
        return 'disabled'
      }
      if (connection.running) {
        return 'running'
      } else if (connection.connected) {
        return 'connected'
      } else {
        return 'disabled'
      }
    }

    onMounted(() => {
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
    })

    const contentList = computed(() => {
      return buildDashboardTree(Object.values(dashboardStore.dashboards), collapsed.value)
    })

    return {
      isMobile,
      connectionStore,
      dashboardStore,
      contentList,
      toggleCollapse,
      collapsed,
      connectionStateToStatus,
      creatorVisible,
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
          // @ts-ignore - Add deleted flag if needed
          this.dashboardStore.dashboards[this.dashboardToDelete].deleted = true
        }
        // Sync the deletion
        this.saveDashboards()
        // And purge
        this.dashboardStore.removeDashboard(this.dashboardToDelete)
      }
      this.showDeleteConfirmationState = false
      this.dashboardToDelete = null
    },

    deleteDashboard(dashboard: DashboardModel) {
      // Replace direct deletion with confirmation
      this.showDeleteConfirmation(dashboard)
    },
    clickAction(type: string, id: string, key: string) {
      if (type === 'dashboard') {
        console.log('Dashboard clicked:', id)
        this.$emit('dashboard-key-selected', id)
      } else {
        this.toggleCollapse(key)
      }
    },
  },
  components: {
    DashboardCreatorInline,
    DashboardCreatorIcon,
    SidebarList,
    Tooltip,
    LoadingButton,
    StatusIcon,
  },
}
</script>

<style scoped>
.icon-display {
  display: flex;
  justify-content: center;
  /* Horizontal center */
  align-items: center;
  /* Vertical center */
}

.active-dashboard {
  font-weight: bold;
}

.remove-btn {
  margin-left: auto;
  cursor: pointer;
  flex: 1;
}

.tag-container {
  margin-left: auto;
  display: flex;
}

.tag {
  /* Push to the right */
  font-size: 8px;
  /* margin-left: 5px; */
  border-radius: 3px;
  padding: 2px;
  background-color: hsl(210, 100%, 50%, 0.25);
  border: 1px solid hsl(210, 100%, 50%, 0.5);
  color: var(--tag-font);
  line-height: 10px;
  cursor: pointer;
}

.text-light {
  color: var(--text-faint);
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
  border-radius: 5px;
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
