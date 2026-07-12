import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import LoadingButton from './LoadingButton.vue'

describe('LoadingButton', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    vi.useRealTimers()
  })

  it('shows a persistent error modal and retries the action', async () => {
    vi.useFakeTimers()
    const action = vi
      .fn()
      .mockRejectedValueOnce(new Error('The connection could not be refreshed.\nCheck the server.'))
      .mockResolvedValueOnce(undefined)

    const wrapper = mount(LoadingButton, {
      props: {
        action,
        testId: 'refresh',
      },
      slots: {
        default: 'Refresh',
      },
      attachTo: document.body,
    })

    await wrapper.get('[data-testid="refresh"]').trigger('click')
    await vi.advanceTimersByTimeAsync(500)
    await flushPromises()

    const modal = document.body.querySelector('[data-testid="refresh-error-modal"]')
    expect(modal).not.toBeNull()
    expect(
      document.body.querySelector('[data-testid="refresh-error-message"]')?.textContent,
    ).toContain('The connection could not be refreshed.\nCheck the server.')
    expect(document.body.querySelector('[data-testid="refresh-error-okay"]')).not.toBeNull()

    await vi.advanceTimersByTimeAsync(30_000)
    expect(document.body.querySelector('[data-testid="refresh-error-modal"]')).not.toBeNull()
    ;(
      document.body.querySelector('[data-testid="refresh-error-retry"]') as HTMLButtonElement
    ).click()
    await vi.advanceTimersByTimeAsync(500)
    await flushPromises()

    expect(action).toHaveBeenCalledTimes(2)
    expect(document.body.querySelector('[data-testid="refresh-error-modal"]')).toBeNull()
    wrapper.unmount()
  })

  it('applies a data-testid passed as an attribute to the button and modal', async () => {
    vi.useFakeTimers()
    const wrapper = mount(LoadingButton, {
      props: {
        action: vi.fn().mockRejectedValue(new Error('Submit failed')),
      },
      attrs: {
        'data-testid': 'creator-submit',
      },
      slots: {
        default: 'Submit',
      },
      attachTo: document.body,
    })

    const button = wrapper.get('button[data-testid="creator-submit"]')
    await button.trigger('click')
    await vi.advanceTimersByTimeAsync(500)
    await flushPromises()

    expect(document.body.querySelector('[data-testid="creator-submit-error-modal"]')).not.toBeNull()
    wrapper.unmount()
  })

  it('dismisses the error modal when the overlay is clicked', async () => {
    vi.useFakeTimers()
    const wrapper = mount(LoadingButton, {
      props: {
        action: vi.fn().mockRejectedValue(new Error('Refresh failed')),
        testId: 'refresh',
      },
      attachTo: document.body,
    })

    await wrapper.get('[data-testid="refresh"]').trigger('click')
    await vi.advanceTimersByTimeAsync(500)
    await flushPromises()

    const overlay = document.body.querySelector('.modal-overlay') as HTMLElement
    expect(overlay).not.toBeNull()
    overlay.click()
    await wrapper.vm.$nextTick()

    expect(document.body.querySelector('[data-testid="refresh-error-modal"]')).toBeNull()
    wrapper.unmount()
  })
})
