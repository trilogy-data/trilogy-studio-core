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
      <div class="header-center">
        <div 
          v-if="tabs.length > 1" 
          class="tab-dropdown-container"
          @click="toggleTabDropdown"
          ref="tabDropdownContainer"
        >
          <span class="current-tab-title">{{ currentTabTitle }}</span>
          <i 
            :class="['mdi', 'dropdown-arrow', { 'rotated': tabDropdownOpen }]"
            class="mdi-chevron-down"
          ></i>
        </div>
        <span v-else class="header">{{ screenTitle }}</span>
        
        <!-- Tab Dropdown -->
        <div 
          v-if="tabDropdownOpen && tabs.length > 1" 
          class="tab-dropdown"
          ref="tabDropdown"
          @click.stop
        >
          <div
            v-for="tab in tabs"
            :key="tab.id"
            :class="['tab-dropdown-item', { 'active': isActiveTab(tab) }]"
            @click="selectTab(tab)"
          >
            <i :class="getTabIcon(tab.screen)" class="tab-dropdown-icon"></i>
            <span class="tab-dropdown-title">{{ tab.title }}</span>
          </div>
        </div>
      </div>
    </div>
    <div class="interface-wrap">
      <div v-show="menuOpen" ref="sidebar" class="sidebar">
        <slot name="sidebar"></slot>
      </div>
      <div v-show="!menuOpen" ref="content" class="nested-page-content" id="page-content">
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
  z-index: 1;
}

.header-center {
  position: relative;
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
}

.header {
  font-size: 20px;
  width: 100%;
  text-align: center;
}

/* Tab Dropdown Styles */
.tab-dropdown-container {
  display: flex;
  align-items: center;
  cursor: pointer;
  padding: 6px 12px;
  border-radius: 4px;
  transition: background-color 0.2s ease;
  user-select: none;
  max-width: 200px;
}

.tab-dropdown-container:hover {
  background-color: var(--button-mouseover);
}

.current-tab-title {
  font-size: 18px;
  font-weight: 500;
  margin-right: 8px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  flex: 1;
}

.dropdown-arrow {
  font-size: 16px;
  transition: transform 0.2s ease;
  flex-shrink: 0;
}

.dropdown-arrow.rotated {
  transform: rotate(180deg);
}

.tab-dropdown {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  background-color: var(--bg-color);
  border: 1px solid var(--border);
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 1001;
  min-width: 200px;
  max-width: 280px;
  max-height: 300px;
  overflow-y: auto;
  padding: 4px 0;
  margin-top: 4px;
}

.tab-dropdown-item {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  cursor: pointer;
  color: var(--text-color);
  transition: background-color 0.2s ease;
  border-left: 3px solid transparent;
}

.tab-dropdown-item:hover {
  background-color: var(--button-mouseover);
}

.tab-dropdown-item.active {
  background-color: var(--query-window-bg);
  border-left-color: var(--accent-color, #007acc);
}

.tab-dropdown-icon {
  font-size: 16px;
  margin-right: 8px;
  color: var(--text-color);
  flex-shrink: 0;
}

.tab-dropdown-title {
  font-size: var(--small-font-size);
  color: var(--text-color);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  flex: 1;
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

/* Very small screens - compact dropdown */
@media screen and (max-width: 480px) {
  .tab-dropdown {
    min-width: 180px;
    left: 16px;
    right: 16px;
    transform: none;
    max-width: none;
  }
  
  .current-tab-title {
    font-size: 16px;
    max-width: 120px;
  }
  
  .tab-dropdown-container {
    max-width: 150px;
    padding: 4px 8px;
  }
}
</style>

<script lang="ts">
import { type Tab, type ScreenType } from '../../stores/useScreenNavigation'

export default {
  name: 'MobileSidebarLayout',
  props: {
    menuOpen: Boolean,
    activeScreen: String,
    tabs: {
      type: Array as () => Tab[],
      required: false,
      default: () => [],
    },
    activeTab: {
      type: String,
      required: false,
      default: '',
    },
  },
  data() {
    return {
      tabDropdownOpen: false,
      // Icon mapping that matches the desktop tabbed component
      iconMap: {
        editors: 'mdi mdi-file-document-edit-outline',
        connections: 'mdi mdi-database-outline',
        llms: 'mdi mdi-creation-outline',
        dashboard: 'mdi mdi-chart-areaspline-outline',
        'dashboard-import': 'mdi mdi-chart-multiple',
        models: 'mdi mdi-set-center',
        'community-models': 'mdi mdi-library-outline',
        tutorial: 'mdi mdi-help',
        settings: 'mdi mdi-cog-outline',
        profile: 'mdi mdi-account-outline',
        welcome: 'mdi mdi-home-outline',
        '': 'mdi mdi-file-document-outline', // fallback icon
      } as Record<ScreenType, string>,
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
    currentTabTitle() {
      if (this.tabs.length === 0) {
        return this.screenTitle
      }
      
      const currentTab = this.tabs.find(tab => tab.id === this.activeTab)
      return currentTab?.title || this.screenTitle
    },
  },
  methods: {
    toggleTabDropdown() {
      console.log('opening')
      this.tabDropdownOpen = !this.tabDropdownOpen
      console.log(this.tabDropdownOpen) 
    },
    
    closeTabDropdown() {
      console.log('closing')
      this.tabDropdownOpen = false
    },
    
    selectTab(tab: Tab) {
      console.log('selecting tab', tab)
      this.$emit('tab-selected', {
        screen: tab.screen,
        address: tab.address,
        id: tab.id,
        params: tab.params
      })

      this.closeTabDropdown()
    },
    
    isActiveTab(tab: Tab): boolean {
      return tab.id === this.activeTab
    },
    
    getTabIcon(screenType: ScreenType): string {
      return this.iconMap[screenType] || 'mdi mdi-file-document-outline'
    },

    // Handle clicks outside the dropdown
    handleOutsideClick(event: Event) {
      if (!this.tabDropdownOpen) return
      
      const target = event.target as Element
      const dropdown = this.$refs.tabDropdown as HTMLElement
      const container = this.$refs.tabDropdownContainer as HTMLElement
      
      // Close if click is outside both the dropdown and the container
      if (dropdown && container && 
          !dropdown.contains(target) && 
          !container.contains(target)) {
        this.closeTabDropdown()
      }
    },
  },
  mounted() {
    // Close dropdown when clicking outside
    document.addEventListener('click', this.handleOutsideClick)
  },
  
  beforeUnmount() {
    // Clean up event listeners
    document.removeEventListener('click', this.handleOutsideClick)
  },
}
</script>