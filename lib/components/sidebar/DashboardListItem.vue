<template>
  <sidebar-item
    v-if="item.type !== 'creator'"
    :item-id="item.key"
    :name="item.label"
    :indent="item.indent"
    :is-selected="isActive"
    :is-collapsible="!['dashboard', 'investigation', 'creator'].includes(item.type) || item.hasInvestigations"
    :is-collapsed="isCollapsed"
    itemType="dashboard"
    @click="handleClick"
    @toggle="handleToggle"
  >
    <!-- Custom icon slot for dashboard items -->
    <template #icon>
      <template v-if="item.type === 'investigation'">
        <tooltip content="Investigation" position="right">
          <i class="mdi mdi-source-branch node-icon investigation-icon"></i>
        </tooltip>
      </template>
      <template v-else-if="item.type === 'dashboard'">
        <tooltip content="Dashboard" position="right">
          <i class="mdi mdi-view-dashboard node-icon"></i>
        </tooltip>
      </template>
    </template>

    <!-- Custom name slot for connection model info -->
    <template #name>
      {{ item.label }}
      <span class="text-light connection-model" v-if="item.type === 'connection'">
        ({{ connectionInfo?.model ? connectionInfo?.model : 'No Model Set' }})
      </span>
    </template>

    <!-- Custom extra content slot for action buttons -->
    <template #extra-content>
      <div class="dashboard-actions">
        <template v-if="item.type === 'connection'">
          <status-icon :status="connectionStatus" />
          <sidebar-overflow-menu
            :items="contextMenuItems"
            tooltip="Connection actions"
            @select="handleContextMenuItemClick"
          />
        </template>
        <template v-if="item.type === 'dashboard' || item.type === 'investigation'">
          <sidebar-overflow-menu
            :items="contextMenuItems"
            :tooltip="item.type === 'investigation' ? 'Investigation actions' : 'Dashboard actions'"
            @select="handleContextMenuItemClick"
          />
        </template>
      </div>
    </template>
  </sidebar-item>

  <!-- Handle creator items separately if needed -->
  <div
    v-else
    :data-testid="`dashboard-list-id-${item.key}`"
    class="creator-item"
    @click="handleClick"
  >
    {{ item.label }}
  </div>
</template>

<script lang="ts">
import { computed, inject } from 'vue'
import SidebarItem from './GenericSidebarItem.vue'
import type { ConnectionStoreType } from '../../stores/connectionStore'
import type { DashboardStoreType } from '../../stores/dashboardStore'
import Tooltip from '../Tooltip.vue'
import StatusIcon from '../StatusIcon.vue'
import SidebarOverflowMenu from './SidebarOverflowMenu.vue'
import type { ContextMenuItem } from '../ContextMenu.vue'

export default {
  name: 'DashboardListItem',
  props: {
    item: {
      type: Object,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: false,
    },
    isCollapsed: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['click', 'delete', 'clone', 'toggle'],
  setup(props) {
    const connectionStore = inject<ConnectionStoreType>('connectionStore')
    const dashboardStore = inject<DashboardStoreType>('dashboardStore')
    const isMobile = inject<boolean>('isMobile', false)

    if (!connectionStore || !dashboardStore) {
      throw new Error('Connection/Dashboard stores is not provided!')
    }

    const connectionInfo = computed(() => {
      if (props.item.type === 'connection') {
        return connectionStore.connections[props.item.label] || null
      }
      return null
    })

    const connectionStatus = computed(() => {
      const connection = connectionInfo.value
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
    })

    const contextMenuItems = computed<ContextMenuItem[]>(() => {
      if (props.item.type === 'connection') {
        return [{ id: 'new-dashboard', label: 'New dashboard', icon: 'mdi-table-plus' }]
      }

      if (props.item.type === 'investigation') {
        return [
          { id: 'promote-investigation', label: 'Promote to dashboard', icon: 'mdi-arrow-up-bold' },
          { id: 'clone-dashboard', label: 'Clone', icon: 'mdi-content-copy' },
          { id: 'delete-separator', kind: 'separator' },
          {
            id: 'delete-dashboard',
            label: 'Delete investigation',
            icon: 'mdi-trash-can-outline',
            danger: true,
          },
        ]
      }

      if (props.item.type === 'dashboard') {
        return [
          { id: 'fork-investigation', label: 'New investigation', icon: 'mdi-source-branch' },
          { id: 'clone-dashboard', label: 'Clone dashboard', icon: 'mdi-content-copy' },
          { id: 'delete-separator', kind: 'separator' },
          {
            id: 'delete-dashboard',
            label: 'Delete dashboard',
            icon: 'mdi-trash-can-outline',
            danger: true,
          },
        ]
      }

      return []
    })

    return {
      isMobile,
      dashboardStore,
      connectionInfo,
      connectionStatus,
      contextMenuItems,
    }
  },
  methods: {
    handleClick() {
      this.$emit('click', this.item)
    },
    handleToggle() {
      this.$emit('click', this.item) // Maintain existing behavior
    },
    handleDelete() {
      this.$emit('delete', this.item.dashboard)
    },
    handleClone() {
      this.dashboardStore.cloneDashboard(this.item.id)
    },
    handleContextMenuItemClick(item: ContextMenuItem) {
      switch (item.id) {
        case 'new-dashboard': {
          const defaultName = `${this.item.label} Dashboard ${Date.now().toString().slice(-4)}`
          const dashboard = this.dashboardStore.newDashboard(defaultName, this.item.label)
          this.dashboardStore.setActiveDashboard(dashboard.id)
          break
        }
        case 'clone-dashboard':
          this.handleClone()
          break
        case 'delete-dashboard':
          this.handleDelete()
          break
        case 'fork-investigation': {
          const name = `Investigation ${Date.now().toString().slice(-4)}`
          this.dashboardStore.forkDashboard(this.item.id, name)
          break
        }
        case 'promote-investigation':
          this.dashboardStore.promoteDashboard(this.item.id)
          break
      }
    },
  },
  components: {
    SidebarItem,
    Tooltip,
    StatusIcon,
    SidebarOverflowMenu,
  },
}
</script>

<style scoped>
.connection-model {
  display: inline-flex;
  max-width: 25px;
}

.icon-display {
  display: flex;
  justify-content: center;
  align-items: center;
}

.text-light {
  color: var(--text-faint);
}

.investigation-icon {
  color: var(--special-text);
}

.dashboard-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}

.title {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding-left: 3px;
}

.creator-item {
  padding: 8px;
  cursor: pointer;
}
</style>
