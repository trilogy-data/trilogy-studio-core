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
  position: sticky;
  top: 0;
  z-index: 100;
  background-color: var(--bg-color);
  /* Add webkit-specific properties for Safari */
  -webkit-transform: translateZ(0);
  transform: translateZ(0);
  -webkit-backface-visibility: hidden;
  backface-visibility: hidden;
  /* Ensure sticky positioning works properly */
  width: 100%;
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
  height: 100vh;
  /* Remove overflow hidden to allow sticky positioning */
  overflow: visible;
}

.interface-wrap {
  display: flex;
  flex-wrap: nowrap;
  flex: 1 1 auto;
  /* Remove max-height and padding-top since we're no longer using fixed positioning */
  isolation: isolate;
  box-sizing: border-box;
  /* Allow natural scrolling flow */
  overflow: visible;
}

.sidebar {
  background-color: var(--sidebar-bg);
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  height: calc(100vh - 40px);
  width: 100%;
  z-index: 51;
  overflow-y: auto;
  /* Add iOS-specific scrolling properties */
  -webkit-overflow-scrolling: touch;
}

.nested-page-content {
  flex: 1 1 auto;
  height: calc(100vh - 40px);
  z-index: 1;
  overflow: auto;
  /* Improve scrolling on iOS Safari */
  -webkit-overflow-scrolling: touch;
  position: relative;
}

/* Additional iOS Safari specific fixes */
@supports (-webkit-touch-callout: none) {
  .interface {
    /* Fix for iOS Safari viewport height issues */
    height: -webkit-fill-available;
  }

  .sidebar {
    height: calc(-webkit-fill-available - 40px);
  }

  .nested-page-content {
    height: calc(-webkit-fill-available - 40px);
  }
}

/* Ensure safe area insets are respected on newer iPhones */
@media screen and (max-width: 768px) {
  .mobile-select-bar {
    padding-left: env(safe-area-inset-left);
    padding-right: env(safe-area-inset-right);
    /* Remove top positioning since sticky handles this naturally */
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
