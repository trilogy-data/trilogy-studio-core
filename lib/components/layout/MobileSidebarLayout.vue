<template>
  <div id="interface" class="interface">
    <div class="mobile-select-bar">
      <div class="icon-container" tooltip="Menu">
        <i
          @click="$emit('menu-toggled')"
          class="mdi mdi-menu hamburger-icon"
          data-testid="mobile-menu-toggle"
        ></i>
      </div>
      <span class="header">{{ screenTitle }}</span>
    </div>
    <div class="interface-wrap">
      <div v-if="menuOpen" ref="sidebar" class="sidebar">
        <slot name="sidebar"></slot>
      </div>
      <div v-else ref="content" class="nested-page-content" id="page-content">
        <slot></slot>
      </div>
    </div>
  </div>
</template>
<style scoped>
.mobile-select-bar {
  height: 40px;
  min-height: 40px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  background-color: var(--bg-color);
}
.icon-container {
  position: absolute;
  left: 16px;
  height: 100%;
  display: flex;
  align-items: center;
}
.hamburger-icon {
  font-size: 24px;
  display: flex;
}
.header {
  font-size: 20px;
  width: 100%;
  text-align: center;
}
.interface {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
}
.interface-wrap {
  display: flex;
  flex-wrap: nowrap;
  flex: 1 1 auto;
  max-height: 100%;
  isolation: isolate;
  margin-top: 40px; /* Add space for the fixed header */
}
.sidebar {
  background-color: var(--sidebar-bg);
  display: flex;
  flex-direction: column;
  /* flex-wrap: wrap; */
  flex: 1 1 auto;
  height: calc(100% - 40px);
  width: 100%;
  z-index: 51;
  overflow-y: visible;
}
.nested-page-content {
  flex: 1 1 auto;
  height: 100%;
  z-index: 1;
  overflow: scroll;
}
</style>
<script lang="ts">
export default {
  name: 'MobileSidebarLayout',
  props: {
    menuOpen: Boolean,
    activeScreen: String,
  },
  data() {
    return {
      // sidebarShown: true,
    }
  },
  components: {},
  computed: {
    screenTitle() {
      if (this.menuOpen) {
        return 'Menu'
      }
      if (this.activeScreen) {
        return this.activeScreen
          .split('-')
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ')
      }
      return 'Trilogy'
    },
  },
  methods: {},
}
</script>
