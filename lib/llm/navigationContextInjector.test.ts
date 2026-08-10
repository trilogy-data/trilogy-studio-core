import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import {
  startNavigationContextInjection,
  resetNavigationInjectionForTests,
  describeNavigationContext,
} from './navigationContextInjector'
import useScreenNavigation from '../stores/useScreenNavigation'

const makeChatStore = () =>
  ({
    chats: {
      'chat-1': { id: 'chat-1', deleted: false, pendingContextNote: null, changed: false },
      'chat-2': { id: 'chat-2', deleted: false, pendingContextNote: null, changed: false },
    },
    isChatExecuting: () => false,
  }) as any

describe('describeNavigationContext', () => {
  it('describes dashboards, editors, and generic screens', () => {
    expect(
      describeNavigationContext(
        { screen: 'dashboard', dashboardId: 'd-1' },
        { dashboardName: 'Q3 Sales' },
      ),
    ).toContain('dashboard "Q3 Sales" (id d-1)')
    expect(
      describeNavigationContext({ screen: 'editors', editorId: 'e-1' }, { editorName: 'model' }),
    ).toContain('editor "model" (id e-1)')
    expect(describeNavigationContext({ screen: 'jobs' }, {})).toContain('jobs screen')
    expect(describeNavigationContext({ screen: '' }, {})).toContain('welcome')
  })
})

describe('startNavigationContextInjection', () => {
  let nav: ReturnType<typeof useScreenNavigation>
  let stop: (() => void) | null = null

  beforeEach(() => {
    setActivePinia(createPinia())
    window.location.hash = ''
    vi.useFakeTimers()
    resetNavigationInjectionForTests()
    nav = useScreenNavigation()
  })

  afterEach(() => {
    if (stop) {
      stop()
      stop = null
    }
    vi.useRealTimers()
  })

  it('queues an immediate note for the target conversation on start', async () => {
    const chatStore = makeChatStore()
    stop = startNavigationContextInjection({
      chatStore,
      getTargetChatId: () => 'chat-1',
    })
    await nextTick()
    expect(chatStore.chats['chat-1'].pendingContextNote).toContain('[navigation]')
  })

  it('debounces rapid navigation to the final location (latest-wins)', async () => {
    const chatStore = makeChatStore()
    stop = startNavigationContextInjection({
      chatStore,
      getTargetChatId: () => 'chat-1',
    })
    await nextTick()
    chatStore.chats['chat-1'].pendingContextNote = null

    nav.activeScreen.value = 'editors' as any
    await nextTick()
    nav.activeScreen.value = 'jobs' as any
    await nextTick()
    nav.activeScreen.value = 'models' as any
    await nextTick()

    // Mid-debounce: nothing queued yet.
    vi.advanceTimersByTime(1000)
    expect(chatStore.chats['chat-1'].pendingContextNote).toBeNull()

    vi.advanceTimersByTime(600)
    expect(chatStore.chats['chat-1'].pendingContextNote).toContain('models screen')
  })

  it('does not re-queue when bouncing back to the last-noted context', async () => {
    const chatStore = makeChatStore()
    stop = startNavigationContextInjection({
      chatStore,
      getTargetChatId: () => 'chat-1',
    })
    await nextTick()

    nav.activeScreen.value = 'jobs' as any
    await nextTick()
    vi.advanceTimersByTime(1600)
    expect(chatStore.chats['chat-1'].pendingContextNote).toContain('jobs screen')

    // Simulate delivery, then bounce away and back before the debounce fires
    // for the intermediate hop.
    chatStore.chats['chat-1'].pendingContextNote = null
    nav.activeScreen.value = 'models' as any
    await nextTick()
    nav.activeScreen.value = 'jobs' as any
    await nextTick()
    vi.advanceTimersByTime(1600)
    // Same context key as last queued — no duplicate note.
    expect(chatStore.chats['chat-1'].pendingContextNote).toBeNull()
  })

  it('writes notes to whichever conversation is active', async () => {
    const chatStore = makeChatStore()
    let target = 'chat-1'
    stop = startNavigationContextInjection({
      chatStore,
      getTargetChatId: () => target,
    })
    await nextTick()
    expect(chatStore.chats['chat-1'].pendingContextNote).toContain('[navigation]')

    target = 'chat-2'
    // The nav store is a module singleton whose state persists across tests,
    // so pick a screen no earlier test has landed on to guarantee a change.
    nav.activeScreen.value = 'connections' as any
    await nextTick()
    vi.advanceTimersByTime(1600)
    expect(chatStore.chats['chat-2'].pendingContextNote).toContain('connections screen')
  })

  it('names the dashboard via the lookup', async () => {
    const chatStore = makeChatStore()
    stop = startNavigationContextInjection({
      chatStore,
      getTargetChatId: () => 'chat-1',
      dashboardNameLookup: (id) => (id === 'd-42' ? 'Revenue' : null),
    })
    await nextTick()

    nav.activeScreen.value = 'dashboard' as any
    nav.activeDashboard.value = 'd-42'
    await nextTick()
    vi.advanceTimersByTime(1600)
    expect(chatStore.chats['chat-1'].pendingContextNote).toContain('dashboard "Revenue" (id d-42)')
  })
})
