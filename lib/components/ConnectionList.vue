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
            />
          </span>
        </template>
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
import type { Connection } from '../connections'

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

    const submitConnectionModel = (connection: string) => {
      if (connectionDetails.value.model) {
        connectionStore.connections[connection].model = connectionDetails.value.model
      }
      connectionModelVisible.value[connection] = false
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
  align-items: center;
  /* padding: 4px; */
  cursor: pointer;
  font-size: 13px;
  height: 22px;
  line-height: 22px;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}

.stacked-item:hover {
  background-color: var(--button-mouseover);
}

.stacked-content {
  display: flex;
  align-items: center;
  width: 100%;
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
  /* Position below the button */
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
  /* Removes default styling */
  -webkit-appearance: none;
  -moz-appearance: none;
  /* border: 1px solid #ccc; */
  /* background-color: var(--sidebar-bg); */
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
</style>
