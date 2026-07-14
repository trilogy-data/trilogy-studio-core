<template>
  <div class="appendix-header no-drag">
    <span class="appendix-eyebrow">Appendix</span>
    <span class="appendix-label">{{ label }}</span>
    <span class="appendix-rule" aria-hidden="true"></span>
  </div>
</template>

<script lang="ts">
import { defineComponent, computed, type PropType } from 'vue'
import type { GridItemDataResponse } from '../../dashboards/base'

/**
 * Visual divider that introduces the appendix section of a report. Pure
 * presentation — carries no query, no live data. The `name` field of the cell
 * is the user-visible label (e.g. "Detail tables", "Methodology").
 */
export default defineComponent({
  name: 'DashboardAppendixHeader',
  props: {
    dashboardId: { type: String, required: true },
    itemId: { type: String, required: true },
    getItemData: {
      type: Function as PropType<(itemId: string, dashboardId: string) => GridItemDataResponse>,
      required: true,
    },
  },
  setup(props) {
    const itemData = computed(() => props.getItemData(props.itemId, props.dashboardId))
    const rawLabel = computed(() =>
      (itemData.value.name || 'Appendix').replace(/^#+\s*/, '').trim(),
    )
    return { label: rawLabel }
  },
})
</script>

<style scoped>
.appendix-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 0 6px;
}

.appendix-eyebrow {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted, #64748b);
}

.appendix-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--fg, #1f2937);
}

.appendix-rule {
  flex: 1 1 auto;
  height: 1px;
  background: var(--border, #d6dde6);
  opacity: 0.85;
}
</style>
