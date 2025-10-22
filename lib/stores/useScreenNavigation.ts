import { ref, type Ref } from 'vue'
import { pushHashToUrl, removeHashFromUrl, getDefaultValueFromHash } from './urlStore'
import { useEditorStore, useDashboardStore } from '.'
import { lastSegment, KeySeparator } from '../data/constants'

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
  activeScreen: Ref<ScreenType>
  activeSidebarScreen: Ref<ScreenType>
  activeEditor: Ref<string>
  activeDashboard: Ref<string>
  activeConnectionKey: Ref<string>
  activeModelKey: Ref<string>
  activeCommunityModelKey: Ref<string>
  activeDocumentationKey: Ref<string>
  activeLLMConnectionKey: Ref<string>
  mobileMenuOpen: Ref<boolean>
  initialSearch: Ref<string>
  tabs: Ref<Tab[]>
  activeTab: Ref<string | null>
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
  readonly activeScreen: Ref<string>
  readonly activeSidebarScreen: Ref<string>
  readonly activeEditor: Ref<string>
  readonly activeDashboard: Ref<string>
  readonly activeConnectionKey: Ref<string>
  readonly activeModelKey: Ref<string>
  readonly activeCommunityModelKey: Ref<string>
  readonly activeDocumentationKey: Ref<string>
  readonly activeLLMConnectionKey: Ref<string>
  readonly mobileMenuOpen: Ref<boolean>
  readonly initialSearch: Ref<string>

  readonly tabs: Ref<Tab[]>
  readonly activeTab: Ref<string | null>
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
  updateTabName(screen: ScreenType, title: string | null, address: string): void
  openTab(screen: ScreenType, title: string | null, address: string): void
  closeTab(tabId: string): void
  closeOtherTabsExcept(tabId: string): void
  closeTabsToRightOf(tabId: string): void
  onInitialLoad(): void
}
const dashboardStore = useDashboardStore()
const editorStore = useEditorStore()
const createNavigationStore = (): NavigationStore => {
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
    mobileMenuOpen: ref(false),
    initialSearch: ref(getDefaultValueFromHash('initialSearch', '')),
    tabs: ref<Tab[]>([]),
    activeTab: ref<string | null>(null),
  }

  // Screens that should close mobile menu when activated
  const mobileMenuClosingScreens: ScreenType[] = [
    'community-models',
    'welcome',
    'profile',
    'settings',
    'dashboard-import',
    'editors',
    'connections',
    'dashboard',
    'models',
    'tutorial'
  ]

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
      console.log('Updating tab name to:', tabName, 'for tab id:', tab.id)
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
    console.log('Opening tab:', title, 'with id:', `tab-${tabIdCounter + 1}`)
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

  const closeTab = (tabId: string): void => {
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
  }

  const setActiveTab = (tabId: string): void => {
    // validate the tab exists
    const tabInfo = state.tabs.value.find((tab) => tab.id === tabId)
    if (tabInfo) {
      state.activeTab.value = tabId
      setActiveScreen(tabInfo.screen)
      if (tabInfo.address) {
        pushHashToUrl(tabInfo.screen, tabInfo.address)
      }

      if (tabInfo.screen === 'editors') {
        state.activeEditor.value = tabInfo.address
        editorStore.activeEditorId = tabInfo.address
      } else if (tabInfo.screen === 'dashboard') {
        state.activeDashboard.value = tabInfo.address
        dashboardStore.activeDashboardId = tabInfo.address
      } else if (tabInfo.screen === 'connections') {
        state.activeConnectionKey.value = tabInfo.address
      } else if (tabInfo.screen === 'llms') {
        state.activeLLMConnectionKey.value = tabInfo.address
      } else if (tabInfo.screen === 'tutorial') {
        state.activeDocumentationKey.value = tabInfo.address
      } else if (tabInfo.screen === 'models') {
        state.activeModelKey.value = tabInfo.address
      } else if (tabInfo.screen === 'community-models') {
        state.activeCommunityModelKey.value = tabInfo.address
      }
      //close if required
      if (mobileMenuClosingScreens.includes(tabInfo.screen)) {
        if (tabInfo.screen === 'connections') {
          // count of KeySeparator>1
          state.mobileMenuOpen.value = (tabInfo.address.split(KeySeparator).length - 1) <3;
        } 
        else if (tabInfo.screen === 'models') {
          state.mobileMenuOpen.value = (tabInfo.address.split(KeySeparator).length - 1) <2;
        }
        
        else {
          state.mobileMenuOpen.value = false
        }
      }
    }
  }
  const setActiveScreen = (screen: ScreenType): void => {
    pushHashToUrl('screen', screen)
    state.activeScreen.value = screen
    if (mobileMenuClosingScreens.includes(screen)) {
      state.mobileMenuOpen.value = false
    }
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
    openTab('editors', editor, editor)
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

  const onInitialLoad = (): void => {
    if (state.activeEditor.value) {
      openTab('editors', null, state.activeEditor.value)
    }
    if (state.activeDashboard.value) {
      openTab('dashboard', null, state.activeDashboard.value)
    }
    if (state.activeConnectionKey.value) {
      openTab('connections', null, state.activeConnectionKey.value)
    }
    if (state.activeModelKey.value) {
      openTab('models', null, state.activeModelKey.value)
    }
    if (state.activeCommunityModelKey.value) {
      openTab('community-models', null, state.activeCommunityModelKey.value)
    }
    if (state.activeDocumentationKey.value) {
      openTab('tutorial', null, state.activeDocumentationKey.value)
    }
    if (state.activeLLMConnectionKey.value) {
      openTab('llms', null, state.activeLLMConnectionKey.value)
    }
    if (state.activeSidebarScreen.value === 'settings') {
      openTab('settings', 'Settings', 'settings')
    }
    if (state.activeSidebarScreen.value === 'profile') {
      openTab('profile', 'Profile', 'profile')
    }
    // if (state.)
    // if (activeScreen.value === 'dashboard') {
    //   openTab('dashboard', state.activeDashboard.value, state.activeDashboard.value)
    //   return
    // }
    // if (activeScreen.value === 'connections') {
    //   openTab('connections', state.activeConnection.value, state.activeConnection.value)
    //   return
    // }
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
  }
}

const navigationStore = createNavigationStore()

export default function useScreenNavigation(): NavigationStore {
  return navigationStore
}

export type { ScreenType }
