<template>
  <tooltip :content="title" position="left">
    <span @click.stop="createDashboard" class="dashboard-creator-icon">
      <i class="mdi mdi-table-plus"></i>
    </span>
  </tooltip>
</template>

<script lang="ts">
import { inject } from 'vue'
import type { DashboardStoreType } from '../../stores/dashboardStore'
import Tooltip from '../Tooltip.vue'

export default {
  name: 'DashboardCreatorIcon',
  components: {
    Tooltip,
  },
  props: {
    connection: {
      type: String,
      required: true,
    },
    title: {
      type: String,
      default: 'New Dashboard',
    },
  },
  setup(props: { connection: string; title: string }) {
    const dashboardStore = inject<DashboardStoreType>('dashboardStore')

    if (!dashboardStore) {
      throw new Error('Dashboard store is not provided!')
    }

    const createDashboard = () => {
      // Generate a default name based on connection
      const defaultName = `${props.connection} Dashboard ${Date.now().toString().slice(-4)}`

      try {
        // Create a new dashboard with connection
        const dashboard = dashboardStore.newDashboard(defaultName, props.connection)

        // Set it as active
        dashboardStore.setActiveDashboard(dashboard.id)
      } catch (error) {
        console.error('Failed to create dashboard:', error)
        alert(`Error creating dashboard: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    return {
      createDashboard,
    }
  },
}
</script>

<style scoped>
.dashboard-creator-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  margin-left: 4px;
  cursor: pointer;
  color: var(--text-color);
  opacity: 0.7;
  transition: opacity 0.2s;
}

.dashboard-creator-icon:hover {
  opacity: 1;
}

.dashboard-creator-icon i {
  font-size: 16px;
}
</style>
