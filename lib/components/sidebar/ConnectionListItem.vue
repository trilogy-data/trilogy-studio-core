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
      :itemType="testTag ? testTag : 'connection'"
      @click="handleItemClick"
      @toggle="handleToggle"
    >
      <!-- Custom icon slot for different item types -->
      <template #icon>
        <connection-icon
          v-if="item.type === 'connection'"
          :connection-type="item.connection?.type"
        />
        <i v-else-if="item.type === 'database'" class="mdi mdi-database node-icon"></i>
        <i v-else-if="item.type === 'schema'" class="mdi mdi-folder-outline node-icon"></i>
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
          :connection="item.connection as any"
        />

        <div v-else-if="item.type === 'model'" class="connection-meta-row" @click.stop>
          <span class="meta-label">Model:</span>
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
              class="bq-project-input sidebar-control-input"
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
              class="bq-project-input sidebar-control-input"
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
            <button type="submit" class="customize-button sidebar-control-button">
              Update Token
            </button>
            <input
              type="password"
              v-model="mdToken"
              placeholder="mdToken"
              class="connection-customize sidebar-control-input"
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
              class="bq-project-input sidebar-control-input"
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
              class="bq-project-input sidebar-control-input"
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
              class="bq-project-input sidebar-control-input"
              @input="debouncedUpdateSnowflakeUsername"
            />
          </span>
        </div>

        <div
          v-else-if="item.type === 'toggle-save-credential'"
          class="md-token-container"
          @click.stop
        >
          <label class="save-credential-toggle sidebar-toggle-row">
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
        <div class="connection-actions" v-if="item.type === 'table'">
          <CreateEditorFromDatasourcePopup
            class="hover-icon"
            :connection="item.connection"
            :table="item.object"
            mode="icon"
          />
        </div>
        <div class="connection-actions" v-else-if="item.type === 'connection'">
          <connection-refresh
            v-if="!item.connection?.connected"
            :connection="item.connection"
            @refresh="handleRefreshConnectionClick"
          />
          <connection-status-icon v-else :connection="item.connection" />
          <sidebar-overflow-menu
            :items="contextMenuItems"
            tooltip="Connection actions"
            :test-id-base="`connection-actions-${item.id}`"
            @select="handleContextMenuItemClick"
          />
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
import ConnectionStatusIcon from './ConnectionStatusIcon.vue'
import ConnectionRefresh from './ConnectionRefresh.vue'
import DuckDBImporter from '../sidebar/DuckDBImporter.vue'
import ModelSelector from '../model/ModelSelector.vue'
import Tooltip from '../Tooltip.vue'
import CreateEditorFromDatasourcePopup from './CreateEditorFromDatasourcePopup.vue'
import { Connection, MotherDuckConnection } from '../../connections'
import SidebarOverflowMenu from './SidebarOverflowMenu.vue'
import type { ContextMenuItem } from '../ContextMenu.vue'
import type { EditorStoreType } from '../../stores/editorStore'

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
  object?: any
}

export default {
  name: 'ConnectionListItem',
  components: {
    SidebarItem,
    ConnectionIcon,
    ConnectionStatusIcon,
    ConnectionRefresh,
    CreateEditorFromDatasourcePopup,
    DuckDBImporter,
    ModelSelector,
    Tooltip,
    SidebarOverflowMenu,
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
    const editorStore = inject<EditorStoreType>('editorStore')
    const saveEditors = inject<Function>('saveEditors')
    const setActiveScreen = inject<Function>('setActiveScreen')
    const setActiveEditor = inject<Function>('setActiveEditor')

    if (!editorStore || !saveEditors || !setActiveScreen || !setActiveEditor) {
      throw new Error('Editor store is not provided!')
    }

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

    const createNewEditor = async (type: string) => {
      try {
        const timestamp = Date.now()
        const editorName = `new-editor-${timestamp}`
        const connectionConfig = props.item.connection as Connection & {
          remoteStoreId?: string | null
        }
        const isRemote = connectionConfig.storage === 'remote'

        const editor = editorStore.newEditor(
          editorName,
          type === 'trilogy' ? 'preql' : 'sql',
          props.item.connection.name,
          undefined,
          isRemote
            ? {
                storage: 'remote',
                remoteStoreId: connectionConfig.remoteStoreId || null,
                remotePath: editorName,
              }
            : undefined,
        )

        await saveEditors()
        setActiveEditor(editor.id)
        setActiveScreen('editors')
      } catch (error) {
        console.error('Failed to create new editor:', error)
      }
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

    const contextMenuItems = computed<ContextMenuItem[]>(() => {
      if (props.item.type !== 'connection') {
        return []
      }

      const items: ContextMenuItem[] = []
      if (isMobile) {
        items.push({ id: 'query-history', label: 'Query history', icon: 'mdi-history' })
      }
      items.push(
        { id: 'new-sql', label: 'New SQL editor', icon: 'mdi-file-document-plus-outline' },
        {
          id: 'new-trilogy',
          label: 'New Trilogy editor',
          icon: 'mdi-file-document-plus-outline',
        },
        { id: 'refresh', label: 'Refresh connection', icon: 'mdi-refresh' },
        { id: 'delete-separator', kind: 'separator' },
        { id: 'delete', label: 'Delete connection', icon: 'mdi-trash-can-outline', danger: true },
      )
      return items
    })

    const handleContextMenuItemClick = (item: ContextMenuItem) => {
      switch (item.id) {
        case 'query-history':
          toggleMobileMenu()
          break
        case 'new-sql':
          createNewEditor('sql')
          break
        case 'new-trilogy':
          createNewEditor('trilogy')
          break
        case 'refresh':
          handleRefreshConnectionClick()
          break
        case 'delete':
          deleteConnection(props.item.connection)
          break
      }
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
      contextMenuItems,
      handleContextMenuItemClick,
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

<style scoped src="./sidebarItemChrome.css"></style>
<style scoped>
.refresh {
  cursor: pointer;
  padding: 2px 0;
  font-size: var(--sidebar-sub-item-font-size);
  color: var(--text-color);
}

input,
input:is([type='text'], [type='password'], [type='email'], [type='number']) {
  font-size: var(--button-font-size);
  font-family: inherit;
  letter-spacing: inherit;
  word-spacing: inherit;
  padding: 0;
  border: 1px solid var(--button-border);
}

.customize-button {
  min-width: 104px;
  margin-right: 8px;
  font-size: 11px;
  justify-content: flex-start;
}

.connection-customize {
  width: 150px;
  min-width: 0;
}

.sidebar-sub-item {
  --sidebar-sub-item-line-height: var(--sidebar-sub-item-height);
  --sidebar-sub-item-height-local: var(--sidebar-sub-item-height);
  --sidebar-sub-item-font-size-local: var(--sidebar-sub-item-font-size);
}

.title-pad-left {
  --sidebar-title-pad-left: 3px;
  --sidebar-title-flex-grow: 1;
  --sidebar-title-width: 100%;
}

.connection-actions {
  --sidebar-actions-gap: 4px;
  --sidebar-actions-pad-right: 6px;
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
  color: var(--text-faint);
  min-width: 52px;
}

.meta-label {
  font-size: 11px;
  color: var(--text-faint);
  letter-spacing: 0.02em;
  white-space: nowrap;
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
  gap: 8px;
  color: var(--text-color);
}

.connection-meta-row {
  display: flex;
  align-items: center;
  width: 100%;
  gap: 8px;
  color: var(--text-color);
}

.bq-project-container > span {
  flex: 1;
  min-width: 0;
  position: relative;
}

.connection-meta-row :deep(.model-anchor) {
  min-width: 0;
  flex: 1;
}

.bq-project-input {
  background: var(--button-bg-color);
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
  gap: var(--sidebar-control-gap);
}

.save-credential-toggle input[type='checkbox'] {
  margin-right: 8px;
}

.checkbox-label {
  white-space: nowrap;
}

.hover-icon {
  --sidebar-hover-icon-mobile-opacity: 1;
}
</style>
