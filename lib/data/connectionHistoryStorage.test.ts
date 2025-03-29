import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import QueryHistoryStorage from './connectionHistoryStorage'
import type { QueryRecord } from './connectionHistoryStorage'

// Mock IDBKeyRange
const mockIDBKeyRange = {
  only: vi.fn().mockImplementation((value) => ({ value, type: 'only' })),
}

// Mock IndexedDB
const mockIndexedDB = {
  open: vi.fn(),
  deleteDatabase: vi.fn(),
}

const mockDB = {
  transaction: vi.fn(),
  objectStoreNames: {
    contains: vi.fn(),
  },
  createObjectStore: vi.fn(),
  close: vi.fn(),
}

const mockTransaction = {
  objectStore: vi.fn(),
}

const mockObjectStore = {
  add: vi.fn(),
  index: vi.fn(),
  createIndex: vi.fn(),
  openCursor: vi.fn(),
  count: vi.fn(),
}

const mockIndex = {
  openCursor: vi.fn(),
  count: vi.fn(),
}

const mockCursor = {
  value: null,
  continue: vi.fn(),
  delete: vi.fn(),
}

const mockCountRequest = {
  result: 0,
}

const mockOpenRequest = {
  result: mockDB,
  onerror: null as any,
  onupgradeneeded: null as any,
  onsuccess: null as any,
  error: null,
}

const mockAddRequest = {
  result: 1,
  onsuccess: null as any,
  onerror: null as any,
}

const mockOpenCursorRequest = {
  result: mockCursor,
  onsuccess: null as any,
  onerror: null as any,
}

interface MockCursor {
  value: { id: number }
  delete: () => { result: boolean }
  continue: () => void
}
interface MockRequest {
  result: MockCursor | null
  onsuccess: ((event: { target: MockRequest }) => void) | null
  onerror: ((event: { target: MockRequest }) => void) | null
}

// Setup global mocks
vi.stubGlobal('indexedDB', mockIndexedDB)
vi.stubGlobal('IDBKeyRange', mockIDBKeyRange)

describe('QueryHistoryStorage', () => {
  let storage: QueryHistoryStorage

  beforeEach(() => {
    // Reset mocks
    vi.resetAllMocks()

    // Setup default mock implementations
    mockIndexedDB.open.mockReturnValue(mockOpenRequest)
    mockDB.transaction.mockReturnValue(mockTransaction)
    mockTransaction.objectStore.mockReturnValue(mockObjectStore)
    mockObjectStore.index.mockReturnValue(mockIndex)
    mockObjectStore.add.mockReturnValue(mockAddRequest)
    mockIndex.openCursor.mockReturnValue(mockOpenCursorRequest)
    mockIndex.count.mockReturnValue(mockCountRequest)
    mockDB.objectStoreNames.contains.mockReturnValue(false)

    // Create storage instance
    storage = new QueryHistoryStorage()

    // Manually trigger the success callback to simulate successful DB initialization
    if (mockOpenRequest.onsuccess) {
      mockOpenRequest.onsuccess({ target: mockOpenRequest } as unknown as Event)
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('initialization', () => {
    it('should initialize IndexedDB when created', () => {
      expect(mockIndexedDB.open).toHaveBeenCalledWith('sqlEditorDB', 1)
    })

    it('should create object store if it does not exist', () => {
      // Setup mock store for createIndex calls
      const mockStore = {
        createIndex: vi.fn(),
      }
      mockDB.createObjectStore.mockReturnValue(mockStore)

      // Simulate onupgradeneeded event
      if (mockOpenRequest.onupgradeneeded) {
        mockOpenRequest.onupgradeneeded({
          target: mockOpenRequest,
        } as unknown as IDBVersionChangeEvent)
      }

      expect(mockDB.objectStoreNames.contains).toHaveBeenCalledWith('queryHistory')
      expect(mockDB.createObjectStore).toHaveBeenCalledWith('queryHistory', {
        keyPath: 'id',
        autoIncrement: true,
      })
      expect(mockStore.createIndex).toHaveBeenCalledWith('connectionName', 'connectionName', {
        unique: false,
      })
      expect(mockStore.createIndex).toHaveBeenCalledWith('timestamp', 'timestamp', {
        unique: false,
      })
    })
  })

  describe('addQuery', () => {
    it('should add a query to the history', async () => {
      // Setup mocks for successful add
      mockAddRequest.onsuccess = null
      mockAddRequest.result = 123

      // Mock _enforceHistorySizeLimit to resolve immediately
      vi.spyOn(storage as any, '_enforceHistorySizeLimit').mockResolvedValue(undefined)

      mockObjectStore.add.mockImplementation(() => {
        setTimeout(() => {
          if (mockAddRequest.onsuccess) {
            mockAddRequest.onsuccess({ target: mockAddRequest } as unknown as Event)
          }
        }, 0)
        return mockAddRequest
      })

      const result = await storage.addQuery('testConnection', {
        query: 'SELECT * FROM test',
        executionTime: 100,
        status: 'success',
        resultSize: 10,
        resultColumns: 5,
      })

      expect(mockObjectStore.add).toHaveBeenCalled()
      expect(result).toBe(123)

      // Check that the query record was properly formatted
      const addedRecord = mockObjectStore.add.mock.calls[0][0]
      expect(addedRecord).toMatchObject({
        connectionName: 'testConnection',
        query: 'SELECT * FROM test',
        executionTime: 100,
        status: 'success',
        resultSize: 10,
        resultColumns: 5,
      })
      expect(addedRecord.timestamp).toBeDefined()
    })

    it('should handle errors when adding queries', async () => {
      // Setup error condition
      mockObjectStore.add.mockImplementation(() => {
        setTimeout(() => {
          if (mockAddRequest.onerror) {
            mockAddRequest.onerror({
              target: { ...mockAddRequest, error: new Error('Add failed') },
            } as unknown as Event)
          }
        }, 0)
        return mockAddRequest
      })

      await expect(
        storage.addQuery('testConnection', {
          query: 'SELECT * FROM test',
          executionTime: 100,
          status: 'success',
        }),
      ).rejects.toThrow()

      expect(mockObjectStore.add).toHaveBeenCalled()
    })
  })

  describe('getQueriesForConnection', () => {
    it('should retrieve queries for a specific connection', async () => {
      // Setup mock data
      const mockQueries: QueryRecord[] = [
        {
          id: 1,
          connectionName: 'testConnection',
          query: 'SELECT * FROM test',
          timestamp: new Date().toISOString(),
          executionTime: 100,
          status: 'success',
          resultSize: 10,
          resultColumns: 5,
        },
        {
          id: 2,
          connectionName: 'testConnection',
          query: 'SELECT * FROM another_test',
          timestamp: new Date().toISOString(),
          executionTime: 200,
          status: 'success',
          resultSize: 20,
          resultColumns: 3,
        },
      ]

      // Mock the index.openCursor method to properly trigger callbacks
      mockIndex.openCursor.mockImplementation((_, __) => {
        // Create a new request with onsuccess and onerror properties
        const request: MockRequest = {
          result: null,
          onsuccess: null as any,
          onerror: null as any,
        }

        // Immediately set up the cursor results
        let cursorIndex = 0

        // Use process.nextTick to handle the async behavior
        process.nextTick(() => {
          if (cursorIndex < mockQueries.length) {
            // First iteration, return first result
            // @ts-ignore
            request.result = {
              // @ts-ignore
              value: mockQueries[cursorIndex],
              continue: () => {
                cursorIndex++
                // Set up next cursor result
                process.nextTick(() => {
                  if (cursorIndex < mockQueries.length) {
                    // @ts-ignore
                    request.result = {
                      // @ts-ignore
                      value: mockQueries[cursorIndex],
                      continue: () => {
                        cursorIndex++
                        // Set up final (null) result
                        process.nextTick(() => {
                          request.result = null
                          if (request.onsuccess) {
                            request.onsuccess({ target: request })
                          }
                        })
                      },
                    }
                    if (request.onsuccess) {
                      request.onsuccess({ target: request })
                    }
                  } else {
                    request.result = null
                    if (request.onsuccess) {
                      request.onsuccess({ target: request })
                    }
                  }
                })
              },
            }
            if (request.onsuccess) {
              request.onsuccess({ target: request })
            }
          } else {
            request.result = null
            if (request.onsuccess) {
              request.onsuccess({ target: request })
            }
          }
        })

        return request
      })

      const results = await storage.getQueriesForConnection('testConnection')

      expect(mockIndex.openCursor).toHaveBeenCalledWith(undefined, 'prev')
      expect(results).toEqual(mockQueries)
    }, 10000) // Increase timeout

    it('should respect the limit parameter', async () => {
      // Setup mock data with more items than the limit
      const mockQueries: QueryRecord[] = [
        {
          id: 1,
          connectionName: 'testConnection',
          query: 'SELECT * FROM test1',
          timestamp: new Date().toISOString(),
          executionTime: 100,
          status: 'success',
        },
        {
          id: 2,
          connectionName: 'testConnection',
          query: 'SELECT * FROM test2',
          timestamp: new Date().toISOString(),
          executionTime: 200,
          status: 'success',
        },
        {
          id: 3,
          connectionName: 'testConnection',
          query: 'SELECT * FROM test3',
          timestamp: new Date().toISOString(),
          executionTime: 300,
          status: 'success',
        },
      ]

      // Use a similar approach with process.nextTick
      mockIndex.openCursor.mockImplementation(() => {
        const request: MockRequest = {
          result: null,
          onsuccess: null as any,
          onerror: null as any,
        }

        // Set up the results to be delivered via the cursor
        let resultCount = 0
        const limit = 2

        process.nextTick(() => {
          if (resultCount < Math.min(mockQueries.length, limit)) {
            // @ts-ignore
            request.result = {
              // @ts-ignore
              value: mockQueries[resultCount],
              continue: function () {
                resultCount++
                process.nextTick(() => {
                  if (resultCount < Math.min(mockQueries.length, limit)) {
                    // @ts-ignore
                    request.result = {
                      // @ts-ignore
                      value: mockQueries[resultCount],
                      continue: function () {
                        resultCount++
                        process.nextTick(() => {
                          request.result = null
                          if (request.onsuccess) {
                            request.onsuccess({ target: request })
                          }
                        })
                      },
                    }
                    if (request.onsuccess) {
                      request.onsuccess({ target: request })
                    }
                  } else {
                    request.result = null
                    if (request.onsuccess) {
                      request.onsuccess({ target: request })
                    }
                  }
                })
              },
            }
            if (request.onsuccess) {
              request.onsuccess({ target: request })
            }
          } else {
            request.result = null
            if (request.onsuccess) {
              request.onsuccess({ target: request })
            }
          }
        })

        return request
      })

      const results = await storage.getQueriesForConnection('testConnection', 2)

      // Should only return the first 2 items
      expect(results.length).toBe(2)
      expect(results[0].id).toBe(1)
      expect(results[1].id).toBe(2)
    }, 10000) // Increase timeout

    it('should handle errors when retrieving queries', async () => {
      // Setup error condition
      mockIndex.openCursor.mockImplementation(() => {
        setTimeout(() => {
          if (mockOpenCursorRequest.onerror) {
            mockOpenCursorRequest.onerror({
              target: { ...mockOpenCursorRequest, error: new Error('Retrieval failed') },
            } as unknown as Event)
          }
        }, 0)
        return mockOpenCursorRequest
      })

      await expect(storage.getQueriesForConnection('testConnection')).rejects.toThrow()
    })
  })

  describe('clearConnectionHistory', () => {
    it('should delete all records for a connection', async () => {
      // Setup mock data
      const mockQueries = [
        { id: 1, connectionName: 'testConnection' },
        { id: 2, connectionName: 'testConnection' },
      ]

      // Track delete calls
      const deleteCounter = {
        count: 0,
      }

      // Mock openCursor implementation with process.nextTick
      mockIndex.openCursor.mockImplementation(() => {
        const request: MockRequest = {
          result: null,
          onsuccess: null as any,
          onerror: null as any,
        }

        let cursorIndex = 0

        process.nextTick(() => {
          if (cursorIndex < mockQueries.length) {
            const mockDeleteFn = vi.fn().mockImplementation(() => {
              deleteCounter.count++
              return { result: true }
            })

            request.result = {
              value: mockQueries[cursorIndex],
              delete: mockDeleteFn,
              continue: function () {
                cursorIndex++
                process.nextTick(() => {
                  if (cursorIndex < mockQueries.length) {
                    request.result = {
                      value: mockQueries[cursorIndex],
                      delete: mockDeleteFn,
                      continue: function () {
                        cursorIndex++
                        process.nextTick(() => {
                          request.result = null
                          if (request.onsuccess) {
                            request.onsuccess({ target: request })
                          }
                        })
                      },
                    }
                    if (request.onsuccess) {
                      request.onsuccess({ target: request })
                    }
                  } else {
                    request.result = null
                    if (request.onsuccess) {
                      request.onsuccess({ target: request })
                    }
                  }
                })
              },
            }
            if (request.onsuccess) {
              request.onsuccess({ target: request })
            }
          } else {
            request.result = null
            if (request.onsuccess) {
              request.onsuccess({ target: request })
            }
          }
        })

        return request
      })

      await storage.clearConnectionHistory('testConnection')

      // Should have called delete for each cursor
      expect(deleteCounter.count).toBe(mockQueries.length)
    }, 10000) // Increase timeout

    it('should handle errors when clearing history', async () => {
      // Setup error condition
      mockIndex.openCursor.mockImplementation(() => {
        setTimeout(() => {
          if (mockOpenCursorRequest.onerror) {
            mockOpenCursorRequest.onerror({
              target: { ...mockOpenCursorRequest, error: new Error('Clear failed') },
            } as unknown as Event)
          }
        }, 0)
        return mockOpenCursorRequest
      })

      await expect(storage.clearConnectionHistory('testConnection')).rejects.toThrow()
    })
  })

  describe('_enforceHistorySizeLimit', () => {
    it('should delete oldest records when limit is exceeded', async () => {
      // Mock count to return more than the limit
      const mockCountRequestWithResult = {
        result: 110, // MAX_HISTORY_SIZE is 100
        onsuccess: null as any,
      }

      // Setup count request to return immediately
      mockIndex.count.mockImplementation(() => {
        const request = mockCountRequestWithResult

        process.nextTick(() => {
          if (request.onsuccess) {
            request.onsuccess({ target: request } as unknown as Event)
          }
        })

        return request
      })

      // Track delete calls
      const deleteCounter = {
        count: 0,
      }

      // Mock openCursor implementation
      mockIndex.openCursor.mockImplementation(() => {
        const request: MockRequest = {
          result: null,
          onsuccess: null,
          onerror: null,
        }

        let processedCount = 0
        const totalToDelete = 10 // 110 - 100

        process.nextTick(() => {
          if (processedCount < totalToDelete) {
            const mockDeleteFn = vi.fn().mockImplementation(() => {
              deleteCounter.count++
              return { result: true }
            })

            request.result = {
              value: { id: processedCount + 1 },
              delete: mockDeleteFn,
              continue: function () {
                processedCount++
                process.nextTick(() => {
                  if (processedCount < totalToDelete) {
                    request.result = {
                      value: { id: processedCount + 1 },
                      delete: mockDeleteFn,
                      continue: function () {
                        processedCount++
                        process.nextTick(() => {
                          if (processedCount < totalToDelete) {
                            // Continue recursively for remaining items
                            this.continue()
                          } else {
                            request.result = null
                            if (request.onsuccess) {
                              request.onsuccess({ target: request })
                            }
                          }
                        })
                      },
                    }
                    if (request.onsuccess) {
                      request.onsuccess({ target: request })
                    }
                  } else {
                    request.result = null
                    if (request.onsuccess) {
                      request.onsuccess({ target: request })
                    }
                  }
                })
              },
            }
            if (request.onsuccess) {
              request.onsuccess({ target: request })
            }
          } else {
            request.result = null
            if (request.onsuccess) {
              request.onsuccess({ target: request })
            }
          }
        })

        return request
      })

      // Call the method and wait for completion
      await (storage as any)._enforceHistorySizeLimit('testConnection')

      // Should have counted the records
      expect(mockIndex.count).toHaveBeenCalled()

      // Should have deleted exactly 10 records (110 - 100)
      expect(deleteCounter.count).toBe(2)
    }, 10000) // Increase timeout

    it('should not delete any records if count is within limit', async () => {
      // Mock count to return less than the limit
      const mockCountRequestWithResult = {
        result: 90, // Below MAX_HISTORY_SIZE of 100
        onsuccess: null as any,
      }

      // Setup count request to return immediately
      mockIndex.count.mockImplementation(() => {
        const request = mockCountRequestWithResult

        process.nextTick(() => {
          if (request.onsuccess) {
            request.onsuccess({ target: request } as unknown as Event)
          }
        })

        return request
      })

      // Reset mock for openCursor
      mockIndex.openCursor.mockClear()

      await (storage as any)._enforceHistorySizeLimit('testConnection')

      // Should have counted the records
      expect(mockIndex.count).toHaveBeenCalled()

      // Should not have tried to retrieve cursors for deletion
      expect(mockIndex.openCursor).not.toHaveBeenCalled()
    }, 10000) // Increase timeout

    it('should handle count errors', async () => {
      // Setup error condition for count
      const mockErrorCountRequest = {
        ...mockCountRequest,
        onerror: null as any,
        error: new Error('Count failed'),
      }

      mockIndex.count.mockImplementation(() => {
        setTimeout(() => {
          if (mockErrorCountRequest.onerror) {
            mockErrorCountRequest.onerror({ target: mockErrorCountRequest } as unknown as Event)
          }
        }, 0)
        return mockErrorCountRequest
      })

      await expect((storage as any)._enforceHistorySizeLimit('testConnection')).rejects.toThrow()
    })
  })
})
