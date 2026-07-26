import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import TabDropdownItem from './TabDropdownItem.vue'
import type { Tab } from '../../stores/useScreenNavigation'

const tab: Tab = { id: 'tab-1', title: 'Orders', screen: 'editors', address: 'orders' }

/**
 * jsdom has no Touch/TouchEvent constructors, so build the shape the handlers
 * actually read. Dispatching directly (rather than via trigger) keeps a handle
 * on the event so we can assert whether the row swallowed the gesture.
 */
function touch(
  el: Element,
  type: 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel',
  points: { clientX: number; clientY: number }[] = [],
): Event {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'touches', { value: points })
  el.dispatchEvent(event)
  return event
}

function mountItem(props: Partial<{ isActive: boolean }> = {}) {
  return mount(TabDropdownItem, {
    props: { tab, icon: 'mdi mdi-file-document-outline', isActive: false, ...props },
  })
}

describe('TabDropdownItem swipe-to-close', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('closes on a left swipe past the threshold, emitting the tab id', async () => {
    const wrapper = mountItem()
    const el = wrapper.element

    touch(el, 'touchstart', [{ clientX: 200, clientY: 50 }])
    touch(el, 'touchmove', [{ clientX: 60, clientY: 52 }])
    touch(el, 'touchend')
    vi.advanceTimersByTime(250)

    // The parent hands this straight to closeTab(tabId), so a Tab object here
    // would silently no-op.
    expect(wrapper.emitted('close')).toEqual([['tab-1']])
  })

  it('ignores a rightward drag instead of treating it as a close', async () => {
    const wrapper = mountItem()
    const el = wrapper.element

    touch(el, 'touchstart', [{ clientX: 60, clientY: 50 }])
    touch(el, 'touchmove', [{ clientX: 200, clientY: 52 }])
    touch(el, 'touchend')
    vi.advanceTimersByTime(250)

    expect(wrapper.emitted('close')).toBeUndefined()
  })

  it('snaps back without selecting when the swipe comes up short', async () => {
    const wrapper = mountItem()
    const el = wrapper.element

    touch(el, 'touchstart', [{ clientX: 200, clientY: 50 }])
    touch(el, 'touchmove', [{ clientX: 160, clientY: 52 }])
    touch(el, 'touchend')
    vi.advanceTimersByTime(250)

    expect(wrapper.emitted('close')).toBeUndefined()
    // A failed close used to fall through to select and navigate instead.
    expect(wrapper.emitted('select')).toBeUndefined()
  })

  it('leaves vertical drags to the list so a long tab list stays scrollable', async () => {
    const wrapper = mountItem()
    const el = wrapper.element

    touch(el, 'touchstart', [{ clientX: 100, clientY: 200 }])
    const move = touch(el, 'touchmove', [{ clientX: 102, clientY: 60 }])
    touch(el, 'touchend')

    expect(move.defaultPrevented).toBe(false)
    expect(wrapper.emitted('close')).toBeUndefined()
  })

  it('claims the gesture only once it is horizontal', async () => {
    const wrapper = mountItem()
    const el = wrapper.element

    touch(el, 'touchstart', [{ clientX: 200, clientY: 50 }])
    const tiny = touch(el, 'touchmove', [{ clientX: 197, clientY: 50 }])
    expect(tiny.defaultPrevented).toBe(false)

    const committed = touch(el, 'touchmove', [{ clientX: 120, clientY: 52 }])
    expect(committed.defaultPrevented).toBe(true)
  })

  it('still selects on a plain tap', async () => {
    const wrapper = mountItem()

    touch(wrapper.element, 'touchstart', [{ clientX: 100, clientY: 50 }])
    touch(wrapper.element, 'touchend')
    await wrapper.find('.tab-dropdown-item').trigger('click')

    expect(wrapper.emitted('select')).toEqual([[tab]])
  })

  it('does not swipe the active tab away', async () => {
    const wrapper = mountItem({ isActive: true })
    const el = wrapper.element

    touch(el, 'touchstart', [{ clientX: 200, clientY: 50 }])
    const move = touch(el, 'touchmove', [{ clientX: 20, clientY: 52 }])
    touch(el, 'touchend')
    vi.advanceTimersByTime(250)

    expect(move.defaultPrevented).toBe(false)
    expect(wrapper.emitted('close')).toBeUndefined()
  })
})
