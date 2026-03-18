<template>
  <span class="sidebar-tag-chip">{{ label }}</span>
</template>

<script setup lang="ts">
defineProps<{
  label: string
}>()
</script>

<style scoped>
.sidebar-tag-chip {
  display: inline-flex;
  align-items: center;
  min-height: 14px;
  padding: 0 4px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.01em;
  line-height: 1;
  cursor: default;
  opacity: 0.92;
  background-color: rgba(var(--special-text-rgb, 37, 99, 235), 0.06);
  border: 1px solid rgba(var(--special-text-rgb, 37, 99, 235), 0.14);
  color: rgba(var(--special-text-rgb, 37, 99, 235), 0.88);
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
