// navigationStore.ts
import { ref, reactive, type Ref } from 'vue'
import { pushHashToUrl, getDefaultValueFromHash } from './urlStore'
import { useEditorStore, useDashboardStore } from '.'

// Define types for the store
interface NavigationState {
  activeScreen: Ref<string>;
  activeEditor: Ref<string>;
  activeDashboard: Ref<string>;
  mobileMenuOpen: Ref<boolean>;
}

interface NavigationStore {
  // Properties (implemented as getters that return refs)
  readonly activeScreen: Ref<string>;
  readonly activeEditor: Ref<string>;
  readonly activeDashboard: Ref<string>;
  readonly mobileMenuOpen: Ref<boolean>;
  
  // Methods
  setActiveScreen(screen: string): void;
  setActiveEditor(editor: string): void;
  setActiveDashboard(dashboard: string): void;
  toggleMobileMenu(): void;
}

// Create a single store instance that will be shared across components
const createNavigationStore = (): NavigationStore => {
  // Create reactive state
  const state: NavigationState = {
    activeScreen: ref(getDefaultValueFromHash('screen', '')),
    activeEditor: ref(getDefaultValueFromHash('editor', '')),
    activeDashboard: ref(getDefaultValueFromHash('dashboard', '')),
    mobileMenuOpen: ref(false)
  };

  // Define methods that modify the state
  const setActiveScreen = (screen: string): void => {
    pushHashToUrl('screen', screen)
    state.activeScreen.value = screen
    if (['community-models', 'welcome', 'profile', 'settings'].includes(screen)) {
      state.mobileMenuOpen.value = false
    }
  }

  const setActiveEditor = (editor: string): void => {
    pushHashToUrl('editor', editor)
    state.activeEditor.value = editor
    const editorStore = useEditorStore()
    editorStore.activeEditorId = editor
    state.mobileMenuOpen.value = false
  }

  const setActiveDashboard = (dashboard: string): void => {
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
    // Expose state as properties that return refs
    get activeScreen() { return state.activeScreen },
    get activeEditor() { return state.activeEditor },
    get activeDashboard() { return state.activeDashboard },
    get mobileMenuOpen() { return state.mobileMenuOpen },
    
    // Expose methods
    setActiveScreen,
    setActiveEditor,
    setActiveDashboard,
    toggleMobileMenu
  }
}

// Create a single instance
const navigationStore = createNavigationStore()

// Export a function that always returns the same instance
export default function useScreenNavigation(): NavigationStore {
  return navigationStore
}

