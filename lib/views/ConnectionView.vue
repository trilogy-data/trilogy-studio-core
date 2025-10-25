<template>
  <div class="view-container">
    <ConnectionHistory v-if="selectedType === 'connection'" :connectionName="selectedConnection" />
    <div v-else-if="selectedType === 'table' && selectedTableDetails" class="model-display">
      <ConnectionTable
        :table="selectedTableDetails"
        :database="selectedDatabase"
        :connectionName="selectedConnection"
      />
    </div>
    <div v-else-if="selectedType === 'schema' && selectedSchemaDetails">
      <ConnectionSchema :schema="selectedSchemaDetails" :connectionName="selectedConnection" />
    </div>
    <div v-else-if="selectedType === 'database' && selectedDatabaseDetails">
      <ConnectionDatabase
        :database="selectedDatabaseDetails"
        :connectionName="selectedConnection"
      />
    </div>
    <div v-else>
      <div class="no-selection">
        <h2>Use menu navigation to select a connection, database, schema, or table.</h2>
      </div>
    </div>
  </div>
</template>

<style scoped>
.view-container {
  height: 100%;
  width: 100%;
  background-color: var(--query-window-bg);
}
.no-selection {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
  width: 100%;
}
.model-display {
  height: 100%;
  overflow-y: hidden;
}
</style>

<script lang="ts">
import { defineComponent, inject, ref } from 'vue'
import type { ModelConfigStoreType } from '../stores/modelStore'
import type { ConnectionStoreType } from '../stores/connectionStore'
import ConnectionTable from '../components/connection/ConnectionTable.vue'
import ConnectionDatabase from '../components/connection/ConnectionDatabase.vue'
import ConnectionSchema from '../components/connection/ConnectionSchema.vue'
import { KeySeparator } from '../data/constants'
import ConnectionHistory from '../components/connection/ConnectionHistory.vue'
export default defineComponent({
  name: 'ConnectionView',
  props: {
    activeConnectionKey: {
      type: String,
      required: true,
    },
  },
  setup() {
    const sourceDetails = ref({
      name: '',
      alias: '',
    })

    const modelStore = inject<ModelConfigStoreType>('modelStore')
    const connectionStore = inject<ConnectionStoreType>('connectionStore')
    if (!modelStore || !connectionStore) {
      throw new Error('Missing store injection')
    }
    return {
      modelStore,
      connectionStore,
      sourceDetails,
    }
  },
  components: {
    ConnectionTable,
    ConnectionHistory,
    ConnectionDatabase,
    ConnectionSchema,
  },
  computed: {
    selectedType() {
      if (this.separatorCount === 1) {
        return 'connection'
      } else if (this.separatorCount === 2) {
        return 'database'
      } else if (this.separatorCount === 3) {
        return 'schema'
      } else if (this.separatorCount === 4) {
        return 'table'
      }
    },
    separatorCount() {
      // This is used to determine the level of the selected path
      return this.activeConnectionKey.split(KeySeparator).length
    },
    selectedPath() {
      return this.activeConnectionKey.split(KeySeparator).slice(1)
    },
    selectedTable() {
      return this.activeConnectionKey.split(KeySeparator)[3]
    },
    selectedSchema() {
      return this.activeConnectionKey.split(KeySeparator)[2]
    },
    selectedConnection() {
      return this.activeConnectionKey.split(KeySeparator)[0]
    },
    selectedDatabase() {
      return this.activeConnectionKey.split(KeySeparator)[1]
    },
    selectedDatabaseDetails() {
      return this.connectionStore.connections[this.selectedConnection]?.databases?.find(
        (db) => db.name === this.selectedDatabase,
      )
    },
    selectedSchemaDetails() {
      return this.selectedDatabaseDetails?.schemas?.find(
        (schema) => schema.name === this.selectedSchema,
      )
    },
    selectedTableDetails() {
      return this.connectionStore.connections[this.selectedConnection].getLocalTable(
        this.selectedDatabase,
        this.selectedSchema,
        this.selectedTable,
      )
    },
  },
  methods: {
    saveEditorsCall() {
      this.$emit('save-editors')
    },
  },
})
</script>
