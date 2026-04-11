<script setup lang="ts">
import { computed, nextTick, ref, watch, type PropType } from 'vue'
import type { ResultColumn, Row } from '../../editors/results'
import { ColumnType } from '../../editors/results'
import type { CrossFilterEntry, CrossFilterScalar } from '../../dashboards/conditions'
import { useClickOutside } from '../../composables/useClickOutside'

export interface SelectOption {
  label: string
  value: CrossFilterScalar
}

const props = defineProps({
  headers: {
    type: Map<String, ResultColumn>,
    required: true,
  },
  results: {
    type: Array as PropType<readonly Row[]>,
    required: true,
  },
  containerHeight: Number,
  prettyPrint: {
    type: Boolean,
    default: false,
  },
  fitParent: {
    type: Boolean,
    default: false,
  },
  initialSelection: {
    type: Array as PropType<CrossFilterScalar[]>,
    default: () => [],
  },
})

const emit = defineEmits<{
  (e: 'cell-click', payload: { filters: Record<string, CrossFilterEntry>; append: boolean }): void
  (e: 'background-click'): void
}>()

// ── State ──────────────────────────────────────────────────────────────────
// selectedValues = committed selections (applied to the dashboard).
// draftValues    = pending selections while the dropdown is open; only
//                  promoted to selectedValues on Apply.
const selectedValues = ref<CrossFilterScalar[]>([...(props.initialSelection ?? [])])
const draftValues = ref<CrossFilterScalar[]>([])
const searchText = ref('')
const showDropdown = ref(false)
const triggerRef = ref<HTMLElement | null>(null)
const dropdownRef = ref<HTMLElement | null>(null)
const searchInputRef = ref<HTMLInputElement | null>(null)

// ── Derived column/option info ────────────────────────────────────────────
const headersArray = computed(() => Array.from(props.headers.values()))
const displayColumn = computed<ResultColumn | null>(() => headersArray.value[0] || null)
const valueColumn = computed<ResultColumn | null>(
  () => headersArray.value[1] || headersArray.value[0] || null,
)

function formatValue(value: any, column: ResultColumn): string {
  switch (column.type) {
    case ColumnType.FLOAT:
      if (column.traits?.includes('usd')) {
        return `$${Number(value).toFixed(column.scale || 2)}`
      } else if (column.traits?.includes('percent')) {
        return `${(Number(value) * 100).toFixed(2)}%`
      }
      return Number(value).toFixed(column.scale || 2)
    case ColumnType.DATETIME:
    case ColumnType.TIMESTAMP:
    case ColumnType.DATE:
    case ColumnType.TIME:
      if (value instanceof Date) {
        return value.toLocaleString()
      }
      return String(value)
    case ColumnType.BOOLEAN:
      return value ? '✓' : '✗'
    case ColumnType.ARRAY:
    case ColumnType.STRUCT:
      return JSON.stringify(value)
    default:
      return String(value)
  }
}

const selectOptions = computed<SelectOption[]>(() => {
  const display = displayColumn.value
  const value = valueColumn.value
  if (!display || !value || !props.results || props.results.length === 0) {
    return []
  }
  const displayFieldName = display.name
  const valueFieldName = value.name
  const options: SelectOption[] = []
  for (const row of props.results) {
    const displayValue = row[displayFieldName]
    const actualValue = row[valueFieldName]
    if (
      displayValue !== null &&
      displayValue !== undefined &&
      actualValue !== null &&
      actualValue !== undefined
    ) {
      options.push({
        label: formatValue(displayValue, display),
        value: actualValue as CrossFilterScalar,
      })
    }
  }
  return options
})

const labelByValue = computed<Map<CrossFilterScalar, string>>(() => {
  const m = new Map<CrossFilterScalar, string>()
  for (const opt of selectOptions.value) {
    m.set(opt.value, opt.label)
  }
  return m
})

const filteredOptions = computed<SelectOption[]>(() => {
  if (!searchText.value) {
    return selectOptions.value
  }
  const q = searchText.value.toLowerCase()
  return selectOptions.value.filter((o) => o.label.toLowerCase().includes(q))
})

const fieldLabel = computed(() => displayColumn.value?.name || 'Field')

const hasSelection = computed(() => selectedValues.value.length > 0)

const displayText = computed(() => {
  if (!selectOptions.value || selectOptions.value.length === 0) {
    return 'No data available'
  }
  if (selectedValues.value.length === 0) {
    return `All (${selectOptions.value.length})`
  }
  if (selectedValues.value.length === 1) {
    return labelByValue.value.get(selectedValues.value[0]) ?? String(selectedValues.value[0])
  }
  const firstLabel =
    labelByValue.value.get(selectedValues.value[0]) ?? String(selectedValues.value[0])
  return `${firstLabel} +${selectedValues.value.length - 1}`
})

const disabled = computed(() => !selectOptions.value || selectOptions.value.length === 0)

const allDraftSelected = computed(
  () =>
    filteredOptions.value.length > 0 &&
    filteredOptions.value.every((o) => draftValues.value.includes(o.value)),
)

// ── Dropdown positioning (Teleport fixed element) ─────────────────────────
const dropdownStyle = ref<Record<string, string>>({})

function updateDropdownPosition() {
  const el = triggerRef.value
  if (!el) {
    dropdownStyle.value = {}
    return
  }
  const rect = el.getBoundingClientRect()
  dropdownStyle.value = {
    position: 'fixed',
    top: `${rect.bottom + 4}px`,
    left: `${rect.left}px`,
    minWidth: `${rect.width}px`,
  }
}

// ── Dropdown open/close ───────────────────────────────────────────────────
function openDropdown() {
  if (disabled.value) return
  draftValues.value = [...selectedValues.value]
  searchText.value = ''
  showDropdown.value = true
  nextTick(() => {
    updateDropdownPosition()
    searchInputRef.value?.focus()
  })
}

function closeDropdown() {
  showDropdown.value = false
}

function toggleDropdown() {
  if (showDropdown.value) {
    closeDropdown()
  } else {
    openDropdown()
  }
}

useClickOutside(
  () => [triggerRef.value, dropdownRef.value],
  () => closeDropdown(),
  { enabled: () => showDropdown.value },
)

// Reposition on scroll/resize while open
function onReposition() {
  if (showDropdown.value) updateDropdownPosition()
}

watch(showDropdown, (open) => {
  if (open) {
    window.addEventListener('scroll', onReposition, true)
    window.addEventListener('resize', onReposition)
  } else {
    window.removeEventListener('scroll', onReposition, true)
    window.removeEventListener('resize', onReposition)
  }
})

// ── Selection mutations (draft) ───────────────────────────────────────────
function isDraftSelected(value: CrossFilterScalar): boolean {
  return draftValues.value.includes(value)
}

function toggleDraftOption(option: SelectOption) {
  const idx = draftValues.value.indexOf(option.value)
  if (idx === -1) {
    draftValues.value.push(option.value)
  } else {
    draftValues.value.splice(idx, 1)
  }
}

function toggleAllDraft() {
  if (allDraftSelected.value) {
    // Deselect everything in the current filtered view
    draftValues.value = draftValues.value.filter(
      (v) => !filteredOptions.value.some((o) => o.value === v),
    )
  } else {
    // Add every filtered option not already in the draft
    const next = [...draftValues.value]
    for (const o of filteredOptions.value) {
      if (!next.includes(o.value)) next.push(o.value)
    }
    draftValues.value = next
  }
}

function clearDraft() {
  draftValues.value = []
}

// ── Commit / clear ─────────────────────────────────────────────────────────
function emitSelection(values: CrossFilterScalar[]) {
  const field = valueColumn.value?.address || valueColumn.value?.name
  if (!field) return

  if (values.length === 0) {
    emit('background-click')
    return
  }

  const entry: CrossFilterEntry =
    values.length === 1
      ? { op: 'eq', value: values[0] }
      : { op: 'in', value: [...values] }

  emit('cell-click', {
    filters: { [field]: entry },
    append: false,
  })
}

function applyDraft() {
  selectedValues.value = [...draftValues.value]
  emitSelection(selectedValues.value)
  closeDropdown()
}

function clearAll() {
  selectedValues.value = []
  draftValues.value = []
  emitSelection([])
  closeDropdown()
}

// External selection changes (e.g., parent hydrates from saved state)
watch(
  () => props.initialSelection,
  (next) => {
    const incoming = next ?? []
    const same =
      incoming.length === selectedValues.value.length &&
      incoming.every((v, i) => v === selectedValues.value[i])
    if (!same) {
      selectedValues.value = [...incoming]
    }
  },
)

// ── Highlight helpers ──────────────────────────────────────────────────────
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function highlightMatch(label: string): string {
  const escaped = escapeHtml(label)
  if (!searchText.value) return escaped
  const q = searchText.value.toLowerCase()
  const idx = escaped.toLowerCase().indexOf(q)
  if (idx === -1) return escaped
  const before = escaped.slice(0, idx)
  const match = escaped.slice(idx, idx + searchText.value.length)
  const after = escaped.slice(idx + searchText.value.length)
  return `${before}<mark>${match}</mark>${after}`
}

function onTriggerKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
    e.preventDefault()
    openDropdown()
  }
}

function onDropdownKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    closeDropdown()
    triggerRef.value?.focus()
  } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault()
    applyDraft()
  }
}
</script>

<template>
  <div class="filter-tile">
    <div class="filter-label" :title="fieldLabel">{{ fieldLabel }}</div>

    <button
      ref="triggerRef"
      type="button"
      class="filter-trigger"
      :class="{
        'is-open': showDropdown,
        'has-selection': hasSelection,
        'is-disabled': disabled,
      }"
      :disabled="disabled"
      :aria-expanded="showDropdown"
      aria-haspopup="listbox"
      @click="toggleDropdown"
      @keydown="onTriggerKeydown"
    >
      <span class="filter-value" :class="{ muted: !hasSelection }">{{ displayText }}</span>

      <span
        v-if="hasSelection && selectedValues.length > 1"
        class="filter-count-badge"
        :title="`${selectedValues.length} selected`"
      >
        {{ selectedValues.length }}
      </span>

      <span
        v-if="hasSelection"
        class="filter-clear"
        role="button"
        tabindex="-1"
        title="Clear selection"
        @click.stop="clearAll"
      >
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
          <path
            d="M6 6l12 12M18 6L6 18"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            fill="none"
          />
        </svg>
      </span>

      <svg class="chevron" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path
          d="M6 9l6 6 6-6"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          fill="none"
        />
      </svg>
    </button>

    <Teleport to="body">
      <div
        v-if="showDropdown"
        ref="dropdownRef"
        class="filter-dropdown"
        :style="dropdownStyle"
        role="dialog"
        @keydown="onDropdownKeydown"
      >
        <div class="dropdown-search">
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
            <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2" fill="none" />
            <path
              d="m20 20-3.5-3.5"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            />
          </svg>
          <input
            ref="searchInputRef"
            v-model="searchText"
            type="text"
            class="dropdown-search-input"
            :placeholder="`Search ${fieldLabel.toLowerCase()}...`"
          />
        </div>

        <div class="dropdown-scroll">
          <label
            v-if="filteredOptions.length > 0"
            class="dropdown-item dropdown-item--all"
            @mousedown.prevent
          >
            <input
              type="checkbox"
              :checked="allDraftSelected"
              @change="toggleAllDraft"
            />
            <span>{{ searchText ? `Select ${filteredOptions.length} matching` : `All (${selectOptions.length})` }}</span>
          </label>

          <label
            v-for="(option, index) in filteredOptions"
            :key="index"
            class="dropdown-item"
            :class="{ selected: isDraftSelected(option.value) }"
            @mousedown.prevent
          >
            <input
              type="checkbox"
              :checked="isDraftSelected(option.value)"
              @change="toggleDraftOption(option)"
            />
            <span v-html="highlightMatch(option.label)"></span>
          </label>

          <div v-if="filteredOptions.length === 0" class="dropdown-empty">
            No matches found
          </div>
        </div>

        <div class="dropdown-footer">
          <button type="button" class="footer-btn" @click="clearDraft">Clear</button>
          <button type="button" class="footer-btn primary" @click="applyDraft">
            Apply{{ draftValues.length > 0 ? ` (${draftValues.length})` : '' }}
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.filter-tile {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  padding: 4px 12px 10px;
  background-color: transparent;
  box-sizing: border-box;
}

.filter-label {
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--text-color-muted, #64748b);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.filter-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 34px;
  padding: 6px 10px;
  font: inherit;
  font-size: 13px;
  color: var(--text-color, #111827);
  background-color: var(--result-window-bg, #ffffff);
  border: 1px solid var(--border-color, #d6dde6);
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease,
    box-shadow 0.15s ease;
}

.filter-trigger:hover:not(.is-disabled) {
  border-color: var(--text-color-muted, #64748b);
  background-color: var(--hover-bg, rgba(148, 163, 184, 0.08));
}

.filter-trigger:focus-visible {
  outline: none;
  border-color: var(--special-text, #2563eb);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
}

.filter-trigger.is-open {
  border-color: var(--special-text, #2563eb);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
}

.filter-trigger.has-selection {
  background-color: var(--result-window-bg, #ffffff);
  border-color: var(--special-text, #2563eb);
}

.filter-trigger.is-disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.filter-value {
  flex: 1 1 auto;
  min-width: 0;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.filter-value.muted {
  font-weight: 400;
  color: var(--text-color-muted, #64748b);
}

.filter-count-badge {
  flex-shrink: 0;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  font-size: 11px;
  font-weight: 600;
  line-height: 20px;
  text-align: center;
  color: #ffffff;
  background-color: var(--special-text, #2563eb);
  border-radius: 10px;
}

.filter-clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  color: var(--text-color-muted, #64748b);
  border-radius: 50%;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.filter-clear:hover {
  color: #ef4444;
  background-color: rgba(239, 68, 68, 0.12);
}

.chevron {
  flex-shrink: 0;
  color: var(--text-color-muted, #64748b);
  transition: transform 0.15s ease;
}

.filter-trigger.is-open .chevron {
  transform: rotate(180deg);
}

/* Dropdown (Teleported to body) */
.filter-dropdown {
  z-index: 9999;
  display: flex;
  flex-direction: column;
  max-height: 360px;
  min-width: 220px;
  background-color: var(--result-window-bg, #ffffff);
  border: 1px solid var(--border-color, #d6dde6);
  border-radius: 10px;
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.18);
  overflow: hidden;
}

.dropdown-search {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border-color, #d6dde6);
  color: var(--text-color-muted, #64748b);
}

.dropdown-search-input {
  flex: 1;
  min-width: 0;
  padding: 2px 0;
  font: inherit;
  font-size: 13px;
  color: var(--text-color, #111827);
  background: transparent;
  border: none;
  outline: none;
}

.dropdown-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 4px 0;
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  font-size: 13px;
  color: var(--text-color, #111827);
  cursor: pointer;
  user-select: none;
}

.dropdown-item > span {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dropdown-item:hover {
  background-color: var(--hover-bg, rgba(148, 163, 184, 0.12));
}

.dropdown-item.selected {
  background-color: rgba(37, 99, 235, 0.08);
}

.dropdown-item input[type='checkbox'] {
  flex-shrink: 0;
  width: 14px;
  height: 14px;
  margin: 0;
  accent-color: var(--special-text, #2563eb);
  cursor: pointer;
}

.dropdown-item--all {
  font-weight: 600;
  border-bottom: 1px solid var(--border-color, #d6dde6);
}

.dropdown-empty {
  padding: 12px;
  font-size: 12px;
  font-style: italic;
  text-align: center;
  color: var(--text-color-muted, #64748b);
}

.dropdown-footer {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  padding: 8px 10px;
  border-top: 1px solid var(--border-color, #d6dde6);
  background-color: var(--result-window-bg, #ffffff);
}

.footer-btn {
  padding: 5px 12px;
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-color, #111827);
  background-color: transparent;
  border: 1px solid var(--border-color, #d6dde6);
  border-radius: 6px;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease;
}

.footer-btn:hover {
  background-color: var(--hover-bg, rgba(148, 163, 184, 0.12));
}

.footer-btn.primary {
  color: #ffffff;
  background-color: var(--special-text, #2563eb);
  border-color: var(--special-text, #2563eb);
}

.footer-btn.primary:hover {
  filter: brightness(1.05);
}

.dropdown-scroll :deep(mark) {
  background-color: rgba(250, 204, 21, 0.55);
  color: inherit;
  font-weight: 600;
  padding: 0;
  border-radius: 2px;
}

/* Scrollbar styling */
.dropdown-scroll::-webkit-scrollbar {
  width: 8px;
}

.dropdown-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.dropdown-scroll::-webkit-scrollbar-thumb {
  background: var(--border-color, #888);
  border-radius: 4px;
}

.dropdown-scroll::-webkit-scrollbar-thumb:hover {
  background: var(--text-color-muted, #555);
}

/* Mobile adjustments */
@media (max-width: 768px) {
  .filter-tile {
    padding: 6px 12px 10px;
  }

  .filter-trigger {
    min-height: 38px;
    font-size: 14px;
  }

  .dropdown-search-input {
    font-size: 16px;
  }
}
</style>
