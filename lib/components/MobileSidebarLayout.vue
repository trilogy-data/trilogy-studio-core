<template>
  <div id="interface" class="interface">
    <div class="select-bar">
      <i @click="$emit('menu-toggled')" class="mdi mdi-menu hamburger-icon"></i
      ><span class="header">{{ screenTitle }}</span>
    </div>
    <div class="interface-wrap">
      <div v-if="menuOpen" ref="sidebar" class="sidebar">
        <slot name="sidebar"></slot>
      </div>
      <div v-else ref="content" class="nested-page-content pa-0" id="page-content">
        <slot></slot>
      </div>
    </div>
  </div>
</template>
<style>
.header {
  margin-bottom: 20px;
  font-size: 20px;
  height: 30px;
  display: inline-block;
  vertical-align: middle;
}

.select-bar {
  height: 40px;
  padding-bottom: 5px;
  border-bottom: 1px solid var(--border);
}

.hamburger-icon {
  height: 30px;
  width: 30px;
  font-size: 30px;
  padding: 5px;
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
}

.sidebar {
  background-color: var(--sidebar-bg);
  display: flex;
  flex-direction: column;
  flex-grow: 0;
  flex-shrink: 1;
  /* flex-wrap: wrap; */
  height: 100%;
  width: 100%;
  z-index: 51;
  overflow-y: visible;
}

.nested-page-content {
  flex: 1 1 auto;
  max-height: 100%;
  min-width: 350px;
  z-index: 1;
  overflow: scroll;
}

.gutter {
  position: relative;

  &.gutter-horizontal,
  &.gutter-vertical {
    display: flex;
    background-color: transparent;
    z-index: 60;
  }

  &.gutter-horizontal {
    width: 0 !important;
    background-color: transparent;
    cursor: ew-resize;

    &:after {
      height: 100%;
      width: 8px;
      left: -2px;
    }
  }

  &.gutter-vertical {
    cursor: ns-resize;
    height: 0 !important;

    &:after {
      height: 8px;
      width: 100%;
      top: -4px;
    }
  }

  &:after {
    content: '';
    display: block;
    position: absolute;
    z-index: 60;
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
      } else if (this.activeScreen === 'connections') {
        return 'Connections'
      } else if (this.activeScreen === 'settings') {
        return 'Settings'
      } else if (this.activeScreen === 'help') {
        return 'Help'
      } else if (this.activeScreen === 'about') {
        return 'About'
      }
      return this.activeScreen
    },
  },
  methods: {},
}
</script>
