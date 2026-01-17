import { ref, type Ref } from 'vue'
import {
  pushHashToUrl,
  removeHashFromUrl,
  getDefaultValueFromHash,
  removeHashesFromUrl,
} from './urlStore'
import {
  useEditorStore,
  useDashboardStore,
  useUserSettingsStore,
  useCommunityApiStore,
  useChatStore,
} from '.'
import { lastSegment, KeySeparator } from '../data/constants'
import { tips, editorTips, communityTips, dashboardTips, type ModalItem } from '../data/tips'

// Define valid screen types in one place to reduce duplication
type ScreenType =
  | 'editors'
  | 'tutorial'
  | 'llms'
  | 'dashboard'
  | 'dashboard-import'
  | 'asset-import'
  | 'models'
  | 'community-models'
  | 'welcome'
  | 'profile'
  | 'settings'
  | 'connections'
  | ''

interface NavigationState {
  fullScreen: Ref<boolean>
  activeScreen: Ref<ScreenType>
  activeSidebarScreen: Ref<ScreenType>
  activeEditor: Ref<string>
  activeDashboard: Ref<string>
  activeConnectionKey: Ref<string>
  activeModelKey: Ref<string>
  activeCommunityModelKey: Ref<string>
  activeDocumentationKey: Ref<string>
  activeLLMConnectionKey: Ref<string>
  modelImport: Ref<string>
  connectionImport: Ref<string>
  mobileMenuOpen: Ref<boolean>
  initialSearch: Ref<string>
  tabs: Ref<Tab[]>
  activeTab: Ref<string | null>
  showTipModal: Ref<boolean>
  displayedTips: Ref<ModalItem[]>
}

export interface Tab {
  id: string
  // what to show in tab
  title: string
  screen: ScreenType
  // the lookup for the component
  address: string
  params?: Record<string, string>
}

interface TabToOpen {
  screen: ScreenType
  title: string | null
  key: string
  isActive?: boolean
}

export interface NavigationStore {
  readonly fullScreen: Ref<boolean>
  readonly activeScreen: Ref<string>
  readonly activeSidebarScreen: Ref<string>
  readonly activeEditor: Ref<string>
  readonly activeDashboard: Ref<string>
  readonly activeConnectionKey: Ref<string>
  readonly activeModelKey: Ref<string>
  readonly activeCommunityModelKey: Ref<string>
  readonly activeDocumentationKey: Ref<string>
  readonly activeLLMConnectionKey: Ref<string>
  readonly modelImport: Ref<string>
  readonly connectionImport: Ref<string>
  readonly mobileMenuOpen: Ref<boolean>
  readonly initialSearch: Ref<string>
  readonly showTipModal: Ref<boolean>

  readonly tabs: Ref<Tab[]>
  readonly activeTab: Ref<string | null>
  readonly displayedTips: Ref<ModalItem[]>
  setActiveTab(tabId: string): void
  setActiveScreen(screen: ScreenType): void
  setActiveSidebarScreen(screen: ScreenType): void
  setActiveEditor(editor: string): void
  setActiveDashboard(dashboard: string | null): void
  setActiveModelKey(model: string | null): void
  setActiveCommunityModelKey(communityModel: string | null): void
  setActiveConnectionKey(connection: string | null): void
  setActiveDocumentationKey(documentation: string | null): void

  setActiveLLMConnectionKey(llmConnection: string | null): void
  toggleMobileMenu(): void
  toggleFullScreen(s: boolean): void
  updateTabName(screen: ScreenType, title: string | null, address: string): void
  openTab(screen: ScreenType, title: string | null, address: string): void
  closeTab(tabId: string | null, address: string | null): void
  closeOtherTabsExcept(tabId: string): void
  closeTabsToRightOf(tabId: string): void
  onInitialLoad(): void
  addBackListeners(): void
  removeBacklisteners(): void
}

const createNavigationStore = (): NavigationStore => {
  const dashboardStore = useDashboardStore()
  const editorStore = useEditorStore()
  const userSettingsStore = useUserSettingsStore()
  const communityApiStore = useCommunityApiStore()
  const chatStore = useChatStore()
  let eventListener: any = null
  const state: NavigationState = {
    activeScreen: ref(getDefaultValueFromHash('screen', '')) as Ref<ScreenType>,
    activeSidebarScreen: ref(
      getDefaultValueFromHash('sidebarScreen', 'editors'),
    ) as Ref<ScreenType>,
    activeEditor: ref(getDefaultValueFromHash('editors', '')),
    activeDashboard: ref(getDefaultValueFromHash('dashboard', '')),
    activeConnectionKey: ref(getDefaultValueFromHash('connections', '')),
    activeModelKey: ref(getDefaultValueFromHash('model', '')),
    activeCommunityModelKey: ref(getDefaultValueFromHash('community-models', '')),
    activeLLMConnectionKey: ref(getDefaultValueFromHash('llms', '')),
    activeDocumentationKey: ref(getDefaultValueFromHash('tutorial', '')),
    // model import is legacy
    modelImport: ref(getDefaultValueFromHash('import', getDefaultValueFromHash('model', ''))),
    connectionImport: ref(getDefaultValueFromHash('connection', '')),
    mobileMenuOpen: ref(false),
    initialSearch: ref(getDefaultValueFromHash('initialSearch', '')),
    tabs: ref<Tab[]>([]),
    activeTab: ref<string | null>(null),
    showTipModal: ref(true),
    displayedTips: ref<ModalItem[]>([]),
    fullScreen: ref(false),
  }

  const getName = (screen: ScreenType, title: string | null, address: string): string => {
    if (title) {
      return title
    }
    if (screen === 'dashboard') {
      let dashboard = dashboardStore.dashboards[address]
      if (dashboard) {
        return dashboard.name || 'Untitled Dashboard'
      }
    } else if (screen === 'editors') {
      let editor = editorStore.editors[address]
      if (editor) {
        return editor.name || 'Untitled Editor'
      }
    } else if (screen === 'llms') {
      // Address format: connectionName or connectionName+chatId
      const parts = address.split(KeySeparator)
      const connectionName = parts[0]
      const chatId = parts.length > 1 ? parts[1] : null

      if (chatId) {
        // Look up the chat name
        const chat = chatStore.getChatById(chatId)
        if (chat) {
          return chat.name
        }
      }
      // Fall back to connection name or "LLM Chat"
      return connectionName || 'LLM Chat'
    } else if (screen === 'community-models') {
      // Parse the address to get the store ID (first part before KeySeparator)
      const parts = address.split(KeySeparator)
      const storeId = parts[0]

      // Look up the store by ID and return its name
      const store = communityApiStore.stores.find((s) => s.id === storeId)
      if (store) {
        // If there are more parts (engine or model), append them to the store name
        if (parts.length === 2) {
          // Engine level: "Store Name - engine"
          return `${store.name} - ${parts[1]}`
        } else if (parts.length === 3) {
          // Model level: just the model name
          return parts[2]
        }
        // Store root level: just the store name
        return store.name
      }
    }
    return lastSegment(address, null)
  }

  const updateTabName = (screen: ScreenType, title: string | null, address: string): void => {
    const tab = state.tabs.value.find((tab) => tab.screen === screen && tab.address === address)
    if (tab) {
      let tabName = getName(screen, title, address)
      tab.title = tabName
    }
  }

  const openTab = (
    screen: ScreenType,
    title: string | null,
    address: string,
    skipUrlUpdate: boolean = false,
  ): void => {
    // check if tab already exists
    const existingTab = state.tabs.value.find(
      (tab) => tab.screen === screen && tab.address === address,
    )
    if (existingTab) {
      setActiveTab(existingTab.id, skipUrlUpdate)
      return
    }
    const maxTabId = state.tabs.value.reduce((maxId, tab) => {
      const idNum = parseInt(tab.id.replace('tab-', ''))
      return isNaN(idNum) ? maxId : Math.max(maxId, idNum)
    }, 0)
    let tabIdCounter = maxTabId
    if (!skipUrlUpdate) {
      setActiveScreen(screen)
    }
    let finalTitle = getName(screen, title, address)
    const tab: Tab = {
      id: `tab-${++tabIdCounter}`,
      title: finalTitle,
      screen,
      address,
    }
    state.tabs.value.push(tab)

    setActiveTab(tab.id, skipUrlUpdate)
  }

  const closeTab = (tabId: string | null, address: string | null = null): void => {
    if (!tabId && !address) {
      return
    }
    if (!tabId && address) {
      const tab = state.tabs.value.find((t) => t.address === address)
      if (tab) {
        tabId = tab.id
      } else {
        return
      }
    }
    const tabIndex = state.tabs.value.findIndex((tab) => tab.id === tabId)
    if (tabIndex !== -1) {
      const wasActiveTab = state.activeTab.value === tabId
      state.tabs.value.splice(tabIndex, 1)

      // Handle active tab change if we closed the active tab
      if (wasActiveTab) {
        if (state.tabs.value.length > 0) {
          // Set active to first remaining tab
          setActiveTab(state.tabs.value[0].id)
        } else {
          // No tabs remain, inject welcome tab and make it active
          openTab('welcome', 'Welcome', 'welcome')
        }
      }
    }
    cleanupActiveKeys()
  }

  const closeOtherTabsExcept = (tabId: string): void => {
    const wasActiveTab = state.activeTab.value === tabId
    state.tabs.value = state.tabs.value.filter((tab) => tab.id === tabId)

    // Handle active tab change if the active tab was not the kept tab
    if (!wasActiveTab) {
      if (state.tabs.value.length > 0) {
        // Set active to the remaining tab (which should be the kept tab)
        setActiveTab(state.tabs.value[0].id)
      } else {
        // No tabs remain, inject welcome tab and make it active
        openTab('welcome', 'Welcome', 'welcome')
      }
    }
    cleanupActiveKeys()
  }

  const cleanupActiveKeys = (): void => {
    let activeKeys = state.tabs.value.map((tab) => tab.screen)
    let keysToRemove: string[] = []
    if (!activeKeys.includes('editors')) {
      state.activeEditor.value = ''
      keysToRemove.push('editors')
      keysToRemove.push('activeEditorTab')
    }
    if (!activeKeys.includes('dashboard')) {
      state.activeDashboard.value = ''
      keysToRemove.push('dashboard')
    }
    if (!activeKeys.includes('connections')) {
      state.activeConnectionKey.value = ''
      keysToRemove.push('connections')
    }
    if (!activeKeys.includes('models')) {
      state.activeModelKey.value = ''
      keysToRemove.push('model')
    }
    if (!activeKeys.includes('community-models')) {
      state.activeCommunityModelKey.value = ''
      keysToRemove.push('community-models')
    }
    if (!activeKeys.includes('tutorial')) {
      state.activeDocumentationKey.value = ''
      keysToRemove.push('tutorial')
    }
    if (!activeKeys.includes('llms')) {
      state.activeLLMConnectionKey.value = ''
      keysToRemove.push('llms')
    }
    if (!activeKeys.includes('settings')) {
      keysToRemove.push('settings')
    }
    if (!activeKeys.includes('profile')) {
      keysToRemove.push('profile')
    }
    if (!activeKeys.includes('welcome')) {
      keysToRemove.push('welcome')
    }
    removeHashesFromUrl(keysToRemove)
  }

  const closeTabsToRightOf = (tabId: string): void => {
    const tabIndex = state.tabs.value.findIndex((tab) => tab.id === tabId)
    if (tabIndex !== -1) {
      const activeTabIndex = state.tabs.value.findIndex((tab) => tab.id === state.activeTab.value)
      const wasActiveTabClosed = activeTabIndex > tabIndex

      state.tabs.value.splice(tabIndex + 1)

      // Handle active tab change if the active tab was closed
      if (wasActiveTabClosed) {
        if (state.tabs.value.length > 0) {
          // Set active to the last remaining tab (which is the tab we kept to the right of)
          setActiveTab(state.tabs.value[state.tabs.value.length - 1].id)
        } else {
          // No tabs remain, inject welcome tab and make it active
          openTab('welcome', 'Welcome', 'welcome')
        }
      }
    }
    cleanupActiveKeys()
  }

  const setActiveTab = (tabId: string, skipUrlUpdate: boolean = false): void => {
    // validate the tab exists
    const tabInfo = state.tabs.value.find((tab) => tab.id === tabId)
    if (tabInfo) {
      state.activeTab.value = tabId
      setActiveScreen(tabInfo.screen)
      let baseTips: ModalItem[] = userSettingsStore.getUnreadTips(tips)

      if (tabInfo.screen === 'editors') {
        state.activeEditor.value = tabInfo.address
        editorStore.activeEditorId = tabInfo.address
        baseTips = baseTips.concat(userSettingsStore.getUnreadTips(editorTips))
      } else if (tabInfo.screen === 'dashboard') {
        state.activeDashboard.value = tabInfo.address
        dashboardStore.activeDashboardId = tabInfo.address
        // if full screen, only show dashboard tips
        if (state.fullScreen.value) {
          baseTips = []
        } else {
          baseTips = baseTips.concat(userSettingsStore.getUnreadTips(dashboardTips))
        }
      } else if (tabInfo.screen === 'connections') {
        state.activeConnectionKey.value = tabInfo.address
      } else if (tabInfo.screen === 'llms') {
        state.activeLLMConnectionKey.value = tabInfo.address
        // Parse chat ID from address if present (format: connectionName+chatId)
        const parts = tabInfo.address.split(KeySeparator)
        if (parts.length > 1) {
          const chatId = parts[1]
          chatStore.setActiveChat(chatId)
        }
      } else if (tabInfo.screen === 'tutorial') {
        state.activeDocumentationKey.value = tabInfo.address
      } else if (tabInfo.screen === 'models') {
        state.activeModelKey.value = tabInfo.address
      } else if (tabInfo.screen === 'dashboard-import' || tabInfo.screen === 'asset-import') {
        baseTips = []
      } else if (tabInfo.screen === 'community-models') {
        state.activeCommunityModelKey.value = tabInfo.address
        baseTips = baseTips.concat(userSettingsStore.getUnreadTips(communityTips))
      }
      state.mobileMenuOpen.value = false
      state.displayedTips.value = baseTips
      state.showTipModal.value = baseTips.length > 0
      // push last, so the event listener can detect it
      if (tabInfo.address && !skipUrlUpdate) {
        pushHashToUrl(tabInfo.screen, tabInfo.address)
      }
    }
  }
  const setActiveScreen = (screen: ScreenType): void => {
    if (state.activeScreen.value === screen) {
      return
    }
    state.activeScreen.value = screen
    pushHashToUrl('screen', screen)
  }

  const setActiveSidebarScreen = (screen: ScreenType): void => {
    state.activeSidebarScreen.value = screen
    pushHashToUrl('sidebarScreen', screen)
    if (screen == 'settings') {
      openTab('settings', 'Settings', 'settings')
    } else if (screen == 'profile') {
      openTab('profile', 'Profile', 'profile')
    }
  }

  const setActiveModelKey = (model: string | null): void => {
    if (model === null) {
      removeHashFromUrl('model')
      return
    }
    pushHashToUrl('model', model)
    state.activeModelKey.value = model
  }

  const setActiveCommunityModelKey = (communityModel: string | null): void => {
    if (communityModel === null) {
      removeHashFromUrl('community-models')
      state.activeCommunityModelKey.value = ''
      return
    }
    state.activeCommunityModelKey.value = communityModel
    openTab('community-models', null, communityModel)
  }

  const setActiveEditor = (editor: string): void => {
    if (editor === null) {
      removeHashFromUrl('editors')
      state.activeEditor.value = ''
      return
    }
    openTab('editors', null, editor)
  }

  const setActiveDocumentationKey = (documentation: string | null): void => {
    if (documentation === null) {
      removeHashFromUrl('docs')
      state.activeDocumentationKey.value = ''
      return
    }
    // last part of the documentation key
    let name = documentation.split('+')
    openTab('tutorial', name[name.length - 1], documentation)
  }

  const setActiveDashboard = (dashboard: string | null): void => {
    if (dashboard === null) {
      removeHashFromUrl('dashboard')
      state.activeDashboard.value = ''
      return
    }
    openTab('dashboard', null, dashboard)
  }

  const setActiveConnectionKey = (connection: string | null): void => {
    if (connection === null) {
      removeHashFromUrl('connections')
      state.activeConnectionKey.value = ''
      return
    }
    openTab('connections', null, connection)
  }

  const setActiveLLMConnectionKey = (llmConnection: string | null): void => {
    if (llmConnection === null) {
      removeHashFromUrl('llms')
      state.activeLLMConnectionKey.value = ''
      return
    }
    openTab('llms', null, llmConnection)
  }

  const toggleMobileMenu = (): void => {
    state.mobileMenuOpen.value = !state.mobileMenuOpen.value
  }

  const toggleFullScreen = (value: boolean): void => {
    state.fullScreen.value = value
  }

  const onInitialLoad = (): void => {
    const importUrl = state.modelImport.value
    const connectionType = state.connectionImport.value
    let sidebarScreen: ScreenType = 'editors'
    let isImport = false

    if (getDefaultValueFromHash('skipTips', '') === 'true') {
      userSettingsStore.updateSetting('skipAllTips', true)
    }

    if (importUrl && connectionType) {
      // Check if we have new-style asset import params or legacy dashboard import
      const assetType = getDefaultValueFromHash('assetType', '')
      const assetName = getDefaultValueFromHash('assetName', '')

      if (assetType && assetName) {
        // New asset import format
        openTab('asset-import', null, 'asset-import')
      } else {
        // Legacy dashboard import format
        openTab('dashboard-import', null, 'dashboard-import')
      }
      isImport = true
    }

    let activeScreen = state.activeScreen.value
    let activeSidebarScreen = state.activeSidebarScreen.value

    // Refactored: collect tabs to open in a list
    const tabsToOpen: TabToOpen[] = []

    if (state.activeEditor.value && !isImport) {
      tabsToOpen.push({
        screen: 'editors',
        title: null,
        key: state.activeEditor.value,
        isActive: activeScreen === 'editors',
      })
    }

    if (state.activeDashboard.value && !isImport) {
      tabsToOpen.push({
        screen: 'dashboard',
        title: null,
        key: state.activeDashboard.value,
        isActive: activeScreen === 'dashboard',
      })
    }

    if (state.activeConnectionKey.value && !isImport) {
      tabsToOpen.push({
        screen: 'connections',
        title: null,
        key: state.activeConnectionKey.value,
        isActive: activeScreen === 'connections',
      })
    }

    if (state.activeModelKey.value && !isImport) {
      tabsToOpen.push({
        screen: 'models',
        title: null,
        key: state.activeModelKey.value,
        isActive: activeScreen === 'models',
      })
    }

    if (state.activeCommunityModelKey.value && !isImport) {
      tabsToOpen.push({
        screen: 'community-models',
        title: null,
        key: state.activeCommunityModelKey.value,
        isActive: activeScreen === 'community-models',
      })
    }

    if (state.activeDocumentationKey.value && !isImport) {
      tabsToOpen.push({
        screen: 'tutorial',
        title: null,
        key: state.activeDocumentationKey.value,
        isActive: activeScreen === 'tutorial',
      })
    }

    if (state.activeLLMConnectionKey.value && !isImport) {
      tabsToOpen.push({
        screen: 'llms',
        title: null,
        key: state.activeLLMConnectionKey.value,

        isActive: activeScreen === 'llms',
      })
    }

    if (state.activeSidebarScreen.value === 'settings') {
      tabsToOpen.push({
        screen: 'settings',
        title: 'Settings',
        key: 'settings',
        isActive: activeScreen === 'settings',
      })
    }

    if (state.activeSidebarScreen.value === 'profile') {
      tabsToOpen.push({
        screen: 'profile',
        title: 'Profile',
        key: 'profile',
        isActive: activeScreen === 'profile',
      })
    }

    // Sort tabs so the active screen is opened last (to remain active)
    tabsToOpen.sort((a, b) => {
      if (a.isActive) return 1
      if (b.isActive) return -1
      return 0
    })

    // Loop over list and open tabs
    tabsToOpen.forEach((tab) => {
      openTab(tab.screen, tab.title, tab.key, true)
    })

    setActiveScreen(activeScreen)

    // If no sidebar screen is set, derive it from the last opened tab's screen
    if (!activeSidebarScreen && tabsToOpen.length > 0) {
      const lastTab = tabsToOpen[tabsToOpen.length - 1]
      sidebarScreen = lastTab.screen
    } else if (activeSidebarScreen) {
      sidebarScreen = activeSidebarScreen
    }

    setActiveSidebarScreen(sidebarScreen)
  }

  const addBackListeners = (): void => {
    if (eventListener) {
      return
    }
    eventListener = window.addEventListener('hashchange', () => {
      // Get current hash values
      const currentEditors = getDefaultValueFromHash('editors', '')
      const currentDashboard = getDefaultValueFromHash('dashboard', '')
      const currentConnections = getDefaultValueFromHash('connections', '')
      const currentModels = getDefaultValueFromHash('model', '')
      const currentCommunityModels = getDefaultValueFromHash('community-models', '')
      const currentDocs = getDefaultValueFromHash('docs', '')
      const currentLLMs = getDefaultValueFromHash('llms', '')
      const currentScreen = getDefaultValueFromHash('screen', '') as ScreenType
      const currentSidebarScreen = getDefaultValueFromHash('sidebarScreen', '') as ScreenType
      let changedScreen = false
      // Update sidebar screen if it changed
      if (currentSidebarScreen !== state.activeSidebarScreen.value) {
        setActiveSidebarScreen(currentSidebarScreen)
      }

      if (currentScreen !== state.activeScreen.value) {
        state.activeScreen.value = currentScreen
        changedScreen = true
      }

      // Find which hash value changed and get the corresponding tab
      const hashToTabMap = [
        {
          hash: currentEditors,
          screen: 'editors' as ScreenType,
          current: state.activeEditor.value,
        },
        {
          hash: currentDashboard,
          screen: 'dashboard' as ScreenType,
          current: state.activeDashboard.value,
        },
        {
          hash: currentConnections,
          screen: 'connections' as ScreenType,
          current: state.activeConnectionKey.value,
        },
        {
          hash: currentModels,
          screen: 'models' as ScreenType,
          current: state.activeModelKey.value,
        },
        {
          hash: currentCommunityModels,
          screen: 'community-models' as ScreenType,
          current: state.activeCommunityModelKey.value,
        },
        {
          hash: currentDocs,
          screen: 'tutorial' as ScreenType,
          current: state.activeDocumentationKey.value,
        },
        {
          hash: currentLLMs,
          screen: 'llms' as ScreenType,
          current: state.activeLLMConnectionKey.value,
        },
      ]

      for (const { hash, screen, current } of hashToTabMap) {
        if ((hash && hash !== current) || (screen === currentScreen && changedScreen)) {
          const targetTab = state.tabs.value.find(
            (tab) => tab.screen === screen && tab.screen === currentScreen && tab.address === hash,
          )
          if (targetTab && targetTab.id !== state.activeTab.value) {
            // Use setActiveTab but skip hash update to avoid recursion
            setActiveTab(targetTab.id, true)
            break // Only handle one change at a time
          }
          if (!targetTab && hash) {
            // Tab doesn't exist, open it
            openTab(screen, null, hash)
            break // Only handle one change at a time
          }
        }
      }
    })
  }

  const removeBacklisteners = (): void => {
    if (eventListener) {
      window.removeEventListener('hashchange', eventListener)
      eventListener = null
    }
  }

  return {
    get activeScreen() {
      return state.activeScreen
    },
    get activeSidebarScreen() {
      return state.activeSidebarScreen
    },
    get activeEditor() {
      return state.activeEditor
    },
    get activeDashboard() {
      return state.activeDashboard
    },
    get activeConnectionKey() {
      return state.activeConnectionKey
    },
    get activeModelKey() {
      return state.activeModelKey
    },

    get activeCommunityModelKey() {
      return state.activeCommunityModelKey
    },
    get activeDocumentationKey() {
      return state.activeDocumentationKey
    },
    get activeLLMConnectionKey() {
      return state.activeLLMConnectionKey
    },
    get modelImport() {
      return state.modelImport
    },
    get connectionImport() {
      return state.connectionImport
    },
    get mobileMenuOpen() {
      return state.mobileMenuOpen
    },
    get initialSearch() {
      return state.initialSearch
    },
    get tabs() {
      return state.tabs
    },
    get activeTab() {
      return state.activeTab
    },
    get showTipModal() {
      return state.showTipModal
    },
    get displayedTips() {
      return state.displayedTips
    },
    get fullScreen() {
      return state.fullScreen
    },
    setActiveScreen,
    setActiveSidebarScreen,
    setActiveEditor,
    setActiveDashboard,
    setActiveConnectionKey,
    setActiveDocumentationKey,
    setActiveLLMConnectionKey,
    setActiveCommunityModelKey,
    toggleMobileMenu,
    setActiveModelKey,
    setActiveTab,
    openTab,
    updateTabName,
    closeTab,
    closeOtherTabsExcept,
    closeTabsToRightOf,
    onInitialLoad,
    toggleFullScreen,
    addBackListeners,
    removeBacklisteners,
  }
}

let navigationStore = null as NavigationStore | null

export default function useScreenNavigation(): NavigationStore {
  if (!navigationStore) {
    navigationStore = createNavigationStore()
  }
  return navigationStore
}

export type { ScreenType }
