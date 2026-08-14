import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import useGlobalChatPanel, {
  resetGlobalChatPanelForTests,
  clampPanelWidth,
  GLOBAL_CHAT_MIN_WIDTH,
  GLOBAL_CHAT_MAX_WIDTH,
  GLOBAL_CHAT_DEFAULT_WIDTH,
} from './useGlobalChatPanel'

const hashParams = () => new URLSearchParams(window.location.hash.slice(1))

describe('useGlobalChatPanel', () => {
  beforeEach(() => {
    window.location.hash = ''
    localStorage.clear()
    setActivePinia(createPinia())
    resetGlobalChatPanelForTests()
  })

  it('starts closed with the default width', () => {
    const panel = useGlobalChatPanel()
    expect(panel.isOpen.value).toBe(false)
    expect(panel.panelWidth.value).toBe(GLOBAL_CHAT_DEFAULT_WIDTH)
    expect(panel.view.value).toBe('conversation')
  })

  it('round-trips open/close state through the URL hash', () => {
    const panel = useGlobalChatPanel()
    panel.openPanel()
    expect(panel.isOpen.value).toBe(true)
    expect(hashParams().get('chatPanel')).toBe('open')

    panel.closePanel()
    expect(panel.isOpen.value).toBe(false)
    expect(hashParams().get('chatPanel')).toBeNull()
  })

  it('writes the active chat id into the hash', () => {
    const panel = useGlobalChatPanel()
    panel.openPanel('chat-123')
    expect(hashParams().get('chatPanel')).toBe('chat-123')

    panel.setActivePanelChat('chat-456')
    expect(hashParams().get('chatPanel')).toBe('chat-456')
    expect(panel.view.value).toBe('conversation')
  })

  it('toggles', () => {
    const panel = useGlobalChatPanel()
    panel.togglePanel()
    expect(panel.isOpen.value).toBe(true)
    panel.togglePanel()
    expect(panel.isOpen.value).toBe(false)
  })

  it('restores an open panel with a chat id from the hash', () => {
    window.location.hash = '#chatPanel=chat-789'
    const panel = useGlobalChatPanel()
    panel.onInitialLoad()
    expect(panel.isOpen.value).toBe(true)
    expect(panel.activePanelChatId.value).toBe('chat-789')
  })

  it('restores an open panel without a chat id from the sentinel', () => {
    window.location.hash = '#chatPanel=open'
    const panel = useGlobalChatPanel()
    panel.onInitialLoad()
    expect(panel.isOpen.value).toBe(true)
    expect(panel.activePanelChatId.value).toBe('')
  })

  it('stays closed when the hash has no panel entry', () => {
    const panel = useGlobalChatPanel()
    panel.onInitialLoad()
    expect(panel.isOpen.value).toBe(false)
  })

  it('clamps and persists width', () => {
    const panel = useGlobalChatPanel()
    panel.setPanelWidth(10_000)
    expect(panel.panelWidth.value).toBe(GLOBAL_CHAT_MAX_WIDTH)
    panel.setPanelWidth(1)
    expect(panel.panelWidth.value).toBe(GLOBAL_CHAT_MIN_WIDTH)
    panel.setPanelWidth(400)
    expect(panel.panelWidth.value).toBe(400)

    // A fresh instance reads the persisted value back.
    resetGlobalChatPanelForTests()
    const fresh = useGlobalChatPanel()
    expect(fresh.panelWidth.value).toBe(400)
  })

  it('clampPanelWidth bounds values', () => {
    expect(clampPanelWidth(0)).toBe(GLOBAL_CHAT_MIN_WIDTH)
    expect(clampPanelWidth(99_999)).toBe(GLOBAL_CHAT_MAX_WIDTH)
    expect(clampPanelWidth(415.6)).toBe(416)
  })

  describe('applyDefaultOpenState', () => {
    it('opens by default for users with an LLM connection', () => {
      const panel = useGlobalChatPanel()
      panel.applyDefaultOpenState(true)
      expect(panel.isOpen.value).toBe(true)
    })

    it('stays hidden without an LLM connection', () => {
      const panel = useGlobalChatPanel()
      panel.applyDefaultOpenState(false)
      expect(panel.isOpen.value).toBe(false)
    })

    it('respects an explicit close from a previous session', () => {
      const panel = useGlobalChatPanel()
      panel.openPanel()
      panel.closePanel()

      // Simulate a fresh load: new instance, same localStorage.
      resetGlobalChatPanelForTests()
      const fresh = useGlobalChatPanel()
      fresh.applyDefaultOpenState(true)
      expect(fresh.isOpen.value).toBe(false)
    })

    it('a hash deep-link decision wins (no double-apply)', () => {
      window.location.hash = '#chatPanel=chat-42'
      const panel = useGlobalChatPanel()
      panel.onInitialLoad()
      panel.applyDefaultOpenState(true)
      expect(panel.isOpen.value).toBe(true)
      expect(panel.activePanelChatId.value).toBe('chat-42')
    })
  })

  describe('keyboard shortcut gating', () => {
    const press = () =>
      window.dispatchEvent(
        new KeyboardEvent('keydown', { code: 'Period', ctrlKey: true, shiftKey: true }),
      )

    it('does not open when canOpen returns false, but still closes', () => {
      const panel = useGlobalChatPanel()
      panel.addKeyListener(() => false)
      press()
      expect(panel.isOpen.value).toBe(false)

      panel.openPanel()
      press()
      expect(panel.isOpen.value).toBe(false)
      panel.removeKeyListener()
    })

    it('opens when canOpen returns true', () => {
      const panel = useGlobalChatPanel()
      panel.addKeyListener(() => true)
      press()
      expect(panel.isOpen.value).toBe(true)
      panel.removeKeyListener()
    })
  })
})
