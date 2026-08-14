import { ref, type Ref } from 'vue'

/**
 * Decides whether a tree node is collapsed. Every sidebar tree builder takes one
 * of these instead of a `Record<string, boolean>`.
 *
 * A map has an "absent key" case, and the builders used to disagree about what
 * it meant: `buildEditorTree` and `buildCommunityModelTree` read absent as open,
 * `buildConnectionTree` read it as closed for connections but open for databases
 * and schemas. Since an unseeded map renders perfectly well — just wrongly — the
 * disagreement was invisible until a tree came up fully expanded. A predicate has
 * no absent case, so every call site has to say what it means.
 */
export type CollapsePredicate = (key: string) => boolean

/** Nothing is collapsed. For search results, where pruning would hide matches. */
export const EXPAND_ALL: CollapsePredicate = () => false

/** Exactly these keys are open, everything else is closed. */
export const openOnly =
  (...keys: string[]): CollapsePredicate =>
  (key) =>
    !keys.includes(key)

/**
 * Whether a node the user has not touched starts open. Supplied per list; see
 * `useCollapseState`.
 */
export type OpenByDefault = (key: string) => boolean

/** Nothing starts open. The default default. */
export const NOTHING_OPEN: OpenByDefault = () => false

export interface CollapseState {
  /**
   * Explicit user toggles only — a node absent from here is using its default.
   * Exposed for tests and for callers that need to inspect a specific node.
   */
  overrides: Ref<Record<string, boolean>>
  isCollapsed: CollapsePredicate
  toggle: (key: string) => void
  open: (key: string) => void
}

/**
 * Collapse state for a sidebar tree: user toggles layered over a default.
 *
 * `openByDefault` must be a pure derivation of the key — reading reactive stores
 * is fine, snapshotting them is not. The sidebar lists are not gated on
 * `storesLoaded` (see `IDE.vue`), so they mount before the storage promises in
 * `Manager.vue` resolve. Anything seeded once at setup or `onMounted` is seeded
 * from empty stores and never revisited, which is how three of these trees ended
 * up rendering fully expanded. A predicate is re-evaluated as data arrives, so
 * there is no load order to get wrong.
 *
 * User toggles win over the default and survive later data arriving, which is
 * what lets `openByDefault` track the active selection without fighting someone
 * who has deliberately closed a node.
 */
export function useCollapseState(openByDefault: OpenByDefault = NOTHING_OPEN): CollapseState {
  const overrides = ref<Record<string, boolean>>({})

  const isCollapsed: CollapsePredicate = (key) => {
    const override = overrides.value[key]
    return override === undefined ? !openByDefault(key) : override
  }

  return {
    overrides,
    isCollapsed,
    toggle: (key) => {
      overrides.value[key] = !isCollapsed(key)
    },
    open: (key) => {
      overrides.value[key] = false
    },
  }
}
