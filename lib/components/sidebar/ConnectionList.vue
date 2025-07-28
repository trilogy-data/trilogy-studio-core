<template>
  <sidebar-list title="Connections">
    <template #actions>
      <!-- Add search box at the top -->

      <div class="button-container">
        <button
          @click="creatorVisible = !creatorVisible"
          :data-testid="testTag ? `connection-creator-add-${testTag}` : 'connection-creator-add'"
        >
          {{ creatorVisible ? 'Hide' : 'New' }}
        </button>
      </div>
      <connection-creator-inline
        :visible="creatorVisible"
        @close="creatorVisible = !creatorVisible"
      />
      <div class="search-container">
        <input
          type="text"
          v-model="searchTerm"
          placeholder="Filter list..."
          class="search-input"
          :data-testid="testTag ? `connection-search-${testTag}` : 'connection-search'"
        />
        <button
          v-if="searchTerm"
          @click="clearSearch"
          class="clear-search-btn"
          :data-testid="testTag ? `connection-search-clear-${testTag}` : 'connection-search-clear'"
        >
          ✕
        </button>
      </div>
    </template>
    <connection-list-item
      v-for="item in filteredContentList"
      :key="item.id"
      :item="item"
      :is-collapsed="collapsed[item.id]"
      :isSelected="item.id === activeConnectionKey"
      :isMobile="isMobile"
      :testTag="testTag"
      @toggle="toggleCollapse"
      @refresh="refreshId"
      @updateMotherduckToken="updateMotherDuckToken"
      @updateBigqueryProject="updateBigqueryProject"
      @updateBigqueryBrowsingProject="updateBigqueryBrowsingProject"
      @update-snowflake-private-key="updateSnowflakePrivateKey"
      @update-snowflake-account="updateSnowflakeAccount"
      @update-snowflake-username="updateSnowflakeUsername"
      @toggle-save-credential="toggleSaveCredential"
      @toggle-mobile-menu="toggleMobileMenu"
      :delete-connection="deleteConnection"
    />
    <div v-if="showDeleteConfirmationState" class="confirmation-overlay" @click.self="cancelDelete">
      <div class="confirmation-dialog">
        <h3>Confirm Deletion</h3>
        <p>
          Are you sure you want to delete this connection? All associated editors will be deleted.
        </p>
        <div class="dialog-actions">
          <button class="cancel-btn" @click="cancelDelete">Cancel</button>
          <button class="confirm-btn" @click="confirmDelete">Delete</button>
        </div>
      </div>
    </div>
  </sidebar-list>
</template>

<script lang="ts">
import { ref, computed, inject } from 'vue'
import SidebarList from './SidebarList.vue'
import ConnectionCreatorInline from './ConnectionCreatorInline.vue'
import LoadingButton from './LoadingButton.vue'
import StatusIcon from './StatusIcon.vue'
import Tooltip from './Tooltip.vue'
import type { ConnectionStoreType } from '../../stores/connectionStore'
import type { ModelConfigStoreType } from '../../stores/modelStore'
import type { EditorStoreType } from '../../stores/editorStore'
import type {
  BigQueryOauthConnection,
  Connection,
  MotherDuckConnection,
  SnowflakeJwtConnection,
} from '../../connections'
import motherduckIcon from '../static/motherduck.png'
import { KeySeparator } from '../../data/constants'
import ConnectionListItem from './ConnectionListItem.vue'
import { buildConnectionTree, filterConnectionTree } from '../../connections'

export default {
  name: 'ConnectionList',
  props: {
    activeConnectionKey: {
      type: String,
      default: '',
      optional: true,
    },
    testTag: {
      type: String,
      default: '',
    },
  },
  data() {
    return {
      showDeleteConfirmationState: false,
      connectionToDelete: '',
    }
  },
  setup(_, { emit }) {
    const connectionStore = inject<ConnectionStoreType>('connectionStore')
    const saveConnections = inject<Function>('saveConnections')
    const modelStore = inject<ModelConfigStoreType>('modelStore')
    const editorStore = inject<EditorStoreType>('editorStore')
    const isMobile = inject<boolean>('isMobile', false)
    if (!connectionStore || !saveConnections || !modelStore || !editorStore) {
      throw new Error('Connection store is not provided!')
    }
    const connectionModelVisible = ref<Record<string, boolean>>({})
    const isLoading = ref<Record<string, boolean>>({})
    const isErrored = ref<Record<string, string>>({})
    const creatorVisible = ref(false)
    // Add search term ref
    const searchTerm = ref('')

    // Function to clear search
    const clearSearch = () => {
      searchTerm.value = ''
    }

    const updateMotherDuckToken = (connection: MotherDuckConnection, token: string) => {
      if (connection.type === 'motherduck') {
        connection.setAttribute('mdToken', token)
        connectionStore.resetConnection(connection.name)
      }
    }

    const updateSnowflakePrivateKey = async (connection: SnowflakeJwtConnection, token: string) => {
      if (connection.type === 'snowflake') {
        connection.setPrivateKey(token)
        await saveConnections()
        await connectionStore.resetConnection(connection.name)
      }
    }

    const updateSnowflakeAccount = async (connection: SnowflakeJwtConnection, account: string) => {
      if (connection.type === 'snowflake') {
        connection.setAccount(account)
        await saveConnections()
        connectionStore.resetConnection(connection.name)
      }
    }

    const updateSnowflakeUsername = async (
      connection: SnowflakeJwtConnection,
      username: string,
    ) => {
      if (connection.type === 'snowflake') {
        connection.setUsername(username)
        await saveConnections()
        connectionStore.resetConnection(connection.name)
      }
    }

    const updateBigqueryProject = async (connection: BigQueryOauthConnection, project: string) => {
      if (connection.type === 'bigquery-oauth') {
        connection.setAttribute('projectId', project)
        await saveConnections()
        connectionStore.resetConnection(connection.name)
      }
    }
    const updateBigqueryBrowsingProject = async (
      connection: BigQueryOauthConnection,
      project: string,
    ) => {
      if (connection.type === 'bigquery-oauth') {
        connection.setAttribute('browsingProjectId', project)
        await saveConnections()
      }
    }
    const toggleSaveCredential = (connection: any) => {
      connection.saveCredential = !connection.saveCredential
      connectionStore.resetConnection(connection.name)
    }

    const toggleMobileMenu = () => {
      emit('toggle-mobile-menu')
    }

    const collapsed = ref<Record<string, boolean>>({})

    const refreshId = async (id: string, connection: string, type: string) => {
      try {
        isLoading.value[id] = true
        if (!connectionStore.connections[connection]?.connected) {
          await connectionStore.resetConnection(connection)
        }
        if (type === 'connection') {
          console.log('getting databases')
          let databases = await connectionStore.connections[connection].getDatabases()
          for (let db of databases) {
            let dbid = `${connection}${KeySeparator}${db.name}`
            collapsed.value[dbid] = true
          }
        }
        if (type === 'database') {
          console.log('getting schemas')
          let dbid = id.split(KeySeparator)[1]
          await connectionStore.connections[connection].refreshDatabase(dbid)
          // we don't expand tables in the sidebar anymore
          // for (let table of tables) {
          //   collapsed.value[`${connection}${KeySeparator}${dbid}${KeySeparator}${table.name}`] =
          //     true
          // }
        }
        if (type === 'schema') {
          let dbid = id.split(KeySeparator)[1]
          let schemaid = id.split(KeySeparator)[2]
          await connectionStore.connections[connection].refreshSchema(dbid, schemaid)
        }
        if (type === 'table') {
          let dbid = id.split(KeySeparator)[1]
          let schemaid = id.split(KeySeparator)[2]
          let tableid = id.split(KeySeparator)[3]

          let cTable = connectionStore.connections[connection].databases
            ?.find((db) => db.name === dbid)
            ?.schemas.find((schema) => schema.name === schemaid)
            ?.tables.find((table) => table.name === tableid)
          if (cTable) {
            let nTable = await connectionStore.connections[connection].getColumns(
              dbid,
              schemaid,
              tableid,
            )
            cTable.columns = nTable
          }
        }
        delete isErrored.value[id]
      } catch (error) {
        console.log(error)
        // check if it's an Error
        if (error instanceof Error) {
          isErrored.value[id] = error.message
        } else {
          isErrored.value[id] = 'An error occurred'
        }
      }
      delete isLoading.value[id]
    }
    const toggleCollapse = async (id: string, connection: string, type: string) => {
      // if we are expanding a connection, get the databases
      if (['connection', 'database', 'schema', 'table'].includes(type)) {
        emit('connection-key-selected', id)
      }

      if (
        type === 'connection' &&
        (collapsed.value[id] === undefined || collapsed.value[id] === true)
      ) {
        // open now see the refresh
        collapsed.value[id] = false
        if (
          connectionStore.connections[connection].databases?.length === 0 ||
          connectionStore.connections[connection].databases?.length === undefined
        ) {
          await refreshId(id, connection, type)
        }
      } else if (type === 'database' && collapsed.value[id] !== false) {
        // open now see the refresh
        collapsed.value[id] = false
        let dbid = id.split(KeySeparator)[1]
        let db = connectionStore.connections[connection].databases?.find((db) => db.name === dbid)

        if (db && db.schemas?.length === 0) {
          await refreshId(id, connection, type)
        }
      } else if (type === 'schema' && collapsed.value[id] !== false) {
        // open now see the refresh
        collapsed.value[id] = false
        let dbid = id.split(KeySeparator)[1]
        let schemaid = id.split(KeySeparator)[2]
        let schema = connectionStore.connections[connection].databases
          ?.find((db) => db.name === dbid)
          ?.schemas?.find((schema) => schema.name === schemaid)
        if (schema && schema.tables?.length === 0) {
          await refreshId(id, connection, type)
        }
      }
      // keep this to refresh, but we won't actually add them to the display
      else if (type === 'table' && collapsed.value[id] !== false) {
        let dbid = id.split(KeySeparator)[1]
        let tableid = id.split(KeySeparator)[3]
        let schemaid = id.split(KeySeparator)[2]
        if (schemaid) {
          // if we have a schema, we need to find the table by schema
          let nTable = await connectionStore.connections[connection].databases
            ?.find((db) => db.name === dbid)
            ?.schemas?.find((schema) => schema.name === schemaid)
            ?.tables?.find((table) => table.name === tableid)
          if (nTable && nTable.columns.length === 0) {
            await refreshId(id, connection, type)
            return
          }
        }
      }
      // expand first, so we can see the loading view
      else if (collapsed.value[id] === undefined) {
        collapsed.value[id] = false
      } else {
        collapsed.value[id] = !collapsed.value[id]
      }
    }

    // hydrate the initial collapse list
    Object.values(connectionStore.connections).forEach((item) => {
      let connectionKey = `${item.name}`
      collapsed.value[connectionKey] = true
      item.databases?.forEach((db) => {
        let dbKey = `${connectionKey}${KeySeparator}${db.name}`
        collapsed.value[dbKey] = true
        db.schemas.forEach((schema) => {
          let schemaKey = `${dbKey}${KeySeparator}${schema.name}`
          collapsed.value[schemaKey] = true
          for (let table of schema.tables) {
            let tableKey = `${dbKey}${KeySeparator}${table.schema}${KeySeparator}${table.name}`
            collapsed.value[tableKey] = true
          }
        })
      })
    })

    const contentList = computed(() => {
      return buildConnectionTree(
        Object.values(connectionStore.connections),
        collapsed.value,
        isLoading.value,
        isErrored.value,
      )
    })

    // Add filtered content list computed property
    const filteredContentList = computed(() => {
      return filterConnectionTree(contentList.value, searchTerm.value)
    })

    const rightSplit = (str: string) => {
      const index = str.lastIndexOf(KeySeparator)
      return index !== -1 ? str.substring(0, index) : str
    }
    return {
      connectionStore,
      editorStore,
      contentList,
      filteredContentList, // Use the filtered list instead of the original
      toggleCollapse,
      toggleMobileMenu,
      collapsed,
      saveConnections,
      modelStore,
      connectionModelVisible,
      updateMotherDuckToken,
      updateSnowflakePrivateKey,
      updateSnowflakeAccount,
      updateSnowflakeUsername,
      toggleSaveCredential,
      motherduckIcon,
      updateBigqueryProject,
      updateBigqueryBrowsingProject,
      refreshId,
      rightSplit,
      creatorVisible,
      isMobile,
      searchTerm, // Expose search term to template
      clearSearch, // Expose clear search function
    }
  },
  components: {
    SidebarList,
    ConnectionCreatorInline,
    LoadingButton,
    StatusIcon,
    Tooltip,
    ConnectionListItem,
  },
  methods: {
    resetConnection(connection: Connection) {
      return this.connectionStore.resetConnection(connection.name)
    },
    showDeleteConfirmation(connection: Connection) {
      this.connectionToDelete = connection.name
      this.showDeleteConfirmationState = true
    },
    cancelDelete() {
      this.showDeleteConfirmationState = false
      this.connectionToDelete = ''
    },
    confirmDelete() {
      if (this.connectionToDelete) {
        for (const editor of Object.values(this.editorStore.editors)) {
          if (editor.connection === this.connectionToDelete) {
            editor.delete()
          }
        }
        this.connectionStore.deleteConnection(this.connectionToDelete)
      }

      this.showDeleteConfirmationState = false
      this.connectionToDelete = ''
    },
    // @ts-ignore
    deleteConnection(editor) {
      this.showDeleteConfirmation(editor)
    },
  },
  computed: {
    connections() {
      return Object.values(this.connectionStore.connections)
    },
    modelList() {
      return Object.keys(this.modelStore.models)
    },
  },
}
</script>

<style scoped>
.error-indicator {
  color: red;
  font-size: 12px;
  overflow-y: hidden;
  white-space: nowrap;
}

.loading-indicator {
  display: block;
  width: 100%;
  line-height: var(--sidebar-list-item-height);
  height: var(--sidebar-list-item-height);
  min-height: var(--sidebar-list-item-height);
  background: linear-gradient(
    to left,
    var(--sidebar-bg) 0%,
    var(--query-window-bg) 50%,
    var(--sidebar-bg) 100%
  );
  background-size: 200% 100%;
  animation: loading-gradient 2s infinite linear;
}

@keyframes loading-gradient {
  0% {
    background-position: -100% 0;
  }

  100% {
    background-position: 100% 0;
  }
}

.motherduck-icon {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

/* Add styles for the search box */
.search-container {
  position: relative;
  margin-top: 5px;
}

.search-input {
  width: 100%;
  border-radius: 0px;
  border: 1px solid var(--sidebar-border-color, #ccc);
  background-color: transparent;
  color: var(--sidebar-text-color, #333);
  line-height: var(--sidebar-list-item-height);
  font-size: var(--sidebar-font-size, 14px);
}

.search-input:focus {
  outline: none;
  border-color: var(--sidebar-active-border-color, #66afe9);
  box-shadow: 0 0 0 2px rgba(102, 175, 233, 0.25);
}

.clear-search-btn {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
  color: var(--sidebar-text-color, #999);
  font-size: 14px;
  padding: 0;
  line-height: 1;
}

.clear-search-btn:hover {
  color: var(--sidebar-active-text-color, #666);
}
</style>
