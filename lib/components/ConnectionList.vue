<template>
  <sidebar-list title="Connections">
    <template #actions>
      <div class="button-container">
        <connection-creator />
        <div>
          <loading-button :action="saveConnections" :key-combination="['control', 's']"
            >Save</loading-button
          >
        </div>
      </div>
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
    />
  </sidebar-list>
</template>

<script lang="ts">
import { ref, computed, inject } from 'vue'
import SidebarList from './SidebarList.vue'
import ConnectionCreator from './ConnectionCreator.vue'
import LoadingButton from './LoadingButton.vue'
import StatusIcon from './StatusIcon.vue'
import Tooltip from './Tooltip.vue'
import type { ConnectionStoreType } from '../stores/connectionStore'
import type { ModelConfigStoreType } from '../stores/modelStore'
import type { BigQueryOauthConnection, Connection, MotherDuckConnection } from '../connections'
import motherduckIcon from '../static/motherduck.png'
import { KeySeparator } from '../data/constants'
import ConnectionListItem from './ConnectionListItem.vue'

export default {
  name: 'ConnectionList',
  props: {
    activeConnectionKey: {
      type: String,
      default: '',
      optional: true,
    },
  },
  setup(_, { emit }) {
    const connectionStore = inject<ConnectionStoreType>('connectionStore')
    const saveConnections = inject<Function>('saveConnections')
    const modelStore = inject<ModelConfigStoreType>('modelStore')
    if (!connectionStore || !saveConnections || !modelStore) {
      throw new Error('Connection store is not provided!')
    }
    const connectionModelVisible = ref<Record<string, boolean>>({})
    const isLoading = ref<Record<string, boolean>>({})
    const isErrored = ref<Record<string, string>>({})

    const updateMotherDuckToken = (connection: MotherDuckConnection, token: string) => {
      if (connection.type === 'motherduck') {
        connection.mdToken = token
        connectionStore.resetConnection(connection.name)
      }
    }

    const updateBigqueryProject = (connection: BigQueryOauthConnection, project: string) => {
      if (connection.type === 'bigquery-oauth') {
        connection.projectId = project
        connectionStore.resetConnection(connection.name)
      }
    }

    const collapsed = ref<Record<string, boolean>>({})

    const refreshId = async (id: string, connection: string, type: string) => {
      console.log('refresh', id, connection, type)
      if (!connectionStore.connections[connection]?.connected) {
        isErrored.value[id] = `Not connected; cannot load tables.`
        return
      }
      try {
        isLoading.value[id] = true
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
          let db = connectionStore.connections[connection].databases?.find((db) => db.name === dbid)

          let tables = await connectionStore.connections[connection].getTables(dbid)

          if (db) {
            db.tables = tables
          }
          for (let table of tables) {
            collapsed.value[`${connection}${KeySeparator}${dbid}${KeySeparator}${table.name}`] =
              true
          }
        }
        if (type === 'table') {
          console.log('getting columns')
          let dbid = id.split(KeySeparator)[1]
          let tableid = id.split(KeySeparator)[2]
          let nTable = await connectionStore.connections[connection].getTable(dbid, tableid)
          let cTable = connectionStore.connections[connection].databases
            ?.find((db) => db.name === dbid)
            ?.tables?.find((table) => table.name === tableid)
          if (cTable) {
            cTable.columns = nTable.columns
          }
        }
        delete isErrored.value[id]
      } catch (error) {
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
        // check if 0 or undefined for (connectionStore.connections[connection].databases?.length)
        if (
          connectionStore.connections[connection].databases?.length === 0 ||
          connectionStore.connections[connection].databases?.length === undefined
        ) {
          await refreshId(id, connection, type)
        }
      }
      if (type === 'database' && collapsed.value[id] !== false) {
        let dbid = id.split(KeySeparator)[1]
        let db = connectionStore.connections[connection].databases?.find((db) => db.name === dbid)
        if (db && db.tables?.length === 0) {
          await refreshId(id, connection, type)
        }
      }
      if (type === 'table' && collapsed.value[id] !== false) {
        let dbid = id.split(KeySeparator)[1]
        let tableid = id.split(KeySeparator)[2]
        let nTable = await connectionStore.connections[connection].databases
          ?.find((db) => db.name === dbid)
          ?.tables?.find((table) => table.name === tableid)
        if (nTable && nTable.columns.length === 0) {
          await refreshId(id, connection, type)
        }
      }
      if (collapsed.value[id] === undefined) {
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
          let tableKey = `${dbKey}${KeySeparator}${table.name}`
          collapsed.value[tableKey] = true
        })
      })
    })

    const contentList = computed(() => {
      const list: Array<{
        id: string
        name: string
        indent: number
        count: number
        type: string
        connection: any | undefined
      }> = []
      const sorted = Object.values(connectionStore.connections).sort((a, b) => {
        if (a.connected && !b.connected) {
          return -1
        } else if (!a.connected && b.connected) {
          return 1
        } else {
          return a.name.localeCompare(b.name)
        }
      })
      sorted.forEach((connection) => {
        let databases = connection.databases ? connection.databases : []
        list.push({
          id: connection.name,
          name: connection.name,
          indent: 0,
          count: databases.length,
          type: 'connection',
          connection,
        })

        if (collapsed.value[connection.name] === false) {
          list.push({
            id: `${connection.name}-model`,
            name: 'Model',
            indent: 1,
            count: 0,
            type: 'model',
            connection,
          })

          if (connection.type === 'motherduck') {
            list.push({
              id: `${connection.name}-md-token`,
              name: 'MotherDuck Token',
              indent: 1,
              count: 0,
              type: 'motherduck-token',
              connection,
            })
          }
          if (connection.type === 'bigquery-oauth') {
            list.push({
              id: `${connection.name}-billing-project`,
              name: 'Billing Project',
              indent: 1,
              count: 0,
              type: 'bigquery-project',
              connection,
            })
          }
          list.push({
            id: `${connection.name}${KeySeparator}refresh`,
            name: 'Refresh Databases',
            indent: 1,
            count: 0,
            type: 'refresh-connection',
            connection,
          })
          if (isLoading.value[connection.name]) {
            list.push({
              id: `${connection.name}-loading`,
              name: 'Loading...',
              indent: 1,
              count: 0,
              type: 'loading',
              connection,
            })
          }
          if (isErrored.value[connection.name]) {
            list.push({
              id: `${connection.name}-error`,
              name: isErrored.value[connection.name],
              indent: 1,
              count: 0,
              type: 'error',
              connection,
            })
          }
          databases.forEach((db) => {
            let dbId = `${connection.name}${KeySeparator}${db.name}`
            list.push({
              id: dbId,
              name: db.name,
              indent: 1,
              count: db.tables.length,
              type: 'database',
              connection,
            })

            if (!collapsed.value[dbId]) {
              list.push({
                id: `${dbId}${KeySeparator}refresh`,
                name: 'Refresh Tables',
                indent: 1,
                count: 0,
                type: 'refresh-database',
                connection,
              })
              if (isLoading.value[dbId]) {
                list.push({
                  id: `${connection.name}-loading`,
                  name: 'Loading...',
                  indent: 1,
                  count: 0,
                  type: 'loading',
                  connection,
                })
              }
              db.tables.forEach((table) => {
                let tableId = `${dbId}${KeySeparator}${table.name}`
                list.push({
                  id: tableId,
                  name: table.name,
                  indent: 2,
                  count: 0,
                  type: 'table',
                  connection,
                })
                if (isLoading.value[tableId]) {
                  list.push({
                    id: `${connection.name}-loading`,
                    name: 'Loading...',
                    indent: 1,
                    count: 0,
                    type: 'loading',
                    connection,
                  })
                }
                if (!collapsed.value[tableId]) {
                  table.columns.forEach((column) => {
                    list.push({
                      id: `${tableId}${KeySeparator}${column.name}`,
                      name: column.name,
                      indent: 3,
                      count: 0,
                      type: 'column',
                      connection,
                    })
                  })
                }
              })
            }
          })
        }
      })
      return list
    })

    const rightSplit = (str: string) => {
      const index = str.lastIndexOf(KeySeparator)
      return index !== -1 ? str.substring(0, index) : str
    }
    return {
      connectionStore,
      contentList,
      toggleCollapse,
      collapsed,
      saveConnections,
      modelStore,
      connectionModelVisible,
      updateMotherDuckToken,
      motherduckIcon,
      updateBigqueryProject,
      refreshId,
      rightSplit,
    }
  },
  components: {
    SidebarList,
    ConnectionCreator,
    LoadingButton,
    StatusIcon,
    Tooltip,
    ConnectionListItem,
  },
  methods: {
    resetConnection(connection: Connection) {
      return this.connectionStore.resetConnection(connection.name)
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
