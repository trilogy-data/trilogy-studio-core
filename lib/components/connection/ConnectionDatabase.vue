<template>
  <div class="database-display">
    <div class="database-display-body">
      <h2 class="header">
        <span>{{ connectionName }}</span>
        <span class="separator">/</span>
        <span class="database-name">{{ database.name }}</span>
      </h2>

      <div class="metadata-section">
        <div class="section-header">
          <h3>Database Overview</h3>
          <!-- <button 
          class="refresh-button" 
          @click="refreshDatabase" 
          :disabled="isRefreshing"
        >
          <span v-if="isRefreshing">Refreshing...</span>
          <span v-else>Refresh</span>
        </button> -->
        </div>

        <div class="metadata-grid">
          <div class="metadata-item">
            <span class="metadata-label">Name:</span>
            <span class="metadata-value">{{ database.name }}</span>
          </div>
          <div class="metadata-item">
            <span class="metadata-label">Schemas:</span>
            <span class="metadata-value">{{ database.schemas.length }}</span>
          </div>
        </div>
      </div>

      <div class="schemas-section">
        <h3>Schemas</h3>
        <div class="schemas-list">
          <div
            v-for="schema in database.schemas"
            :key="schema.name"
            class="schema-item"
            @click="selectSchema(schema.name)"
          >
            <div class="schema-name">{{ schema.name }}</div>
            <div class="schema-details">
              <span class="table-count"
                >{{ schema.tables.length }} tables
                <LoadingButton class="refresh-class" :action="() => refreshSchema(schema.name)"
                  >Refresh</LoadingButton
                ></span
              >
              <span class="schema-description" v-if="schema.description">{{
                schema.description
              }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.database-display {
  width: 100%;
}

.database-display-body {
  padding: 1rem;
}

.header {
  display: flex;
  align-items: center;
  margin-bottom: 1.5rem;
  font-size: 1.25rem;
  font-weight: 600;
}

.separator {
  margin: 0 0.5rem;
  color: var(--text-muted);
}

.database-name {
  color: var(--text-primary);
}

.metadata-section,
.schemas-section {
  background-color: var(--surface-card);
  border-radius: var(--border-radius);
  padding: 1rem;
  margin-bottom: 1.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 0.5rem;
}

.section-header h3 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}

.refresh-button {
  background-color: var(--button-bg);
  color: var(--button-text);
  border: none;
  border-radius: var(--border-radius);
  padding: 0.25rem 0.75rem;
  font-size: 0.875rem;
  cursor: pointer;
  transition: background-color 0.2s;
}

.refresh-button:hover:not(:disabled) {
  background-color: var(--button-hover-bg);
}

.refresh-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.metadata-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 1rem;
}

.metadata-item {
  display: flex;
  flex-direction: column;
}

.metadata-label {
  font-size: 0.875rem;
  color: var(--text-muted);
  margin-bottom: 0.25rem;
}

.metadata-value {
  font-weight: 500;
}

.schemas-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 0.75rem;
}

.schema-item {
  background-color: var(--surface-hover);
  border-radius: var(--border-radius);
  padding: 0.75rem;
  cursor: pointer;
  transition: background-color 0.2s;
}

.schema-item:hover {
  background-color: var(--surface-active);
}

.schema-name {
  font-weight: 500;
  margin-bottom: 0.25rem;
}

.schema-details {
  display: flex;
  flex-direction: column;
  font-size: 0.875rem;
  color: var(--text-muted);
}

.table-count {
  margin-bottom: 0.25rem;
}

.schema-description {
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  line-clamp: 2;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
</style>

<script lang="ts">
import { defineComponent, type PropType, ref, inject } from 'vue'
import type { Database } from '../../connections'
import type { ConnectionStoreType } from '../../stores/connectionStore'
import LoadingButton from './LoadingButton.vue'

export default defineComponent({
  name: 'ConnectionDatabases',
  props: {
    database: {
      type: Object as PropType<Database>,
      required: true,
    },
    connectionName: {
      type: String,
      required: true,
    },
  },
  components: {
    LoadingButton,
  },
  emits: ['schema-selected', 'refresh-database', 'refresh-schema'],
  setup(props, { emit }) {
    const isRefreshing = ref(false)
    const connectionStore = inject<ConnectionStoreType>('connectionStore')
    const refreshMap = ref<Map<string, boolean>>(new Map())
    if (!connectionStore) {
      throw new Error('Connection store not found')
    }

    const refreshDatabase = async () => {
      isRefreshing.value = true
      try {
        // Event to trigger database refresh in parent
        emit('refresh-database', props.database.name)
      } finally {
        isRefreshing.value = false
      }
    }

    const refreshSchema = async (schema: string) => {
      refreshMap.value.set(schema, true)
      try {
        await connectionStore.connections[props.connectionName].refreshSchema(
          props.database.name,
          schema,
        )
      } finally {
        refreshMap.value.set(schema, false)
      }
    }

    const selectSchema = (schemaName: string) => {
      emit('schema-selected', props.database.name, schemaName)
    }

    return {
      isRefreshing,
      refreshDatabase,
      refreshMap,
      refreshSchema,
      selectSchema,
    }
  },
})
</script>
