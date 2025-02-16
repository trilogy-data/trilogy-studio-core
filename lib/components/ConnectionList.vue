<template>
  <sidebar-list title="Connections">
    <template #actions>
      <div class="button-container">
        <connection-creator />
        <loading-button :action="saveConnections" :key-combination="['control', 's']">Save</loading-button>

      </div>
    </template>
    <!-- <button @click="login">Login Using Google</button> -->
    <li v-for="connection in connections" :key="connection.name"
      class="connection-item p-2 cursor-pointer hover:bg-gray-200 rounded">
      <div class="connection-content">
        <tooltip content="DuckDB" v-if="connection.type == 'duckdb'"><i class="mdi mdi-duck"></i>
        </tooltip>
        <tooltip content="MotherDuck" v-else-if="connection.type == 'motherduck'">M<i class="mdi mdi-duck"></i>
        </tooltip>

        <tooltip content="Bigquery" v-else-if="connection.type == 'bigquery-oauth'"> <i class="mdi mdi-google"></i>
        </tooltip>

        <div class="button-container connection-parts">
          <div class="padding-left" >
          <span >{{ connection.name }}</span>
          <tooltip v-if="connection.connected" content="Connected" position="bottom"><i class="mdi mdi-check green"></i>
          </tooltip>
          <tooltip v-else-if="connection.error" :content="connection.error" position="bottom"><i
              class="mdi mdi-alert-circle-outline red"></i></tooltip>
            </div>
          <div class="flex relative-container button-container float-right">

            <button class="button" @click="connectionModelVisible[connection.name] = true">
              {{ connection.model || 'Set Model' }}
            </button>

            <div v-if="connectionModelVisible[connection.name]" class="absolute-form override-left">
              <form @submit.prevent="submitConnectionModel(connection.name)">
                <div>
                  <label for="connection-model">Model</label>
                  <select v-model="connectionDetails.model" id="connection-model" required>
                    <option v-for="model in modelList" :key="model" :value="model">
                      {{ model }}
                    </option>
                  </select>
                </div>

                <button type="submit">Submit</button>
                <button type="button"
                  @click="connectionModelVisible[connection.name] = !connectionModelVisible[connection.name]">Close</button>
              </form>
            </div>
          </div>


          <loading-button :action="() => resetConnection(connection)"><i :class="connection.connected? 'mdi mdi-refresh' : 'mdi mdi-connection'"></i></loading-button>
        </div>


      </div>
    </li>

  </sidebar-list>
</template>

<style scoped>
.override-left {
  left: -150px;
}
.connection-parts {
  width:100%;
}

.padding-left {
  padding-left: 5px;
  flex: 3;
}


.float-right {
  flex:1;
}

.green {
  color: green;
}

.red {
  color: red;
}


input,
select {
  font-size: 12px;
  border: 1px solid #ccc;
  /* Light gray border for inputs */
  border-radius: 0;
  /* Sharp corners */
  width: 95%;
  /* Full width of the container */
}

input:focus,
select:focus {
  border-color: #4b4b4b;
  /* Dark gray border on focus */
  outline: none;
}

.connection-item {
  display: flex;
  justify-content: flex-start;
  align-items: center;
  /* border: 1px solid var(--border-light); */
  padding: 2px;
}

.connection-content {
  display: flex;
  justify-content: flex-start;
  padding-left: 5px;
  width: 100%;
  font-size: 15px;
}

.connection-connection {
  text-align: right;
  flex-grow: 1;
  /* Makes the connection name take up remaining space */
}
.button {
  min-width:60px;
  white-space: nowrap;
}
</style>



<script lang="ts">
import { inject, ref } from 'vue';
import type { ConnectionStoreType } from '../stores/connectionStore';
import type { ModelConfigStoreType } from '../stores/modelStore';
import ConnectionCreator from './ConnectionCreator.vue'
import Connection from '../connections/base';
import SidebarList from './SidebarList.vue';
import LoadingButton from './LoadingButton.vue';
import Tooltip from './Tooltip.vue';

export default {
  name: "ConnectionList",
  props: {
  },
  setup() {
    const connectionStore = inject<ConnectionStoreType>('connectionStore');
    const modelStore = inject<ModelConfigStoreType>('modelStore');
    const saveConnections = inject<Function>('saveConnections');
    if (!connectionStore || !modelStore || !saveConnections) {
      throw new Error('Connection store is not provided!');
    }
    const connectionModelVisible = ref<Record<string, boolean>>({});
    const connectionDetails = ref({
      model: '',
    });

    const submitConnectionModel = (connection: string) => {
      if (connectionDetails.value.model) {
        connectionStore.connections[connection].model = connectionDetails.value.model;
      }
      connectionModelVisible.value[connection] = false;
    };

    return { connectionStore, connectionModelVisible, connectionDetails, submitConnectionModel, saveConnections, modelStore };

  },
  computed: {
    connections() {
      return Object.values(this.connectionStore.connections);
    },
    modelList() {
      return Object.keys(this.modelStore.models);
    }
  },
  components: {
    ConnectionCreator,
    LoadingButton,
    SidebarList,
    Tooltip,
  },
  methods: {
    resetConnection(connection: Connection) {
      return this.connectionStore.resetConnection(connection.name)
    },
    // login() {
    //   const client = google.accounts.oauth2.initTokenClient({
    //     client_id: '734709568634-3u732kjmtp8e4bi6te0g7uo9278k104i.apps.googleusercontent.com',
    //     scope: 'https://www.googleapis.com/auth/calendar.readonly',
    //     callback: (response) => {
    //       console.log(response)
    //     },
    //     error_callback: (error) => {
    //       console.log("Handle the error", error)
    //     },
    //   });
    //   client.requestAccessToken()
    // }
  },
};
</script>