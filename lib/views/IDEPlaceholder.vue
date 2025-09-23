<template>
  <div class="ide-placeholder">
    <div v-if="!isDashboardImport" class="ide-placeholder__sidebar"></div>
    <div class="ide-placeholder__main">
      <div class="ide-placeholder__editor"></div>
      <!-- <div class="ide-placeholder__output">
            </div> -->
    </div>
  </div>
</template>

<style scoped>
.ide-placeholder {
  display: flex;
  height: 100vh;
  width: 100%;
}
.ide-placeholder__sidebar {
  width: 15%;
  min-width: 200px;
  background-color: var(--sidebar-bg);
  border-right: 1px solid var(--border);
  flex-shrink: 0;
}
.ide-placeholder__main {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.ide-placeholder__editor {
  flex: 1; /* 60% of the main area */
  background-color: var(--bg-color);
  border-bottom: 1px solid var(--border);
}
/* for now, disabled to avoid border pop on some screens
we can revisit if we want editor specific placeholder from url */
.ide-placeholder__output {
  flex: 0.4; /* 40% of the main area */
  background-color: var(--bg-color);
}
</style>

<script lang="ts" setup>
import { computed } from 'vue'

const isDashboardImport = computed(() => {
  return window.location.href.includes('dashboard-import')
})
</script>
