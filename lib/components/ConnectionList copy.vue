<template>
  <sidebar-list title="Connections">
    <template #actions>
      <div class="button-container">
        <connection-creator />
        <div>
          <loading-button :action="saveConnections" :key-combination="['control', 's']">Save</loading-button>
        </div>
      </div>
    </template>
    <connection-list-item
      v-for="item in contentList"
      :key="item.id"
      :item="item"
      :is-collapsed="collapsed[item.id]"
      @toggle="toggleCollapse"
      @refresh="refreshId"
    />
    <div v-for="item in contentList" :key="item.id" class="sidebar-item"
  
      @click="toggleCollapse(item.id, item.connection.name, item.type)">
      <div v-for="_ in item.indent" class="sidebar-padding"></div>
      <template v-if="item.type === 'connection'">
        <i v-if="!collapsed[item.id]" class="mdi mdi-menu-down"></i>
        <i v-else class="mdi mdi-menu-right"></i>
        <tooltip content="DuckDB" v-if="item.connection?.type == 'duckdb'"><i class="mdi mdi-duck"></i>
        </tooltip>
        <tooltip content="MotherDuck" v-else-if="item.connection?.type == 'motherduck'">
          <img :src="motherduckIcon" class="motherduck-icon" />
        </tooltip>

        <tooltip content="Bigquery" v-else-if="item.connection?.type == 'bigquery-oauth'">
          <i class="mdi mdi-google"></i>
        </tooltip>
        <span class="title-pad-left"> {{ item.name }} ({{ item.count }}) </span>
      </template>

      <template v-else-if="item.type === 'database'">
        <i v-if="!collapsed[item.id]" class="mdi mdi-menu-down"></i>
        <i v-else class="mdi mdi-menu-right"></i>
        <span class="title-pad-left"> {{ item.name }} </span>
      </template>
      <template v-else-if="item.type === 'table'">
        <i v-if="!collapsed[item.id]" class="mdi mdi-menu-down"></i>
        <i v-else class="mdi mdi-menu-right"></i>
        <span class="title-pad-left"> {{ item.name }} </span>
      </template>
      <template v-else-if="item.type === 'column'">
        <span class="title-pad-left"> {{ item.name }} </span>
      </template>
      <template v-else-if="item.type === 'loading'">
        <span class="loading-indicator"> </span>
      </template>
      <template v-else-if="item.type === 'error'">
        <span class="error-indicator">{{ item.name }} </span>
      </template>
      <span class="model-anchor" v-if="item.type === 'model'">
        <i class="mdi mdi-set-center"></i>
        <button class="button" @click="connectionModelVisible[item.connection.name] = true">
          {{ item.connection.model || 'Set Model' }}
        </button>
        <div v-if="connectionModelVisible[item.connection.name]" class="model-form">
          <form @submit.prevent="submitConnectionModel(item.connection.name)">
            <div>
              <select class="model-select" v-model="item.connection.model" id="connection-model" required>
                <option class="model-select-item" v-for="model in modelList" :key="model" :value="model">
                  {{ model }}
                </option>
              </select>
            </div>
            <button type="submit">Submit</button>
            <button type="button" @click="
              connectionModelVisible[item.connection.name] =
              !connectionModelVisible[item.connection.name]
              ">
              Close
            </button>
          </form>
        </div>
      </span>

      <template v-if="item.type === 'connection'">
        <span class="flag-container">
          <loading-button class="lb" :action="() => resetConnection(item.connection)"><i
              :class="item.connection.connected ? 'mdi mdi-refresh' : 'mdi mdi-connection'"></i></loading-button>
        </span>
        <span class="spacer"></span>
        <status-icon v-if="item.type === 'connection'"
          :status="connectionStore.connectionStateToStatus(connectionStore.connections[item.name])" :message="connectionStore.connections[item.name].error
            ? connectionStore.connections[item.name].error || ''
            : ''
            " />
      </template>

      <!-- actions -->
      <div class = 'refresh' v-if="item.type === 'refresh'" @click="refreshId(rightSplit(item.id), item.connection.name, 'connection')">
        {{item.name}}
      </div>
      <!-- Add MotherDuck token input when connection is expanded -->
      <div v-if="item.type === 'motherduck-token'" class="md-token-container" @click.stop>
        <form @submit.prevent="updateMotherDuckToken(item.connection)">
          <input type="password" v-model="mdTokens[item.connection.name]" placeholder="Enter MotherDuck Token"
            class="md-token-input" />
          <button type="submit" class="md-token-button">Set Token</button>
        </form>
      </div>
      <div v-if="item.type === 'bigquery-project'" class="md-token-container" @click.stop>
        <form @submit.prevent="updateBigqueryProject(item.connection)">
          <input type="text" v-model="mdTokens[item.connection.name]" placeholder="Enter Billing Project"
            class="md-token-input" />
          <button type="submit" class="md-token-button">Set Project</button>
        </form>
      </div>
    </div>
  </sidebar-list>
</template>

<script lang="ts">
import { ref, computed, inject, onMounted } from 'vue'
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
  setup() {
    const connectionStore = inject<ConnectionStoreType>('connectionStore')
    const saveConnections = inject<Function>('saveConnections')
    const modelStore = inject<ModelConfigStoreType>('modelStore')
    if (!connectionStore || !saveConnections || !modelStore) {
      throw new Error('Connection store is not provided!')
    }
    const connectionModelVisible = ref<Record<string, boolean>>({})
    const isLoading = ref<Record<string, boolean>>({})
    const isErrored = ref<Record<string, string>>({})
    const connectionDetails = ref({
      model: '',
    })
    const mdTokens = ref<Record<string, string>>({})
    const billingProjects = ref<Record<string, string>>({})

    const submitConnectionModel = (connection: string) => {
      if (connectionDetails.value.model) {
        connectionStore.connections[connection].model = connectionDetails.value.model
      }
      connectionModelVisible.value[connection] = false
      saveConnections()
    }

    const updateMotherDuckToken = (connection: MotherDuckConnection) => {
      if (connection.type === 'motherduck' && mdTokens.value[connection.name]) {
        connection.mdToken = mdTokens.value[connection.name]
        mdTokens.value[connection.name] = '' // Clear the input after setting
        connectionStore.resetConnection(connection.name)
      }
    }

    const updateBigqueryProject = (connection: BigQueryOauthConnection) => {
      if (connection.type === 'bigquery-oauth' && billingProjects.value[connection.name]) {
        connection.projectId = billingProjects.value[connection.name]
        billingProjects.value[connection.name] = '' // Clear the input after setting
        connectionStore.resetConnection(connection.name)
      }
    }

    const collapsed = ref<Record<string, boolean>>({})

    const refreshId = async (id: string, connection: string, type: string) => {
      try {
        isLoading.value[id] = true
        if (type === 'connection') {
          console.log('getting databases')
          let databases = await connectionStore.connections[connection].getDatabases()
          console.log('databases', databases)
          connectionStore.connections[connection].databases = databases
          for (let db of databases) {
            collapsed.value[db.name] = true
          }


        }
        if (type === 'database') {
          console.log('getting tables')
          let db = connectionStore.connections[connection].databases?.find(db => db.name === id)

          let tables = await connectionStore.connections[connection].getTables(id)

          if (db) {
            db.tables = tables
          }
          for (let table of tables) {
            collapsed.value[`${connection}-${id}-${table.name}`] = true
          }

        }
        if (type === 'table') {
          console.log('getting columns')
          let dbid = id.split(KeySeparator)[1]
          let tableid = id.split(KeySeparator)[2]
          let nTable = await connectionStore.connections[connection].getTable(dbid, tableid)

          nTable.columns = await connectionStore.connections[connection].getColumns(dbid, tableid)

        }
      }
      catch (error) {
        // check if it's an Error
        if (error instanceof Error) {
          isErrored.value[id] = error.message
        }
        else {
          isErrored.value[id] = 'An error occurred'
        }
      }
      delete isLoading.value[id]
    }
    const toggleCollapse = async (id: string, connection: string, type: string) => {
      // if we are expanding a connection, get the databases

      if (type === 'connection' && collapsed.value[id]) {
        if (!connectionStore.connections[connection].databases) {
          await refreshId(id, connection, type)
        }

      }
      if (type === 'database' && collapsed.value[id]) {
        let db = connectionStore.connections[connection].databases?.find(db => db.name === id)
        if (!db || !db.tables) {
          await refreshId(id, connection, type)
        }
      }
      if (type === 'table' && collapsed.value[id]) {
        let dbid = id.split(KeySeparator)[1]
        let tableid = id.split(KeySeparator)[2]
        let nTable = await connectionStore.connections[connection].getTable(dbid, tableid)
        if (!nTable.columns) {
          await refreshId(id, connection, type)
        }
      }
      collapsed.value[id] = !collapsed.value[id]
    }

    onMounted(() => {
      Object.values(connectionStore.connections).forEach((item) => {
        let connectionKey = `${item.name}`
        collapsed.value[connectionKey] = true
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
        if (!collapsed.value[connection.name]) {
          list.push({
            id: `${connection.name}-model`,
            name: 'Set Model',
            indent: 1,
            count: 0,
            type: 'model',
            connection,
          })
          list.push({
            id: `${connection.name}${KeySeparator}refresh`,
            name: 'Refresh Tables',
            indent: 1,
            count: 0,
            type: 'refresh',
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
              name: 'BigqueryProject',
              indent: 1,
              count: 0,
              type: 'bigquery-project',
              connection,
            })
          }
          databases.forEach((db) => {
            list.push({
              id: db.name,
              name: db.name,
              indent: 1,
              count: db.tables.length,
              type: 'database',
              connection
            })
            if (isLoading.value[db.name]) {
              list.push({
                id: `${connection.name}-loading`,
                name: 'Loading...',
                indent: 1,
                count: 0,
                type: 'loading',
                connection,
              })
            }
            if (!collapsed.value[db.name]) {
              db.tables.forEach((table) => {
                let tableId = `${connection.name}${KeySeparator}${db.name}${KeySeparator}${table.name}`
                list.push({
                  id: tableId,
                  name: table.name,
                  indent: 2,
                  count: 0,
                  type: 'table',
                  connection
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
                      connection
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

    const rightSplit = (str: string,) => {
      const index = str.lastIndexOf(KeySeparator);
      return index !== -1 ? str.substring(0, index) : str;
    }
    return {
      connectionStore,
      contentList,
      toggleCollapse,
      collapsed,
      saveConnections,
      modelStore,
      connectionModelVisible,
      submitConnectionModel,
      mdTokens,
      updateMotherDuckToken,
      motherduckIcon,
      updateBigqueryProject,
      billingProjects,
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
    ConnectionListItem
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
.refresh {
  cursor: pointer;
  padding: 5px;
  font-size: 12px;
  color: var(--text);
}
.error-indicator {
  color: red;
  font: 12px;
  overflow-y: hidden;
  white-space: nowrap;
}

.loading-indicator {
  display: block;
  width: 100%;
  line-height: var(--sidebar-list-item-height);
  height: var(--sidebar-list-item-height);
  min-height: var(--sidebar-list-item-height);
  background: linear-gradient(to left, var(--sidebar-bg) 0%, var(--query-window-bg) 50%, var(--sidebar-bg) 100%);
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


.title-pad-left {
  padding-left: 5px;
}

.lb {
  line-height: var(--sidebar-list-item-height);
  height: var(--sidebar-list-item-height);
  min-height: var(--sidebar-list-item-height);
}

.button {
  font-size: var(--button-font-size);
}

.spacer {
  margin-right: 5px;
}

.stacked-item:hover>.stacked-content {
  background-color: var(--button-mouseover);
}

.model-anchor {
  position: relative;
}

.flag-container {
  margin-left: auto;
  display: flex;
  flex-wrap: wrap;
}

.model-form {
  position: absolute;
  top: 100%;
  background-color: var(--button-bg);
  box-shadow: 0px 4px 8px rgba(0, 0, 0, 0.1);
  border: 1px solid var(--border);
  z-index: 1001;
  font-size: 12px;
  text-align: center;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}

.model-select {
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  padding: 2px;
  font-size: 12px;
  text-align: center;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  border-radius: 0px;
}

.model-select-item {
  font-size: 12px;
  font-weight: 300;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}

.md-token-container {
  /* padding: 4px 0 4px 20px; */
  background-color: var(--sidebar-bg);
  width: 100%;
}

.md-token-input {
  padding: 2px 4px;
  font-size: var(--button-font-size);
  width: 180px;
  margin-right: 4px;
  border: 1px solid var(--border);
  background-color: var(--button-bg);
  color: var(--text);
}

.md-token-button {
  padding: 2px 8px;
  font-size: var(--button-font-size);
  background-color: var(--button-bg);
  border: 1px solid var(--border);
  color: var(--text);
  cursor: pointer;
}

.md-token-button:hover {
  background-color: var(--button-mouseover);
}
</style>
