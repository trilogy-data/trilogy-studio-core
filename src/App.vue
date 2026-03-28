<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
const ResponsiveIDE = defineAsyncComponent(() => {
  return import('../lib/views/ResponsiveIDE.vue')
})
</script>
<template>
  <ResponsiveIDE />
</template>
