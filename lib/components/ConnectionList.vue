<template>
  <sidebar-list title="Connections">
    <template #actions>
      <connection-creator />
    </template>
    <!-- <button @click="login">Login Using Google</button> -->
    <li v-for="connection in connections" :key="connection.name"
      class="connection-item p-2 cursor-pointer hover:bg-gray-200 rounded">
      <div class="connection-content">
        <tooltip content="DuckDB" v-if="connection.type == 'duckdb'"><i class="mdi mdi-duck"></i>
        </tooltip>
        <tooltip content="MotherDuck" v-else-if="connection.type == 'motherduck'">M<i class="mdi mdi-duck"></i>
        </tooltip>
        <tooltip content="Trilogy Editor" v-else> <i class="mdi mdi-alpha-t-box-outline"></i></tooltip>
        <span class="padding-left">{{ connection.name }}

          <tooltip v-if="connection.connected" content="Connected" position="bottom"><i class="mdi mdi-check green"></i>
          </tooltip>
          <tooltip v-else-if="connection.error" :content="connection.error" position="bottom"><i
              class="mdi mdi-alert-circle-outline red"></i></tooltip>
          <loading-button :action="() => resetConnection(connection)"><i class="mdi mdi-refresh"></i></loading-button>
        </span>

      </div>
    </li>

  </sidebar-list>
</template>

<style scoped>
.green {
  color: green;
}

.red {
  color: red;
}

.padding-left {
  padding-left: 5px;
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
</style>





<script lang="ts">
import { inject } from 'vue';
import type { ConnectionStoreType } from '../stores/connectionStore';
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
    if (!connectionStore) {
      throw new Error('Connection store is not provided!');
    }
    return { connectionStore }

  },
  computed: {
    connections() {
      return Object.keys(this.connectionStore.connections).map((name) => this.connectionStore.connections[name]);
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