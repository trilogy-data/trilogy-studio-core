import { ref, type Ref } from 'vue'
import {
  pushHashToUrl,
  removeHashFromUrl,
  getDefaultValueFromHash,
  URL_HASH_KEYS,
} from './urlStore'
import useScreenNavigation from './useScreenNavigation'

const PANEL_WIDTH_STORAGE_KEY = 'trilogy-global-chat-width'
/** The user's explicit open/close choice ('open' | 'closed'). Absent until
 *  they interact with the panel; the default-open heuristic only applies
 *  while it's absent. */
const PANEL_OPEN_PREF_STORAGE_KEY = 'trilogy-global-chat-open-pref'
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
  /** canOpen gates opening (not closing) — hosts pass "an LLM connection
   *  exists" so the shortcut matches the rail icon's availability. */
  addKeyListener(canOpen?: () => boolean): void
  removeKeyListener(): void
  onInitialLoad(): void
  /** Called once after persisted stores hydrate: open the panel by default
   *  for users with an LLM connection, unless a hash deep-link already
   *  decided or the user has explicitly closed it before. */
  applyDefaultOpenState(hasLLMConnections: boolean): void
}

export function clampPanelWidth(width: number): number {
  return Math.min(GLOBAL_CHAT_MAX_WIDTH, Math.max(GLOBAL_CHAT_MIN_WIDTH, Math.round(width)))
}

function loadOpenPreference(): 'open' | 'closed' | null {
  try {
    const raw = localStorage.getItem(PANEL_OPEN_PREF_STORAGE_KEY)
    if (raw === 'open' || raw === 'closed') return raw
  } catch {
    // localStorage unavailable — treat as no preference
  }
  return null
}

function storeOpenPreference(pref: 'open' | 'closed'): void {
  try {
    localStorage.setItem(PANEL_OPEN_PREF_STORAGE_KEY, pref)
  } catch {
    // best-effort persistence only
  }
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
    storeOpenPreference('open')
    syncHash()
  }

  const closePanel = () => {
    isOpen.value = false
    storeOpenPreference('closed')
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

  const addKeyListener = (canOpen?: () => boolean) => {
    if (keyListener) return
    keyListener = (e: KeyboardEvent) => {
      // Ctrl/Cmd+Shift+Period. Match on e.code — with shift held, e.key is
      // layout-dependent ('>' on US keyboards).
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'Period') {
        // Full-screen mode bypasses SidebarLayout entirely, so the panel has
        // nowhere to render; the shortcut is a no-op there.
        if (useScreenNavigation().fullScreen.value) return
        // Closing is always allowed; opening is gated the same way as the
        // rail icon (no LLM connection -> no panel).
        if (!isOpen.value && canOpen && !canOpen()) return
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

  const applyDefaultOpenState = (hasLLMConnections: boolean) => {
    // A hash deep-link (or anything else that already opened the panel) wins.
    if (isOpen.value) return
    // No LLM connection: the panel has nothing to offer; stay hidden.
    if (!hasLLMConnections) return
    // Respect an explicit close from a previous session.
    if (loadOpenPreference() === 'closed') return
    openPanel()
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
    applyDefaultOpenState,
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
