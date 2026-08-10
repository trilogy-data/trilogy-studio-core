import { ref, type Ref } from 'vue'
import {
  pushHashToUrl,
  removeHashFromUrl,
  getDefaultValueFromHash,
  URL_HASH_KEYS,
} from './urlStore'
import useScreenNavigation from './useScreenNavigation'

const PANEL_WIDTH_STORAGE_KEY = 'trilogy-global-chat-width'
export const GLOBAL_CHAT_MIN_WIDTH = 320
export const GLOBAL_CHAT_MAX_WIDTH = 640
export const GLOBAL_CHAT_DEFAULT_WIDTH = 380
/** Hash value used when the panel is open without a specific conversation. */
const OPEN_SENTINEL = 'open'

export type GlobalChatPanelView = 'conversation' | 'list'

export interface GlobalChatPanelStore {
  readonly isOpen: Ref<boolean>
  readonly panelWidth: Ref<number>
  /** Conversation shown in the panel. Deliberately separate from
   *  chatStore.activeChatId, which is owned by the llms screen / tab
   *  navigation — the panel must not fight over it. */
  readonly activePanelChatId: Ref<string>
  readonly view: Ref<GlobalChatPanelView>
  openPanel(chatId?: string): void
  closePanel(): void
  togglePanel(): void
  setActivePanelChat(chatId: string): void
  setView(view: GlobalChatPanelView): void
  setPanelWidth(width: number): void
  addKeyListener(): void
  removeKeyListener(): void
  onInitialLoad(): void
}

export function clampPanelWidth(width: number): number {
  return Math.min(GLOBAL_CHAT_MAX_WIDTH, Math.max(GLOBAL_CHAT_MIN_WIDTH, Math.round(width)))
}

function loadStoredWidth(): number {
  try {
    const raw = localStorage.getItem(PANEL_WIDTH_STORAGE_KEY)
    if (raw) {
      const parsed = Number(raw)
      if (Number.isFinite(parsed)) return clampPanelWidth(parsed)
    }
  } catch {
    // localStorage unavailable (privacy mode etc.) — fall through to default
  }
  return GLOBAL_CHAT_DEFAULT_WIDTH
}

const createGlobalChatPanelStore = (): GlobalChatPanelStore => {
  const isOpen = ref(false)
  const panelWidth = ref(loadStoredWidth())
  const activePanelChatId = ref('')
  const view = ref<GlobalChatPanelView>('conversation')
  let keyListener: ((e: KeyboardEvent) => void) | null = null

  const syncHash = () => {
    if (isOpen.value) {
      pushHashToUrl(URL_HASH_KEYS.CHAT_PANEL, activePanelChatId.value || OPEN_SENTINEL)
    } else {
      removeHashFromUrl(URL_HASH_KEYS.CHAT_PANEL)
    }
  }

  const openPanel = (chatId?: string) => {
    if (chatId) {
      activePanelChatId.value = chatId
      view.value = 'conversation'
    }
    isOpen.value = true
    syncHash()
  }

  const closePanel = () => {
    isOpen.value = false
    syncHash()
  }

  const togglePanel = () => {
    if (isOpen.value) {
      closePanel()
    } else {
      openPanel()
    }
  }

  const setActivePanelChat = (chatId: string) => {
    activePanelChatId.value = chatId
    view.value = 'conversation'
    syncHash()
  }

  const setView = (next: GlobalChatPanelView) => {
    view.value = next
  }

  const setPanelWidth = (width: number) => {
    panelWidth.value = clampPanelWidth(width)
    try {
      localStorage.setItem(PANEL_WIDTH_STORAGE_KEY, String(panelWidth.value))
    } catch {
      // best-effort persistence only
    }
  }

  const addKeyListener = () => {
    if (keyListener) return
    keyListener = (e: KeyboardEvent) => {
      // Ctrl/Cmd+Shift+Period. Match on e.code — with shift held, e.key is
      // layout-dependent ('>' on US keyboards).
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'Period') {
        // Full-screen mode bypasses SidebarLayout entirely, so the panel has
        // nowhere to render; the shortcut is a no-op there.
        if (useScreenNavigation().fullScreen.value) return
        e.preventDefault()
        togglePanel()
      }
    }
    window.addEventListener('keydown', keyListener)
  }

  const removeKeyListener = () => {
    if (keyListener) {
      window.removeEventListener('keydown', keyListener)
      keyListener = null
    }
  }

  const onInitialLoad = () => {
    const stored = getDefaultValueFromHash(URL_HASH_KEYS.CHAT_PANEL, '')
    if (!stored) return
    isOpen.value = true
    if (stored !== OPEN_SENTINEL) {
      // May reference a deleted chat; the panel component validates and falls
      // back to the conversation list if the id no longer resolves.
      activePanelChatId.value = stored
    }
  }

  return {
    isOpen,
    panelWidth,
    activePanelChatId,
    view,
    openPanel,
    closePanel,
    togglePanel,
    setActivePanelChat,
    setView,
    setPanelWidth,
    addKeyListener,
    removeKeyListener,
    onInitialLoad,
  }
}

// Lazy module singleton, same pattern as useScreenNavigation — importable from
// anywhere (components, tool executors) without an app instance.
let globalChatPanelStore = null as GlobalChatPanelStore | null

export default function useGlobalChatPanel(): GlobalChatPanelStore {
  if (!globalChatPanelStore) {
    globalChatPanelStore = createGlobalChatPanelStore()
  }
  return globalChatPanelStore
}

/** Test-only: drop the singleton so each test starts from a clean slate. */
export function resetGlobalChatPanelForTests(): void {
  globalChatPanelStore = null
}
