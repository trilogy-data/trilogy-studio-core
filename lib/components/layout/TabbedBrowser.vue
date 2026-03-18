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
        :data-testid="`tab-${tab.address}`"
      >
        <i
          :class="[
            getTabIcon(tab.screen),
            'tab-icon',
            `tab-icon-status-${getTabStatus(tab) || 'none'}`,
          ]"
        ></i>
        <span class="tab-title truncate-text">{{ tab.title }}</span>
        <button class="tab-close-btn" @click.stop="closeTab(tab.id, null)" v-if="tabs.length > 1">
          <i class="mdi mdi-close"></i>
        </button>
      </div>
    </div>

    <div class="tab-content">
      <slot></slot>
    </div>

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

    <div v-if="contextMenu.visible" class="context-menu-overlay" @click="hideContextMenu"></div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import useScreenNavigation from '../../stores/useScreenNavigation'
import { type ScreenType, type Tab } from '../../stores/useScreenNavigation'
import useEditorStore from '../../stores/editorStore'
import useConnectionStore from '../../stores/connectionStore'
import useChatStore from '../../stores/chatStore'
import type { Status } from '../StatusIcon.vue'

export default defineComponent({
  name: 'TabbedLayout',
  emits: ['new-tab', 'tab-added', 'tab-closed', 'tab-selected', 'tabs-reordered'],
  setup() {
    const navigationStore = useScreenNavigation()
    const editorStore = useEditorStore()
    const connectionStore = useConnectionStore()
    const chatStore = useChatStore()

    const {
      activeTab,
      tabs,
      openTab,
      closeTab,
      setActiveTab,
      closeOtherTabsExcept,
      closeTabsToRightOf,
    } = navigationStore

    const getTabStatus = (tab: Tab): Status | null => {
      if (tab.screen === 'editors') {
        const editor = editorStore.editors[tab.address]
        if (!editor) return null

        if (editor.loading) {
          return 'running'
        }

        const connection = connectionStore.connections[editor.connection]
        if (connection?.connected) {
          return 'connected'
        }

        return 'idle'
      }

      if (tab.screen === 'llms') {
        const parts = tab.address.split('::')
        const chatId = parts.length > 1 ? parts[1] : null

        if (chatId) {
          if (chatStore.isChatExecuting(chatId)) {
            const activeToolName = chatStore.getChatActiveToolName(chatId)
            if (activeToolName === 'run_query') {
              return 'running'
            }
            return 'waiting'
          }
        }

        return 'connected'
      }

      return null
    }

    return {
      activeTab,
      tabs,
      openTab,
      setActiveTab,
      closeTab,
      closeOtherTabsExcept,
      closeTabsToRightOf,
      getTabStatus,
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
      iconMap: {
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
      } as Record<ScreenType, string>,
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
      this.setActiveTab(tabId)
    },

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

      if (this.closeOtherTabsExcept) {
        this.closeOtherTabsExcept(this.contextMenu.targetTabId)
      }
      this.hideContextMenu()
    },

    closeTabsToRight(): void {
      if (!this.canCloseTabsToRight) return

      if (this.closeTabsToRightOf) {
        this.closeTabsToRightOf(this.contextMenu.targetTabId)
      }
      this.hideContextMenu()
    },

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
  },

  mounted() {
    if (this.tabs.length === 0) {
      const currentScreen: ScreenType = 'welcome'
      this.openTab(currentScreen, 'Welcome', 'welcome')
    }
    document.addEventListener('click', this.hideContextMenu)
    document.addEventListener('contextmenu', (e: Event) => {
      if (!(e.target instanceof Element) || !e.target.closest('.tab')) {
        this.hideContextMenu()
      }
    })
  },

  beforeUnmount() {
    document.removeEventListener('click', this.hideContextMenu)
  },
})
</script>

<style scoped>
.tabbed-container {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
  scrollbar-width: thin;
  scrollbar-color: rgba(0, 0, 0, 0.2) transparent;
}

.tabbed-container::-webkit-scrollbar {
  height: 4px;
}

.tabbed-container::-webkit-scrollbar-track {
  background: transparent;
}

.tabbed-container::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 2px;
}

.tabbed-container::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.4);
}

.tab-bar {
  display: flex;
  align-items: center;
  background-color: var(--query-window-bg);
  border-bottom: 1px solid var(--border-light);
  padding: 0 8px;
  min-height: 32px;
  overflow-x: auto;
  overflow-y: hidden;
  flex-shrink: 0;
  gap: 2px;
}

.tab {
  display: flex;
  align-items: center;
  padding: 0 8px;
  height: 100%;
  background-color: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  user-select: none;
  min-width: 110px;
  max-width: 200px;
  transition:
    background-color 0.16s ease,
    border-color 0.16s ease,
    color 0.16s ease,
    opacity 0.16s ease;
  border-radius: 0;
  color: var(--text-faint);
}

.tab:hover {
  background-color: rgba(var(--special-text-rgb, 37, 99, 235), 0.05);
}

.tab-active {
  border-bottom-color: var(--special-text);
  color: var(--text-color);
  opacity: 1;
}

.tab:not(.tab-active) {
  opacity: 0.62;
}

.tab-icon {
  font-size: 15px;
  margin-right: 6px;
  flex-shrink: 0;
}

.tab-icon-status-connected {
  color: #22c55e;
  animation: tab-icon-pulse 1.8s ease-in-out infinite;
}

.tab-icon-status-running {
  color: var(--special-text);
  animation: tab-icon-pulse 1s ease-in-out infinite;
}

.tab-icon-status-waiting {
  color: #f59e0b;
}

.tab-icon-status-failed {
  color: var(--delete-color);
}

.tab-icon-status-idle,
.tab-icon-status-disabled,
.tab-icon-status-none {
  color: currentColor;
}

.tab-title {
  flex: 1;
  font-size: 12px;
  font-weight: 500;
  color: currentColor;
  margin-right: 6px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.tab-close-btn {
  background: none;
  border: none;
  color: var(--text-faint);
  cursor: pointer;
  font-size: 14px;
  padding: 1px 2px;
  line-height: 1;
  border-radius: 0;
  margin-left: 2px;
  transition: all 0.2s ease;
  flex-shrink: 0;
  box-shadow: none;
}

.tab-close-btn:hover {
  background-color: var(--button-mouseover);
  color: var(--text-color);
}

.context-menu {
  position: fixed;
  background-color: var(--query-window-bg);
  border: 1px solid var(--border-light);
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.16);
  z-index: 1000;
  min-width: 160px;
  padding: 6px;
  border-radius: 12px;
}

.context-menu-item {
  padding: 10px 12px;
  cursor: pointer;
  color: var(--text-color);
  font-size: 13px;
  transition: background-color 0.2s ease;
  border-radius: 8px;
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
  inset: 0;
  z-index: 999;
}

.tab-content {
  flex: 1;
  overflow: hidden;
  background: var(--main-bg-color);
}

.tab[draggable='true'] {
  cursor: pointer;
}

.tab[draggable='true']:active {
  cursor: grabbing;
}

.truncate-text {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

@keyframes tab-icon-pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.7;
    transform: scale(1.08);
  }
}

@media screen and (max-width: 768px) {
  .tab {
    min-width: 100px;
    max-width: 150px;
    padding: 0 8px;
  }

  .tab-icon {
    font-size: 14px;
    margin-right: 4px;
  }

  .tab-title {
    font-size: var(--font-size);
  }

  .tab-bar {
    min-height: 36px;
  }

  .context-menu {
    min-width: 140px;
  }

  .context-menu-item {
    padding: 10px 16px;
    font-size: var(--font-size);
  }

  @media screen and (max-width: 480px) {
    .tab {
      min-width: 40px;
      max-width: 50px;
      padding: 0 4px;
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
