<template>
  <details class="provenance-footer no-drag" :open="initiallyOpen">
    <summary class="provenance-summary">
      <span class="provenance-icon" aria-hidden="true">i</span>
      <span class="provenance-label">Provenance</span>
      <span v-if="provenance.confidence" class="conf-chip" :class="`conf-${provenance.confidence}`">
        {{ provenance.confidence }} confidence
      </span>
      <span v-if="provenance.dataSource" class="provenance-source"
        >· {{ provenance.dataSource }}</span
      >
      <span v-if="provenance.rowCount !== undefined" class="provenance-rows"
        >· {{ provenance.rowCount }} rows</span
      >
      <span class="provenance-freshness">· {{ formattedFreshness }}</span>
    </summary>
    <dl class="provenance-grid">
      <template v-if="provenance.confidenceRationale">
        <dt>Confidence rationale</dt>
        <dd>{{ provenance.confidenceRationale }}</dd>
      </template>
      <template v-if="provenance.caveat">
        <dt>Caveat</dt>
        <dd>{{ provenance.caveat }}</dd>
      </template>
      <template v-if="provenance.drilldown">
        <dt>Next drilldown</dt>
        <dd>{{ provenance.drilldown }}</dd>
      </template>
      <template v-if="provenance.filters.length > 0">
        <dt>Filters</dt>
        <dd>
          <ul class="filter-list">
            <li v-for="(f, idx) in provenance.filters" :key="idx">
              <span class="filter-source">[{{ f.source }}]</span>
              <code>{{ f.expression }}</code>
            </li>
          </ul>
        </dd>
      </template>
      <template v-if="hasParameters">
        <dt>Parameters</dt>
        <dd>
          <code>{{ formattedParameters }}</code>
        </dd>
      </template>
      <template v-if="provenance.error">
        <dt>Last error</dt>
        <dd class="provenance-error">{{ provenance.error }}</dd>
      </template>
      <template v-if="provenance.query">
        <dt>Query</dt>
        <dd>
          <pre class="provenance-query"><code>{{ provenance.query }}</code></pre>
        </dd>
      </template>
      <template v-else-if="provenance.noQuery">
        <dt>Query</dt>
        <dd class="provenance-muted">No data binding — this block is authored prose only.</dd>
      </template>
    </dl>
  </details>
</template>

<script lang="ts">
import { defineComponent, computed, type PropType } from 'vue'
import type { Provenance } from '../../dashboards/provenance'

export default defineComponent({
  name: 'DashboardProvenance',
  props: {
    provenance: {
      type: Object as PropType<Provenance>,
      required: true,
    },
    initiallyOpen: { type: Boolean, default: false },
  },
  setup(props) {
    const formattedFreshness = computed(() => {
      const d = props.provenance.freshness
      try {
        return d.toLocaleString()
      } catch {
        return d.toISOString()
      }
    })
    const hasParameters = computed(() => {
      const p = props.provenance.parameters
      return !!p && Object.keys(p).length > 0
    })
    const formattedParameters = computed(() =>
      hasParameters.value ? JSON.stringify(props.provenance.parameters) : '',
    )
    return { formattedFreshness, hasParameters, formattedParameters }
  },
})
</script>

<style scoped>
.provenance-footer {
  border-top: 1px dashed var(--border, #d6dde6);
  padding: 6px 0 0;
  margin-top: 8px;
  font-size: 12px;
  color: var(--muted, #475569);
}

.provenance-summary {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  list-style: none;
  user-select: none;
  padding: 4px 0;
}

.provenance-summary::-webkit-details-marker {
  display: none;
}

.provenance-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 999px;
  border: 1px solid currentColor;
  font-size: 10px;
  font-weight: 700;
  font-style: italic;
  font-family: serif;
  opacity: 0.75;
}

.provenance-label {
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  font-size: 10.5px;
}

.conf-chip {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 999px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.conf-high {
  background: rgba(16, 185, 129, 0.16);
  color: #047857;
}
.conf-medium {
  background: rgba(245, 158, 11, 0.16);
  color: #b45309;
}
.conf-low {
  background: rgba(239, 68, 68, 0.16);
  color: #b91c1c;
}

.provenance-source,
.provenance-rows,
.provenance-freshness {
  font-size: 11px;
  opacity: 0.85;
}

.provenance-grid {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 4px 12px;
  margin: 6px 0 4px;
}

.provenance-grid dt {
  font-weight: 600;
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--muted, #64748b);
  align-self: start;
  padding-top: 2px;
}

.provenance-grid dd {
  margin: 0;
  font-size: 12.5px;
  color: var(--fg, #1f2937);
  word-break: break-word;
}

.filter-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.filter-source {
  font-weight: 600;
  color: var(--accent, #2563eb);
  margin-right: 4px;
  font-size: 11px;
}

.provenance-query {
  margin: 0;
  padding: 6px 8px;
  background: rgba(127, 127, 127, 0.08);
  border-radius: 6px;
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 11.5px;
  white-space: pre-wrap;
  word-break: break-word;
}

.provenance-error {
  color: #b91c1c;
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 11.5px;
}

.provenance-muted {
  color: var(--muted, #64748b);
  font-style: italic;
}
</style>
