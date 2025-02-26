<template>
  <sidebar-list title="Connections">
    <template #actions>
      <div class="button-container">
        <connection-creator />
        <loading-button :action="saveConnections" :key-combination="['control', 's']"
          >Save</loading-button
        >
      </div>
    </template>

    <div
      v-for="item in contentList"
      :key="item.id"
      class="stacked-item"
      :style="{ paddingLeft: `${item.indent * 10}px` }"
    >
      <div class="stacked-content" @click="toggleCollapse(item.id)">
        <i v-if="!collapsed[item.id]" class="mdi mdi-menu-down"></i>
        <i v-else class="mdi mdi-menu-right"></i>
        <tooltip content="DuckDB" v-if="item.connection?.type == 'duckdb'"
          ><i class="mdi mdi-duck"></i>
        </tooltip>
        <tooltip content="MotherDuck" v-else-if="item.connection?.type == 'motherduck'"
          >M<i class="mdi mdi-duck"></i>
        </tooltip>

        <tooltip content="Bigquery" v-else-if="item.connection?.type == 'bigquery-oauth'">
          <i class="mdi mdi-google"></i>
        </tooltip>
        <span>
          {{ item.name }} ({{ item.count }})
          <span class="model-anchor">
            <button class="button" @click="connectionModelVisible[item.name] = true">
              {{ item.connection.model || 'Set Model' }}
            </button>
            <div v-if="connectionModelVisible[item.name]" class="model-form">
              <form @submit.prevent="submitConnectionModel(item.name)">
                <div>
                  <select
                    class="model-select"
                    v-model="item.connection.model"
                    id="connection-model"
                    required
                  >
                    <option
                      class="model-select-item"
                      v-for="model in modelList"
                      :key="model"
                      :value="model"
                    >
                      {{ model }}
                    </option>
                  </select>
                </div>
                <button type="submit">Submit</button>
                <button
                  type="button"
                  @click="connectionModelVisible[item.name] = !connectionModelVisible[item.name]"
                >
                  Close
                </button>
              </form>
            </div>
          </span>
        </span>
        <template v-if="item.type === 'connection'">
          <span class="flag-container">
            <loading-button class="lb" :action="() => resetConnection(item.connection)"
              ><i :class="item.connection.connected ? 'mdi mdi-refresh' : 'mdi mdi-connection'"></i
            ></loading-button>
            <status-icon
              v-if="item.type === 'connection'"
              :status="
                connectionStore.connectionStateToStatus(connectionStore.connections[item.name])
              "
              :message="
                connectionStore.connections[item.name].error
                  ? connectionStore.connections[item.name].error || ''
                  : ''
              "
            />
          </span>
        </template>
      </div>
      <!-- Add MotherDuck token input when connection is expanded -->
      <div
        v-if="!collapsed[item.id] && item.connection?.type === 'motherduck'"
        class="md-token-container"
        @click.stop
      >
        <form @submit.prevent="updateMotherDuckToken(item.connection)">
          <input
            type="password"
            v-model="mdTokens[item.connection.name]"
            placeholder="Enter MotherDuck Token"
            class="md-token-input"
          />
          <button type="submit" class="md-token-button">Set Token</button>
        </form>
      </div>
    </div>
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
import type { Connection, MotherDuckConnection } from '../connections'

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
    const toggleCollapse = (id: string) => {
      collapsed.value[id] = !collapsed.value[id]
    }

    const contentList = computed(() => {
      const list: Array<{
        id: string
        name: string
        indent: number
        count: number
        type: string
        connection: any | undefined
      }> = []
      Object.values(connectionStore.connections).forEach((connection) => {
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
          databases.forEach((db) => {
            list.push({
              id: db.name,
              name: db.name,
              indent: 1,
              count: db.tables.length,
              type: 'database',
              connection: null,
            })
            if (!collapsed.value[db.name]) {
              db.tables.forEach((table) => {
                list.push({
                  id: table.name,
                  name: table.name,
                  indent: 2,
                  count: 0,
                  type: 'table',
                  connection: null,
                })
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
.lb {
  line-height: 12px;
  height: 12px;
  min-height: 12px;
}

.button {
  line-height: 12px;
  height: 16px;
}

.stacked-item {
  display: flex;
  flex-direction: column;
  cursor: pointer;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}

.stacked-content {
  display: flex;
  align-items: center;
  width: 100%;
  font-size: var(--sidebar-list-item-font-size);
  height: var(--sidebar-list-item-height);
  line-height: var(--sidebar-list-item-height);
}

.stacked-item:hover > .stacked-content {
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
  padding: 4px 0 4px 20px;
  background-color: var(--sidebar-bg);
  width: 100%;
}

.md-token-input {
  padding: 2px 4px;
  font-size: 12px;
  width: 180px;
  margin-right: 4px;
  border: 1px solid var(--border);
  background-color: var(--button-bg);
  color: var(--text);
}

.md-token-button {
  padding: 2px 8px;
  font-size: 12px;
  background-color: var(--button-bg);
  border: 1px solid var(--border);
  color: var(--text);
  cursor: pointer;
}

.md-token-button:hover {
  background-color: var(--button-mouseover);
}
</style>
