import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import useConnectionStore from './connectionStore'

// Mock the editor store
vi.mock('./editorStore', () => ({
  default: () => ({
    getConnectionEditors: () => [],
  }),
}))

// Mock the model store
vi.mock('./modelStore', () => ({
  default: () => ({
    models: {},
    newModelConfig: (name: string) => ({ name }),
  }),
}))

describe('connectionStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  describe('connectConnection', () => {
    it('should throw error when connection does not exist', async () => {
      const store = useConnectionStore()

      await expect(store.connectConnection('nonexistent')).rejects.toThrow(
        'Connection with name "nonexistent" not found.',
      )
    })

    it('should actually call reset when connecting', async () => {
      const store = useConnectionStore()

      // Create a mock connection
      const resetMock = vi.fn().mockResolvedValue(undefined)
      const mockConnection = {
        name: 'test-connection',
        connected: false,
        running: false,
        error: null,
        model: null,
        changed: false,
        reset: resetMock,
      }

      // Add the connection directly to the store
      store.connections['test-connection'] = mockConnection as any

      // Connect should actually invoke reset
      await store.connectConnection('test-connection')

      // Verify reset was called - this was the bug: reset wasn't being called
      expect(resetMock).toHaveBeenCalledTimes(1)
    })

    it('should deduplicate concurrent connection attempts', async () => {
      const store = useConnectionStore()

      // Create a mock connection with a slow reset
      let resolveReset: () => void
      const resetPromise = new Promise<void>((resolve) => {
        resolveReset = resolve
      })
      const resetMock = vi.fn().mockReturnValue(resetPromise)
      const mockConnection = {
        name: 'test-connection',
        connected: false,
        running: false,
        error: null,
        model: null,
        changed: false,
        reset: resetMock,
      }

      store.connections['test-connection'] = mockConnection as any

      // Start two concurrent connections
      const promise1 = store.connectConnection('test-connection')
      const promise2 = store.connectConnection('test-connection')

      // Reset should only be called once (deduplication)
      expect(resetMock).toHaveBeenCalledTimes(1)

      // Resolve the reset
      resolveReset!()
      await Promise.all([promise1, promise2])
    })

    it('should handle reset failures', async () => {
      const store = useConnectionStore()

      const resetError = new Error('Connection failed')
      const resetMock = vi.fn().mockRejectedValue(resetError)
      const mockConnection = {
        name: 'test-connection',
        connected: false,
        running: false,
        error: null,
        model: null,
        changed: false,
        reset: resetMock,
      }

      store.connections['test-connection'] = mockConnection as any

      // The promise races between reset and timeout, so it should reject with the reset error
      await expect(store.connectConnection('test-connection')).rejects.toThrow('Connection failed')
    }, 10000) // Increase timeout since we're racing with a 60s timeout
  })

  describe('resetConnection', () => {
    it('should throw error when connection does not exist', async () => {
      const store = useConnectionStore()

      await expect(store.resetConnection('nonexistent')).rejects.toThrow(
        'Connection with name "nonexistent" not found.',
      )
    })

    it('should call reset on the connection', async () => {
      const store = useConnectionStore()

      const resetMock = vi.fn().mockResolvedValue(undefined)
      const mockConnection = {
        name: 'test-connection',
        connected: true,
        running: false,
        error: null,
        model: null,
        changed: false,
        reset: resetMock,
        setError: vi.fn(),
      }

      store.connections['test-connection'] = mockConnection as any

      await store.resetConnection('test-connection')

      expect(resetMock).toHaveBeenCalledTimes(1)
    })
  })
})
