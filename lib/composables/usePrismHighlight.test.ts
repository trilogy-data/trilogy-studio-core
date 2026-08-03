import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { usePrismHighlight } from './usePrismHighlight'
import { ensurePrismLanguagesReady } from '../utility/prism'

// Lets a test hold grammar loading open, so an unmount can be landed precisely
// in the window between the pre-load guard and the post-load use.
const prismState = vi.hoisted(() => ({ gate: null as Promise<void> | null }))

vi.mock('../utility/prism', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utility/prism')>()
  return {
    ...actual,
    ensurePrismLanguagesReady: async (languages: Array<string | null | undefined> = []) => {
      await actual.ensurePrismLanguagesReady(languages)
      if (prismState.gate) {
        await prismState.gate
      }
    },
  }
})

const TestComponent = defineComponent({
  props: {
    code: { type: String, default: 'select 1' },
    onHighlighted: { type: Function, default: undefined },
  },
  setup(props) {
    const root = ref<HTMLElement | null>(null)
    usePrismHighlight(root, {
      selector: 'code',
      languages: ['sql'],
      onHighlighted: props.onHighlighted as ((root: HTMLElement) => void) | undefined,
      watchSources: [() => props.code],
    })
    // Render from setup so the element ref object binds directly, rather than
    // relying on string-ref resolution.
    return () => h('div', { ref: root }, [h('code', { class: 'language-sql' }, props.code)])
  },
})

describe('usePrismHighlight', () => {
  let unhandled: unknown[] = []
  const captureUnhandled = (event: PromiseRejectionEvent) => {
    unhandled.push(event.reason)
  }

  // Warm the sql grammar so the tests are not racing a real dynamic import.
  // The unmount test still exercises the null-ref path: the ref is cleared
  // synchronously on unmount, before the pass resumes past its awaits.
  beforeAll(async () => {
    await ensurePrismLanguagesReady(['sql'])
  })

  beforeEach(() => {
    unhandled = []
    window.addEventListener('unhandledrejection', captureUnhandled)
  })

  afterEach(() => {
    window.removeEventListener('unhandledrejection', captureUnhandled)
  })

  it('highlights matching descendants after mount', async () => {
    const onHighlighted = vi.fn()
    const wrapper = mount(TestComponent, { props: { onHighlighted } })

    await vi.waitFor(() => expect(onHighlighted).toHaveBeenCalled())

    expect(wrapper.find('code').html()).toContain('token')
    wrapper.unmount()
  })

  it('does not throw when the component unmounts before the pass starts', async () => {
    const onHighlighted = vi.fn()
    const wrapper = mount(TestComponent, { props: { onHighlighted } })

    wrapper.unmount()

    await nextTick()
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(unhandled).toEqual([])
    expect(onHighlighted).not.toHaveBeenCalled()
  })

  /**
   * The regression this composable exists for. The element must be re-read
   * after the grammar load, not carried across it: the component can unmount
   * while the load is in flight, which nulls the ref for every pending pass at
   * once. Dereferencing it then threw an uncaught TypeError, which the e2e
   * harness correctly failed the test on.
   *
   * The gate holds the load open so the unmount lands strictly between the
   * pre-load guard and the post-load use -- the window the original bug lived
   * in, and which an unmount before the first guard does not exercise.
   */
  it('does not throw when the component unmounts mid grammar load', async () => {
    let openGate: () => void = () => {}
    prismState.gate = new Promise<void>((resolve) => {
      openGate = resolve
    })

    const onHighlighted = vi.fn()
    const wrapper = mount(TestComponent, { props: { onHighlighted } })

    // Let the pass clear nextTick and its pre-load guard, so it is parked
    // inside ensurePrismLanguagesReady with a live element captured.
    await nextTick()
    await nextTick()

    wrapper.unmount()

    openGate()
    prismState.gate = null
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(unhandled).toEqual([])
    expect(onHighlighted).not.toHaveBeenCalled()
  })

  it('drops superseded passes when re-rendered rapidly', async () => {
    const onHighlighted = vi.fn()
    const wrapper = mount(TestComponent, { props: { onHighlighted } })

    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))
    onHighlighted.mockClear()

    // Mimics streamed markdown: several renders land before any pass finishes.
    for (const code of ['select 1', 'select 2', 'select 3', 'select 4']) {
      await wrapper.setProps({ code })
    }

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(unhandled).toEqual([])
    // Only the final pass survives; the earlier ones inspected DOM that has
    // since been replaced.
    expect(onHighlighted).toHaveBeenCalledTimes(1)
    expect(wrapper.find('code').text()).toContain('select 4')
    wrapper.unmount()
  })
})
