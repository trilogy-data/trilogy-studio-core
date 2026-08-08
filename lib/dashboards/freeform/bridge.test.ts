import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { FreeformBridge } from './bridge'
import { FREEFORM_HELLO, FREEFORM_PROTOCOL_VERSION, type FreeformState } from './types'

/** Minimal stand-in for the frame's contentWindow: records what the host posts
 *  and hands back the transferred port so the test can act as the guest. */
function createFakeFrame() {
  const posted: { message: any; transfer: MessagePort[] }[] = []
  const contentWindow = {
    postMessage: (message: any, _origin: string, transfer: MessagePort[] = []) => {
      posted.push({ message, transfer })
    },
  }
  return {
    frame: { contentWindow } as unknown as HTMLIFrameElement,
    posted,
    guestPort: () => posted[0]?.transfer[0],
  }
}

function hello(source: unknown): MessageEvent {
  return { data: { type: FREEFORM_HELLO, v: FREEFORM_PROTOCOL_VERSION }, source } as MessageEvent
}

/** Let the MessagePort task queue drain. jsdom delivers port messages over
 *  several turns, so a single macrotask is not enough to be deterministic. */
const settle = async (turns = 10) => {
  for (let i = 0; i < turns; i++) await new Promise((resolve) => setTimeout(resolve, 0))
}

/** Poll until a condition holds, so tests never race port delivery. */
async function waitUntil(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('timed out waiting for port delivery')
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

const emptyState: FreeformState = {
  status: 'ready',
  columns: [],
  rows: [],
  rowCount: 0,
  truncated: false,
  filters: [],
  error: null,
}

function makeHandlers() {
  return {
    onReady: vi.fn(),
    onFilter: vi.fn(),
    onRefresh: vi.fn(),
    onResize: vi.fn(),
    onLog: vi.fn(),
  }
}

describe('FreeformBridge handshake', () => {
  let bridge: FreeformBridge

  beforeEach(() => {
    vi.useRealTimers()
  })

  afterEach(() => {
    bridge?.destroy()
  })

  it('transfers a port only to the frame it is attached to', () => {
    const { frame, posted } = createFakeFrame()
    const other = createFakeFrame()
    bridge = new FreeformBridge({ itemId: '1', editMode: false, ...makeHandlers() })
    bridge.attach(frame)

    // A hello from a different frame — every sandboxed frame shares the "null"
    // origin, so source identity is the only thing distinguishing them.
    bridge.handleWindowMessage(hello(other.frame.contentWindow))
    expect(posted).toHaveLength(0)
    expect(bridge.connected).toBe(false)

    bridge.handleWindowMessage(hello(frame.contentWindow))
    expect(posted).toHaveLength(1)
    expect(posted[0].message).toMatchObject({ type: 'connect', itemId: '1' })
    expect(posted[0].transfer[0]).toBeInstanceOf(MessagePort)
    expect(bridge.connected).toBe(true)
  })

  it('ignores a protocol version mismatch', () => {
    const { frame, posted } = createFakeFrame()
    bridge = new FreeformBridge({ itemId: '1', editMode: false, ...makeHandlers() })
    bridge.attach(frame)
    bridge.handleWindowMessage({
      data: { type: FREEFORM_HELLO, v: 999 },
      source: frame.contentWindow,
    } as MessageEvent)
    expect(posted).toHaveLength(0)
  })

  it('only connects once, so a replayed hello cannot swap the port', () => {
    const { frame, posted } = createFakeFrame()
    bridge = new FreeformBridge({ itemId: '1', editMode: false, ...makeHandlers() })
    bridge.attach(frame)
    bridge.handleWindowMessage(hello(frame.contentWindow))
    bridge.handleWindowMessage(hello(frame.contentWindow))
    expect(posted).toHaveLength(1)
  })
})

describe('FreeformBridge messaging', () => {
  let bridge: FreeformBridge

  afterEach(() => {
    bridge?.destroy()
  })

  it('routes validated guest messages to handlers and drops the rest', async () => {
    const { frame, guestPort } = createFakeFrame()
    const handlers = makeHandlers()
    bridge = new FreeformBridge({ itemId: '1', editMode: false, ...handlers })
    bridge.attach(frame)
    bridge.handleWindowMessage(hello(frame.contentWindow))

    const port = guestPort()
    port.postMessage({ type: 'ready' })
    port.postMessage({ type: 'refresh' })
    port.postMessage({ type: 'resize', height: 250 })
    port.postMessage({ type: 'filter', mode: 'set', filters: { region: { op: 'eq', value: 'w' } } })
    // Junk a hostile or buggy widget might send.
    port.postMessage({ type: 'exec', code: 'alert(1)' })
    port.postMessage({ type: 'filter', mode: 'set', filters: { region: "1=1 OR 'a'='a'" } })
    await waitUntil(() => handlers.onFilter.mock.calls.length > 0)
    await settle()

    expect(handlers.onReady).toHaveBeenCalledTimes(1)
    expect(handlers.onRefresh).toHaveBeenCalledTimes(1)
    expect(handlers.onResize).toHaveBeenCalledWith(250)
    expect(handlers.onFilter).toHaveBeenCalledTimes(1)
    expect(handlers.onFilter).toHaveBeenCalledWith({
      type: 'filter',
      mode: 'set',
      filters: { region: { op: 'eq', value: 'w' } },
    })
  })

  it('replays the latest state to a widget that connects late', async () => {
    const { frame, guestPort } = createFakeFrame()
    bridge = new FreeformBridge({ itemId: '1', editMode: false, ...makeHandlers() })
    bridge.attach(frame)

    // State arrives while the frame is still parsing.
    bridge.postState({ ...emptyState, rowCount: 7 })
    bridge.postTheme({ mode: 'dark', vars: {} })

    bridge.handleWindowMessage(hello(frame.contentWindow))

    const received: any[] = []
    guestPort().onmessage = (event) => received.push(event.data)
    guestPort().start()
    await waitUntil(() => received.length >= 2)

    expect(received.map((m) => m.type)).toEqual(['theme', 'state'])
    expect(received[1].state.rowCount).toBe(7)
  })

  it('rate-limits a runaway widget', async () => {
    const { frame, guestPort } = createFakeFrame()
    const handlers = makeHandlers()
    bridge = new FreeformBridge({
      itemId: '1',
      editMode: false,
      maxMessagesPerSecond: 5,
      ...handlers,
    })
    bridge.attach(frame)
    bridge.handleWindowMessage(hello(frame.contentWindow))

    const port = guestPort()
    for (let i = 0; i < 50; i++) port.postMessage({ type: 'refresh' })
    await waitUntil(() => handlers.onRefresh.mock.calls.length > 0)
    await settle()

    expect(handlers.onRefresh.mock.calls.length).toBeLessThanOrEqual(5)
  })

  it('stops delivering after destroy', async () => {
    const { frame, guestPort } = createFakeFrame()
    const handlers = makeHandlers()
    bridge = new FreeformBridge({ itemId: '1', editMode: false, ...handlers })
    bridge.attach(frame)
    bridge.handleWindowMessage(hello(frame.contentWindow))

    const port = guestPort()
    bridge.destroy()
    port.postMessage({ type: 'refresh' })
    await settle()

    expect(handlers.onRefresh).not.toHaveBeenCalled()
  })
})
