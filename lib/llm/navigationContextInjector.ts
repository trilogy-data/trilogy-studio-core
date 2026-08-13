import { watch } from 'vue'
import useScreenNavigation from '../stores/useScreenNavigation'
import type { ChatStoreType } from '../stores/chatStore'

const DEBOUNCE_MS = 1500

// Last context key delivered (or queued) per chat, so bouncing away and back
// to the same screen produces no duplicate note.
const lastQueuedKey = new Map<string, string>()

function currentNavigationKey(): string {
  const nav = useScreenNavigation()
  const screen = nav.activeScreen.value
  const refId = nav.activeDashboard.value || nav.activeEditor.value || ''
  return `${screen}:${refId}`
}

/**
 * Mark the current location as already delivered for a chat. Callers that
 * seed their own richer context note (e.g. the editor AI-assist note, which
 * names the editor and carries the selection) use this so the injector's
 * immediate/debounced nav note for the same location doesn't clobber it.
 */
export function markNavigationContextDelivered(chatId: string): void {
  if (!chatId) return
  lastQueuedKey.set(chatId, currentNavigationKey())
}

/** Forget a chat's dedupe state so its next note re-queues even for the
 *  current location. Used when a conversation is cleared: the delivered note
 *  died with the history, and a fresh one should accompany the next send. */
export function resetNavigationNoteDedupe(chatId: string): void {
  lastQueuedKey.delete(chatId)
}

export function describeNavigationContext(
  context: { screen: string; dashboardId?: string; editorId?: string },
  stores: { dashboardName?: string | null; editorName?: string | null },
): string {
  if (context.screen === 'dashboard' && context.dashboardId) {
    const name = stores.dashboardName || context.dashboardId
    return `[navigation] The user is now viewing dashboard "${name}" (id ${context.dashboardId}). Dashboard tools default to the currently viewed dashboard.`
  }
  if (context.screen === 'editors' && context.editorId) {
    const name = stores.editorName || context.editorId
    return `[navigation] The user is now viewing editor "${name}" (id ${context.editorId}).`
  }
  return `[navigation] The user is now on the ${context.screen || 'welcome'} screen.`
}

export interface NavigationInjectionDeps {
  chatStore: ChatStoreType
  /** Which conversation receives the notes (the panel's active conversation). */
  getTargetChatId: () => string
  dashboardNameLookup?: (id: string) => string | null
  editorNameLookup?: (id: string) => string | null
}

/**
 * Watch screen navigation and queue latest-wins context notes on the target
 * conversation. Notes are stored on Chat.pendingContextNote and delivered
 * lazily by sendGlobalChatMessage — navigation NEVER triggers an LLM turn
 * (that's why this deliberately does not use chat.pendingInjections, whose
 * drain calls executeMessage).
 *
 * Returns a stop function.
 */
export function startNavigationContextInjection(deps: NavigationInjectionDeps): () => void {
  const nav = useScreenNavigation()
  let timer: ReturnType<typeof setTimeout> | null = null

  const queueNote = () => {
    const chatId = deps.getTargetChatId()
    if (!chatId) return
    const chat = deps.chatStore.chats[chatId]
    if (!chat || chat.deleted) return

    const context = {
      screen: nav.activeScreen.value,
      dashboardId: nav.activeDashboard.value || undefined,
      editorId: nav.activeEditor.value || undefined,
    }
    const key = currentNavigationKey()
    if (lastQueuedKey.get(chatId) === key) return
    lastQueuedKey.set(chatId, key)

    chat.pendingContextNote = describeNavigationContext(context, {
      dashboardName: context.dashboardId
        ? (deps.dashboardNameLookup?.(context.dashboardId) ?? null)
        : null,
      editorName: context.editorId ? (deps.editorNameLookup?.(context.editorId) ?? null) : null,
    })
    chat.changed = true
  }

  const schedule = () => {
    // Trailing debounce: rapid navigation hops collapse to the final location.
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      queueNote()
    }, DEBOUNCE_MS)
  }

  const stopNavWatch = watch([nav.activeScreen, nav.activeDashboard, nav.activeEditor], () =>
    schedule(),
  )

  // Immediate (non-debounced) note when the target conversation changes, so
  // the first message of a conversation always carries current context.
  const stopTargetWatch = watch(
    () => deps.getTargetChatId(),
    () => queueNote(),
    { immediate: true },
  )

  return () => {
    if (timer) clearTimeout(timer)
    stopNavWatch()
    stopTargetWatch()
  }
}

/** Test-only: forget per-chat dedupe state. */
export function resetNavigationInjectionForTests(): void {
  lastQueuedKey.clear()
}
