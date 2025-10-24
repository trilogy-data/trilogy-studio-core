<template>
  <div>
    <!-- Regular items using SidebarItem -->
    <sidebar-item
      :item-id="item.id"
      :name="getItemName()"
      :indent="item.indent"
      :is-selected="isSelected"
      :is-collapsible="isExpandable"
      :is-collapsed="isCollapsed"
      itemType="connection"
      @click="handleItemClick"
      @toggle="handleToggle"
    >
      <!-- Custom icon slot for different item types -->
      <template #icon>
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
          class="mdi mdi-database node-icon"
          :data-testid="
            testTag
              ? `database-${item.connection.name}-${item.name}-${testTag}`
              : `database-${item.connection.name}-${item.name}`
          "
        ></i>
        <i
          v-else-if="item.type === 'schema'"
          class="mdi mdi-folder-outline node-icon"
          :data-testid="
            testTag
              ? `schema-${item.connection.name}-${item.name}-${testTag}`
              : `schema-${item.connection.name}-${item.name}`
          "
        ></i>
        <i v-else-if="item.type === 'table'" class="mdi mdi-table node-icon"></i>
        <i v-else-if="item.type === 'error'" class="mdi mdi-alert-circle node-icon"></i>
        <i v-else-if="item.type === 'loading'" class="mdi mdi-loading mdi-spin node-icon"></i>
        <i v-else-if="item.type === 'column'" class="mdi mdi-table-column node-icon"></i>
      </template>

      <!-- Custom name slot for complex content -->
      <template #name>
        <div
          v-if="item.type === 'refresh-connection'"
          class="refresh title-pad-left truncate-text sidebar-sub-item"
          @click="handleRefreshConnectionClick"
        >
          {{ item.name }}
        </div>

        <div
          v-else-if="item.type === 'refresh-database'"
          class="refresh title-pad-left truncate-text sidebar-sub-item"
          @click="handleRefreshDatabaseClick"
        >
          {{ item.name }}
        </div>

        <div
          v-else-if="item.type === 'refresh-schema'"
          class="refresh title-pad-left truncate-text sidebar-sub-item"
          @click="handleRefreshSchemaClick"
        >
          {{ item.name }}
        </div>

        <DuckDBImporter
          v-else-if="item.type === 'duckdb-upload'"
          :db="(item.connection as any as DuckDBConnection).db"
          :connection="item.connection as any as DuckDBConnection"
        />

        <div v-else-if="item.type === 'model'" class="bq-project-container" @click.stop>
          <label class="input-label">Model</label>
          <model-selector :connection="item.connection" />
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
          <form
            @submit.prevent="
              updateMotherDuckToken(item.connection as any as MotherDuckConnection, mdToken)
            "
          >
            <button type="submit" class="customize-button">Update Token</button>
            <input
              type="password"
              v-model="mdToken"
              placeholder="mdToken"
              class="connection-customize"
            />
          </form>
        </div>

        <div
          v-else-if="item.type === 'snowflake-private-key'"
          class="bq-project-container"
          @click.stop
        >
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

        <div
          v-else-if="item.type === 'snowflake-username'"
          class="bq-project-container"
          @click.stop
        >
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

        <div
          v-else-if="item.type === 'toggle-save-credential'"
          class="md-token-container"
          @click.stop
        >
          <label class="save-credential-toggle">
            <input
              type="checkbox"
              :checked="(item.connection as any as ConnectionWithSaveCredential).saveCredential"
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
          <span
            v-if="item.type === 'connection'"
            class="hover-icon"
            @click.stop="handleRefreshConnectionClick"
          >
            <i class="mdi mdi-refresh"></i>
          </span>
          <span
            v-if="item.type === 'database'"
            class="hover-icon"
            @click.stop="handleRefreshDatabaseClick"
          >
            <i class="mdi mdi-refresh"></i>
          </span>
          <span
            v-if="item.type === 'schema'"
            class="hover-icon"
            @click.stop="handleRefreshSchemaClick"
          >
            <i class="mdi mdi-refresh"></i>
          </span>
        </span>
      </template>

      <!-- Custom extra content slot for connection actions -->
      <template #extra-content>
        <div class="connection-actions" v-if="item.type === 'connection'">
          <i
            :data-testid="`toggle-history-${item.connection.name}`"
            class="mdi mdi-history hover-icon"
            v-if="isMobile"
            title="Query History"
            @click.stop="toggleMobileMenu"
          ></i>
          <editor-creator-icon
            class="tacticle-button hover-icon"
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
            class="tacticle-button hover-icon"
            :connection="item.connection.name"
            title="New Trilogy Editor"
            :data-testid="
              testTag
                ? `new-trilogy-editor-${item.connection.name}-${testTag}`
                : `new-trilogy-editor-${item.connection.name}`
            "
          />
          <connection-refresh
            class="tacticle-button hover-icon"
            :connection="item.connection"
            :is-connected="item.connection.connected"
          />

          <tooltip class="tacticle-button hover-icon" content="Delete Connection" position="left">
            <span class="remove-btn" @click.stop="deleteConnection(item.connection)">
              <i class="mdi mdi-trash-can-outline"></i>
            </span>
          </tooltip>

          <!-- Connection status icon should always be visible -->
          <connection-status-icon :connection="item.connection" />
        </div>
      </template>
    </sidebar-item>
  </div>
</template>

<script lang="ts">
import { ref, computed, inject } from 'vue'
import type { PropType, Ref } from 'vue'
import SidebarItem from './GenericSidebarItem.vue'
import ConnectionIcon from './ConnectionIcon.vue'
import ConnectionRefresh from './ConnectionRefresh.vue'
import ConnectionStatusIcon from './ConnectionStatusIcon.vue'
import EditorCreatorIcon from '../editor/EditorCreatorIcon.vue'
import DuckDBImporter from '../sidebar/DuckDBImporter.vue'
import ModelSelector from '../model/ModelSelector.vue'
import Tooltip from '../Tooltip.vue'
import { Connection, MotherDuckConnection, DuckDBConnection } from '../../connections'

// Interface for connections that have common properties
interface ConnectionWithSaveCredential {
  saveCredential?: boolean
}

interface BigQueryLikeConnection {
  projectId?: string
  browsingProjectId?: string
}

interface SnowflakeLikeConnection {
  config?: {
    privateKey?: string
    account?: string
    username?: string
  }
}

export interface ListItem {
  id: string
  name: string
  indent: number
  count?: number
  type: string
  connection: Connection
}

export default {
  name: 'ConnectionListItem',
  components: {
    SidebarItem,
    ConnectionIcon,
    ConnectionRefresh,
    ConnectionStatusIcon,
    EditorCreatorIcon,
    DuckDBImporter,
    ModelSelector,
    Tooltip,
  },
  props: {
    item: {
      type: Object as PropType<ListItem>,
      required: true,
    },
    isCollapsed: {
      type: Boolean,
      default: true,
    },
    isSelected: {
      type: Boolean,
      default: false,
    },
    testTag: {
      type: String,
      default: '',
    },
  },
  emits: [
    'toggle',
    'click',
    'refresh',
    'updateBigqueryProject',
    'updateBigqueryBrowsingProject',
    'updateMotherDuckToken',
    'updateSnowflakePrivateKey',
    'updateSnowflakeAccount',
    'updateSnowflakeUsername',
    'toggleSaveCredential',
    'deleteConnection',
    'toggleMobileMenu',
  ],
  setup(props, { emit }) {
    const isMobile = inject<boolean>('isMobile', false)

    const isExpandable = computed(() =>
      ['connection', 'database', 'schema'].includes(props.item.type),
    )

    const isFetchable = computed(() =>
      ['connection', 'database', 'schema', 'table', 'schema'].includes(props.item.type),
    )

    // Get item name (for simple cases where name slot isn't needed)
    const getItemName = () => {
      // Return empty string for complex items that use the name slot
      const complexTypes = [
        'refresh-connection',
        'refresh-database',
        'refresh-schema',
        'duckdb-upload',
        'model',
        'bigquery-project',
        'bigquery-browsing-project',
        'motherduck-token',
        'snowflake-private-key',
        'snowflake-account',
        'snowflake-username',
        'toggle-save-credential',
      ]

      if (complexTypes.includes(props.item.type)) {
        return ''
      }
      return props.item.name
    }

    // Click handler for item expansion/toggling
    const handleItemClick = () => {
      if (isFetchable.value) {
        emit('click', props.item.id, props.item.connection?.name || '', props.item.type)
      }
    }

    const handleToggle = () => {
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

    const deleteConnection = (connection: Connection) => {
      emit('deleteConnection', connection)
    }

    // Configuration reactive variables with proper initialization
    const bigqueryProject = ref(
      (props.item.connection as any as BigQueryLikeConnection).projectId || '',
    )
    const bigqueryBrowsingProject = ref(
      (props.item.connection as any as BigQueryLikeConnection).browsingProjectId || '',
    )
    const mdToken = ref((props.item.connection as any as MotherDuckConnection).mdToken || '')
    const snowflakePrivateKey = ref(
      (props.item.connection as any as SnowflakeLikeConnection).config?.privateKey || '',
    )
    const snowflakeAccount = ref(
      (props.item.connection as any as SnowflakeLikeConnection).config?.account || '',
    )
    const snowflakeUsername = ref(
      (props.item.connection as any as SnowflakeLikeConnection).config?.username || '',
    )

    // Success indicators
    const showBillingSuccess = ref(false)
    const showBrowsingSuccess = ref(false)
    const showPrivateKeySuccess = ref(false)
    const showAccountSuccess = ref(false)
    const showUsernameSuccess = ref(false)

    const showSuccessIndicator = (indicator: Ref<boolean>) => {
      indicator.value = true
      setTimeout(() => {
        indicator.value = false
      }, 1500)
    }

    // Debounce function
    const debounce = (fn: Function, delay: number) => {
      let timeout: NodeJS.Timeout
      return (...args: any[]) => {
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
    const debouncedUpdateBigqueryBrowsingProject = debounce(
      updateBigqueryBrowsingProjectInternal,
      500,
    )
    const debouncedUpdateSnowflakePrivateKey = debounce(updateSnowflakePrivateKeyInternal, 500)
    const debouncedUpdateSnowflakeAccount = debounce(updateSnowflakeAccountInternal, 500)
    const debouncedUpdateSnowflakeUsername = debounce(updateSnowflakeUsernameInternal, 500)

    const updateMotherDuckToken = (connection: MotherDuckConnection, token: string) => {
      emit('updateMotherDuckToken', connection, token)
    }

    const toggleSaveCredential = (connection: any) => {
      emit('toggleSaveCredential', connection)
    }

    return {
      isMobile,
      isExpandable,
      getItemName,
      handleItemClick,
      handleToggle,
      toggleMobileMenu,
      handleRefreshConnectionClick,
      handleRefreshDatabaseClick,
      handleRefreshSchemaClick,
      deleteConnection,
      // Config variables
      bigqueryProject,
      bigqueryBrowsingProject,
      mdToken,
      snowflakePrivateKey,
      snowflakeAccount,
      snowflakeUsername,
      // Success indicators
      showBillingSuccess,
      showBrowsingSuccess,
      showPrivateKeySuccess,
      showAccountSuccess,
      showUsernameSuccess,
      // Update functions
      debouncedUpdateBigqueryProject,
      debouncedUpdateBigqueryBrowsingProject,
      debouncedUpdateSnowflakePrivateKey,
      debouncedUpdateSnowflakeAccount,
      debouncedUpdateSnowflakeUsername,
      updateMotherDuckToken,
      toggleSaveCredential,
    }
  },
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
  border-radius: 0px;
}

.connection-customize {
  width: 150px;
}

.customize-button:hover {
  background-color: var(--button-mouseover);
}

.sidebar-sub-item {
  line-height: var(--sidebar-sub-item-height);
  height: var(--sidebar-sub-item-height);
  font-size: var(--sidebar-sub-item-font-size);
}

.title-pad-left {
  padding-left: 3px;
  flex-grow: 1;
  width: 100%;
}

.connection-actions {
  display: flex;
  align-items: center;
  margin-left: auto;
}

.loading-indicator {
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

.md-token-container {
  display: flex;
  flex-grow: 1;
}

.md-token-container form {
  display: flex;
  width: 100%;
  align-items: center;
}

.save-credential-toggle {
  display: flex;
  align-items: center;
  cursor: pointer;
  font-size: 0.9em;
}

.save-credential-toggle input[type='checkbox'] {
  margin-right: 8px;
}

.checkbox-label {
  white-space: nowrap;
}

/* Show hover icons when parent sidebar item is hovered */
:deep(.sidebar-item:hover) .hover-icon {
  opacity: 1;
}

.hover-icon {
  opacity: 0;
  transition: opacity 0.2s;
}

/* if mobile, always show hover icons */
@media (max-width: 768px) {
  .hover-icon {
    opacity: 1;
  }
}
</style>
