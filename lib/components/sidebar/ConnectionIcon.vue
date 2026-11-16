<template>
  <tooltip :content="tooltipContent">
    <template v-if="connectionType === 'duckdb'">
      <i class="mdi mdi-duck"></i>
    </template>
    <template v-else-if="connectionType === 'motherduck'">
      <img :src="motherduckIcon" class="motherduck-icon" alt="MotherDuck" />
    </template>
    <template v-else-if="connectionType === 'bigquery-oauth'">
      <i class="mdi mdi-google"></i>
    </template>
    <template v-else-if="connectionType === 'bigquery'">
      <i class="mdi mdi-google"></i>
    </template>
    <template v-else-if="connectionType === 'remote-worker:databricks'">
      <!-- Stacked-layers mark in Databricks red. -->
      <svg
        class="databricks-icon"
        data-testid="databricks-connection-icon"
        viewBox="0 0 24 24"
        role="img"
        aria-label="Databricks"
      >
        <path
          fill="#FF3621"
          d="M12 2 2 7.6l10 5.6 10-5.6L12 2Zm0 13.4L4.2 11 2 12.3l10 5.6 10-5.6-2.2-1.3L12 15.4Zm0 4.7-7.8-4.4L2 17l10 5 10-5-2.2-1.3L12 20.1Z"
        />
      </svg>
    </template>
    <template v-else>
      <i class="mdi mdi-database"></i>
    </template>
  </tooltip>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import Tooltip from '../Tooltip.vue'
import motherduckIcon from '../../static/motherduck.png'

export interface ConnectionIconProps {
  connectionType?: string
}

const props = defineProps<ConnectionIconProps>()

// Dynamically generate tooltip content based on connection type
const tooltipContent = computed(() => {
  const typeMap: Record<string, string> = {
    duckdb: 'DuckDB',
    motherduck: 'MotherDuck',
    'bigquery-oauth': 'BigQuery',
    snowflake: 'Snowflake',
    'snowflake-pat': 'Snowflake',
    'remote-worker:databricks': 'Databricks (Beta)',
    'remote-worker:duckdb': 'DuckDB (Native)',
    remote: 'Remote Project',
    default: 'Database Connection',
  }
  return typeMap[props.connectionType || 'default'] || props.connectionType || ''
})
</script>

<style scoped>
.motherduck-icon {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

.databricks-icon {
  width: 12px;
  height: 12px;
  vertical-align: middle;
}
</style>
