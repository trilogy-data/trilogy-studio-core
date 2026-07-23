import { computed, ref, type ComputedRef, type Ref } from 'vue'

/**
 * Navigation state for the mobile sidebar drawer.
 *
 * The drawer is a drill-down stack rendered across three components that are
 * not in a straight parent/child line: MobileSidebarLayout owns the header
 * (title + back/home controls), Sidebar owns the destination list, and each
 * MobileTreeList owns one level of tree drilling. Passing this through props
 * and events meant the level was mirrored in three places and the back button
 * had to reach into a child via `$refs`.
 *
 * Keeping it in one lazily-created store (matching `useScreenNavigation`) means
 * there is exactly one source of truth and every component reads it directly.
 */
export interface MobileTreeStackEntry {
  title: string
  /** Restores the owning MobileTreeList to the view it had before this push. */
  onBack: () => void
}

export interface MobileSidebarNavigation {
  readonly level: ComputedRef<'root' | 'detail'>
  /** Header title: the drilled node, or the destination when not drilled in. */
  readonly title: ComputedRef<string>
  readonly depth: ComputedRef<number>
  readonly searchActive: Ref<boolean>
  /** True when there is anywhere to go back to. */
  readonly canGoBack: ComputedRef<boolean>
  enterDestination(title: string): void
  push(entry: MobileTreeStackEntry): void
  back(): void
  home(): void
}

/** Exported for tests; application code should use the default export. */
export const createMobileSidebarNavigation = (): MobileSidebarNavigation => {
  const inDestination = ref(false)
  const destinationTitle = ref('')
  const stack = ref<MobileTreeStackEntry[]>([])
  const searchActive = ref(false)

  // Unwind rather than discard: each entry restores the owning tree's view, so
  // popping in reverse leaves every MobileTreeList back at its own root.
  const unwind = () => {
    while (stack.value.length) {
      stack.value.pop()?.onBack()
    }
  }

  return {
    level: computed(() => (inDestination.value ? 'detail' : 'root')),
    title: computed(() => {
      if (!inDestination.value) return ''
      // While searching, the visible rows are flat results rather than the
      // drilled node's children, so the node's title would be misleading.
      if (searchActive.value) return destinationTitle.value
      return stack.value[stack.value.length - 1]?.title || destinationTitle.value
    }),
    depth: computed(() => stack.value.length),
    canGoBack: computed(() => inDestination.value),
    searchActive,

    enterDestination(title: string) {
      unwind()
      destinationTitle.value = title
      inDestination.value = true
    },

    push(entry: MobileTreeStackEntry) {
      stack.value.push(entry)
    },

    back() {
      const entry = stack.value.pop()
      if (entry) {
        entry.onBack()
        return
      }
      inDestination.value = false
    },

    home() {
      unwind()
      inDestination.value = false
    },
  }
}

let store: MobileSidebarNavigation | null = null

export default function useMobileSidebarNavigation(): MobileSidebarNavigation {
  if (!store) {
    store = createMobileSidebarNavigation()
  }
  return store
}
