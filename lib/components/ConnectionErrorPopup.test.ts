import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { reactive, nextTick } from 'vue'
import ConnectionErrorPopup from './ConnectionErrorPopup.vue'

function mountWithConnections(connections: Record<string, any>) {
  const store = reactive({ connections })
  const wrapper = mount(ConnectionErrorPopup, {
    attachTo: document.body,
    global: {
      provide: {
        connectionStore: store,
      },
    },
  })
  return { wrapper, store }
}

describe('ConnectionErrorPopup', () => {
  it('renders nothing when no connections are errored', () => {
    const { wrapper } = mountWithConnections({
      'local:ok': { id: 'local:ok', name: 'ok', error: null, deleted: false },
    })

    expect(document.body.querySelector('[data-testid^="connection-error-popup"]')).toBeNull()
    wrapper.unmount()
  })

  it('shows a popup with error details when a connection fails', async () => {
    const { wrapper, store } = mountWithConnections({
      'local:demo': { id: 'local:demo', name: 'demo', error: null, deleted: false },
    })

    store.connections['local:demo'].error = 'Unable to connect to URL "https://example.com": 404'
    await nextTick()

    const popup = document.body.querySelector('[data-testid="connection-error-popup-demo"]')
    expect(popup).not.toBeNull()
    expect(popup?.textContent).toContain('demo')
    expect(popup?.textContent).toContain('Unable to connect to URL "https://example.com": 404')
    wrapper.unmount()
  })

  it('dismisses on click and stays dismissed for the same error', async () => {
    const { wrapper, store } = mountWithConnections({
      'local:demo': { id: 'local:demo', name: 'demo', error: 'boom', deleted: false },
    })

    const dismiss = document.body.querySelector(
      '[data-testid="dismiss-connection-error-demo"]',
    ) as HTMLButtonElement | null
    expect(dismiss).not.toBeNull()
    dismiss?.click()
    await nextTick()

    expect(document.body.querySelector('[data-testid="connection-error-popup-demo"]')).toBeNull()

    // Same error persisting should not re-show
    store.connections['local:demo'].error = 'boom'
    await nextTick()
    expect(document.body.querySelector('[data-testid="connection-error-popup-demo"]')).toBeNull()
    wrapper.unmount()
  })

  it('re-shows after the error clears and a new failure occurs', async () => {
    const { wrapper, store } = mountWithConnections({
      'local:demo': { id: 'local:demo', name: 'demo', error: 'boom', deleted: false },
    })

    const dismiss = document.body.querySelector(
      '[data-testid="dismiss-connection-error-demo"]',
    ) as HTMLButtonElement | null
    dismiss?.click()
    await nextTick()
    expect(document.body.querySelector('[data-testid="connection-error-popup-demo"]')).toBeNull()

    // Connection recovers, then fails again with the same message
    store.connections['local:demo'].error = null
    await nextTick()
    store.connections['local:demo'].error = 'boom'
    await nextTick()

    expect(
      document.body.querySelector('[data-testid="connection-error-popup-demo"]'),
    ).not.toBeNull()
    wrapper.unmount()
  })

  it('ignores deleted connections', () => {
    const { wrapper } = mountWithConnections({
      'local:gone': { id: 'local:gone', name: 'gone', error: 'boom', deleted: true },
    })

    expect(document.body.querySelector('[data-testid^="connection-error-popup"]')).toBeNull()
    wrapper.unmount()
  })
})
