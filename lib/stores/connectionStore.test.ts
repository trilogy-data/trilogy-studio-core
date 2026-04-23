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

  describe('deleteConnection / purgeDeletedConnections', () => {
    it('flags the connection as deleted but keeps it in the map for the save flow', () => {
      const store = useConnectionStore()
      const deleteMock = vi.fn(function (this: any) {
        this.deleted = true
        this.changed = true
      })
      store.connections['doomed'] = {
        name: 'doomed',
        deleted: false,
        changed: false,
        delete: deleteMock,
      } as any

      store.deleteConnection('doomed')

      // Soft-delete: localStorage.saveConnections iterates the passed
      // connections looking for `deleted === true` to purge them, so the
      // entry must still be present at this point.
      expect(deleteMock).toHaveBeenCalledTimes(1)
      expect(store.connections['doomed']).toBeDefined()
      expect(store.connections['doomed'].deleted).toBe(true)
    })

    it('is a no-op when the connection does not exist', () => {
      const store = useConnectionStore()
      expect(() => store.deleteConnection('missing')).not.toThrow()
    })

    it('purgeDeletedConnections hard-removes only entries flagged as deleted', () => {
      const store = useConnectionStore()
      store.connections['keep-alive'] = {
        name: 'keep-alive',
        deleted: false,
      } as any
      store.connections['goodbye'] = {
        name: 'goodbye',
        deleted: true,
      } as any

      store.purgeDeletedConnections()

      expect(store.connections['keep-alive']).toBeDefined()
      expect(store.connections['goodbye']).toBeUndefined()
    })

    it('survives round-trip through a localStorage-shaped persistence stub', async () => {
      // Mirrors the sidebar's confirmDelete sequence: mark deleted, flush to
      // storage, then purge from memory. Regresses the original bug where
      // delete left the entry in both memory and localStorage.
      const store = useConnectionStore()
      store.connections['local-conn'] = {
        name: 'local-conn',
        storage: 'local',
        deleted: false,
        changed: false,
        delete(this: any) {
          this.deleted = true
          this.changed = true
        },
      } as any

      // Storage stub shaped like localStorage.saveConnections
      const persisted: Record<string, any> = { 'local-conn': { name: 'local-conn' } }
      const saveStub = (connections: any[]) => {
        for (const conn of connections) {
          if (conn.deleted) {
            delete persisted[conn.name]
          } else if (conn.changed) {
            persisted[conn.name] = conn
          }
        }
      }

      store.deleteConnection('local-conn')
      saveStub(Object.values(store.connections))
      store.purgeDeletedConnections()

      expect(persisted['local-conn']).toBeUndefined()
      expect(store.connections['local-conn']).toBeUndefined()
    })

    it('delete followed by purge removes the connection from Object.values iteration', () => {
      // Reproduces the reported UX bug: stale connections leaking into
      // dashboard pickers etc. after the sidebar delete button is clicked.
      const store = useConnectionStore()
      store.connections['ghost'] = {
        name: 'ghost',
        model: 'some-model',
        deleted: false,
        changed: false,
        delete(this: any) {
          this.deleted = true
          this.changed = true
        },
      } as any

      store.deleteConnection('ghost')
      store.purgeDeletedConnections()

      expect(
        Object.values(store.connections).some((conn) => conn.name === 'ghost'),
      ).toBe(false)
    })
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
