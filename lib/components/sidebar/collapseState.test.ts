import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { useCollapseState, openOnly, EXPAND_ALL } from './collapseState'

describe('useCollapseState', () => {
  it('collapses anything the default does not open', () => {
    const { isCollapsed } = useCollapseState((key) => key === 'open-me')

    expect(isCollapsed('open-me')).toBe(false)
    expect(isCollapsed('anything-else')).toBe(true)
  })

  it('defaults everything closed when no default is supplied', () => {
    const { isCollapsed } = useCollapseState()

    expect(isCollapsed('a')).toBe(true)
  })

  it('re-derives as the default’s data arrives', () => {
    // The whole point of a predicate over a seeded map: sidebar lists mount
    // before their stores hydrate, so the default has to be re-read, not
    // snapshotted.
    const activeKey = ref('')
    const { isCollapsed } = useCollapseState((key) => key === activeKey.value)

    expect(isCollapsed('store-1')).toBe(true)
    activeKey.value = 'store-1'
    expect(isCollapsed('store-1')).toBe(false)
  })

  it('keeps a user toggle when the default later changes its mind', () => {
    const activeKey = ref('')
    const { isCollapsed, toggle } = useCollapseState((key) => key === activeKey.value)

    toggle('store-1') // deliberately opened while the default said closed
    expect(isCollapsed('store-1')).toBe(false)

    activeKey.value = 'store-2'
    expect(isCollapsed('store-1')).toBe(false)
  })

  it('toggles out of a defaulted-open state', () => {
    const { isCollapsed, toggle } = useCollapseState(() => true)

    toggle('a')
    expect(isCollapsed('a')).toBe(true)
    toggle('a')
    expect(isCollapsed('a')).toBe(false)
  })

  it('records only explicit toggles in overrides', () => {
    const { overrides, isCollapsed, toggle, open } = useCollapseState(() => true)

    expect(isCollapsed('untouched')).toBe(false)
    expect(overrides.value.untouched).toBeUndefined()

    toggle('touched')
    open('opened')
    expect(overrides.value).toEqual({ touched: true, opened: false })
  })
})

describe('predicate helpers', () => {
  it('opens exactly the listed keys', () => {
    const isCollapsed = openOnly('a', 'b')

    expect(isCollapsed('a')).toBe(false)
    expect(isCollapsed('b')).toBe(false)
    expect(isCollapsed('c')).toBe(true)
  })

  it('collapses nothing under EXPAND_ALL', () => {
    expect(EXPAND_ALL('anything')).toBe(false)
  })
})
