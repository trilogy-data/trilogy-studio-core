<script setup lang="ts">
import { ref, onBeforeUnmount } from 'vue'

/**
 * Vertical drag handle for resizing horizontally-laid-out columns.
 *
 * The handle itself doesn't own width — it emits the new pixel width via
 * v-model so the parent can persist / clamp / apply. `side` controls which
 * end of the parent column the handle measures from:
 *   - 'left'  → handle is on the right edge of a left-side column;
 *               width grows when dragging right
 *   - 'right' → handle is on the left edge of a right-side column;
 *               width grows when dragging left
 */
const props = defineProps<{
  modelValue: number
  side: 'left' | 'right'
  min?: number
  max?: number
}>()

const emit = defineEmits<{ 'update:modelValue': [value: number] }>()

const dragging = ref(false)
let startX = 0
let startWidth = 0

function clamp(v: number): number {
  const lo = props.min ?? 160
  const hi = props.max ?? 800
  return Math.max(lo, Math.min(hi, v))
}

function onMouseDown(e: MouseEvent) {
  dragging.value = true
  startX = e.clientX
  startWidth = props.modelValue
  e.preventDefault()
  document.body.style.userSelect = 'none'
  document.body.style.cursor = 'col-resize'
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

function onMove(e: MouseEvent) {
  if (!dragging.value) return
  const delta = e.clientX - startX
  const next = props.side === 'left' ? startWidth + delta : startWidth - delta
  emit('update:modelValue', clamp(next))
}

function onUp() {
  dragging.value = false
  document.body.style.userSelect = ''
  document.body.style.cursor = ''
  window.removeEventListener('mousemove', onMove)
  window.removeEventListener('mouseup', onUp)
}

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onMove)
  window.removeEventListener('mouseup', onUp)
})
</script>

<template>
  <div
    class="resize-handle"
    :class="{ dragging }"
    @mousedown="onMouseDown"
    role="separator"
    aria-orientation="vertical"
  />
</template>

<style scoped>
.resize-handle {
  flex-shrink: 0;
  width: 4px;
  cursor: col-resize;
  background: transparent;
  border-left: 1px solid var(--border);
  margin-left: -1px; /* sit ON the existing column border */
  margin-right: -1px;
  transition: background 120ms ease;
  z-index: 1;
}

.resize-handle:hover,
.resize-handle.dragging {
  background: rgba(59, 130, 246, 0.35);
  border-left-color: transparent;
}
</style>
