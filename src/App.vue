<script setup lang="ts">
//@ts-ignore
import { defineAsyncComponent } from 'vue'
// import { ResponsiveIDE } from 'trilogy-studio-core'
const ResponsiveIDE = defineAsyncComponent(() => {
  return import('trilogy-studio-core/views/ResponsiveIDE.vue')
})
</script>
<template>
  <ResponsiveIDE />
</template>
