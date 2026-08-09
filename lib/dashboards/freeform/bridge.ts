import { parseGuestMessage } from './protocol'
import {
  FREEFORM_HELLO,
  FREEFORM_PROTOCOL_VERSION,
  type FreeformState,
  type FreeformTheme,
  type GuestFilterMessage,
} from './types'

/**
 * Host half of the freeform widget bridge.
 *
 * Authentication note: a frame sandboxed without `allow-same-origin` has an
 * opaque origin, so `event.origin` is the string "null" for every such frame
 * on the page — comparing it proves nothing. Instead the host verifies
 * `event.source === iframe.contentWindow` on the one-time hello, then transfers
 * a MessagePort. Possession of that port is the capability; nothing else can
 * post to it, and no further identity checks are needed.
 */

export interface FreeformBridgeHandlers {
  onReady: () => void
  onFilter: (message: GuestFilterMessage) => void
  onRefresh: () => void
  onResize: (height: number) => void
  onLog: (level: 'log' | 'warn' | 'error', message: string) => void
}

export interface FreeformBridgeOptions extends FreeformBridgeHandlers {
  itemId: string
  editMode: boolean
  /** Max guest messages accepted per second before we start dropping them.
   *  A runaway widget shouldn't be able to spam the query executor. */
  maxMessagesPerSecond?: number
}

const DEFAULT_RATE_LIMIT = 40

export class FreeformBridge {
  private port: MessagePort | null = null
  private frame: HTMLIFrameElement | null = null
  private destroyed = false
  private windowListener: ((event: MessageEvent) => void) | null = null

  private windowStart = 0
  private windowCount = 0

  /** Last values pushed, replayed on connect so a slow-booting widget never
   *  misses the state that arrived while it was parsing. */
  private lastState: FreeformState | null = null
  private lastTheme: FreeformTheme | null = null

  constructor(private options: FreeformBridgeOptions) {}

  get connected(): boolean {
    return this.port !== null
  }

  /** Begin listening for the guest hello. Call once the iframe is in the DOM. */
  attach(frame: HTMLIFrameElement): void {
    this.detachWindowListener()
    this.frame = frame
    this.windowListener = (event: MessageEvent) => this.handleWindowMessage(event)
    window.addEventListener('message', this.windowListener)
  }

  /** Exposed for tests; normally invoked by the window listener. */
  handleWindowMessage(event: MessageEvent): void {
    if (this.destroyed || this.port) return
    if (!this.frame || event.source !== this.frame.contentWindow) return

    const data = event.data
    if (!data || typeof data !== 'object') return
    if ((data as { type?: unknown }).type !== FREEFORM_HELLO) return
    if ((data as { v?: unknown }).v !== FREEFORM_PROTOCOL_VERSION) return

    this.connect()
  }

  private connect(): void {
    const target = this.frame?.contentWindow
    if (!target) return

    const channel = new MessageChannel()
    this.port = channel.port1
    this.port.onmessage = (event) => this.handlePortMessage(event)
    this.port.start()

    target.postMessage(
      {
        type: 'connect',
        v: FREEFORM_PROTOCOL_VERSION,
        itemId: this.options.itemId,
        editMode: this.options.editMode,
      },
      // Targeting an opaque origin requires '*'; the transferred port, not the
      // target origin, is what scopes this channel to one frame.
      '*',
      [channel.port2],
    )

    if (this.lastTheme) this.postTheme(this.lastTheme)
    if (this.lastState) this.postState(this.lastState)
  }

  private allowMessage(): boolean {
    const limit = this.options.maxMessagesPerSecond ?? DEFAULT_RATE_LIMIT
    const now = Date.now()
    if (now - this.windowStart > 1000) {
      this.windowStart = now
      this.windowCount = 0
    }
    this.windowCount += 1
    return this.windowCount <= limit
  }

  private handlePortMessage(event: MessageEvent): void {
    if (this.destroyed) return
    if (!this.allowMessage()) return

    const message = parseGuestMessage(event.data)
    if (!message) return

    switch (message.type) {
      case 'ready':
        this.options.onReady()
        break
      case 'filter':
        this.options.onFilter(message)
        break
      case 'refresh':
        this.options.onRefresh()
        break
      case 'resize':
        this.options.onResize(message.height)
        break
      case 'log':
        this.options.onLog(message.level, message.message)
        break
    }
  }

  postState(state: FreeformState): void {
    this.lastState = state
    if (!this.port || this.destroyed) return
    try {
      this.port.postMessage({ type: 'state', v: FREEFORM_PROTOCOL_VERSION, state })
    } catch (err) {
      // Rows that survived the executor but not structuredClone (e.g. exotic
      // driver types). Surface it rather than silently rendering stale data.
      this.options.onLog('error', `Failed to deliver data to widget: ${String(err)}`)
    }
  }

  postTheme(theme: FreeformTheme): void {
    this.lastTheme = theme
    if (!this.port || this.destroyed) return
    this.port.postMessage({ type: 'theme', v: FREEFORM_PROTOCOL_VERSION, theme })
  }

  private detachWindowListener(): void {
    if (this.windowListener) {
      window.removeEventListener('message', this.windowListener)
      this.windowListener = null
    }
  }

  destroy(): void {
    this.destroyed = true
    this.detachWindowListener()
    if (this.port) {
      this.port.onmessage = null
      this.port.close()
      this.port = null
    }
    this.frame = null
  }
}
