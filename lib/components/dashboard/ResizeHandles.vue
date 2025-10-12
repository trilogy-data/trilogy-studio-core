<script lang="ts" setup>
defineProps<{
  onStartResize: (e: MouseEvent, direction: string) => void
}>()
</script>

<template>
  <div class="resize-handles">
    <div class="resize-handle resize-handle-n" @mousedown="(e) => onStartResize(e, 'n')"></div>
    <div class="resize-handle resize-handle-e" @mousedown="(e) => onStartResize(e, 'e')"></div>
    <div class="resize-handle resize-handle-s" @mousedown="(e) => onStartResize(e, 's')"></div>
    <div class="resize-handle resize-handle-w" @mousedown="(e) => onStartResize(e, 'w')"></div>
    <div class="resize-handle resize-handle-ne" @mousedown="(e) => onStartResize(e, 'ne')"></div>
    <div class="resize-handle resize-handle-nw" @mousedown="(e) => onStartResize(e, 'nw')"></div>
    <div class="resize-handle resize-handle-se" @mousedown="(e) => onStartResize(e, 'se')"></div>
    <div class="resize-handle resize-handle-sw" @mousedown="(e) => onStartResize(e, 'sw')"></div>
  </div>
</template>

<style scoped>
/* Resize handles */
.resize-handle {
  position: absolute;
  background-color: transparent;
  z-index: 10;
}

.resize-handle-n {
  top: 0;
  left: 0;
  height: 8px;
  width: 100%;
  cursor: n-resize;
}

.resize-handle-e {
  top: 0;
  right: 0;
  width: 8px;
  height: 100%;
  cursor: e-resize;
}

.resize-handle-s {
  bottom: 0;
  left: 0;
  height: 8px;
  width: 100%;
  cursor: s-resize;
}

.resize-handle-w {
  top: 0;
  left: 0;
  width: 8px;
  height: 100%;
  cursor: w-resize;
}

.resize-handle-ne {
  top: 0;
  right: 0;
  width: 15px;
  height: 15px;
  cursor: ne-resize;
}

.resize-handle-nw {
  top: 0;
  left: 0;
  width: 15px;
  height: 15px;
  cursor: nw-resize;
}

.resize-handle-se {
  bottom: 0;
  right: 0;
  width: 15px;
  height: 15px;
  cursor: se-resize;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='15' height='15' viewBox='0 0 15 15'%3E%3Cpath fill='rgba(150, 150, 150, 0.8)' d='M11 9.5L11 11H9.5V9.5H11M11 5.5V7H9.5V5.5H11M7 9.5V11H5.5V9.5H7M7 5.5V7H5.5V5.5H7Z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: bottom right;
}

.resize-handle-sw {
  bottom: 0;
  left: 0;
  width: 15px;
  height: 15px;
  cursor: sw-resize;
}
</style>