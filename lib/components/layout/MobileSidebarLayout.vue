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
            :class="['mdi', 'dropdown-arrow', { rotated: tabDropdownOpen }]"
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
          <!-- Batch Actions Header -->
          <div class="tab-dropdown-header" v-if="tabs.length > 2">
            <button
              class="close-others-btn"
              @click="showCloseOthersConfirm = true"
              :disabled="batchCloseInProgress"
            >
              <i class="mdi mdi-close-box-multiple-outline"></i>
              <span>Close other tabs</span>
            </button>
          </div>

          <!-- Tab Items -->
          <div class="tab-dropdown-items">
            <TabDropdownItem
              v-for="tab in tabs"
              :key="tab.id"
              :ref="'tabItem-' + tab.id"
              :tab="tab"
              :is-active="isActiveTab(tab)"
              :icon="getTabIcon(tab.screen)"
              :disabled="batchCloseInProgress"
              @select="selectTab"
              @close="closeTab"
            />
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

    <!-- Confirmation Dialog -->
    <div
      v-if="showCloseOthersConfirm"
      class="close-confirm-overlay"
      @click="showCloseOthersConfirm = false"
    >
      <div class="close-confirm-dialog" @click.stop>
        <p>Close {{ otherTabsCount }} other tabs?</p>
        <div class="confirm-buttons">
          <button @click="showCloseOthersConfirm = false" class="cancel-btn">Cancel</button>
          <button @click="executeCloseOthers" class="confirm-btn">Close Others</button>
        </div>
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
  max-width: 250px;
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

/* New styles for batch actions header */
.tab-dropdown-header {
  padding: 8px 16px;
  border-bottom: 1px solid var(--border);
  background-color: var(--bg-color-light, var(--bg-color));
}

.close-others-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--button-bg, var(--bg-color));
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 6px 12px;
  font-size: 14px;
  color: var(--text-color);
  cursor: pointer;
  transition: background-color 0.2s ease;
  width: 100%;
}

.close-others-btn:hover:not(:disabled) {
  background-color: var(--button-mouseover);
}

.close-others-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.close-others-btn i {
  font-size: 16px;
}

.tab-dropdown-items {
  max-height: 240px;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

/* Confirmation dialog styles */
.close-confirm-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1002;
}

.close-confirm-dialog {
  background-color: var(--bg-color);
  border-radius: 8px;
  padding: 20px;
  margin: 20px;
  max-width: 300px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

.close-confirm-dialog p {
  margin: 0 0 16px 0;
  text-align: center;
  font-size: 16px;
  color: var(--text-color);
}

.confirm-buttons {
  display: flex;
  gap: 8px;
}

.confirm-buttons button {
  flex: 1;
  padding: 8px 16px;
  border-radius: 4px;
  border: 1px solid var(--border);
  cursor: pointer;
  font-size: 14px;
  transition: background-color 0.2s ease;
}

.cancel-btn {
  background-color: var(--bg-color);
  color: var(--text-color);
}

.cancel-btn:hover {
  background-color: var(--button-mouseover);
}

.confirm-btn {
  background-color: var(--error-color, #dc3545);
  color: white;
  border-color: var(--error-color, #dc3545);
}

.confirm-btn:hover {
  background-color: var(--error-color-dark, #c82333);
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
  }

  .tab-dropdown-container {
    padding: 4px 8px;
  }
}
</style>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import TabDropdownItem from './TabDropdownItem.vue'
import { type Tab } from '../../stores/useScreenNavigation'

type IconMapKey = keyof typeof iconMap.value

export interface Props {
  menuOpen: boolean
  activeScreen: string
  tabs?: Tab[]
  activeTab: string | null
}

const props = withDefaults(defineProps<Props>(), {
  tabs: () => [],
})

// Emits
const emit = defineEmits<{
  'menu-toggled': []
  'tab-selected': [data: Tab]
  'tab-closed': [tabId: string]
  'close-other-tabs': [tabId: string]
}>()

// Reactive data
const tabDropdownOpen = ref(false)
const showCloseOthersConfirm = ref(false)
const batchCloseInProgress = ref(false)

// Template refs
const tabDropdownContainer = ref<HTMLElement>()
const tabDropdown = ref<HTMLElement>()
const sidebar = ref<HTMLElement>()
const content = ref<HTMLElement>()

// Icon mapping that matches the desktop tabbed component
const iconMap = ref({
  editors: 'mdi mdi-file-document-edit-outline',
  connections: 'mdi mdi-database-outline',
  llms: 'mdi mdi-creation-outline',
  dashboard: 'mdi mdi-chart-multiple',
  'dashboard-import': 'mdi mdi-chart-multiple',
  'asset-import': 'mdi mdi-import',
  models: 'mdi mdi-set-center',
  'community-models': 'mdi mdi-library-outline',
  tutorial: 'mdi mdi-help',
  settings: 'mdi mdi-cog-outline',
  profile: 'mdi mdi-account-outline',
  welcome: 'mdi mdi-home-outline',
  '': 'mdi mdi-file-document-outline',
} as const)

// Computed properties
const screenTitle = computed(() => {
  if (props.menuOpen) {
    return 'Menu'
  }
  if (props.activeScreen) {
    return props.activeScreen
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }
  return 'Trilogy'
})

const currentTabTitle = computed(() => {
  if (props.tabs.length === 0) {
    return screenTitle.value
  }

  const currentTab = props.tabs.find((tab) => tab.id === props.activeTab)
  return currentTab?.title || screenTitle.value
})

const otherTabsCount = computed(() => {
  return props.tabs.filter((tab) => !isActiveTab(tab)).length
})

// Methods
const toggleTabDropdown = (): void => {
  tabDropdownOpen.value = !tabDropdownOpen.value
}

const closeTabDropdown = (): void => {
  tabDropdownOpen.value = false
}

const selectTab = (tab: Tab): void => {
  emit('tab-selected', tab)
  closeTabDropdown()
}

const closeTab = (tabId: string): void => {
  emit('tab-closed', tabId)
}

const isActiveTab = (tab: Tab): boolean => {
  return tab.id === props.activeTab
}

const getTabIcon = (screenType: string): string => {
  return iconMap.value[screenType as IconMapKey] || 'mdi mdi-file-document-outline'
}

const executeCloseOthers = (): void => {
  showCloseOthersConfirm.value = false
  emit('close-other-tabs', props.activeTab as string)
}

// Handle clicks outside the dropdown
const handleOutsideClick = (event: Event): void => {
  if (!tabDropdownOpen.value) return

  const target = event.target as Element
  const dropdown = tabDropdown.value
  const container = tabDropdownContainer.value

  if (dropdown && container && !dropdown.contains(target) && !container.contains(target)) {
    closeTabDropdown()
  }
}

// Lifecycle hooks
onMounted(() => {
  document.addEventListener('click', handleOutsideClick)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleOutsideClick)
})
</script>
