<script setup lang="ts">
import { computed } from 'vue'
import { useDashboardStore } from '@lib/stores/dashboardStore'
import ReportLayout from '@lib/components/dashboard/ReportLayout.vue'
import Dashboard from '@lib/components/dashboard/Dashboard.vue'

/**
 * Middle-pane wrapper for an opened dashboard / report. Picks the renderer
 * based on layoutType: 'report' goes through ReportLayout (single-column
 * narrative flow), 'grid' goes through the legacy Dashboard component.
 *
 * Reports and grid dashboards share the same persisted model — only the
 * renderer differs.
 */
const props = defineProps<{ dashboardId: string }>()
const emit = defineEmits<{ close: [] }>()

const dashboardStore = useDashboardStore()

const dashboard = computed(() => dashboardStore.dashboards[props.dashboardId] || null)
const isReport = computed(() => dashboard.value?.layoutType === 'report')
</script>

<template>
  <section class="report-view">
    <div v-if="!dashboard" class="report-empty">
      <p>
        This report is no longer available. It may have been deleted or detached from the project.
      </p>
      <button class="dismiss" @click="emit('close')">Dismiss</button>
    </div>
    <ReportLayout
      v-else-if="isReport"
      :name="dashboardId"
      :connectionId="dashboard.connectionId"
      externalChat
    />
    <Dashboard v-else :name="dashboardId" :connectionId="dashboard.connectionId" />
  </section>
</template>

<style scoped>
.report-view {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  height: 100%;
  width: 100%;
  background: var(--bg, #f6f8fb);
}

.report-empty {
  margin: auto;
  padding: 24px;
  text-align: center;
  color: var(--muted, #64748b);
  display: flex;
  flex-direction: column;
  gap: 14px;
  align-items: center;
}

.dismiss {
  padding: 6px 14px;
  border-radius: 8px;
  border: 1px solid var(--border, #d6dde6);
  background: var(--bg, #ffffff);
  cursor: pointer;
  font-weight: 500;
}
.dismiss:hover {
  background: rgba(127, 127, 127, 0.06);
}
</style>
