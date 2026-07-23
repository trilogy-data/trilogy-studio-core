<template>
  <div class="mobile-tree-list" :class="{ 'mobile-tree-list-enabled': enabled }">
    <template v-if="!flat && view.mode === 'detail' && currentNode">
      <slot v-if="!isSelectable(currentNode)" name="item" :item="currentNode" :detail="true"></slot>
      <button
        v-if="isSelectable(currentNode)"
        type="button"
        class="mobile-tree-open"
        :data-testid="`mobile-tree-open-${listId}`"
        @click="emit('select', currentNode)"
      >
        <i class="mdi mdi-open-in-new"></i>
        <span>Open</span>
      </button>
      <div v-for="item in configItems" :key="itemKey(item)" class="mobile-tree-entry">
        <slot name="item" :item="item"></slot>
      </div>
      <div
        v-for="item in isSelectable(currentNode) ? childItems : []"
        :key="itemKey(item)"
        class="mobile-tree-entry"
      >
        <slot name="item" :item="item"></slot>
      </div>
      <button
        v-if="childItems.length && !isSelectable(currentNode)"
        type="button"
        class="mobile-tree-children"
        :data-testid="`mobile-tree-children-${listId}`"
        @click="openChildren"
      >
        <i class="mdi mdi-folder-outline"></i>
        <span>Children</span>
        <span class="mobile-tree-count">{{ childItems.length }}</span>
        <i class="mdi mdi-chevron-right"></i>
      </button>
    </template>
    <template v-else>
      <div v-for="item in visibleItems" :key="itemKey(item)" class="mobile-tree-entry">
        <slot name="item" :item="item"></slot>
        <div v-if="enabled && isBranch(item)" class="mobile-tree-branch-meta" aria-hidden="true">
          <span v-if="descendantLeafCount(item)">({{ descendantLeafCount(item) }})</span>
          <i class="mdi mdi-chevron-right"></i>
        </div>
      </div>
      <div
        v-if="enabled && !flat && view.mode !== 'root' && !visibleItems.length"
        class="mobile-tree-empty"
        :data-testid="`mobile-tree-empty-${listId}`"
      >
        {{ currentNode ? 'Nothing here.' : 'This item is no longer available.' }}
      </div>
    </template>
  </div>
</template>

<script setup lang="ts" generic="T extends Record<string, any>">
import { computed, reactive } from 'vue'
import useMobileSidebarNavigation from '../../stores/useMobileSidebarNavigation'

type TreeView = { mode: 'root' | 'detail' | 'children'; nodeKey: string | null }

const props = withDefaults(
  defineProps<{
    items: T[]
    /** Distinguishes this tree's test ids from the other sidebar lists. */
    listId: string
    idField?: string
    labelField?: string
    isBranch: (item: T) => boolean
    /** A branch which is also a loadable destination, rather than only a container. */
    isSelectable?: (item: T) => boolean
    /** A pure container which should skip the generic detail screen entirely. */
    isDirectBranch?: (item: T) => boolean
    /** A branch whose configuration is populated as part of expansion. */
    isDetailBranch?: (item: T) => boolean
    isConfig?: (item: T) => boolean
    enabled?: boolean
    /** Bypass the drill-down and render `items` as-is (search results). */
    flat?: boolean
  }>(),
  {
    idField: 'id',
    labelField: 'name',
    enabled: true,
    flat: false,
    isConfig: () => false,
    isSelectable: () => false,
    isDirectBranch: () => false,
    isDetailBranch: () => false,
  },
)
const emit = defineEmits<{
  expand: [item: T]
  select: [item: T]
  viewChange: [isRoot: boolean]
}>()
const navigation = useMobileSidebarNavigation()
const view = reactive<TreeView>({ mode: 'root', nodeKey: null })

const itemKey = (item: T) => String(item[props.idField] ?? item.key)
const itemLabel = (item: T) => String(item[props.labelField] ?? item.label ?? '')
const isBranch = (item: T) => props.isBranch(item)
const isSelectable = (item: T) => props.isSelectable(item)
const currentNode = computed(() => props.items.find((item) => itemKey(item) === view.nodeKey))
const descendants = computed(() => {
  if (!currentNode.value) return []
  const start = props.items.findIndex((item) => itemKey(item) === view.nodeKey)
  const depth = Number(currentNode.value.indent || 0)
  const result: T[] = []
  for (let index = start + 1; index < props.items.length; index++) {
    const item = props.items[index]
    const indent = Number(item.indent || 0)
    if (indent <= depth) break
    if (indent === depth + 1) result.push(item)
  }
  return result
})
const configItems = computed(() => descendants.value.filter((item) => props.isConfig(item)))
const childItems = computed(() => descendants.value.filter((item) => !props.isConfig(item)))
const visibleItems = computed(() => {
  if (!props.enabled || props.flat) return props.items
  if (view.mode === 'root') return props.items.filter((item) => Number(item.indent || 0) === 0)
  // Expanding a branch can be async (connections and LLM providers fetch their
  // contents). Until it resolves the only descendants are status rows — loading
  // or error — which `childItems` filters out as config. Fall back to them so a
  // pending expand reads as "loading", not as an unexplained blank screen.
  return childItems.value.length ? childItems.value : descendants.value
})

const setView = (next: TreeView) => {
  Object.assign(view, next)
  emit('viewChange', view.mode === 'root')
}
const restore = (previous: TreeView) => setView(previous)
const itemDescendants = (item: T, directOnly = false) => {
  const start = props.items.findIndex((candidate) => itemKey(candidate) === itemKey(item))
  if (start < 0) return []
  const depth = Number(item.indent || 0)
  const result: T[] = []
  for (let index = start + 1; index < props.items.length; index++) {
    const candidate = props.items[index]
    const indent = Number(candidate.indent || 0)
    if (indent <= depth) break
    if (!directOnly || indent === depth + 1) result.push(candidate)
  }
  return result
}
const descendantLeafCount = (item: T) =>
  itemDescendants(item).filter(
    (candidate) => !props.isBranch(candidate) && !props.isConfig(candidate),
  ).length
const openItem = (item: T) => {
  if (!props.isBranch(item)) return emit('select', item)
  emit('expand', item)
  const previous = { ...view }
  const hasConfig = itemDescendants(item, true).some((candidate) => props.isConfig(candidate))
  // Pure containers do not need an intermediate detail -> Children interaction.
  // Selectable parents keep that screen so the parent itself remains loadable.
  const needsDetail =
    !props.isDirectBranch(item) &&
    (props.isDetailBranch(item) || hasConfig || props.isSelectable(item))
  setView({ mode: needsDetail ? 'detail' : 'children', nodeKey: itemKey(item) })
  navigation.push({ title: itemLabel(item), onBack: () => restore(previous) })
}
const openChildren = () => {
  if (!currentNode.value) return
  const previous = { ...view }
  setView({ mode: 'children', nodeKey: view.nodeKey })
  navigation.push({
    title: `${itemLabel(currentNode.value)} children`,
    onBack: () => restore(previous),
  })
}

defineExpose({ openItem })
</script>

<style scoped>
.mobile-tree-entry {
  position: relative;
}
.mobile-tree-list-enabled .mobile-tree-entry {
  padding-right: 58px;
}
.mobile-tree-branch-meta {
  position: absolute;
  top: 0;
  right: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
  height: 100%;
  color: var(--text-faint);
  pointer-events: none;
}
.mobile-tree-list-enabled :deep(.chevron-button),
.mobile-tree-list-enabled :deep(.sidebar-padding) {
  display: none;
}
.mobile-tree-open,
.mobile-tree-children {
  display: grid;
  grid-template-columns: 28px 1fr auto 24px;
  align-items: center;
  gap: 10px;
  width: calc(100% - 24px);
  min-height: 48px;
  margin: 8px 12px;
  padding: 0 12px;
  /* --query-window-bg is identical to --sidebar-bg in the dark theme, which
     would leave this button with no visible surface. */
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--button-mouseover);
  color: var(--text-color);
  text-align: left;
  font: inherit;
  cursor: pointer;
}
.mobile-tree-open {
  grid-template-columns: 28px 1fr;
}
.mobile-tree-count {
  color: var(--text-faint);
}
.mobile-tree-empty {
  padding: 24px 16px;
  color: var(--text-faint);
  text-align: center;
  font-size: 14px;
}
</style>
