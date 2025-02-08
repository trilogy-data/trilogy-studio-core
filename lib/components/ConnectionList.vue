<template>
  <sidebar-list title="Connections">
    <template #actions>
      <connection-creator />
    </template>

      <li v-for="connection in connections" :key="connection.name"
        class="connection-item p-2 cursor-pointer hover:bg-gray-200 rounded">
        <div class="connection-content">
          <tooltip content="DuckDB" v-if="connection.type == 'duckdb'"><i class="mdi mdi-duck"></i>
          </tooltip>
          <tooltip content="MotherDuck" v-else-if="connection.type == 'motherduck'">M<i class="mdi mdi-duck"></i>
          </tooltip>
          <tooltip content="Trilogy Editor" v-else> <i class="mdi mdi-alpha-t-box-outline"></i></tooltip>
          <span class="padding-left">{{ connection.name }} <tooltip  v-if="connection.connected" content="Connected"><i class="mdi mdi-check green"></i></tooltip> <loading-button
              :action="() => resetConnection(connection)"><i class="mdi mdi-refresh"></i></loading-button></span>
              
        </div>
      </li>

  </sidebar-list>
</template>

<style scoped>
.green {
  color: green;
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
      console.log('restting connection')
      return this.connectionStore.resetConnection(connection.name)
    }
  },
};
</script>