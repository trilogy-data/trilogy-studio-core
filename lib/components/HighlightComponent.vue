<template>
  <div :class="['highlight', type]">
    <slot></slot>
  </div>
</template>

<script setup lang="ts">
defineProps<{ type: 'tip' | 'warning' | 'caution' }>()
</script>

<style scoped>
.highlight {
  padding: 12px;
  border-left: 6px solid;
  border-radius: 4px;
  font-size: 14px;
  margin: 10px 0;
}

.tip {
  background-color: #e7f5ff;
  border-color: #3498db;
  color: #2c3e50;
}

.warning {
  background-color: #fff3cd;
  border-color: #ffc107;
  color: #856404;
}

.caution {
  background-color: #f8d7da;
  border-color: #dc3545;
  color: #721c24;
}
</style>
