<template>
  <div class="sidebar-item" @click="handleItemClick" :class="{ 'sidebar-item-selected': isSelected }">
    <!-- Indentation -->
    <div v-for="_ in item.indent" :key="`indent-${_}`" class="sidebar-padding"></div>

    <!-- Expandable Item Icons -->
    <template v-if="isExpandable">
      <i v-if="isCollapsed === false" class="mdi mdi-menu-down"></i>
      <i v-else class="mdi mdi-menu-right"></i>
    </template>

    <!-- Connection Type Icons -->
    <connection-icon v-if="item.type === 'connection'" :connection-type="item.connection?.type" />
    <i v-else-if="item.type === 'database'" class="mdi mdi-database"></i>
    <i v-else-if="item.type === 'table'" class="mdi mdi-table"></i>
    <i v-else-if="item.type === 'error'" class="mdi mdi-alert-circle"></i>
    <i v-else-if="item.type === 'loading'" class="mdi mdi-loading mdi-spin"></i>
    <i v-else-if="item.type === 'column'" class="mdi mdi-table-column"></i>
    <!-- Item Name -->
    <div class="refresh title-pad-left truncate-text sidebar-sub-item" v-if="item.type === 'refresh-connection'"
      @click="handleRefreshConnectionClick">
      {{ item.name }}
    </div>
    <div class="refresh title-pad-left truncate-text sidebar-sub-item" v-else-if="item.type === 'refresh-database'"
      @click="handleRefreshDatabaseClick">
      {{ item.name }}
    </div>
    <model-selector v-else-if="item.type === 'model'" :connection="item.connection" />
    <div v-else-if="item.type === 'bigquery-project'" class="md-token-container" @click.stop>
      <form @submit.prevent="updateBigqueryProject(item.connection, bigqueryProject)">
        <button type="submit" class="customize-button">Set Billing Project</button>
        <input type="text" v-model="bigqueryProject" placeholder="Billing Project" class="connection-customize" />
      </form>
    </div>
    <div v-else-if="item.type === 'motherduck-token'" class="md-token-container" @click.stop>
      <form @submit.prevent="updateMotherDuckToken(item.connection, mdToken)">
        <button type="submit" class="customize-button">Update Motherduck Token</button>
        <input type="password" v-model="mdToken" placeholder="mdToken" class="connection-customize" />
      </form>
    </div>
    <div v-else-if="item.type === 'snowflake-private-key'" class="md-token-container" @click.stop>
      <form @submit.prevent="updateSnowflakePrivateKey(item.connection, privateKey)">
        <button type="submit" class="customize-button">Update Snowflake Private Key</button>
        <input type="password" v-model="privateKey" placeholder="privateKey" class="connection-customize" />
      </form>
    </div>
    <div v-else-if="item.type === 'toggle-save-credential'" class="md-token-container" @click.stop>
      <label class="save-credential-toggle">
        <input type="checkbox" :checked="item.connection.saveCredential"
          @change="toggleSaveCredential(item.connection)" />
        <span class="checkbox-label">Save Credentials</span>
      </label>
    </div>
    <span v-else class="title-pad-left truncate-text" :class="{ 'error-indicator': item.type === 'error' }">
      {{ item.name }}
      <span v-if="item.count !== undefined && item.count > 0"> ({{ item.count }}) </span>
    </span>

    <div class="connection-actions" v-if="item.type === 'connection'">
      <connection-refresh :connection="item.connection" :is-connected="item.connection.connected" />
      <connection-status-icon :connection="item.connection" />
      <tooltip content="Delete Connection" position="left">
        <span class="remove-btn" @click.stop="deleteConnection(item.connection)">
          <i class="mdi mdi-trash-can"></i>
        </span>
      </tooltip>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import ConnectionIcon from './ConnectionIcon.vue'
import ModelSelector from './ModelSelector.vue'
import ConnectionRefresh from './ConnectionRefresh.vue'
import ConnectionStatusIcon from './ConnectionStatusIcon.vue'
import { BigQueryOauthConnection, MotherDuckConnection, SnowflakeConnection } from '../connections'
import { KeySeparator, rsplit } from '../data/constants'
import Tooltip from './Tooltip.vue'
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
  isSelected?: boolean
  deleteConnection: (connection: any) => void
}

// Props definition
const props = defineProps<ConnectionListItemProps>()

// Emits definition
const emit = defineEmits<{
  (e: 'toggle', id: string, connection: string, type: string): void
  (e: 'refresh', id: string, connection: string, type: string): void
  (e: 'updateBigqueryProject', connection: BigQueryOauthConnection, project: string): void
  (e: 'updateSnowflakePrivateKey', connection: SnowflakeConnection, token: string): void
  (e: 'updateMotherDuckToken', connection: MotherDuckConnection, token: string): void
  (e: 'toggleSaveCredential', connection: any): void
}>()

// Computed properties for rendering logic
const isExpandable = computed(() => ['connection', 'database', 'table'].includes(props.item.type))

// Click handler for item expansion/toggling
const handleItemClick = () => {
  console.log('click')
  if (isExpandable.value) {
    console.log('toggle', props.item.id, props.item.connection?.name || '', props.item.type)
    emit('toggle', props.item.id, props.item.connection?.name || '', props.item.type)
  }
}

const handleRefreshConnectionClick = () => {
  emit('refresh', props.item.connection?.name, props.item.connection?.name || '', 'connection')
}

const handleRefreshDatabaseClick = () => {
  emit(
    'refresh',
    rsplit(props.item.id, KeySeparator)[0],
    props.item.connection?.name || '',
    'database',
  )
}

//config vairables
const bigqueryProject = ref<string>(
  props.item.connection.projectId ? props.item.connection.projectId : '',
)
const mdToken = ref<string>(props.item.connection.mdToken ? props.item.connection.mdToken : '')
const privateKey = ref<string>(
  props.item.connection?.config?.privateKey ? props.item.connection.config.privateKey : '',
)
const updateMotherDuckToken = (connection: MotherDuckConnection, token: string) => {
  emit('updateMotherDuckToken', connection, token)
}

const updateSnowflakePrivateKey = (connection: SnowflakeConnection, key: string) => {
  console.log(key)
  emit('updateSnowflakePrivateKey', connection, key)
}

const updateBigqueryProject = (connection: BigQueryOauthConnection, project: string) => {
  emit('updateBigqueryProject', connection, project)
}

const toggleSaveCredential = (connection: any) => {
  emit('toggleSaveCredential', connection)
}
</script>

<style scoped>
.refresh {
  cursor: pointer;
  padding: 5px;
  font-size: 12px;
  color: var(--text);
}

.customize-input {
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  outline: none;
  border: none;
  background: none;
  padding: 0;
  margin: 0;
  padding: 2px 4px;
  font-size: var(--button-font-size);
  width: 180px;
  margin-right: 4px;
  border: 1px solid var(--border);
  background-color: var(--button-bg);
  color: var(--text);
  height: var(--sidebar-list-item-height);
}

input,
input:is([type='text'], [type='password'], [type='email'], [type='number']) {
  font-size: var(--button-font-size);
  font-family: inherit;
  line-height: var(--sidebar-sub-item-height);
  height: var(--sidebar-sub-item-height);
  letter-spacing: inherit;
  word-spacing: inherit;
  padding: 0px;
  padding-left: 5px;
  border: 1px solid var(--border);
}

.customize-button {
  padding: 2px 8px;
  font-size: var(--button-font-size);
  background-color: var(--button-bg);
  border: 1px solid var(--border);
  color: var(--text);
  cursor: pointer;
}

.customize-button:hover {
  background-color: var(--button-mouseover);
}

.sidebar-item {
  display: flex;
  align-items: center;
  cursor: pointer;
  width: 100%;
}

.sidebar-sub-item {
  line-height: var(--sidebar-sub-item-height);
  height: var(--sidebar-sub-item-height);
  font-size: var(--sidebar-sub-item-font-size);
}

.title-pad-left {
  padding-left: 5px;
  flex-grow: 1;
  width: 100%;
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
  background: linear-gradient(to left,
      var(--sidebar-bg) 0%,
      var(--query-window-bg) 50%,
      var(--sidebar-bg) 100%);
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
