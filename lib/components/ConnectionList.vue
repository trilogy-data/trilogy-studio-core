<template>
  <sidebar-list title="Connections">
    <template #actions>
      <div class="button-container">
        <button
          @click="creatorVisible = !creatorVisible"
          :data-testid="testTag ? `connection-creator-add-${testTag}` : 'connection-creator-add'"
        >
          {{ creatorVisible ? 'Hide' : 'New' }}
        </button>
        <loading-button :action="saveConnections" :key-combination="['control', 's']"
          >Save</loading-button
        >
      </div>
      <connection-creator-inline
        :visible="creatorVisible"
        @close="creatorVisible = !creatorVisible"
      />
    </template>
    <connection-list-item
      v-for="item in contentList"
      :key="item.id"
      :item="item"
      :is-collapsed="collapsed[item.id]"
      :isSelected="item.id === activeConnectionKey"
      @toggle="toggleCollapse"
      @refresh="refreshId"
      @updateMotherduckToken="updateMotherDuckToken"
      @updateBigqueryProject="updateBigqueryProject"
      @update-snowflake-private-key="updateSnowflakePrivateKey"
      @toggle-save-credential="toggleSaveCredential"
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
import type { ConnectionStoreType } from '../stores/connectionStore'
import type { ModelConfigStoreType } from '../stores/modelStore'
import type { EditorStoreType } from '../stores/editorStore'
import type {
  BigQueryOauthConnection,
  Connection,
  MotherDuckConnection,
  SnowflakeJwtConnection,
} from '../connections'
import motherduckIcon from '../static/motherduck.png'
import { KeySeparator } from '../data/constants'
import ConnectionListItem from './ConnectionListItem.vue'
import { buildConnectionTree } from '../connections'

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
    if (!connectionStore || !saveConnections || !modelStore || !editorStore) {
      throw new Error('Connection store is not provided!')
    }
    const connectionModelVisible = ref<Record<string, boolean>>({})
    const isLoading = ref<Record<string, boolean>>({})
    const isErrored = ref<Record<string, string>>({})
    const creatorVisible = ref(false)

    const updateMotherDuckToken = (connection: MotherDuckConnection, token: string) => {
      if (connection.type === 'motherduck') {
        connection.mdToken = token
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

    const updateBigqueryProject = (connection: BigQueryOauthConnection, project: string) => {
      if (connection.type === 'bigquery-oauth') {
        connection.projectId = project
        connectionStore.resetConnection(connection.name)
      }
    }

    const toggleSaveCredential = (connection: any) => {
      connection.saveCredential = !connection.saveCredential
      connectionStore.resetConnection(connection.name)
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
          connectionStore.connections[connection].databases = databases
          for (let db of databases) {
            let dbid = `${connection}${KeySeparator}${db.name}`
            collapsed.value[dbid] = true
          }
        }
        if (type === 'database') {
          console.log('getting tables')
          let dbid = id.split(KeySeparator)[1]
          connectionStore.connections[connection].refreshDatabase(dbid)
          // we don't expand tables in the sidebar anymore
          // for (let table of tables) {
          //   collapsed.value[`${connection}${KeySeparator}${dbid}${KeySeparator}${table.name}`] =
          //     true
          // }
        }
        if (type === 'schema') {
          // pass, always get at database level
        }
        if (type === 'table') {
          let separatorCount = id.split(KeySeparator).length
          let dbid = id.split(KeySeparator)[1]
          let tableid = id.split(KeySeparator)[2]
          let schema = null
          if (separatorCount === 4) {
            // if we have a schema, we need to find the table by schema
            tableid = id.split(KeySeparator)[3]
            schema = id.split(KeySeparator)[2]
            dbid = id.split(KeySeparator)[1]
          } else if (separatorCount === 3) {
            // no schema, just a table
            dbid = id.split(KeySeparator)[1]
          }

          let cTable = connectionStore.connections[connection].databases
            ?.find((db) => db.name === dbid)
            ?.tables?.find((table) => table.name === tableid)
          if (schema) {
            // if we have a schema, find the table by schema
            cTable = connectionStore.connections[connection].databases
              ?.find((db) => db.name === dbid)
              ?.tables?.find((table) => table.schema === schema && table.name === tableid)
          }

          if (cTable) {
            let nTable = await connectionStore.connections[connection].getColumns(
              dbid,
              tableid,
              cTable.schema,
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
      if (['connection', 'database', 'table'].includes(type)) {
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
        if (db && db.tables?.length === 0) {
          await refreshId(id, connection, type)
        }
      }
      // keep this to refresh, but we won't actually add them to the display
      else if (type === 'table' && collapsed.value[id] !== false) {
        let separatorCount = id.split(KeySeparator).length
        let dbid = id.split(KeySeparator)[1]
        let tableid = id.split(KeySeparator)[2]
        let schema = null
        if (separatorCount === 4) {
          schema = id.split(KeySeparator)[2]
          tableid = id.split(KeySeparator)[3]
        }
        if (schema) {
          // if we have a schema, we need to find the table by schema
          let nTable = await connectionStore.connections[connection].databases
            ?.find((db) => db.name === dbid)
            ?.tables?.find((table) => table.schema === schema && table.name === tableid)
          if (nTable && nTable.columns.length === 0) {
            await refreshId(id, connection, type)
            return
          }
        }
        let nTable = await connectionStore.connections[connection].databases
          ?.find((db) => db.name === dbid)
          ?.tables?.find((table) => table.name === tableid)
        if (nTable && nTable.columns.length === 0) {
          await refreshId(id, connection, type)
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
        db.tables.forEach((table) => {
          // if a database uses schemas inside databases, we have one more layer
          if (table.schema) {
            let schemaKey = `${dbKey}${KeySeparator}${table.schema}`
            collapsed.value[schemaKey] = true
            let tableKey = `${dbKey}${KeySeparator}${table.schema}${KeySeparator}${table.name}`
            collapsed.value[tableKey] = true
          } else {
            let tableKey = `${dbKey}${KeySeparator}${table.name}`
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

    const rightSplit = (str: string) => {
      const index = str.lastIndexOf(KeySeparator)
      return index !== -1 ? str.substring(0, index) : str
    }
    return {
      connectionStore,
      editorStore,
      contentList,
      toggleCollapse,
      collapsed,
      saveConnections,
      modelStore,
      connectionModelVisible,
      updateMotherDuckToken,
      updateSnowflakePrivateKey,
      toggleSaveCredential,
      motherduckIcon,
      updateBigqueryProject,
      refreshId,
      rightSplit,
      creatorVisible,
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
            this.editorStore.removeEditor(editor.name)
          }
        }
        this.connectionStore.removeConnection(this.connectionToDelete)
      }

      this.showDeleteConfirmationState = false
      this.connectionToDelete = ''
    },
    // @ts-ignore
    deleteConnection(editor) {
      // Replace direct deletion with confirmation
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
</style>
