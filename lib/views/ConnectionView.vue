<template>
  <div class="view-container">
    <ConnectionHistory
      v-if="selectedType === 'connection'"
      :connectionName="selectedConnection"
      :connectionId="selectedConnectionRef?.id || selectedConnectionKey"
    />
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
        <h3>
          This saved item address is not loadable; you may need to establish the connection and
          refresh databases/schemas to view it.
        </h3>
      </div>
    </div>
  </div>
</template>

<style scoped>
.view-container {
  height: 100%;
  width: 100%;
  background-color: var(--query-window-bg);
  padding: 0;
  overflow: hidden;
}

.no-selection {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
  width: 100%;
  padding: 24px;
  color: var(--text-faint);
  text-align: center;
}

.no-selection h3 {
  max-width: 720px;
  margin: 0;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.55;
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
    // Position [0] is the connection id (e.g. `local:foo`); the resolved
    // connection's display name is what child components want to render.
    selectedConnectionKey() {
      return this.activeConnectionKey.split(KeySeparator)[0]
    },
    selectedConnectionRef() {
      return (
        this.connectionStore.connections[this.selectedConnectionKey] ||
        this.connectionStore.connectionByName(this.selectedConnectionKey) ||
        null
      )
    },
    selectedConnection() {
      return this.selectedConnectionRef?.name || this.selectedConnectionKey
    },
    selectedDatabase() {
      return this.activeConnectionKey.split(KeySeparator)[1]
    },
    selectedDatabaseDetails() {
      return this.selectedConnectionRef?.databases?.find(
        (db: any) => db.name === this.selectedDatabase,
      )
    },
    selectedSchemaDetails() {
      return this.selectedDatabaseDetails?.schemas?.find(
        (schema: any) => schema.name === this.selectedSchema,
      )
    },
    selectedTableDetails() {
      return this.selectedConnectionRef?.getLocalTable(
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
