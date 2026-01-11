<!-- OrchestrationSidebar.vue -->
<template>
  <sidebar-list title="Orchestration">
    <template #actions>
      <div class="button-container">
        <button
          @click="creatorVisible = !creatorVisible"
          :data-testid="testTag ? `schedule-creator-add-${testTag}` : 'schedule-creator-add'"
        >
          {{ creatorVisible ? 'Hide' : 'New Schedule' }}
        </button>
      </div>
      <div v-if="creatorVisible" class="creator-form">
        <input
          v-model="newScheduleName"
          type="text"
          placeholder="Schedule name"
          class="schedule-name-input"
          data-testid="schedule-name-input"
          @keyup.enter="createSchedule"
        />
        <select v-model="selectedConnection" class="connection-select" data-testid="schedule-connection-select">
          <option value="" disabled>Select connection</option>
          <option v-for="conn in connectionList" :key="conn.name" :value="conn.name">
            {{ conn.name }}
          </option>
        </select>
        <button
          @click="createSchedule"
          :disabled="!newScheduleName || !selectedConnection"
          data-testid="schedule-create-button"
          class="create-button"
        >
          Create
        </button>
      </div>
    </template>

    <generic-sidebar-item
      v-for="item in contentList"
      :key="item.key"
      :item-id="item.id"
      :name="item.label"
      :indent="item.indent"
      :is-selected="activeScheduleKey === item.id && item.type === 'schedule'"
      :is-collapsible="item.type !== 'schedule'"
      :is-collapsed="collapsed[item.key]"
      :icon="getIcon(item.type)"
      :item-type="item.type"
      @click="clickAction(item)"
      @toggle="toggleCollapse(item.key)"
    >
      <template #extra-content v-if="item.type === 'schedule'">
        <div class="schedule-actions">
          <span
            v-if="item.schedule?.enabled"
            class="status-badge enabled"
            title="Enabled"
          >
            <i class="mdi mdi-check-circle"></i>
          </span>
          <span
            v-else
            class="status-badge disabled"
            title="Disabled"
          >
            <i class="mdi mdi-pause-circle"></i>
          </span>
          <button
            class="delete-btn"
            @click.stop="showDeleteConfirmation(item.schedule)"
            title="Delete schedule"
            :data-testid="`delete-schedule-${item.id}`"
          >
            <i class="mdi mdi-delete-outline"></i>
          </button>
        </div>
      </template>
    </generic-sidebar-item>

    <div v-if="scheduleList.length === 0" class="empty-state">
      <p>No schedules yet.</p>
      <p class="hint">Create a schedule to automate your queries.</p>
    </div>

    <div v-if="showDeleteConfirmationState" class="confirmation-overlay" @click.self="cancelDelete">
      <div class="confirmation-dialog">
        <h3>Confirm Deletion</h3>
        <p>Are you sure you want to delete this schedule? This action cannot be undone.</p>
        <div class="dialog-actions">
          <button class="cancel-btn" data-testid="cancel-schedule-deletion" @click="cancelDelete">
            Cancel
          </button>
          <button
            class="confirm-btn"
            data-testid="confirm-schedule-deletion"
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
import type { OrchestrationStoreType } from '../../stores/orchestrationStore'
import type { ConnectionStoreType } from '../../stores/connectionStore'
import type { Schedule } from '../../stores/orchestrationStore'
import GenericSidebarItem from './GenericSidebarItem.vue'
import SidebarList from './SidebarList.vue'
import { getDefaultValueFromHash } from '../../stores/urlStore'

export interface TreeItem {
  type: 'connection' | 'schedule'
  label: string
  key: string
  id: string
  indent: number
  schedule?: Schedule
}

function buildScheduleTree(
  schedules: Schedule[],
  collapsed: Record<string, boolean>
): TreeItem[] {
  const tree: TreeItem[] = []

  // Group schedules by connection
  const connectionMap: Record<string, Schedule[]> = {}

  schedules.forEach((schedule) => {
    const connection = schedule.connection || 'default'
    if (!connectionMap[connection]) {
      connectionMap[connection] = []
    }
    connectionMap[connection].push(schedule)
  })

  // Build tree with connection headers
  Object.entries(connectionMap).forEach(([connection, connectionSchedules]) => {
    const connectionKey = `conn-${connection}`
    tree.push({
      type: 'connection',
      label: connection,
      key: connectionKey,
      id: connectionKey,
      indent: 0,
    })

    // If not collapsed, add schedules
    if (!collapsed[connectionKey]) {
      connectionSchedules.forEach((schedule) => {
        tree.push({
          type: 'schedule',
          label: schedule.name,
          key: `sched-${schedule.id}`,
          id: schedule.id,
          indent: 1,
          schedule: schedule,
        })
      })
    }
  })

  return tree
}

export default {
  name: 'OrchestrationSidebar',
  props: {
    activeScheduleKey: String,
    testTag: {
      type: String,
      default: '',
    },
  },
  setup() {
    const orchestrationStore = inject<OrchestrationStoreType>('orchestrationStore')
    const connectionStore = inject<ConnectionStoreType>('connectionStore')

    if (!orchestrationStore || !connectionStore) {
      throw new Error('Orchestration or connection store is not provided!')
    }

    const collapsed = ref<Record<string, boolean>>({})
    const creatorVisible = ref(false)
    const newScheduleName = ref('')
    const selectedConnection = ref('')

    const toggleCollapse = (key: string) => {
      if (collapsed.value[key] === undefined) {
        collapsed.value[key] = false
      }
      collapsed.value[key] = !collapsed.value[key]
    }

    const current = getDefaultValueFromHash('orchestration') || ''

    onMounted(() => {
      // Expand the connection containing the current schedule
      Object.values(orchestrationStore.schedules).forEach((schedule) => {
        const connectionKey = `conn-${schedule.connection}`
        if (current === schedule.id) {
          collapsed.value[connectionKey] = false
        } else if (collapsed.value[connectionKey] === undefined) {
          collapsed.value[connectionKey] = false // Default to expanded
        }
      })
    })

    const scheduleList = computed(() => Object.values(orchestrationStore.schedules))

    const contentList = computed(() => {
      return buildScheduleTree(scheduleList.value, collapsed.value)
    })

    const connectionList = computed(() => connectionStore.connectionList)

    return {
      orchestrationStore,
      connectionStore,
      contentList,
      scheduleList,
      connectionList,
      toggleCollapse,
      collapsed,
      creatorVisible,
      newScheduleName,
      selectedConnection,
    }
  },
  data() {
    return {
      showDeleteConfirmationState: false,
      scheduleToDelete: null as string | null,
    }
  },
  methods: {
    getIcon(type: string): string {
      switch (type) {
        case 'connection':
          return 'mdi-database-outline'
        case 'schedule':
          return 'mdi-clock-outline'
        default:
          return ''
      }
    },
    createSchedule() {
      if (!this.newScheduleName || !this.selectedConnection) {
        return
      }

      const schedule = this.orchestrationStore.createSchedule(
        this.newScheduleName,
        this.selectedConnection
      )

      this.newScheduleName = ''
      this.creatorVisible = false

      // Emit event to navigate to the new schedule
      this.$emit('schedule-key-selected', schedule.id)
    },
    showDeleteConfirmation(schedule: Schedule | undefined) {
      if (!schedule) return
      this.scheduleToDelete = schedule.id
      this.showDeleteConfirmationState = true
    },
    cancelDelete() {
      this.showDeleteConfirmationState = false
      this.scheduleToDelete = null
    },
    confirmDelete() {
      if (this.scheduleToDelete) {
        this.orchestrationStore.deleteSchedule(this.scheduleToDelete)
      }
      this.showDeleteConfirmationState = false
      this.scheduleToDelete = null
    },
    clickAction(item: TreeItem) {
      if (item.type === 'schedule') {
        this.$emit('schedule-key-selected', item.id)
      } else {
        this.toggleCollapse(item.key)
      }
    },
  },
  components: {
    GenericSidebarItem,
    SidebarList,
  },
}
</script>

<style scoped>
.creator-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
  background-color: var(--bg-color-secondary);
  border-radius: 4px;
  margin-bottom: 8px;
}

.schedule-name-input,
.connection-select {
  padding: 6px 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background-color: var(--input-bg);
  color: var(--text-color);
  font-size: 13px;
}

.create-button {
  padding: 6px 12px;
  background-color: var(--primary-color);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.create-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.create-button:hover:not(:disabled) {
  background-color: var(--primary-color-hover);
}

.schedule-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  padding-right: 4px;
}

.status-badge {
  font-size: 14px;
}

.status-badge.enabled {
  color: var(--success-color, #4caf50);
}

.status-badge.disabled {
  color: var(--text-color-secondary);
}

.delete-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-color-secondary);
  padding: 2px 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
}

.delete-btn:hover {
  color: var(--delete-color);
  background-color: var(--button-mouseover);
}

.empty-state {
  padding: 16px;
  text-align: center;
  color: var(--text-color-secondary);
}

.empty-state p {
  margin: 4px 0;
}

.empty-state .hint {
  font-size: 12px;
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
  border-radius: 4px;
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
