<template>
  <div class="sidebar-item" @click="handleItemClick">
    <!-- Indentation -->
    <div v-for="_ in item.indent" :key="`indent-${_}`" class="sidebar-padding"></div>

    <!-- Expandable Item Icons -->
    <template v-if="isExpandable">
      <i v-if="isCollapsed === false" class="mdi mdi-menu-down"></i>
      <i v-else class="mdi mdi-menu-right"></i>
    </template>

    <!-- Connection Type Icons -->
    <connection-icon v-if="item.type === 'connection'" :connection-type="item.connection?.type" />

    <!-- Item Name -->
    <div class='refresh title-pad-left truncate-text' v-if="item.type === 'refresh'" @click="handleRefreshClick">
      {{ item.name }}
    </div>
    <model-selector v-else-if="item.type === 'model'" :connection="item.connection" />
    <div v-else-if="item.type === 'bigquery-project'" class="md-token-container" @click.stop>
      <form @submit.prevent="updateBigqueryProject(item.connection, bigqueryProject)">
        <button type="submit" class="md-token-button">Set Billing Project</button>
        <input type="text" v-model="bigqueryProject" placeholder="Enter Billing Project" class="md-token-input" />
      </form>
    </div>
    <div v-else-if="item.type === 'motherduck-token'" class="md-token-container" @click.stop>
      <form @submit.prevent="updateMotherDuckToken(item.connection, bigqueryProject)">
        <button type="submit" class="md-token-button">Set Billing Project</button>
        <input type="text" v-model="bigqueryProject" placeholder="Enter Billing Project" class="md-token-input" />
      </form>
    </div>
    <span v-else class="title-pad-left truncate-text" :class="{ 'error-indicator': item.type === 'error' }">
      {{ item.name }}
      <span v-if="item.count !== undefined && item.count > 0">
        ({{ item.count }})
      </span>
    </span>


    <!-- Connection-specific Actions -->
    <div class="connection-actions">
      <!-- Model Selection for Connection -->

      <!-- Refresh Button for Connection -->
      <connection-refresh v-if="item.type === 'connection'" :connection="item.connection"
        :is-connected="item.connection.connected" />

      <!-- Status Indicator -->
      <connection-status-icon v-if="item.type === 'connection'" :connection="item.connection" />

    </div>

    <!-- Loading/Error States -->
    <template v-if="item.type === 'loading'">
      <span class="loading-indicator"></span>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import ConnectionIcon from './ConnectionIcon.vue'
import ModelSelector from './ModelSelector.vue'
import ConnectionRefresh from './ConnectionRefresh.vue'
import ConnectionStatusIcon from './ConnectionStatusIcon.vue'
import { BigQueryOauthConnection, MotherDuckConnection } from '../connections'

// Define prop types
interface ConnectionListItemProps {
  item: {
    id: string
    name: string
    indent: number
    count?: number
    type: string
    connection?: any
  }
  isCollapsed?: boolean
}

// Props definition
const props = defineProps<ConnectionListItemProps>()

// Emits definition
const emit = defineEmits<{
  (e: 'toggle', id: string, connection: string, type: string): void
  (e: 'refresh', id: string, connection: string, type: string): void
  (e: 'updateBigqueryProject', connection: BigQueryOauthConnection, project: string): void
  (e: 'updateMotherDuckToken', connection: MotherDuckConnection, token: string): void
}>()

// Computed properties for rendering logic
const isExpandable = computed(() =>
  ['connection', 'database', 'table'].includes(props.item.type)
)

// Click handler for item expansion/toggling
const handleItemClick = () => {
  if (isExpandable.value) {
    emit('toggle', props.item.id, props.item.connection?.name || '', props.item.type)
  }
}

const handleRefreshClick = () => {
  emit('refresh', props.item.id, props.item.connection?.name || '', props.item.type)
}


const bigqueryProject = ref<string>(props.item.connection.projectId? props.item.connection.projectId : '')
const mdToken = ref<string>('')

const updateMotherDuckToken = (connection: MotherDuckConnection, token: string) => {
  emit('updateMotherDuckToken', connection, token)
}

const updateBigqueryProject = (connection: BigQueryOauthConnection, project: string) => {
  emit('updateBigqueryProject', connection, project)
}


</script>

<style scoped>
.sidebar-item {
  display: flex;
  align-items: center;
  cursor: pointer;
  width: 100%;
}

.title-pad-left {
  padding-left: 5px;
  flex-grow: 1;
}

.connection-actions {
  display: flex;
  align-items: center;
  margin-left: auto;
}

.loading-indicator {
  /* Existing loading animation styles */
  display: block;
  width: 100%;
  background: linear-gradient(to left, var(--sidebar-bg) 0%, var(--query-window-bg) 50%, var(--sidebar-bg) 100%);
  background-size: 200% 100%;
  animation: loading-gradient 2s infinite linear;
}

.error-indicator {
  color: red;
  font-size: 12px;
  overflow: hidden;
  white-space: nowrap;
}
</style>