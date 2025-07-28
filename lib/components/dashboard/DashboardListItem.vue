<!-- DashboardListItem.vue -->
<template>
  <div
    :data-testid="`dashboard-list-id-${item.key}`"
    :class="{
      'sidebar-item': item.type !== 'creator',
      'sidebar-item-selected': isActive,
    }"
    @click="handleClick"
  >
    <div
      v-if="!['creator'].includes(item.type) && !isMobile"
      v-for="_ in item.indent"
      class="sidebar-padding"
    ></div>
    <i
      v-if="!['dashboard', 'creator'].includes(item.type)"
      :class="isCollapsed ? 'mdi mdi-menu-right' : 'mdi mdi-menu-down'"
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
        ({{ connectionInfo?.model ? connectionInfo?.model : 'No Model Set' }})</span
      >
    </span>
    <div class="dashboard-actions">
      <template v-if="item.type === 'connection'">
        <span class="tag-container">
          <dashboard-creator-icon :connection="item.label" title="New Dashboard" />
        </span>
        <status-icon :status="connectionStatus" />
      </template>
      <template v-if="item.type === 'dashboard'">
        <tooltip content="Clone Dashboard" position="left">
          <span
            class="clone-btn"
            @click.stop="handleClone"
            :data-testid="`clone-dashboard-${item.label}`"
          >
            <i class="mdi mdi-content-copy"></i>
          </span>
        </tooltip>
        <tooltip content="Delete Dashboard" position="left">
          <span
            class="remove-btn"
            @click.stop="handleDelete"
            :data-testid="`delete-dashboard-${item.label}`"
          >
            <i class="mdi mdi-trash-can"></i>
          </span>
        </tooltip>
      </template>
    </div>
  </div>
</template>
<script lang="ts">
import { computed, inject } from 'vue'
import type { ConnectionStoreType } from '../../stores/connectionStore'
import type { DashboardStoreType } from '../../stores/dashboardStore'
import DashboardCreatorIcon from './DashboardCreatorIcon.vue'
import Tooltip from './Tooltip.vue'
import StatusIcon from './StatusIcon.vue'
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
  emits: ['click', 'delete', 'clone'],
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
    return {
      isMobile,
      dashboardStore,
      connectionInfo,
      connectionStatus,
    }
  },
  methods: {
    handleClick() {
      this.$emit('click', this.item)
    },
    handleDelete() {
      this.$emit('delete', this.item.dashboard)
    },
    handleClone() {
      this.dashboardStore.cloneDashboard(this.item.id)
    },
  },
  components: {
    DashboardCreatorIcon,
    Tooltip,
    StatusIcon,
  },
}
</script>
<style scoped>
.icon-display {
  display: flex;
  justify-content: center;
  align-items: center;
}
.clone-btn,
.remove-btn {
  margin-left: 8px;
  cursor: pointer;
  flex: 1;
}
.clone-btn:hover,
.remove-btn:hover {
  opacity: 0.7;
}
.tag-container {
  margin-left: auto;
  display: flex;
}
.text-light {
  color: var(--text-faint);
}
.dashboard-actions {
  display: flex;
  align-items: center;
  margin-left: auto;
}
</style>
