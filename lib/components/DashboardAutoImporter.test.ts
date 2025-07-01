import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import AutoImportComponent from './DashboardAutoImporter.vue' // Adjust path as needed
import { getDefaultValueFromHash } from '../stores/urlStore'

// Test constants
const TEST_CONSTANTS = {
  MODEL_URL: 'https://example.com/model.json',
  DASHBOARD_NAME: 'TestDashboard',
  MODEL_NAME: 'TestModel',
  DASHBOARD_ID: 'dashboard-123',
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
    NAVIGATION_DELAY: 500,
  },
}

// Mock dependencies
const mockDashboardStore = {
  dashboards: {} as Record<string, any>,
  addDashboard: vi.fn(),
}

const mockConnectionStore = {
  connections: {} as Record<string, any>,
  newConnection: vi.fn(),
  resetConnection: vi.fn().mockResolvedValue(undefined),
}

const mockEditorStore = {
  editors: {},
  newEditor: vi.fn(),
  setEditorContents: vi.fn(),
}

const mockModelStore = {
  models: {},
  newModelConfig: vi.fn(), // Fixed: should be newModelConfig, not newModel
}

const mockSaveDashboards = vi.fn()
const mockSaveAll = vi.fn()

const mockScreenNavigation = {
  setActiveModel: vi.fn(),
  setActiveDashboard: vi.fn(),
  setActiveScreen: vi.fn(),
}

// Mock ModelImportService
const mockModelImportService = {
  importModel: vi.fn(),
}

// Mock connection with setModel method
const createMockConnection = () => ({
  setModel: vi.fn(),
})

// Mock the URL store
vi.mock('../stores/urlStore', () => ({
  getDefaultValueFromHash: vi.fn(),
}))

// Mock the screen navigation hook
vi.mock('../stores/useScreenNavigation', () => ({
  default: () => mockScreenNavigation,
}))

// Mock the ModelImportService
vi.mock('../models/helpers', () => ({
  ModelImportService: vi.fn(() => mockModelImportService),
}))

describe('AutoImportComponent', () => {
  let wrapper: VueWrapper<any>
  let mockFetch: any

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks()

    // Reset store states
    mockDashboardStore.dashboards = {}
    mockConnectionStore.connections = {}
    mockModelStore.models = {}

    // Mock fetch globally
    mockFetch = vi.fn()
    global.fetch = mockFetch

    // Mock console methods to avoid noise in tests
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
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

  const createUrlParams = (overrides: Record<string, string> = {}) => ({
    model: TEST_CONSTANTS.MODEL_URL,
    dashboard: TEST_CONSTANTS.DASHBOARD_NAME,
    modelName: TEST_CONSTANTS.MODEL_NAME,
    connection: TEST_CONSTANTS.CONNECTIONS.DUCKDB,
    ...overrides,
  })

  const createWrapper = (urlParams: Record<string, string> = {}) => {
    // Setup URL parameter mocks - Fixed type signature
    vi.mocked(getDefaultValueFromHash).mockImplementation(
      (key: string, defaultValue?: string | null) => {
        return urlParams[key] || defaultValue || null
      },
    )

    return mount(AutoImportComponent, {
      global: {
        provide: {
          dashboardStore: mockDashboardStore,
          connectionStore: mockConnectionStore,
          editorStore: mockEditorStore,
          modelStore: mockModelStore,
          saveDashboards: mockSaveDashboards,
          saveAll: mockSaveAll,
        },
      },
    })
  }

  const setupSuccessfulImport = (connectionType: string = TEST_CONSTANTS.CONNECTIONS.DUCKDB) => {
    mockModelImportService.importModel.mockResolvedValue(undefined)

    const connectionName =
      connectionType === TEST_CONSTANTS.CONNECTIONS.DUCKDB
        ? TEST_CONSTANTS.CONNECTION_NAME
        : TEST_CONSTANTS.CONNECTION_NAME

    const mockDashboard = createMockDashboard(connectionName)
    mockDashboardStore.dashboards = {
      [TEST_CONSTANTS.DASHBOARD_ID]: mockDashboard,
    }

    // Setup connection mock - Fixed type issue
    mockConnectionStore.connections[connectionName] = createMockConnection()
  }

  describe('Component Initialization', () => {
    it('should throw error if required stores are not provided', () => {
      expect(() => {
        mount(AutoImportComponent, {
          global: {
            provide: {
              // Missing required stores
            },
          },
        })
      }).toThrow('Required stores not provided')
    })

    it('should show error if missing required URL parameters', async () => {
      wrapper = createWrapper({})

      await nextTick()
      await nextTick() // Wait for onMounted to complete

      expect(wrapper.find('.error-state').exists()).toBe(true)
      expect(wrapper.text()).toContain('Missing required import parameters')
    })

    it('should show error for unsupported connection type', async () => {
      wrapper = createWrapper(
        createUrlParams({
          connection: TEST_CONSTANTS.CONNECTIONS.UNSUPPORTED,
        }),
      )

      await nextTick()
      await nextTick()

      expect(wrapper.find('.error-state').exists()).toBe(true)
      expect(wrapper.text()).toContain(
        `Unsupported connection type: ${TEST_CONSTANTS.CONNECTIONS.UNSUPPORTED}`,
      )
    })

    it('should initialize with correct URL parameters', async () => {
      // Setup successful import for DuckDB to avoid error state
      setupSuccessfulImport(TEST_CONSTANTS.CONNECTIONS.DUCKDB)

      wrapper = createWrapper(createUrlParams())

      await nextTick()
      await nextTick()

      // Should not show error state
      expect(wrapper.find('.error-state').exists()).toBe(false)
    })
  })

  describe('DuckDB Auto Import', () => {
    it('should auto-import for DuckDB connection', async () => {
      setupSuccessfulImport(TEST_CONSTANTS.CONNECTIONS.DUCKDB)

      wrapper = createWrapper(
        createUrlParams({
          connection: TEST_CONSTANTS.CONNECTIONS.DUCKDB,
        }),
      )

      await nextTick()
      await nextTick()

      // Wait for auto-import to complete
      await vi.waitFor(() => {
        expect(mockModelImportService.importModel).toHaveBeenCalledWith(
          TEST_CONSTANTS.MODEL_NAME,
          TEST_CONSTANTS.MODEL_URL,
          TEST_CONSTANTS.CONNECTION_NAME,
        )
      })

      expect(mockSaveAll).toHaveBeenCalled()
    })

    it('should show success state after successful import', async () => {
      setupSuccessfulImport(TEST_CONSTANTS.CONNECTIONS.DUCKDB)

      wrapper = createWrapper(
        createUrlParams({
          connection: TEST_CONSTANTS.CONNECTIONS.DUCKDB,
        }),
      )

      await nextTick()
      await nextTick()

      await vi.waitFor(() => {
        expect(wrapper.find('.success-state').exists()).toBe(true)
      })

      expect(wrapper.text()).toContain('Import Successful!')
      expect(wrapper.text()).toContain(TEST_CONSTANTS.MODEL_NAME)
      expect(wrapper.text()).toContain(TEST_CONSTANTS.DASHBOARD_NAME)
    })
  })

  describe('Manual Import with Connection Setup', () => {
    it('should show connection setup form for MotherDuck', async () => {
      wrapper = createWrapper(
        createUrlParams({
          connection: TEST_CONSTANTS.CONNECTIONS.MOTHERDUCK,
        }),
      )

      await nextTick()
      await nextTick()

      expect(wrapper.find('.import-form').exists()).toBe(true)
      expect(wrapper.find('#md-token').exists()).toBe(true)
      // Fixed: Check for actual capitalization in component
      expect(wrapper.text()).toContain('Motherduck Connection Setup')
    })

    it('should show connection setup form for BigQuery', async () => {
      wrapper = createWrapper(
        createUrlParams({
          connection: TEST_CONSTANTS.CONNECTIONS.BIGQUERY,
        }),
      )

      await nextTick()
      await nextTick()

      expect(wrapper.find('.import-form').exists()).toBe(true)
      expect(wrapper.find('#project-id').exists()).toBe(true)
      // Fixed: Check for actual capitalization in component
      expect(wrapper.text()).toContain('Bigquery Connection Setup')
    })

    it('should show connection setup form for Snowflake', async () => {
      wrapper = createWrapper(
        createUrlParams({
          connection: TEST_CONSTANTS.CONNECTIONS.SNOWFLAKE,
        }),
      )

      await nextTick()
      await nextTick()

      expect(wrapper.find('.import-form').exists()).toBe(true)
      expect(wrapper.find('#snowflake-username').exists()).toBe(true)
      expect(wrapper.find('#snowflake-account').exists()).toBe(true)
      expect(wrapper.find('#snowflake-key').exists()).toBe(true)
      expect(wrapper.text()).toContain('Snowflake Connection Setup')
    })

    it('should validate form and disable import button when invalid', async () => {
      wrapper = createWrapper(
        createUrlParams({
          connection: TEST_CONSTANTS.CONNECTIONS.MOTHERDUCK,
        }),
      )

      await nextTick()
      await nextTick()

      const importButton = wrapper.find('.import-button')
      expect(importButton.attributes('disabled')).toBeDefined()
    })

    it('should enable import button when form is valid', async () => {
      wrapper = createWrapper(
        createUrlParams({
          connection: TEST_CONSTANTS.CONNECTIONS.MOTHERDUCK,
        }),
      )

      await nextTick()
      await nextTick()

      // Fill in required field
      const tokenInput = wrapper.find('#md-token')
      await tokenInput.setValue(TEST_CONSTANTS.FORM_VALUES.MD_TOKEN)

      await nextTick()

      const importButton = wrapper.find('.import-button')
      expect(importButton.attributes('disabled')).toBeUndefined()
    })
  })

  describe('Import Process', () => {
    it('should create model if it does not exist', async () => {
      setupSuccessfulImport(TEST_CONSTANTS.CONNECTIONS.DUCKDB)

      wrapper = createWrapper(
        createUrlParams({
          connection: TEST_CONSTANTS.CONNECTIONS.DUCKDB,
        }),
      )

      await nextTick()
      await nextTick()

      await vi.waitFor(() => {
        expect(mockModelStore.newModelConfig).toHaveBeenCalledWith(TEST_CONSTANTS.MODEL_NAME)
      })
    })

    it('should handle import errors gracefully', async () => {
      const errorMessage = 'Import failed'
      mockModelImportService.importModel.mockRejectedValue(new Error(errorMessage))

      wrapper = createWrapper(
        createUrlParams({
          connection: TEST_CONSTANTS.CONNECTIONS.DUCKDB,
        }),
      )

      await nextTick()
      await nextTick()

      await vi.waitFor(() => {
        expect(wrapper.find('.error-state').exists()).toBe(true)
      })

      expect(wrapper.text()).toContain(errorMessage)
    })

    it('should handle missing dashboard after import', async () => {
      mockModelImportService.importModel.mockResolvedValue(undefined)
      mockDashboardStore.dashboards = {} // No dashboards
      mockConnectionStore.connections[TEST_CONSTANTS.CONNECTION_NAME] = createMockConnection()

      wrapper = createWrapper(
        createUrlParams({
          connection: TEST_CONSTANTS.CONNECTIONS.DUCKDB,
        }),
      )

      await nextTick()
      await nextTick()

      await vi.waitFor(() => {
        expect(wrapper.find('.error-state').exists()).toBe(true)
      })

      expect(wrapper.text()).toContain(
        `Dashboard "${TEST_CONSTANTS.DASHBOARD_NAME}" was not found in the imported model`,
      )
    })
  })

  describe('Navigation and Events', () => {
    it('should emit importComplete event with dashboard ID', async () => {
      setupSuccessfulImport(TEST_CONSTANTS.CONNECTIONS.DUCKDB)

      wrapper = createWrapper(
        createUrlParams({
          connection: TEST_CONSTANTS.CONNECTIONS.DUCKDB,
        }),
      )

      await nextTick()
      await nextTick()

      await vi.waitFor(() => {
        expect(wrapper.emitted('importComplete')).toBeTruthy()
      })

      const emittedEvents = wrapper.emitted('importComplete')
      expect(emittedEvents![0]).toEqual([TEST_CONSTANTS.DASHBOARD_ID])
    })

    it('should navigate to dashboard after successful import', async () => {
      vi.useFakeTimers()

      setupSuccessfulImport(TEST_CONSTANTS.CONNECTIONS.DUCKDB)

      wrapper = createWrapper(
        createUrlParams({
          connection: TEST_CONSTANTS.CONNECTIONS.DUCKDB,
        }),
      )

      await nextTick()
      await nextTick()

      // Wait for import to complete
      await vi.waitFor(() => {
        expect(wrapper.find('.success-state').exists()).toBe(true)
      })

      // Fast-forward the timeout
      vi.advanceTimersByTime(TEST_CONSTANTS.TIMEOUTS.NAVIGATION_DELAY)

      expect(mockScreenNavigation.setActiveModel).toHaveBeenCalledWith(null)
      expect(mockScreenNavigation.setActiveDashboard).toHaveBeenCalledWith(
        TEST_CONSTANTS.DASHBOARD_ID,
      )
      expect(mockScreenNavigation.setActiveScreen).toHaveBeenCalledWith('dashboard')

      vi.useRealTimers()
    })

    it('should handle cancel button click', async () => {
      wrapper = createWrapper(
        createUrlParams({
          connection: TEST_CONSTANTS.CONNECTIONS.MOTHERDUCK,
        }),
      )

      await nextTick()
      await nextTick()

      await wrapper.find('.cancel-button').trigger('click')

      expect(mockScreenNavigation.setActiveDashboard).toHaveBeenCalledWith(null)
      expect(mockScreenNavigation.setActiveScreen).toHaveBeenCalledWith('dashboard')
    })
  })

  describe('Form Validation', () => {
    it('should validate MotherDuck token requirement', async () => {
      wrapper = createWrapper(
        createUrlParams({
          connection: TEST_CONSTANTS.CONNECTIONS.MOTHERDUCK,
        }),
      )

      await nextTick()
      await nextTick()

      // Initially invalid
      expect(wrapper.find('.import-button').attributes('disabled')).toBeDefined()

      // Add token
      await wrapper.find('#md-token').setValue(TEST_CONSTANTS.FORM_VALUES.MD_TOKEN)
      await nextTick()

      // Should be valid now
      expect(wrapper.find('.import-button').attributes('disabled')).toBeUndefined()
    })

    it('should validate all Snowflake required fields', async () => {
      wrapper = createWrapper(
        createUrlParams({
          connection: TEST_CONSTANTS.CONNECTIONS.SNOWFLAKE,
        }),
      )

      await nextTick()
      await nextTick()

      // Initially invalid
      expect(wrapper.find('.import-button').attributes('disabled')).toBeDefined()

      // Fill only username
      await wrapper.find('#snowflake-username').setValue(TEST_CONSTANTS.FORM_VALUES.USERNAME)
      await nextTick()
      expect(wrapper.find('.import-button').attributes('disabled')).toBeDefined()

      // Fill account
      await wrapper.find('#snowflake-account').setValue(TEST_CONSTANTS.FORM_VALUES.ACCOUNT)
      await nextTick()
      expect(wrapper.find('.import-button').attributes('disabled')).toBeDefined()

      // Fill private key - now should be valid
      await wrapper.find('#snowflake-key').setValue(TEST_CONSTANTS.FORM_VALUES.PRIVATE_KEY)
      await nextTick()
      expect(wrapper.find('.import-button').attributes('disabled')).toBeUndefined()
    })
  })
})
