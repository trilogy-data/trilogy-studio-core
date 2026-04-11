<template>
  <div class="page-loading">
    <img :src="trilogyIcon" alt="Loading" class="page-loading__icon" />
  </div>
</template>

<script setup lang="ts">
import trilogyIcon from '../static/trilogy.png'
</script>

<style scoped>
.page-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  min-height: 200px;
  background-color: var(--bg-color);
}

.page-loading__icon {
  height: 64px;
  width: 64px;
  filter: grayscale(100%) opacity(0.6);
  animation: page-loading-spin 1.5s linear infinite;
}

@keyframes page-loading-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
