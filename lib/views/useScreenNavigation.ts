import { ref, provide } from 'vue'
import { pushHashToUrl, getDefaultValueFromHash } from '../stores/urlStore'
import { useDashboardStore, useEditorStore } from '../stores'
export default function useScreenNavigation() {
  const activeScreen = ref(getDefaultValueFromHash('screen', '') || '')
  const activeEditor = ref(getDefaultValueFromHash('editor', '') || '')
  const activeDashboard = ref(getDefaultValueFromHash('dashboard', '') || '')
  const mobileMenuOpen = ref(false)
  const setActiveScreen = (screen: string) => {
    pushHashToUrl('screen', screen)
    activeScreen.value = screen
    if (['community-models', 'welcome', 'profile', 'settings'].includes(screen)) {
      mobileMenuOpen.value = false
    }
  }

  const setActiveEditor = (editor: string) => {
    pushHashToUrl('editor', editor)
    activeEditor.value = editor
    let editorStore = useEditorStore()
    editorStore.activeEditorId = editor
    mobileMenuOpen.value = false
  }

  const setActiveDashboard = (dashboard: string) => {
    pushHashToUrl('dashboard', dashboard)
    activeDashboard.value = dashboard
    let dashboardStore = useDashboardStore()
    dashboardStore.activeDashboardId = dashboard
    mobileMenuOpen.value = false
  }

  // Provide for deeper component access
  provide('setActiveScreen', setActiveScreen)
  provide('setActiveEditor', setActiveEditor)
  provide('setActiveDashboard', setActiveDashboard)
  return {
    activeScreen,
    activeEditor,
    activeDashboard,
    setActiveScreen,
    setActiveEditor,
    setActiveDashboard,
    mobileMenuOpen,
  }
}
