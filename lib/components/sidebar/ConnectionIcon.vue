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
    default: 'Database Connection',
  }
  return typeMap[props.connectionType || 'default']
})
</script>

<style scoped>
.motherduck-icon {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}
</style>
