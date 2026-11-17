<template>
  <div ref="root" class="connection-picker" @focusout="onFocusOut">
    <button
      :id="id"
      type="button"
      class="picker-trigger sidebar-control-select"
      :data-testid="testId"
      aria-haspopup="listbox"
      :aria-expanded="open"
      @click="toggle"
      @keydown.down.prevent="openPicker"
    >
      <template v-if="selected">
        <connection-icon :connection-type="selected.type" />
        <span class="trigger-label">{{ selected.label }}</span>
      </template>
      <span v-else class="trigger-label placeholder">{{ placeholder }}</span>
      <i class="mdi mdi-chevron-down" aria-hidden="true"></i>
    </button>
    <div v-if="open" class="picker-panel">
      <input
        ref="search"
        v-model="query"
        type="text"
        class="sidebar-control-input picker-search"
        placeholder="Search connections"
        role="combobox"
        aria-autocomplete="list"
        :aria-controls="listId"
        :aria-activedescendant="activeOption ? optionId(activeOption) : undefined"
        :data-testid="`${testId}-search`"
        @keydown.down.prevent="move(1)"
        @keydown.up.prevent="move(-1)"
        @keydown.enter.prevent="activeOption && choose(activeOption)"
        @keydown.esc.prevent.stop="close(true)"
      />
      <ul :id="listId" class="picker-list" role="listbox">
        <template v-for="group in groups" :key="group.key">
          <li class="group-label" role="presentation">{{ group.label }}</li>
          <li
            v-for="option in group.options"
            :id="optionId(option)"
            :key="option.value"
            role="option"
            :aria-selected="option.value === modelValue"
            :class="{
              'picker-option': true,
              active: option === activeOption,
              selected: option.value === modelValue,
            }"
            :data-testid="`${testId}-option-${option.value}`"
            @mousedown.prevent="choose(option)"
            @mousemove="activeIndex = filtered.indexOf(option)"
          >
            <connection-icon :connection-type="option.type" />
            <span class="option-label">{{ option.label }}</span>
            <span v-if="option.detail" class="option-detail">{{ option.detail }}</span>
          </li>
        </template>
        <li v-if="filtered.length === 0" class="picker-empty" role="presentation">
          No matching connections
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import ConnectionIcon from '../sidebar/ConnectionIcon.vue'

export interface ConnectionPickerOption {
  /** The value emitted on selection: a connection name, or `new-<type>`. */
  value: string
  label: string
  /** Connection type, for the icon (e.g. `duckdb`, `remote-worker:databricks`). */
  type?: string
  /** Secondary text, also matched by the search. */
  detail?: string
  group: 'existing' | 'new'
}

const props = withDefaults(
  defineProps<{
    modelValue: string
    options: ConnectionPickerOption[]
    id?: string
    testId?: string
    placeholder?: string
  }>(),
  {
    id: 'connection-picker',
    testId: 'connection-picker',
    placeholder: 'Choose a connection',
  },
)

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const GROUP_LABELS: Record<ConnectionPickerOption['group'], string> = {
  existing: 'Existing connections',
  new: 'Create a new connection',
}

const root = ref<HTMLElement | null>(null)
const search = ref<HTMLInputElement | null>(null)
const open = ref(false)
const query = ref('')
const activeIndex = ref(0)
const listId = computed(() => `${props.id}-list`)

const selected = computed(() => props.options.find((o) => o.value === props.modelValue))

const filtered = computed(() => {
  const terms = query.value.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const matches = (o: ConnectionPickerOption) => {
    const haystack = `${o.label} ${o.detail ?? ''} ${o.value}`.toLowerCase()
    return terms.every((term) => haystack.includes(term))
  }
  // Grouped order, so keyboard order matches what is on screen.
  return (['existing', 'new'] as const).flatMap((g) =>
    props.options.filter((o) => o.group === g && matches(o)),
  )
})

const groups = computed(() =>
  (['existing', 'new'] as const)
    .map((key) => ({
      key,
      label: GROUP_LABELS[key],
      options: filtered.value.filter((o) => o.group === key),
    }))
    .filter((g) => g.options.length > 0),
)

const activeOption = computed(() => filtered.value[activeIndex.value])

watch(query, () => {
  activeIndex.value = 0
})

function optionId(option: ConnectionPickerOption) {
  return `${props.id}-option-${option.value.replace(/[^A-Za-z0-9_-]/g, '_')}`
}

async function openPicker() {
  if (open.value) return
  open.value = true
  query.value = ''
  const current = filtered.value.findIndex((o) => o.value === props.modelValue)
  activeIndex.value = Math.max(current, 0)
  await nextTick()
  search.value?.focus()
}

function close(refocus = false) {
  open.value = false
  if (refocus) {
    nextTick(() => root.value?.querySelector<HTMLButtonElement>('.picker-trigger')?.focus())
  }
}

function toggle() {
  if (open.value) close()
  else openPicker()
}

function move(step: number) {
  const count = filtered.value.length
  if (count === 0) return
  activeIndex.value = (activeIndex.value + step + count) % count
  nextTick(() => {
    const el = activeOption.value && document.getElementById(optionId(activeOption.value))
    el?.scrollIntoView?.({ block: 'nearest' })
  })
}

function choose(option: ConnectionPickerOption) {
  emit('update:modelValue', option.value)
  close(true)
}

function onFocusOut(event: FocusEvent) {
  const next = event.relatedTarget as Node | null
  if (!next || !root.value?.contains(next)) close()
}
</script>

<style scoped>
.connection-picker {
  position: relative;
  flex: 1;
  min-width: 0;
}

.picker-trigger {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-height: var(--sidebar-control-height);
  text-align: left;
  cursor: pointer;
}

.trigger-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.placeholder {
  color: var(--text-faint);
}

.picker-panel {
  position: absolute;
  z-index: 50;
  top: calc(100% + 2px);
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px;
  background: var(--bg-color);
  border: 1px solid var(--border);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18);
}

.picker-search {
  width: 100%;
  box-sizing: border-box;
}

.picker-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 240px;
  overflow-y: auto;
}

.group-label {
  padding: 4px 6px 2px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-faint);
}

.picker-option {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  font-size: var(--sidebar-control-font-size);
  cursor: pointer;
}

.picker-option.active {
  background: var(--button-mouseover);
}

.picker-option.selected .option-label {
  font-weight: 600;
}

.option-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.option-detail {
  margin-left: auto;
  padding-left: 8px;
  flex-shrink: 0;
  color: var(--text-faint);
  font-size: 11px;
}

.picker-empty {
  padding: 6px;
  color: var(--text-faint);
  font-size: var(--sidebar-control-font-size);
}
</style>
