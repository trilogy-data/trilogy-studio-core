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
  /* Add webkit-specific properties for Safari */
  -webkit-transform: translateZ(0);
  transform: translateZ(0);
  -webkit-backface-visibility: hidden;
  backface-visibility: hidden;
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
  height: 100vh; /* Use viewport height instead of 100% */
  /* Prevent iOS Safari bounce scrolling on the main container */
  overflow: hidden;
}

.interface-wrap {
  display: flex;
  flex-wrap: nowrap;
  flex: 1 1 auto;
  max-height: calc(100vh - 40px); /* Account for header height */
  isolation: isolate;
  padding-top: 40px; /* Use padding instead of margin for better Safari compatibility */
  /* Ensure proper box-sizing */
  box-sizing: border-box;
}

.sidebar {
  background-color: var(--sidebar-bg);
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  height: 100%;
  width: 100%;
  z-index: 51;
  overflow-y: auto;
  /* Add iOS-specific scrolling properties */
  -webkit-overflow-scrolling: touch;
}

.nested-page-content {
  flex: 1 1 auto;
  height: 100%;
  z-index: 1;
  overflow: auto;
  /* Improve scrolling on iOS Safari */
  -webkit-overflow-scrolling: touch;
  /* Prevent content from going under the header */
  position: relative;
}

/* Additional iOS Safari specific fixes */
@supports (-webkit-touch-callout: none) {
  .interface {
    /* Fix for iOS Safari viewport height issues */
    height: -webkit-fill-available;
  }
  
  .interface-wrap {
    max-height: calc(-webkit-fill-available - 40px);
  }
}

/* Ensure safe area insets are respected on newer iPhones */
@media screen and (max-width: 768px) {
  .mobile-select-bar {
    padding-left: env(safe-area-inset-left);
    padding-right: env(safe-area-inset-right);
    top: env(safe-area-inset-top);
  }
  
  .interface-wrap {
    padding-top: calc(40px + env(safe-area-inset-top));
  }
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