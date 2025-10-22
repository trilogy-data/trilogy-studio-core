<template>
  <div class="tabbed-container">
    <div class="tab-bar">
      <div
        v-for="(tab, index) in tabs"
        :key="tab.id"
        :class="['tab', { 'tab-active': activeTab === tab.id }]"
        @click="selectTab(tab.id)"
        @dragstart="handleDragStart(index, $event)"
        @dragover="handleDragOver($event)"
        @drop="handleDrop(index, $event)"
        @contextmenu="showContextMenu($event, tab.id, index)"
        draggable="true"
      >
        <i :class="getTabIcon(tab.screen)" class="tab-icon"></i>
        <span class="tab-title truncate-text">{{ tab.title }}</span>
        <button class="tab-close-btn" @click.stop="closeTab(tab.id)" v-if="tabs.length > 1">
          ×
        </button>
      </div>
      <!-- <button class="new-tab-btn" @click="$emit('new-tab')" title="New Tab">+</button> -->
    </div>

    <!-- Content Area -->
    <div class="tab-content">
      <slot></slot>
    </div>

    <!-- Context Menu -->
    <div
      v-if="contextMenu.visible"
      class="context-menu"
      :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
      @click.stop
    >
      <div
        class="context-menu-item"
        @click="closeOtherTabs"
        :class="{ disabled: tabs.length <= 1 }"
      >
        Close Other Tabs
      </div>
      <div
        class="context-menu-item"
        @click="closeTabsToRight"
        :class="{ disabled: !canCloseTabsToRight }"
      >
        Close Tabs to the Right
      </div>
    </div>

    <!-- Invisible overlay to close context menu -->
    <div v-if="contextMenu.visible" class="context-menu-overlay" @click="hideContextMenu"></div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import useScreenNavigation from '../../stores/useScreenNavigation'
import { type ScreenType } from '../../stores/useScreenNavigation'

export default defineComponent({
  name: 'TabbedLayout',
  emits: ['new-tab', 'tab-added', 'tab-closed', 'tab-selected', 'tabs-reordered'],
  setup() {
    const navigationStore = useScreenNavigation()
    const {
      activeTab,
      tabs,
      openTab,
      closeTab,
      setActiveTab,
      // Stub methods for new functionality - to be implemented in store
      closeOtherTabsExcept,
      closeTabsToRightOf,
    } = navigationStore
    return {
      activeTab,
      tabs,
      openTab,
      setActiveTab,
      closeTab,
      closeOtherTabsExcept,
      closeTabsToRightOf,
    }
  },
  data() {
    return {
      draggedTabIndex: -1 as number,
      tabIdCounter: 0 as number,
      contextMenu: {
        visible: false,
        x: 0,
        y: 0,
        targetTabId: '',
        targetTabIndex: -1,
      },
      // Icon mapping that matches the sidebar configuration
      iconMap: {
        'editors': 'mdi mdi-file-document-edit-outline',
        'connections': 'mdi mdi-database-outline',
        'llms': 'mdi mdi-creation-outline',
        'dashboard': 'mdi mdi-chart-areaspline-outline',
        'dashboard-import': 'mdi mdi-chart-multiple',
        'models': 'mdi mdi-set-center',
        'community-models': 'mdi mdi-library-outline',
        'tutorial': 'mdi mdi-help',
        'settings': 'mdi mdi-cog-outline',
        'profile': 'mdi mdi-account-outline',
        'welcome': 'mdi mdi-home-outline',
        '': 'mdi mdi-file-document-outline', // fallback icon
      } as Record<ScreenType, string>
    }
  },
  computed: {
    canCloseTabsToRight(): boolean {
      return this.contextMenu.targetTabIndex < this.tabs.length - 1
    },
  },
  methods: {
    getTabIcon(screenType: ScreenType): string {
      return this.iconMap[screenType] || 'mdi mdi-file-document-outline'
    },

    selectTab(tabId: string): void {
      console.log('Selecting tab:', tabId)
      this.setActiveTab(tabId)
    },

    // Context Menu Methods
    showContextMenu(event: MouseEvent, tabId: string, tabIndex: number): void {
      event.preventDefault()
      this.contextMenu.visible = true
      this.contextMenu.x = event.clientX
      this.contextMenu.y = event.clientY
      this.contextMenu.targetTabId = tabId
      this.contextMenu.targetTabIndex = tabIndex
    },

    hideContextMenu(): void {
      this.contextMenu.visible = false
      this.contextMenu.targetTabId = ''
      this.contextMenu.targetTabIndex = -1
    },

    closeOtherTabs(): void {
      if (this.tabs.length <= 1) return

      // Call store method to close all tabs except the target tab
      if (this.closeOtherTabsExcept) {
        this.closeOtherTabsExcept(this.contextMenu.targetTabId)
      } else {
        // Fallback implementation until store method is available
        console.log('closeOtherTabsExcept not implemented in store yet')
      }
      this.hideContextMenu()
    },

    closeTabsToRight(): void {
      if (!this.canCloseTabsToRight) return

      // Call store method to close tabs to the right of the target tab
      if (this.closeTabsToRightOf) {
        this.closeTabsToRightOf(this.contextMenu.targetTabId)
      } else {
        // Fallback implementation until store method is available
        console.log('closeTabsToRightOf not implemented in store yet')
      }
      this.hideContextMenu()
    },

    // Drag and Drop
    handleDragStart(index: number, event: DragEvent): void {
      this.draggedTabIndex = index
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData('text/html', '')
      }
    },

    handleDragOver(event: DragEvent): void {
      event.preventDefault()
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'move'
      }
    },

    handleDrop(targetIndex: number, event: DragEvent): void {
      event.preventDefault()

      if (this.draggedTabIndex !== -1 && this.draggedTabIndex !== targetIndex) {
        const draggedTab = this.tabs.splice(this.draggedTabIndex, 1)[0]
        this.tabs.splice(targetIndex, 0, draggedTab)
        this.$emit('tabs-reordered', this.tabs)
      }

      this.draggedTabIndex = -1
    },

    // Split.js Integration
    initializeSplit(): void {
      // No split functionality needed
    },
  },

  mounted() {
    // Initialize with provided tabs or create a default one
    if (this.tabs.length === 0) {
      const currentScreen: ScreenType = 'welcome'
      this.openTab(currentScreen, 'Welcome', 'welcome')
    }
    // Hide context menu when clicking outside
    document.addEventListener('click', this.hideContextMenu)
    document.addEventListener('contextmenu', (e: Event) => {
      if (!(e.target instanceof Element) || !e.target.closest('.tab')) {
        this.hideContextMenu()
      }
    })
  },

  beforeUnmount() {
    // Clean up event listeners
    document.removeEventListener('click', this.hideContextMenu)
  },

  watch: {
    // Watch navigation store changes to sync with tabs (when store is available)
    // 'navigationStore.activeScreen': {
    //   handler(newScreen: ScreenType) {
    //     if (!newScreen) return
    //     // Check if we already have a tab for this screen
    //     const existingTab = this.tabs.find((tab: Tab) => tab.screen === newScreen)
    //     if (existingTab && this.currentTabId !== existingTab.id) {
    //       this.currentTabId = existingTab.id
    //     } else if (!existingTab) {
    //       // Create a new tab for this screen
    //       this.addTab(newScreen)
    //     }
    //   },
    //   immediate: true
    // }
  },
})
</script>

<style scoped>
.tabbed-container {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: calc(100% - 30px);
  position: relative;
}

/* Tab Bar Styles */
.tab-bar {
  display: flex;
  align-items: center;
  background-color: var(--sidebar-bg);
  border-bottom: 1px solid var(--border);
  padding: 0;
  min-height: 20px;
  overflow-x: auto;
  overflow-y: hidden;
  flex-shrink: 0;
}

.tab {
  display: flex;
  align-items: center;
  padding: 4px 8px;
  background-color: var(--button-bg);
  border: 1px solid var(--border);
  border-bottom: none;
  margin-right: 2px;
  cursor: pointer;
  user-select: none;
  min-width: 120px;
  max-width: 200px;
  transition: background-color 0.2s ease;
}

.tab:hover {
  background-color: var(--button-mouseover);
}

.tab-active {
  background-color: var(--query-window-bg);
  border-bottom: 1px solid var(--query-window-bg);
  position: relative;
  z-index: 1;
}

.tab-icon {
  font-size: 16px;
  margin-right: 6px;
  color: var(--text-color);
  flex-shrink: 0;
}

.tab-title {
  flex: 1;
  font-size: var(--small-font-size);
  color: var(--text-color);
  margin-right: 8px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.tab-close-btn {
  background: none;
  border: none;
  color: var(--text-faint);
  cursor: pointer;
  font-size: 16px;
  padding: 2px 4px;
  line-height: 1;
  border-radius: 2px;
  margin-left: 4px;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.tab-close-btn:hover {
  background-color: var(--button-mouseover);
  color: var(--text-color);
}

.new-tab-btn {
  background-color: var(--button-bg);
  border: 1px solid var(--border);
  color: var(--text-color);
  cursor: pointer;
  padding: 6px 10px;
  margin-left: 4px;
  font-size: 14px;
  transition: background-color 0.2s ease;
}

.new-tab-btn:hover {
  background-color: var(--button-mouseover);
}

/* Context Menu Styles */
.context-menu {
  position: fixed;
  background-color: var(--bg-color);
  border: 1px solid var(--border);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  min-width: 160px;
  padding: 4px 0;
}

.context-menu-item {
  padding: 8px 16px;
  cursor: pointer;
  color: var(--text-color);
  font-size: var(--small-font-size);
  transition: background-color 0.2s ease;
}

.context-menu-item:hover:not(.disabled) {
  background-color: var(--button-mouseover);
}

.context-menu-item.disabled {
  color: var(--text-faint);
  cursor: not-allowed;
}

.context-menu-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 999;
}

/* Content Area */
.tab-content {
  height: 100%;
}

/* Drag and Drop Visual Feedback */
.tab[draggable='true'] {
  cursor: grab;
}

.tab[draggable='true']:active {
  cursor: grabbing;
}

/* Utility Classes */
.truncate-text {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* Responsive Design */
@media screen and (max-width: 768px) {
  .tab {
    min-width: 100px;
    max-width: 150px;
    padding: 6px 8px;
  }

  .tab-icon {
    font-size: 14px;
    margin-right: 4px;
  }

  .tab-title {
    font-size: var(--font-size);
  }

  .tab-bar {
    min-height: 44px;
  }

  .context-menu {
    min-width: 140px;
  }

  .context-menu-item {
    padding: 10px 16px;
    font-size: var(--font-size);
  }

  /* On very small screens, consider hiding tab titles and showing only icons */
  @media screen and (max-width: 480px) {
    .tab {
      min-width: 40px;
      max-width: 50px;
      padding: 6px 4px;
      justify-content: center;
    }

    .tab-title {
      display: none;
    }

    .tab-icon {
      margin-right: 0;
    }

    .tab-close-btn {
      display: none;
    }
  }
}
</style>