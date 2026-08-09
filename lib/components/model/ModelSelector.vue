<template>
  <div class="model-anchor">
    <button
      class="model-trigger truncate-text"
      type="button"
      data-testid="model-selector-trigger"
      @click.stop="toggleModelForm"
    >
      <span class="model-trigger-text truncate-text">{{ connection.model || 'Set model' }}</span>
      <i class="mdi mdi-chevron-down model-trigger-icon"></i>
    </button>
    <!-- Rendered as a fixed-position context menu rather than an absolutely
         positioned child: the sidebar row wraps this slot in an overflow:hidden,
         fixed-height span, which clips any in-flow dropdown out of sight. -->
    <context-menu
      :items="menuItems"
      :position="menuPosition"
      :is-visible="isModelFormVisible"
      :id="`model-selector-${connection.id || connection.name}`"
      @item-click="selectMenuItem"
      @close="isModelFormVisible = false"
    />
  </div>
</template>
<script setup lang="ts">
import { ref, computed, inject } from 'vue'
import type { ModelConfigStoreType } from '../../stores/modelStore'
import type { ConnectionStoreType } from '../../stores/connectionStore'
import ContextMenu from '../ContextMenu.vue'
import type { ContextMenuItem, Position } from '../ContextMenu.vue'
import type { Connection } from '../../connections'
export interface ModelSelectorProps {
  connection: Connection
}
const props = defineProps<ModelSelectorProps>()
const modelStore = inject<ModelConfigStoreType>('modelStore')
const connectionStore = inject<ConnectionStoreType>('connectionStore')
const saveConnections = inject<Function>('saveConnections', () => {})
const saveModels = inject<Function>('saveModels', () => {})
const isModelFormVisible = ref(false)
const menuPosition = ref<Position>({ x: 0, y: 0 })

const NEW_MODEL_ID = '~new-model'
const MENU_WIDTH = 180
const MENU_VIEWPORT_MARGIN = 8

// Compute available models from the model store
const availableModels = computed(() =>
  modelStore
    ? Object.keys(modelStore.models)
        .filter((name) => !modelStore.models[name].deleted)
        .sort((a, b) => a.localeCompare(b))
    : [],
)

const menuItems = computed<ContextMenuItem[]>(() => {
  const items: ContextMenuItem[] = availableModels.value.map((model) => ({
    id: model,
    label: model,
    icon: model === props.connection.model ? 'mdi-check' : 'mdi-cube-outline',
  }))
  if (items.length > 0) {
    items.push({ id: 'model-separator', kind: 'separator' })
  }
  items.push({ id: NEW_MODEL_ID, label: 'Create New Model', icon: 'mdi-plus' })
  return items
})

const toggleModelForm = (event: MouseEvent) => {
  if (isModelFormVisible.value) {
    isModelFormVisible.value = false
    return
  }
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  // Estimated so a menu opened near the bottom of the viewport flips up rather
  // than running off-screen; matches SidebarOverflowMenu's clamping.
  const estimatedHeight = menuItems.value.length * 27 + 6
  const maxX = Math.max(MENU_VIEWPORT_MARGIN, window.innerWidth - MENU_WIDTH - MENU_VIEWPORT_MARGIN)
  const maxY = Math.max(
    MENU_VIEWPORT_MARGIN,
    window.innerHeight - estimatedHeight - MENU_VIEWPORT_MARGIN,
  )
  menuPosition.value = {
    x: Math.min(maxX, Math.max(MENU_VIEWPORT_MARGIN, rect.left)),
    y: Math.min(maxY, Math.max(MENU_VIEWPORT_MARGIN, rect.bottom + 4)),
  }
  isModelFormVisible.value = true
}

/** A new model is named for the connection, but must never overwrite an
 *  existing one -- connections are created with a same-named model already. */
const uniqueModelName = (base: string) => {
  if (!modelStore || !modelStore.models[base]) {
    return base
  }
  let suffix = 2
  while (modelStore.models[`${base}-${suffix}`]) {
    suffix += 1
  }
  return `${base}-${suffix}`
}

const selectMenuItem = async (item: ContextMenuItem) => {
  if (!connectionStore) {
    return
  }

  let nextModel = item.id
  let createdModel = false
  if (nextModel === NEW_MODEL_ID) {
    nextModel = uniqueModelName(props.connection.name)
    modelStore?.newModelConfig(nextModel)
    createdModel = true
  }

  const conn =
    connectionStore.connections[props.connection.id] ||
    connectionStore.connectionByName(props.connection.name)
  if (conn) {
    conn.setModel(nextModel)
  }
  isModelFormVisible.value = false
  if (createdModel) {
    await saveModels()
  }
  await saveConnections()
}
</script>
<style scoped>
.model-anchor {
  position: relative;
  min-width: 0;
  flex-shrink: 1;
}

.model-trigger {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  min-height: 24px;
  padding: 0 2px 0 0;
  border: none;
  background: transparent;
  color: var(--text-color);
  font-size: var(--sidebar-sub-item-font-size);
  font-weight: 500;
  box-shadow: none;
}

.model-trigger:hover {
  background: transparent;
  color: var(--special-text);
}

.model-trigger-text {
  min-width: 0;
}

.model-trigger-icon {
  font-size: 14px;
  color: var(--text-faint);
}
</style>
