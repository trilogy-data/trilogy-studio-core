import type { CrossFilterEntry } from '../conditions'

/**
 * Freeform ("agentic") widgets: author-supplied HTML rendered inside a
 * sandboxed iframe, wired to the dashboard's data + interaction lifecycle
 * through a MessageChannel bridge.
 *
 * The widget NEVER authors queries. The query lives on the persisted item
 * model (authored by a human or the dashboard agent at design time) and is
 * executed by the normal DashboardQueryExecutor path; the widget only ever
 * receives its results. Likewise the widget never emits SQL — it emits typed
 * CrossFilterEntry values that the host validates against the dashboard's
 * concept allowlist before they become filters.
 */

/** Persisted content shape for a freeform cell. */
export interface FreeformData {
  /** Self-contained HTML document (or fragment) authored for this widget. */
  html: string
  /** Trilogy query whose results are pushed to the widget. */
  query: string
}

/** Protocol version. Bump on any breaking change to the message shapes;
 *  the guest runtime refuses to connect on a mismatch. */
export const FREEFORM_PROTOCOL_VERSION = 1

/** Persisted HTML cap. Guards localStorage/remote-dashboard payload bloat and
 *  bounds the cost of building a srcdoc string. */
export const MAX_FREEFORM_HTML_LENGTH = 262_144

/** Row cap for a single state push. Beyond this the payload is truncated and
 *  `truncated: true` is set so widgets can say so. */
export const MAX_FREEFORM_ROWS = 20_000

/** Milliseconds a widget has to call `trilogy.ready()` before the host
 *  declares it broken and tears the frame down. */
export const FREEFORM_READY_TIMEOUT_MS = 8_000

/** Bounds on `trilogy.resize()` requests, in pixels. */
export const MIN_FREEFORM_HEIGHT = 40
export const MAX_FREEFORM_HEIGHT = 4_000

/** Origins a widget may load scripts/styles/fonts from. Kept to CDNs that
 *  serve immutable, versioned artifacts. Note that because `srcdoc` frames
 *  inherit the embedding document's CSP and policies intersect, these origins
 *  must ALSO appear in the host page's script-src for widget CDN loads to
 *  work (see index.html). */
export const FREEFORM_CDN_ORIGINS: readonly string[] = [
  'https://cdn.jsdelivr.net',
  'https://unpkg.com',
  'https://esm.sh',
  'https://cdnjs.cloudflare.com',
]

export type FreeformStatus = 'loading' | 'ready' | 'error'

export interface FreeformColumn {
  name: string
  type: string
  /** Fully-qualified concept address (e.g. `local.rows`). This is what the
   *  cross-filter allowlist is keyed on; `filters.*` accepts either this or
   *  `name`, and the host resolves names to addresses. */
  address?: string
  description?: string
}

/** A filter currently constraining this item, described without exposing SQL. */
export interface FreeformFilterRef {
  source: string
  fields: string[]
}

/** The snapshot handed to the widget on every host-side change. */
export interface FreeformState {
  status: FreeformStatus
  columns: FreeformColumn[]
  rows: Record<string, unknown>[]
  /** Rows actually delivered (== rows.length). */
  rowCount: number
  /** True when the result set was larger than MAX_FREEFORM_ROWS. */
  truncated: boolean
  filters: FreeformFilterRef[]
  error: string | null
}

export interface FreeformTheme {
  mode: 'light' | 'dark'
  vars: Record<string, string>
}

// ── Host → guest ───────────────────────────────────────────────────────────

export interface HostConnectMessage {
  type: 'connect'
  v: number
  itemId: string
  editMode: boolean
}

export interface HostStateMessage {
  type: 'state'
  v: number
  state: FreeformState
}

export interface HostThemeMessage {
  type: 'theme'
  v: number
  theme: FreeformTheme
}

export type HostMessage = HostConnectMessage | HostStateMessage | HostThemeMessage

// ── Guest → host ───────────────────────────────────────────────────────────

export interface GuestReadyMessage {
  type: 'ready'
}

export interface GuestFilterMessage {
  type: 'filter'
  /** 'set' replaces this widget's selection, 'append' adds to it, 'clear'
   *  drops it entirely. Mirrors the chart click semantics. */
  mode: 'set' | 'append' | 'clear'
  /** Field → typed entry. Empty for 'clear'. */
  filters: Record<string, CrossFilterEntry>
}

export interface GuestRefreshMessage {
  type: 'refresh'
}

export interface GuestResizeMessage {
  type: 'resize'
  height: number
}

export interface GuestLogMessage {
  type: 'log'
  level: 'log' | 'warn' | 'error'
  message: string
}

export type GuestMessage =
  | GuestReadyMessage
  | GuestFilterMessage
  | GuestRefreshMessage
  | GuestResizeMessage
  | GuestLogMessage

/** Handshake ping the guest runtime posts to its parent on load. The host
 *  replies by transferring a MessagePort; all further traffic runs over that
 *  port. Origin checks are useless here — every sandboxed frame reports
 *  "null" — so the port itself is the capability. */
export const FREEFORM_HELLO = 'trilogy-freeform-hello'
