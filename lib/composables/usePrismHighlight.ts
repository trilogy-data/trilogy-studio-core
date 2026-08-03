import { nextTick, onMounted, ref, watch, type Ref, type WatchSource } from 'vue'
import { Prism, ensurePrismLanguagesReady } from '../utility/prism'

export type PrismTarget = HTMLElement | HTMLElement[] | null

export interface UsePrismHighlightOptions {
  /**
   * Languages to load before highlighting. Either a fixed list, or a function
   * that reads them off the rendered DOM (for containers whose content is not
   * known ahead of time, like rendered markdown).
   */
  languages?: string[] | ((root: HTMLElement) => Array<string | null | undefined>)
  /**
   * When set, highlight descendants matching this selector rather than the
   * target element itself.
   */
  selector?: string
  /**
   * Run after a successful highlight pass, with the element still verified as
   * mounted. Use for DOM wiring that must survive re-renders.
   */
  onHighlighted?: (root: HTMLElement) => void
  /** Re-run whenever any of these change. */
  watchSources?: WatchSource[]
  /** Set false to drive passes purely through the returned refresh(). */
  immediate?: boolean
}

/**
 * Highlights Prism code inside `target` after render.
 *
 * The awkward part this exists to centralize is that grammar loading is async
 * (languages are imported on demand rather than bundled -- see the prism plugin
 * comment in vite.config.ts) while the element it highlights can disappear
 * mid-await. Every caller has to re-read the element ref after each await, drop
 * passes that a newer render has superseded, and keep the rejection from
 * escaping a fire-and-forget call. Getting any of those wrong shows up as an
 * uncaught "Cannot read properties of null" in the browser, or as silently
 * unhighlighted code.
 */
export function usePrismHighlight(
  target: Ref<PrismTarget>,
  options: UsePrismHighlightOptions = {},
) {
  const { languages, selector, onHighlighted, watchSources, immediate = true } = options

  // Distinguishes a superseded pass from a current one. A pass that resumes
  // after a newer one started would be highlighting DOM that no longer matches
  // what it inspected.
  let generation = 0

  const highlightTargets = (root: HTMLElement): HTMLElement[] =>
    selector ? Array.from(root.querySelectorAll<HTMLElement>(selector)) : [root]

  const resolveRoot = (): HTMLElement | null => {
    const value = target.value
    if (Array.isArray(value)) {
      return value.find((element): element is HTMLElement => Boolean(element)) ?? null
    }
    return value
  }

  const run = async () => {
    const pass = ++generation
    await nextTick()

    const beforeLoad = resolveRoot()
    if (!beforeLoad || pass !== generation) {
      return
    }

    const requested =
      typeof languages === 'function'
        ? languages(beforeLoad)
        : (languages ??
          highlightTargets(beforeLoad).map((element) =>
            Array.from(element.classList)
              .find((className) => className.startsWith('language-'))
              ?.replace('language-', ''),
          ))

    await ensurePrismLanguagesReady(requested)

    // Re-read rather than reusing beforeLoad: the component can unmount while
    // the grammar import is in flight, which nulls the ref for every pending
    // pass at once.
    const root = resolveRoot()
    if (!root || pass !== generation) {
      return
    }

    // An array target means several sibling elements, all of which need a pass.
    const elements = Array.isArray(target.value)
      ? target.value.filter(Boolean).flatMap((element) => highlightTargets(element))
      : highlightTargets(root)

    elements.forEach((element) => Prism.highlightElement(element))

    onHighlighted?.(root)
  }

  /**
   * Fire-and-forget by design: highlighting is cosmetic, so a failure is logged
   * rather than surfaced as an unhandled rejection.
   */
  const refresh = () => {
    run().catch((error) => {
      console.error('Failed to apply syntax highlighting:', error)
    })
  }

  if (immediate) {
    onMounted(refresh)
  }

  if (watchSources?.length) {
    watch(watchSources, refresh)
  }

  return { refresh }
}

/** Convenience ref typed for the common single-element case. */
export function usePrismTarget() {
  return ref<PrismTarget>(null)
}
