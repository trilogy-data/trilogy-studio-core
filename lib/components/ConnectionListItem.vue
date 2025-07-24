<template>
  <div
    class="sidebar-item"
    @click="handleItemClick"
    :class="{ 'sidebar-item-selected': isSelected }"
  >
    <div v-for="_ in item.indent" :key="`indent-${_}`" class="sidebar-padding"></div>
    <template v-if="isExpandable">
      <i v-if="isCollapsed === false" class="mdi mdi-menu-down"></i>
      <i v-else class="mdi mdi-menu-right"></i>
    </template>
    <connection-icon
      v-if="item.type === 'connection'"
      :connection-type="item.connection?.type"
      :data-testid="
        testTag
          ? `connection-${item.connection.name}-${testTag}`
          : `connection-${item.connection.name}`
      "
    />
    <i
      v-else-if="item.type === 'database'"
      class="mdi mdi-database"
      :data-testid="
        testTag
          ? `database-${item.connection.name}-${item.name}-${testTag}`
          : `database-${item.connection.name}-${item.name}`
      "
    ></i>
    <i
      v-else-if="item.type === 'schema'"
      class="mdi mdi-folder-outline"
      :data-testid="
        testTag
          ? `schema-${item.connection.name}-${item.name}-${testTag}`
          : `schema-${item.connection.name}-${item.name}`
      "
    ></i>
    <i v-else-if="item.type === 'table'" class="mdi mdi-table"></i>
    <i v-else-if="item.type === 'error'" class="mdi mdi-alert-circle"></i>
    <i v-else-if="item.type === 'loading'" class="mdi mdi-loading mdi-spin"></i>
    <i v-else-if="item.type === 'column'" class="mdi mdi-table-column"></i>
    <div
      class="refresh title-pad-left truncate-text sidebar-sub-item"
      v-if="item.type === 'refresh-connection'"
      @click="handleRefreshConnectionClick"
    >
      {{ item.name }}
    </div>
    <div
      class="refresh title-pad-left truncate-text sidebar-sub-item"
      v-else-if="item.type === 'refresh-database'"
      @click="handleRefreshDatabaseClick"
    >
      {{ item.name }}
    </div>
    <div
      class="refresh title-pad-left truncate-text sidebar-sub-item"
      v-else-if="item.type === 'refresh-schema'"
      @click="handleRefreshSchemaClick"
    >
      {{ item.name }}
    </div>
    <DuckDBImporter
      v-else-if="item.type === 'duckdb-upload'"
      :db="item.connection.db"
      :connection="item.connection"
    />
    <div v-else-if="item.type === 'model'" class="bq-project-container">
      <label class="input-label">Model</label><model-selector :connection="item.connection" />
    </div>
    <div v-else-if="item.type === 'bigquery-project'" class="bq-project-container" @click.stop>
      <label class="input-label">Billing</label>

      <span>
        <transition name="fade">
          <i v-if="showBillingSuccess" class="mdi mdi-check-circle success-icon"></i>
        </transition>
        <input
          type="text"
          v-model="bigqueryProject"
          placeholder="Billing Project"
          class="bq-project-input"
          @input="debouncedUpdateBigqueryProject"
        />
      </span>
    </div>

    <div
      v-else-if="item.type === 'bigquery-browsing-project'"
      class="bq-project-container"
      @click.stop
    >
      <label class="input-label">Browsing</label>
      <span>
        <transition name="fade">
          <i v-if="showBrowsingSuccess" class="mdi mdi-check-circle success-icon"></i>
        </transition>
        <input
          type="text"
          v-model="bigqueryBrowsingProject"
          placeholder="Browsing Project"
          class="bq-project-input"
          @input="debouncedUpdateBigqueryBrowsingProject"
        />
      </span>
    </div>
    <div v-else-if="item.type === 'motherduck-token'" class="md-token-container" @click.stop>
      <form @submit.prevent="updateMotherDuckToken(item.connection, mdToken)">
        <button type="submit" class="customize-button">Update Token</button>
        <input
          type="password"
          v-model="mdToken"
          placeholder="mdToken"
          class="connection-customize"
        />
      </form>
    </div>
    <div v-else-if="item.type === 'snowflake-private-key'" class="bq-project-container" @click.stop>
      <label class="input-label">Private Key</label>
      <span>
        <transition name="fade">
          <i v-if="showPrivateKeySuccess" class="mdi mdi-check-circle success-icon"></i>
        </transition>
        <input
          type="password"
          v-model="snowflakePrivateKey"
          placeholder="Private Key"
          class="bq-project-input"
          @input="debouncedUpdateSnowflakePrivateKey"
        />
      </span>
    </div>
    <div v-else-if="item.type === 'snowflake-account'" class="bq-project-container" @click.stop>
      <label class="input-label">Account</label>
      <span>
        <transition name="fade">
          <i v-if="showAccountSuccess" class="mdi mdi-check-circle success-icon"></i>
        </transition>
        <input
          type="text"
          v-model="snowflakeAccount"
          placeholder="Account"
          class="bq-project-input"
          @input="debouncedUpdateSnowflakeAccount"
        />
      </span>
    </div>

    <div v-else-if="item.type === 'snowflake-username'" class="bq-project-container" @click.stop>
      <label class="input-label">Username</label>
      <span>
        <transition name="fade">
          <i v-if="showUsernameSuccess" class="mdi mdi-check-circle success-icon"></i>
        </transition>
        <input
          type="text"
          v-model="snowflakeUsername"
          placeholder="Username"
          class="bq-project-input"
          @input="debouncedUpdateSnowflakeUsername"
        />
      </span>
    </div>
    <div v-else-if="item.type === 'toggle-save-credential'" class="md-token-container" @click.stop>
      <label class="save-credential-toggle">
        <input
          type="checkbox"
          :checked="item.connection.saveCredential"
          @change="toggleSaveCredential(item.connection)"
        />
        <span class="checkbox-label">Save Credentials</span>
      </label>
    </div>

    <span
      v-else
      class="title-pad-left truncate-text"
      :class="{ 'error-indicator': item.type === 'error' }"
    >
      {{ item.name }}
      <span v-if="item.count !== undefined && item.count > 0"> ({{ item.count }}) </span>
      <span v-if="item.type === 'connection'" @click.stop="handleRefreshConnectionClick"
        ><i class="mdi mdi-refresh"></i
      ></span>
      <span v-if="item.type === 'database'" @click.stop="handleRefreshDatabaseClick"
        ><i class="mdi mdi-refresh"></i
      ></span>
      <span v-if="item.type === 'schema'" @click.stop="handleRefreshSchemaClick"
        ><i class="mdi mdi-refresh"></i
      ></span>
    </span>

    <div class="connection-actions" v-if="item.type === 'connection'">
      <i
        :data-testid="`toggle-history-${item.connection.name}`"
        class="mdi mdi-history"
        v-if="isMobile"
        title="Query History"
        @click.stop="toggleMobileMenu"
      ></i>
      <editor-creator-icon
        class="tacticle-button"
        :connection="item.connection.name"
        type="sql"
        title="New SQL Editor"
        :data-testid="
          testTag
            ? `new-sql-editor-${item.connection.name}-${testTag}`
            : `new-sql-editor-${item.connection.name}`
        "
      />
      <editor-creator-icon
        class="tacticle-button"
        :connection="item.connection.name"
        title="New Trilogy Editor"
        :data-testid="
          testTag
            ? `new-trilogy-editor-${item.connection.name}-${testTag}`
            : `new-trilogy-editor-${item.connection.name}`
        "
      />
      <connection-refresh
        class="tacticle-button"
        :connection="item.connection"
        :is-connected="item.connection.connected"
      />
      <connection-status-icon :connection="item.connection" />
      <tooltip class="tacticle-button" content="Delete Connection" position="left">
        <span class="remove-btn" @click.stop="deleteConnection(item.connection)">
          <i class="mdi mdi-trash-can"></i>
        </span>
      </tooltip>
    </div>
    <div class="connection-actions" v-if="item.type === 'table'">
      <CreateEditorFromDatasourcePopup :connection="item.connection" :table="item.object" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, type Ref } from 'vue'
import ConnectionIcon from './ConnectionIcon.vue'
import ModelSelector from './ModelSelector.vue'
import ConnectionRefresh from './ConnectionRefresh.vue'
import ConnectionStatusIcon from './ConnectionStatusIcon.vue'
import CreateEditorFromDatasourcePopup from './CreateEditorFromDatasourcePopup.vue'
import {
  BigQueryOauthConnection,
  MotherDuckConnection,
  SnowflakeJwtConnection,
} from '../connections'
import EditorCreatorIcon from './EditorCreatorIcon.vue'
import Tooltip from './Tooltip.vue'
import DuckDBImporter from './DuckDBImporter.vue'

// Define prop types
interface ConnectionListItemProps {
  item: {
    id: string
    name: string
    indent: number
    count?: number
    type: string
    connection: any
    object?: any
  }

  isCollapsed?: boolean
  isSelected?: boolean
  isMobile?: boolean
  testTag?: string
  deleteConnection: (connection: any) => void
}

// Props definition
const props = defineProps<ConnectionListItemProps>()

// Emits definition
const emit = defineEmits<{
  (e: 'toggle', id: string, connection: string, type: string): void
  (e: 'refresh', id: string, connection: string, type: string): void
  (e: 'updateBigqueryProject', connection: BigQueryOauthConnection, project: string): void
  (e: 'updateBigqueryBrowsingProject', connection: BigQueryOauthConnection, project: string): void
  (e: 'updateSnowflakePrivateKey', connection: SnowflakeJwtConnection, token: string): void
  (e: 'updateSnowflakeAccount', connection: SnowflakeJwtConnection, account: string): void
  (e: 'updateSnowflakeUsername', connection: SnowflakeJwtConnection, username: string): void
  (e: 'updateMotherDuckToken', connection: MotherDuckConnection, token: string): void
  (e: 'toggleSaveCredential', connection: any): void
  (e: 'toggleMobileMenu'): void
}>()
// Computed properties for rendering logic
const isExpandable = computed(() => ['connection', 'database', 'schema'].includes(props.item.type))

const isFetchable = computed(() =>
  ['connection', 'database', 'schema', 'table', 'schema'].includes(props.item.type),
)

// Click handler for item expansion/toggling
const handleItemClick = () => {
  if (isFetchable.value) {
    emit('toggle', props.item.id, props.item.connection?.name || '', props.item.type)
  }
}

const toggleMobileMenu = () => {
  emit('toggleMobileMenu')
}

const handleRefreshConnectionClick = () => {
  emit('refresh', props.item.connection?.name, props.item.connection?.name || '', 'connection')
}

const handleRefreshDatabaseClick = () => {
  emit('refresh', props.item.id, props.item.connection?.name || '', 'database')
}
const handleRefreshSchemaClick = () => {
  emit('refresh', props.item.id, props.item.connection?.name || '', 'schema')
}

//config variables
const bigqueryProject = ref<string>(
  props.item.connection.projectId ? props.item.connection.projectId : '',
)
const bigqueryBrowsingProject = ref<string>(
  props.item.connection.browsingProjectId ? props.item.connection.browsingProjectId : '',
)
const mdToken = ref<string>(props.item.connection.mdToken ? props.item.connection.mdToken : '')
const snowflakePrivateKey = ref<string>(
  props.item.connection?.config?.privateKey ? props.item.connection.config.privateKey : '',
)
const snowflakeAccount = ref<string>(
  props.item.connection?.config?.account ? props.item.connection.config.account : '',
)
const snowflakeUsername = ref<string>(
  props.item.connection?.config?.username ? props.item.connection.config.username : '',
)
// Success indicator states
const showBillingSuccess = ref<boolean>(false)
const showBrowsingSuccess = ref<boolean>(false)
const showPrivateKeySuccess = ref<boolean>(false)
const showAccountSuccess = ref<boolean>(false)
const showUsernameSuccess = ref<boolean>(false)
// Function to show and hide success indicator
const showSuccessIndicator = (indicator: Ref<boolean>) => {
  indicator.value = true
  setTimeout(() => {
    indicator.value = false
  }, 2000) // Show check mark for 2 seconds then fade out
}

// Debounce function to prevent too many updates
const debounce = (fn: Function, delay: number) => {
  let timeout: ReturnType<typeof setTimeout>
  return function (...args: any[]) {
    clearTimeout(timeout)
    timeout = setTimeout(() => fn(...args), delay)
  }
}

// Debounced update functions that will auto-save after typing stops
const updateBigqueryProjectInternal = () => {
  emit('updateBigqueryProject', props.item.connection, bigqueryProject.value)
  showSuccessIndicator(showBillingSuccess)
}

const updateBigqueryBrowsingProjectInternal = () => {
  emit('updateBigqueryBrowsingProject', props.item.connection, bigqueryBrowsingProject.value)
  showSuccessIndicator(showBrowsingSuccess)
}
const updateSnowflakePrivateKeyInternal = () => {
  emit('updateSnowflakePrivateKey', props.item.connection, snowflakePrivateKey.value)
  showSuccessIndicator(showPrivateKeySuccess)
}

const updateSnowflakeAccountInternal = () => {
  emit('updateSnowflakeAccount', props.item.connection, snowflakeAccount.value)
  showSuccessIndicator(showAccountSuccess)
}

const updateSnowflakeUsernameInternal = () => {
  emit('updateSnowflakeUsername', props.item.connection, snowflakeUsername.value)
  showSuccessIndicator(showUsernameSuccess)
}

const debouncedUpdateBigqueryProject = debounce(updateBigqueryProjectInternal, 500)
const debouncedUpdateBigqueryBrowsingProject = debounce(updateBigqueryBrowsingProjectInternal, 500)
const debouncedUpdateSnowflakePrivateKey = debounce(updateSnowflakePrivateKeyInternal, 500)
const debouncedUpdateSnowflakeAccount = debounce(updateSnowflakeAccountInternal, 500)
const debouncedUpdateSnowflakeUsername = debounce(updateSnowflakeUsernameInternal, 500)

const updateMotherDuckToken = (connection: MotherDuckConnection, token: string) => {
  emit('updateMotherDuckToken', connection, token)
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
  margin-right: 8px;
  font-size: var(--button-font-size);
  background-color: var(--button-bg);
  border: 1px solid var(--border);
  color: var(--text);
  cursor: pointer;
}

.connection-customize {
  width: 150px;
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
  background: linear-gradient(
    to left,
    var(--sidebar-bg) 0%,
    var(--query-window-bg) 50%,
    var(--sidebar-bg) 100%
  );
  background-size: 200% 100%;
  animation: loading-gradient 2s infinite linear;
}

.error-indicator {
  color: red;
  font-size: 12px;
  overflow: hidden;
  white-space: nowrap;
}

.input-with-label {
  display: flex;
  flex-direction: column;
  margin-bottom: 4px;
}

.input-label {
  font-size: 11px;
  color: var(--text-muted);
}

.label-with-status {
  display: flex;
  align-items: center;
}

.success-icon {
  color: #4caf50;
  font-size: 14px;
  margin-left: 4px;
}

/* Fade transition for the success check mark */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.5s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.bq-project-container {
  display: flex;
  justify-content: space-between;
  width: 100%;
  align-items: center;
  color: var(--text-color);
}

.bq-project-input {
  background: transparent;
  color: var(--text-color);
}
</style>
