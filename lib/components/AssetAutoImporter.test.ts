import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, VueWrapper, flushPromises } from '@vue/test-utils'
import { nextTick, ref } from 'vue'
import AssetAutoImporter from './AssetAutoImporter.vue'
import { getDefaultValueFromHash } from '../stores/urlStore'

// Test constants
const TEST_CONSTANTS = {
  MODEL_URL: 'https://example.com/model.json',
  STORE_URL: 'https://example.com/store',
  DASHBOARD_NAME: 'TestDashboard',
  EDITOR_NAME: 'TestEditor',
  MODEL_NAME: 'TestModel',
  DASHBOARD_ID: 'dashboard-123',
  EDITOR_ID: 'editor-456',
  CONNECTION_NAME: 'TestModel-connection',
  CONNECTIONS: {
    DUCKDB: 'duckdb',
    MOTHERDUCK: 'motherduck',
    BIGQUERY: 'bigquery',
    SNOWFLAKE: 'snowflake',
    UNSUPPORTED: 'unsupported',
  },
  FORM_VALUES: {
    MD_TOKEN: 'test-token',
    PROJECT_ID: 'test-project',
    USERNAME: 'test-user',
    ACCOUNT: 'test-account',
    PRIVATE_KEY: 'test-key',
  },
  TIMEOUTS: {
    MIN_DISPLAY_TIME: 1500,
    SUCCESS_DELAY: 2000,
  },
}

const createMockConnection = (connectionType: string) => ({
  setModel: vi.fn(),
  type: connectionType,
})

// Mock dependencies
const mockDashboardStore = {
  dashboards: {} as Record<string, any>,
  addDashboard: vi.fn(),
  warmDashboardQueries: vi.fn(),
}

const mockConnectionStore = {
  connections: {} as Record<string, any>,
  newConnection: vi.fn((name: string, type: string, _: any) => {
    mockConnectionStore.connections[name] = createMockConnection(type)
  }),
  resetConnection: vi.fn().mockResolvedValue(undefined),
}

const mockEditorStore = {
  editors: {} as Record<string, any>,
  newEditor: vi.fn(),
  setEditorContents: vi.fn(),
}

const mockModelStore = {
  models: {},
  newModelConfig: vi.fn(),
}

const mockCommunityApiStore = {
  stores: [] as any[],
  addStore: vi.fn(),
}

const mockSaveDashboards = vi.fn()
const mockSaveAll = vi.fn()

const mockScreenNavigation = {
  setActiveModel: vi.fn(),
  setActiveDashboard: vi.fn(),
  setActiveScreen: vi.fn(),
  closeTab: vi.fn(),
  openTab: vi.fn(),
  setActiveSidebarScreen: vi.fn(),
  modelImport: ref(TEST_CONSTANTS.MODEL_URL),
}

const mockModelImportService = {
  importModel: vi.fn(),
}

vi.mock('../stores/urlStore', () => ({
  getDefaultValueFromHash: vi.fn(),
  removeHashFromUrl: vi.fn(),
}))

vi.mock('../stores/useScreenNavigation', () => ({
  default: vi.fn(() => mockScreenNavigation),
}))

vi.mock('../models/helpers', () => ({
  ModelImportService: vi.fn(() => mockModelImportService),
}))

const mockQueryExecutionService = {}

describe('AssetAutoImporter', () => {
  let wrapper: VueWrapper<any>
  let mockFetch: any

  beforeEach(() => {
    vi.clearAllMocks()
    mockDashboardStore.dashboards = {}
    mockConnectionStore.connections = {}
    mockEditorStore.editors = {}
    mockModelStore.models = {}
    mockCommunityApiStore.stores = []
    mockScreenNavigation.modelImport.value = TEST_CONSTANTS.MODEL_URL
    mockFetch = vi.fn()
    global.fetch = mockFetch
  })

  afterEach(() => {
    if (wrapper) {
      wrapper.unmount()
    }
    vi.restoreAllMocks()
  })

  const createMockDashboard = (connectionName: string = TEST_CONSTANTS.CONNECTIONS.DUCKDB) => ({
    id: TEST_CONSTANTS.DASHBOARD_ID,
    name: TEST_CONSTANTS.DASHBOARD_NAME,
    connection: connectionName,
  })

  const createMockEditor = (connectionName: string = TEST_CONSTANTS.CONNECTIONS.DUCKDB) => ({
    id: TEST_CONSTANTS.EDITOR_ID,
    name: TEST_CONSTANTS.EDITOR_NAME,
    connection: connectionName,
  })

  const createUrlParams = (overrides: Record<string, string> = {}) => ({
    assetType: 'dashboard',
    assetName: TEST_CONSTANTS.DASHBOARD_NAME,
    modelName: TEST_CONSTANTS.MODEL_NAME,
    connection: TEST_CONSTANTS.CONNECTIONS.DUCKDB,
    ...overrides,
  })

  const createWrapper = async (urlParams: Record<string, string> = {}) => {
    vi.mocked(getDefaultValueFromHash).mockImplementation(
      (key: string, defaultValue?: string | null) => {
        return urlParams[key] || defaultValue || null
      },
    )

    const wrapper = mount(AssetAutoImporter, {
      global: {
        provide: {
          dashboardStore: mockDashboardStore,
          connectionStore: mockConnectionStore,
          editorStore: mockEditorStore,
          modelStore: mockModelStore,
          communityApiStore: mockCommunityApiStore,
          queryExecutionService: mockQueryExecutionService,
          saveDashboards: mockSaveDashboards,
          saveAll: mockSaveAll,
        },
      },
    })
    await nextTick()
    await flushPromises()
    return wrapper
  }

  const setupSuccessfulDashboardImport = (
    connectionType: string = TEST_CONSTANTS.CONNECTIONS.DUCKDB,
  ) => {
    mockModelImportService.importModel.mockResolvedValue({
      dashboards: new Map([[TEST_CONSTANTS.DASHBOARD_NAME, TEST_CONSTANTS.DASHBOARD_NAME]]),
      trilogy: new Map(),
      sql: new Map(),
    })

    const connectionName = TEST_CONSTANTS.CONNECTION_NAME
    const mockDashboard = createMockDashboard(connectionName)
    mockDashboardStore.dashboards = {
      [TEST_CONSTANTS.DASHBOARD_ID]: mockDashboard,
    }

    mockConnectionStore.connections[connectionName] = createMockConnection(connectionType)
  }

  const setupSuccessfulEditorImport = (
    connectionType: string = TEST_CONSTANTS.CONNECTIONS.DUCKDB,
  ) => {
    mockModelImportService.importModel.mockResolvedValue({
      dashboards: new Map(),
      trilogy: new Map([[TEST_CONSTANTS.EDITOR_NAME, TEST_CONSTANTS.EDITOR_NAME]]),
      sql: new Map(),
    })

    const connectionName = TEST_CONSTANTS.CONNECTION_NAME
    const mockEditor = createMockEditor(connectionName)
    mockEditorStore.editors = {
      [TEST_CONSTANTS.EDITOR_ID]: mockEditor,
    }

    mockConnectionStore.connections[connectionName] = createMockConnection(connectionType)
  }

  describe('Component Initialization', () => {
    it('should throw error if required stores are not provided', () => {
      expect(() => {
        mount(AssetAutoImporter, {
          global: {
            provide: {},
          },
        })
      }).toThrow('Required stores not provided')
    })

    it('should show error if missing required URL parameters', async () => {
      vi.useFakeTimers()
      wrapper = await createWrapper({})
      await nextTick()
      vi.advanceTimersByTime(2000)
      await vi.runOnlyPendingTimersAsync()
      await nextTick()
      await flushPromises()
      await wrapper.vm.$forceUpdate()

      expect(wrapper.find('.error-state').exists()).toBe(true)
      expect(wrapper.text()).toContain('Missing required import parameters')
      vi.useRealTimers()
    })

    it('should show error for unsupported connection type', async () => {
      wrapper = await createWrapper(
        createUrlParams({
          connection: TEST_CONSTANTS.CONNECTIONS.UNSUPPORTED,
        }),
      )

      await wrapper.vm.$forceUpdate()
      expect(wrapper.find('.error-state').exists()).toBe(true)
      expect(wrapper.text()).toContain(
        `Unsupported connection type: ${TEST_CONSTANTS.CONNECTIONS.UNSUPPORTED}`,
      )
    })

    it('should support legacy dashboard parameter format', async () => {
      setupSuccessfulDashboardImport(TEST_CONSTANTS.CONNECTIONS.DUCKDB)

      wrapper = await createWrapper({
        dashboard: TEST_CONSTANTS.DASHBOARD_NAME, // Legacy param
        modelName: TEST_CONSTANTS.MODEL_NAME,
        connection: TEST_CONSTANTS.CONNECTIONS.DUCKDB,
      })

      await nextTick()
      await nextTick()
      await wrapper.vm.$forceUpdate()

      expect(wrapper.find('.error-state').exists()).toBe(false)
    })
  })

  describe('Dashboard Import', () => {
    it('should auto-import dashboard for DuckDB connection', async () => {
      setupSuccessfulDashboardImport(TEST_CONSTANTS.CONNECTIONS.DUCKDB)

      wrapper = await createWrapper(
        createUrlParams({
          assetType: 'dashboard',
          assetName: TEST_CONSTANTS.DASHBOARD_NAME,
          connection: TEST_CONSTANTS.CONNECTIONS.DUCKDB,
        }),
      )

      await nextTick()
      await nextTick()
      await wrapper.vm.$forceUpdate()

      expect(wrapper.find('.loading-state').exists()).toBe(true)
      expect(wrapper.text()).toContain('Setting up your dashboard...')
    })

    it('should emit importComplete with dashboard ID and type', async () => {
      vi.useFakeTimers()
      setupSuccessfulDashboardImport(TEST_CONSTANTS.CONNECTIONS.DUCKDB)

      wrapper = await createWrapper(
        createUrlParams({
          assetType: 'dashboard',
          assetName: TEST_CONSTANTS.DASHBOARD_NAME,
          connection: TEST_CONSTANTS.CONNECTIONS.DUCKDB,
        }),
      )

      await nextTick()
      await nextTick()

      await vi.waitFor(() => {
        return mockModelImportService.importModel.mock.calls.length > 0
      })

      vi.advanceTimersByTime(5000)
      await nextTick()

      await vi.waitFor(() => {
        expect(wrapper.emitted('importComplete')).toBeTruthy()
      })

      const emittedEvents = wrapper.emitted('importComplete')
      expect(emittedEvents![0]).toEqual([TEST_CONSTANTS.DASHBOARD_ID, 'dashboard'])
      vi.useRealTimers()
    })
  })

  describe('Editor Import', () => {
    it('should auto-import editor for DuckDB connection', async () => {
      setupSuccessfulEditorImport(TEST_CONSTANTS.CONNECTIONS.DUCKDB)

      wrapper = await createWrapper(
        createUrlParams({
          assetType: 'editor',
          assetName: TEST_CONSTANTS.EDITOR_NAME,
          connection: TEST_CONSTANTS.CONNECTIONS.DUCKDB,
        }),
      )

      await nextTick()
      await nextTick()
      await wrapper.vm.$forceUpdate()

      expect(wrapper.find('.loading-state').exists()).toBe(true)
      expect(wrapper.text()).toContain('Setting up your editor...')
    })

    it('should emit importComplete with editor ID and type', async () => {
      vi.useFakeTimers()
      setupSuccessfulEditorImport(TEST_CONSTANTS.CONNECTIONS.DUCKDB)

      wrapper = await createWrapper(
        createUrlParams({
          assetType: 'trilogy',
          assetName: TEST_CONSTANTS.EDITOR_NAME,
          connection: TEST_CONSTANTS.CONNECTIONS.DUCKDB,
        }),
      )

      await nextTick()
      await nextTick()

      await vi.waitFor(() => {
        return mockModelImportService.importModel.mock.calls.length > 0
      })

      vi.advanceTimersByTime(5000)
      await nextTick()

      await vi.waitFor(() => {
        expect(wrapper.emitted('importComplete')).toBeTruthy()
      })

      const emittedEvents = wrapper.emitted('importComplete')
      expect(emittedEvents![0]).toEqual([TEST_CONSTANTS.EDITOR_ID, 'trilogy'])
      vi.useRealTimers()
    })
  })

  describe('Store Registration', () => {
    it('should register new store if store URL provided', async () => {
      setupSuccessfulDashboardImport(TEST_CONSTANTS.CONNECTIONS.DUCKDB)

      wrapper = await createWrapper({
        ...createUrlParams(),
        store: TEST_CONSTANTS.STORE_URL,
      })

      await nextTick()
      await nextTick()

      await vi.waitFor(() => {
        return mockCommunityApiStore.addStore.mock.calls.length > 0
      })

      expect(mockCommunityApiStore.addStore).toHaveBeenCalled()
    })

    it('should skip registration if store already exists', async () => {
      mockCommunityApiStore.stores = [
        {
          id: 'example.com-store',
          name: 'Test Store',
          baseUrl: TEST_CONSTANTS.STORE_URL,
        },
      ]

      setupSuccessfulDashboardImport(TEST_CONSTANTS.CONNECTIONS.DUCKDB)

      wrapper = await createWrapper({
        ...createUrlParams(),
        store: TEST_CONSTANTS.STORE_URL,
      })

      await nextTick()
      await nextTick()

      // Wait a bit to ensure registration doesn't happen
      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(mockCommunityApiStore.addStore).not.toHaveBeenCalled()
    })

    it('should show registering step when store URL provided', async () => {
      setupSuccessfulDashboardImport(TEST_CONSTANTS.CONNECTIONS.DUCKDB)

      wrapper = await createWrapper({
        ...createUrlParams(),
        store: TEST_CONSTANTS.STORE_URL,
      })

      await nextTick()
      await nextTick()
      await wrapper.vm.$forceUpdate()

      const steps = wrapper.findAll('.step')
      // Should have 4 steps including registering
      expect(steps.length).toBeGreaterThanOrEqual(4)
      expect(wrapper.text()).toContain('Registering store')
    })
  })

  describe('Connection Setup Forms', () => {
    it('should show connection setup form for MotherDuck', async () => {
      wrapper = await createWrapper(
        createUrlParams({
          connection: TEST_CONSTANTS.CONNECTIONS.MOTHERDUCK,
        }),
      )

      await nextTick()
      await nextTick()
      await wrapper.vm.$forceUpdate()

      expect(wrapper.find('.import-form').exists()).toBe(true)
      expect(wrapper.find('#md-token').exists()).toBe(true)
      expect(wrapper.text()).toContain('Connection Setup')
    })

    it('should validate form and enable import when valid', async () => {
      wrapper = await createWrapper(
        createUrlParams({
          connection: TEST_CONSTANTS.CONNECTIONS.MOTHERDUCK,
        }),
      )

      await nextTick()
      await nextTick()
      await wrapper.vm.$forceUpdate()

      expect(wrapper.find('.import-button').attributes('disabled')).toBeDefined()

      await wrapper.find('#md-token').setValue(TEST_CONSTANTS.FORM_VALUES.MD_TOKEN)
      await nextTick()
      await wrapper.vm.$forceUpdate()

      const disabledAttr = wrapper.find('.import-button').attributes('disabled')
      expect(disabledAttr).toBeFalsy()
    })
  })

  describe('Error Handling', () => {
    it('should handle import errors gracefully', async () => {
      mockModelImportService.importModel.mockRejectedValue(new Error('Import failed'))

      wrapper = await createWrapper(
        createUrlParams({
          connection: TEST_CONSTANTS.CONNECTIONS.DUCKDB,
        }),
      )

      await nextTick()
      await nextTick()

      await vi.waitFor(() => {
        return wrapper.vm.error !== null
      })

      await wrapper.vm.$forceUpdate()
      expect(wrapper.find('.error-state').exists()).toBe(true)
      expect(wrapper.text()).toContain('Import failed')
    })

    it('should handle missing asset after import', async () => {
      mockModelImportService.importModel.mockResolvedValue({
        dashboards: new Map(),
        trilogy: new Map(),
        sql: new Map(),
      })

      const connectionName = TEST_CONSTANTS.CONNECTION_NAME
      mockConnectionStore.connections[connectionName] = createMockConnection(
        TEST_CONSTANTS.CONNECTIONS.DUCKDB,
      )

      wrapper = await createWrapper(
        createUrlParams({
          connection: TEST_CONSTANTS.CONNECTIONS.DUCKDB,
        }),
      )

      await nextTick()
      await nextTick()

      await vi.waitFor(() => {
        return wrapper.vm.error !== null
      })

      await wrapper.vm.$forceUpdate()
      expect(wrapper.find('.error-state').exists()).toBe(true)
      expect(wrapper.text()).toContain('was not found in the imported model')
    })
  })

  describe('Navigation', () => {
    it('should navigate to dashboard screen after dashboard import', async () => {
      vi.useFakeTimers()
      setupSuccessfulDashboardImport(TEST_CONSTANTS.CONNECTIONS.DUCKDB)

      wrapper = await createWrapper(
        createUrlParams({
          assetType: 'dashboard',
        }),
      )

      await nextTick()
      await nextTick()

      await vi.waitFor(() => {
        return mockModelImportService.importModel.mock.calls.length > 0
      })

      vi.advanceTimersByTime(6000)
      await nextTick()

      await vi.waitFor(() => {
        expect(mockScreenNavigation.openTab).toHaveBeenCalledWith(
          'dashboard',
          null,
          TEST_CONSTANTS.DASHBOARD_ID,
        )
      })

      expect(mockScreenNavigation.closeTab).toHaveBeenCalledWith(null, 'asset-import')
      expect(mockScreenNavigation.setActiveSidebarScreen).toHaveBeenCalledWith('dashboard')
      vi.useRealTimers()
    })

    it('should navigate to editor screen after editor import', async () => {
      vi.useFakeTimers()
      setupSuccessfulEditorImport(TEST_CONSTANTS.CONNECTIONS.DUCKDB)

      wrapper = await createWrapper(
        createUrlParams({
          assetType: 'editor',
          assetName: TEST_CONSTANTS.EDITOR_NAME,
        }),
      )

      await nextTick()
      await nextTick()

      await vi.waitFor(() => {
        return mockModelImportService.importModel.mock.calls.length > 0
      })

      vi.advanceTimersByTime(6000)
      await nextTick()

      await vi.waitFor(() => {
        expect(mockScreenNavigation.openTab).toHaveBeenCalledWith(
          'editors',
          null,
          TEST_CONSTANTS.EDITOR_ID,
        )
      })

      expect(mockScreenNavigation.closeTab).toHaveBeenCalledWith(null, 'asset-import')
      expect(mockScreenNavigation.setActiveSidebarScreen).toHaveBeenCalledWith('editors')
      vi.useRealTimers()
    })
  })
})
