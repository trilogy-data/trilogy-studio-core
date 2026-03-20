import { onMounted, onUnmounted, unref, type Ref } from 'vue'

type MaybeElement = HTMLElement | null | undefined
type Resolvable<T> = T | Ref<T> | (() => T)
type ElementSource = Resolvable<MaybeElement | MaybeElement[]>

export interface ClickOutsideOptions {
  enabled?: Resolvable<boolean>
  eventName?: 'click' | 'mousedown'
  defer?: boolean
}

function resolveValue<T>(value: Resolvable<T>): T {
  return typeof value === 'function' ? (value as () => T)() : unref(value)
}

function resolveElements(sources: ElementSource | ElementSource[]): HTMLElement[] {
  const sourceList = Array.isArray(sources) ? sources : [sources]

  return sourceList.flatMap((source) => {
    const resolved = resolveValue(source)
    const elements = Array.isArray(resolved) ? resolved : [resolved]
    return elements.filter((element): element is HTMLElement => element instanceof HTMLElement)
  })
}

export function useClickOutside(
  targets: ElementSource | ElementSource[],
  onOutside: (event: Event) => void,
  options: ClickOutsideOptions = {},
): void {
  const { enabled = true, eventName = 'click', defer = false } = options
  let registrationTimeout: number | null = null

  const handleEvent = (event: Event) => {
    if (!resolveValue(enabled)) {
      return
    }

    const target = event.target
    if (!(target instanceof Node)) {
      return
    }

    const elements = resolveElements(targets)
    if (elements.length === 0) {
      return
    }

    if (elements.some((element) => element.contains(target))) {
      return
    }

    onOutside(event)
  }

  const register = () => {
    document.addEventListener(eventName, handleEvent)
  }

  onMounted(() => {
    if (defer) {
      registrationTimeout = window.setTimeout(register, 0)
      return
    }

    register()
  })

  onUnmounted(() => {
    if (registrationTimeout !== null) {
      window.clearTimeout(registrationTimeout)
    }

    document.removeEventListener(eventName, handleEvent)
  })
}
