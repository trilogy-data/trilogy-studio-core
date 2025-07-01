import { ref, type Ref } from 'vue'
import { pushHashToUrl, removeHashFromUrl, getDefaultValueFromHash } from './urlStore'
import { useEditorStore, useDashboardStore } from '.'

// Define valid screen types in one place to reduce duplication
type ScreenType = 
  | 'editors' 
  | 'tutorial' 
  | 'llms' 
  | 'dashboard' 
  | 'dashboard-import'
  | 'community-models' 
  | 'welcome' 
  | 'profile' 
  | 'settings' 
  | ''

interface NavigationState {
  activeScreen: Ref<ScreenType>
  activeEditor: Ref<string>
  activeDashboard: Ref<string>
  mobileMenuOpen: Ref<boolean>
}

interface NavigationStore {
  readonly activeScreen: Ref<string>
  readonly activeEditor: Ref<string>
  readonly activeDashboard: Ref<string>
  readonly mobileMenuOpen: Ref<boolean>
  setActiveScreen(screen: ScreenType): void
  setActiveEditor(editor: string): void
  setActiveDashboard(dashboard: string | null): void
  setActiveModel(model: string | null): void
  toggleMobileMenu(): void
}

const createNavigationStore = (): NavigationStore => {
  const state: NavigationState = {
    activeScreen: ref(getDefaultValueFromHash('screen', '')) as Ref<ScreenType>,
    activeEditor: ref(getDefaultValueFromHash('editor', '')),
    activeDashboard: ref(getDefaultValueFromHash('dashboard', '')),
    mobileMenuOpen: ref(false),
  }

  // Screens that should close mobile menu when activated
  const mobileMenuClosingScreens: ScreenType[] = [
    'community-models', 
    'welcome', 
    'profile', 
    'settings',
    'dashboard-import'
  ]

  const setActiveScreen = (screen: ScreenType): void => {
    pushHashToUrl('screen', screen)
    state.activeScreen.value = screen
    
    if (mobileMenuClosingScreens.includes(screen)) {
      state.mobileMenuOpen.value = false
    }
  }
  const setActiveModel = (model: string | null): void => {
    if (model === null) {
      removeHashFromUrl('model')
      return
    }
    pushHashToUrl('model', model)

    state.mobileMenuOpen.value = false
  }

  const setActiveEditor = (editor: string): void => {
    pushHashToUrl('editor', editor)
    state.activeEditor.value = editor
    const editorStore = useEditorStore()
    editorStore.activeEditorId = editor
    state.mobileMenuOpen.value = false
  }

  const setActiveDashboard = (dashboard: string | null): void => {
    if (dashboard === null) {
      removeHashFromUrl('dashboard')
      state.activeDashboard.value = ''
      return
    }
    pushHashToUrl('dashboard', dashboard)
    console.log(state.activeDashboard)
    state.activeDashboard.value = dashboard
    const dashboardStore = useDashboardStore()
    dashboardStore.activeDashboardId = dashboard
    state.mobileMenuOpen.value = false
  }

  const toggleMobileMenu = (): void => {
    state.mobileMenuOpen.value = !state.mobileMenuOpen.value
  }

  return {
    get activeScreen() {
      return state.activeScreen
    },
    get activeEditor() {
      return state.activeEditor
    },
    get activeDashboard() {
      return state.activeDashboard
    },
    get mobileMenuOpen() {
      return state.mobileMenuOpen
    },
    setActiveScreen,
    setActiveEditor,
    setActiveDashboard,
    toggleMobileMenu,
    setActiveModel,
  }
}

const navigationStore = createNavigationStore()

export default function useScreenNavigation(): NavigationStore {
  return navigationStore
}

export type { ScreenType }