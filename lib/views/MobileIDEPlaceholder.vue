<template>
  <div class="mobile-ide-placeholder">
    <div class="mobile-ide-placeholder__header"></div>
    <div class="mobile-ide-placeholder__content"></div>
  </div>
</template>

<style scoped>
.mobile-ide-placeholder {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100%;
}

.mobile-ide-placeholder__header {
  height: 30px;
  background-color: var(--sidebar-bg);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.mobile-ide-placeholder__content {
  flex: 1;
  background-color: var(--bg-color);
}
</style>

<script lang="ts" setup></script>
