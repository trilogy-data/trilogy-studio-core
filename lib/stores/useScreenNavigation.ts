import { ref, type Ref } from 'vue'
import { pushHashToUrl, removeHashFromUrl, getDefaultValueFromHash } from './urlStore'
import { useEditorStore, useDashboardStore, useUserSettingsStore } from '.'
import { lastSegment } from '../data/constants'
import { tips, editorTips, communityTips, dashboardTips, type ModalItem } from '../data/tips'

// Define valid screen types in one place to reduce duplication
type ScreenType =
  | 'editors'
  | 'tutorial'
  | 'llms'
  | 'dashboard'
  | 'dashboard-import'
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
}

const createNavigationStore = (): NavigationStore => {
  const dashboardStore = useDashboardStore()
  const editorStore = useEditorStore()
  const userSettingsStore = useUserSettingsStore()
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
    activeDocumentationKey: ref(getDefaultValueFromHash('docs', '')),
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

  const openTab = (screen: ScreenType, title: string | null, address: string): void => {
    // check if tab already exists
    const existingTab = state.tabs.value.find(
      (tab) => tab.screen === screen && tab.address === address,
    )
    if (existingTab) {
      setActiveTab(existingTab.id)
      return
    }
    const maxTabId = state.tabs.value.reduce((maxId, tab) => {
      const idNum = parseInt(tab.id.replace('tab-', ''))
      return isNaN(idNum) ? maxId : Math.max(maxId, idNum)
    }, 0)
    let tabIdCounter = maxTabId
    setActiveScreen(screen)
    let finalTitle = getName(screen, title, address)
    const tab: Tab = {
      id: `tab-${++tabIdCounter}`,
      title: finalTitle,
      screen,
      address,
    }
    state.tabs.value.push(tab)

    setActiveTab(tab.id)
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
    if (!activeKeys.includes('editors')) {
      state.activeEditor.value = ''
      removeHashFromUrl('editors')
      removeHashFromUrl('activeEditorTabs')
    }
    if (!activeKeys.includes('dashboard')) {
      state.activeDashboard.value = ''
      removeHashFromUrl('dashboard')
    }
    if (!activeKeys.includes('connections')) {
      state.activeConnectionKey.value = ''
      removeHashFromUrl('connections')
    }
    if (!activeKeys.includes('models')) {
      state.activeModelKey.value = ''
      removeHashFromUrl('model')
    }
    if (!activeKeys.includes('community-models')) {
      state.activeCommunityModelKey.value = ''
      removeHashFromUrl('community-models')
    }
    if (!activeKeys.includes('tutorial')) {
      state.activeDocumentationKey.value = ''
      removeHashFromUrl('docs')
    }
    if (!activeKeys.includes('llms')) {
      state.activeLLMConnectionKey.value = ''
      removeHashFromUrl('llms')
    }
    if (!activeKeys.includes('settings')) {
      removeHashFromUrl('sidebarScreen')
      removeHashFromUrl('settings')
    }
    if (!activeKeys.includes('profile')) {
      removeHashFromUrl('sidebarScreen')
    }
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

  const setActiveTab = (tabId: string): void => {
    // validate the tab exists
    const tabInfo = state.tabs.value.find((tab) => tab.id === tabId)
    if (tabInfo) {
      state.activeTab.value = tabId
      setActiveScreen(tabInfo.screen)
      let baseTips: ModalItem[] = userSettingsStore.getUnreadTips(tips)
      if (tabInfo.address) {
        pushHashToUrl(tabInfo.screen, tabInfo.address)
      }

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
      } else if (tabInfo.screen === 'tutorial') {
        state.activeDocumentationKey.value = tabInfo.address
      } else if (tabInfo.screen === 'models') {
        state.activeModelKey.value = tabInfo.address
      } else if (tabInfo.screen === 'dashboard-import') {
        baseTips = []
      } else if (tabInfo.screen === 'community-models') {
        state.activeCommunityModelKey.value = tabInfo.address
        baseTips = baseTips.concat(userSettingsStore.getUnreadTips(communityTips))
      }
      state.mobileMenuOpen.value = false
      state.displayedTips.value = baseTips
      state.showTipModal.value = baseTips.length > 0
    }
  }
  const setActiveScreen = (screen: ScreenType): void => {
    pushHashToUrl('screen', screen)
    state.activeScreen.value = screen
  }

  const setActiveSidebarScreen = (screen: ScreenType): void => {
    pushHashToUrl('sidebarScreen', screen)
    state.activeSidebarScreen.value = screen
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
      console.log('Skipping tips as per URL parameter')
    }

    if (importUrl && connectionType) {
      openTab('dashboard-import', null, 'dashboard-import')
      isImport = true
    }

    if (state.activeEditor.value && !isImport) {
      sidebarScreen = 'editors'
      openTab('editors', null, state.activeEditor.value)
    }
    if (state.activeDashboard.value && !isImport) {
      sidebarScreen = 'dashboard'
      openTab('dashboard', null, state.activeDashboard.value)
    }
    if (state.activeConnectionKey.value && !isImport) {
      sidebarScreen = 'connections'
      openTab('connections', null, state.activeConnectionKey.value)
    }
    if (state.activeModelKey.value && !isImport) {
      sidebarScreen = 'models'
      openTab('models', null, state.activeModelKey.value)
    }
    if (state.activeCommunityModelKey.value && !isImport) {
      sidebarScreen = 'community-models'
      openTab('community-models', null, state.activeCommunityModelKey.value)
    }
    if (state.activeDocumentationKey.value && !isImport) {
      sidebarScreen = 'tutorial'
      openTab('tutorial', null, state.activeDocumentationKey.value)
    }
    if (state.activeLLMConnectionKey.value && !isImport) {
      sidebarScreen = 'llms'
      openTab('llms', null, state.activeLLMConnectionKey.value)
    }
    if (state.activeSidebarScreen.value === 'settings') {
      sidebarScreen = 'settings'
      openTab('settings', 'Settings', 'settings')
    }
    if (state.activeSidebarScreen.value === 'profile') {
      sidebarScreen = 'profile'
      openTab('profile', 'Profile', 'profile')
    }

    setActiveSidebarScreen(sidebarScreen)
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
