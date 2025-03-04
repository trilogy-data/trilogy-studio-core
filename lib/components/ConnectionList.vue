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

      <!-- Add MotherDuck token input when connection is expanded -->
      <div v-if="item.type === 'motherduck-token'" class="md-token-container" @click.stop>
        <form @submit.prevent="updateMotherDuckToken(item.connection)">
          <input type="password" v-model="mdTokens[item.connection.name]" placeholder="Enter MotherDuck Token"
            class="md-token-input" />
          <button type="submit" class="md-token-button">Set Token</button>
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
import type { Connection, MotherDuckConnection } from '../connections'
import motherduckIcon from '../static/motherduck.png'
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
    const connectionDetails = ref({
      model: '',
    })
    const mdTokens = ref<Record<string, string>>({})

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
        // saveConnections() // Save the updated connection
        connectionStore.resetConnection(connection.name)
      }
    }

    const collapsed = ref<Record<string, boolean>>({})
    const toggleCollapse = async (id: string, connection: string, type: string) => {
      console.log('toggling Collapse')
      console.log(collapsed.value[id])
      // if we are expanding a connection, get the databases
      if (type === 'connection' && collapsed.value[id]) {
        console.log('getting databases')
        let databases = await connectionStore.connections[connection].getDatabases()
        connectionStore.connections[connection].databases = databases
        console.log(databases)
        for (let db of databases) {
          collapsed.value[db.name] = true
        }
      }
      if (type === 'database' && collapsed.value[id]) {
        console.log('getting tables')
        let tables = await connectionStore.connections[connection].getTables(id)
        let db = connectionStore.connections[connection].databases?.find(db => db.name === id)
        if (db) {
          db.tables = tables
          console.log(db.tables)
        }
        console.log(tables)
        for (let table of tables) {
          collapsed.value[`${connection}-${id}-${table.name}`] = true
        }
      }
      if (type === 'table' && collapsed.value[id]) {
        console.log('getting columns')
        let dbid = id.split('-')[1]
        let tableid = id.split('-')[2]
        let nTable = await connectionStore.connections[connection].getTable(dbid, tableid)
        let tableFull = connectionStore.connections[connection].databases?.find(db => db.name == dbid)?.tables.find(table => table.name === tableid)
        if (tableFull) {
          tableFull.columns = nTable.columns
        }
        console.log(nTable.columns)
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
        if (!collapsed.value[connection.name]) {
          list.push({
            id: `${connection.name}-model`,
            name: 'Set Model',
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
          databases.forEach((db) => {
            list.push({
              id: db.name,
              name: db.name,
              indent: 1,
              count: db.tables.length,
              type: 'database',
              connection
            })
            if (!collapsed.value[db.name]) {
              db.tables.forEach((table) => {
                list.push({
                  id: `${connection.name}-${db.name}-${table.name}`,
                  name: table.name,
                  indent: 2,
                  count: 0,
                  type: 'table',
                  connection
                })
                if (!collapsed.value[`${connection.name}-${db.name}-${table.name}`]) {
                  table.columns.forEach((column) => {
                    list.push({
                      id: `${connection.name}-${db.name}-${table.name}-${column.name}`,
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
    }
  },
  components: {
    SidebarList,
    ConnectionCreator,
    LoadingButton,
    StatusIcon,
    Tooltip,
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
