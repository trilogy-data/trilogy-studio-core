<template>
    <div class="editor-list">
      <h2 class="text-lg font-bold mb-2">Connections</h2>
      <ul class="space-y-1">
        <li v-for="connection in connections" :key="connection.name" class="editor-item p-2 cursor-pointer hover:bg-gray-200 rounded">
          <div class="editor-content">
            <span>[{{ connection.type }}] {{ connection.name }} {{ connection.connected }} <loading-button :action="()=>resetConnection(connection)">reset</loading-button></span>
          </div>
        </li>
      </ul>
      <connection-creator />
    </div>
  </template>
  
  <style scoped>
  .editor-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border: 1px solid var(--border-light);
    padding: 2px;
  }
  
  .editor-list {
    border: 1px solid var(--border-light);
    border-radius: 0px;
    padding: 16px;
    height: 100%;
  }
  
  .editor-content {
    display: flex;
    justify-content: space-between;
    width: 100%;
  }
  
  .editor-connection {
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
  import LoadingButton from './LoadingButton.vue'
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
      LoadingButton
    },
    methods: {
      resetConnection(connection:Connection) {
        console.log('restting connection')
        return this.connectionStore.resetConnection(connection.name)
      } 
    },
  };
  </script>
  