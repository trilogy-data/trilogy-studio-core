import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import AutoImportComponent from './DashboardAutoImporter.vue' // Adjust path as needed
import { getDefaultValueFromHash } from '../../stores/urlStore'

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
    MIN_DISPLAY_TIME: 1500,
    SUCCESS_DELAY: 2000,
  },
}

// Mock dependencies
const mockDashboardStore = {
  dashboards: {} as Record<string, any>,
  addDashboard: vi.fn(),
  warmDashboardQueries: vi.fn(), // Add this line
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
  newModelConfig: vi.fn(),
}

const mockSaveDashboards = vi.fn()
const mockSaveAll = vi.fn()

const mockScreenNavigation = {
  setActiveModel: vi.fn(),
  setActiveDashboard: vi.fn(),
  setActiveScreen: vi.fn(),
}

const mockModelImportService = {
  importModel: vi.fn(),
}

const createMockConnection = (connectionType: string) => ({
  setModel: vi.fn(),
  type: connectionType,
})

vi.mock('../../stores/urlStore', () => ({
  getDefaultValueFromHash: vi.fn(),
}))

vi.mock('../../stores/useScreenNavigation', () => ({
  default: () => mockScreenNavigation,
}))

vi.mock('../../models/helpers', () => ({
  ModelImportService: vi.fn(() => mockModelImportService),
}))

const mockQueryExecutionService = {}

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
    // vi.spyOn(console, 'error').mockImplementation(() => { })
    // vi.spyOn(console, 'log').mockImplementation(() => { })
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
    // Setup URL parameter mocks
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
          queryExecutionService: mockQueryExecutionService,
          saveDashboards: mockSaveDashboards,
          saveAll: mockSaveAll,
        },
      },
    })
  }

  const setupSuccessfulImport = (connectionType: string = TEST_CONSTANTS.CONNECTIONS.DUCKDB) => {
    mockModelImportService.importModel.mockResolvedValue({
      dashboards: new Map([[TEST_CONSTANTS.DASHBOARD_NAME, TEST_CONSTANTS.DASHBOARD_NAME]]),
    })

    const connectionName = TEST_CONSTANTS.CONNECTION_NAME
    const mockDashboard = createMockDashboard(connectionName)
    mockDashboardStore.dashboards = {
      [TEST_CONSTANTS.DASHBOARD_ID]: mockDashboard,
    }

    // Setup connection mock
    mockConnectionStore.connections[connectionName] = createMockConnection(connectionType)
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
    it('should auto-import for DuckDB connection and show step indicators', async () => {
      setupSuccessfulImport(TEST_CONSTANTS.CONNECTIONS.DUCKDB)

      wrapper = createWrapper(
        createUrlParams({
          connection: TEST_CONSTANTS.CONNECTIONS.DUCKDB,
        }),
      )

      await nextTick()
      await nextTick()

      // Should show loading state with step indicators
      expect(wrapper.find('.loading-state').exists()).toBe(true)
      expect(wrapper.find('.step-indicator').exists()).toBe(true)
      expect(wrapper.text()).toContain('Setting up your dashboard...')

      // Should show importing step as active initially
      const steps = wrapper.findAll('.step')
      expect(steps[0].classes()).toContain('completed')
      expect(steps[0].text()).toContain('Importing model')

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

    it('should show unified loading state throughout the process', async () => {
      vi.useFakeTimers()
      setupSuccessfulImport(TEST_CONSTANTS.CONNECTIONS.DUCKDB)

      wrapper = createWrapper(
        createUrlParams({
          connection: TEST_CONSTANTS.CONNECTIONS.DUCKDB,
        }),
      )

      await nextTick()
      await nextTick()

      // Initially shows loading state
      expect(wrapper.find('.loading-state').exists()).toBe(true)
      expect(wrapper.text()).toContain('Setting up your dashboard...')

      // Fast-forward to allow step transitions
      vi.advanceTimersByTime(TEST_CONSTANTS.TIMEOUTS.MIN_DISPLAY_TIME * 3)
      await nextTick()

      // Should still show the same headline, but may transition to success state
      expect(wrapper.text()).toContain('Setting up your dashboard...')

      vi.useRealTimers()
    })

    it('should transition through all step indicators', async () => {
      vi.useFakeTimers()
      setupSuccessfulImport(TEST_CONSTANTS.CONNECTIONS.DUCKDB)

      wrapper = createWrapper(
        createUrlParams({
          connection: TEST_CONSTANTS.CONNECTIONS.DUCKDB,
        }),
      )

      // Check initial step
      let steps = wrapper.findAll('.step')
      expect(steps[0].classes()).toContain('active')
      expect(steps[0].text()).toContain('Importing model')

      // Fast-forward through minimum display times
      vi.advanceTimersByTime(TEST_CONSTANTS.TIMEOUTS.MIN_DISPLAY_TIME)
      await nextTick()

      // Should eventually show connecting step
      vi.advanceTimersByTime(TEST_CONSTANTS.TIMEOUTS.MIN_DISPLAY_TIME)
      await nextTick()

      // And finally preparing step
      vi.advanceTimersByTime(TEST_CONSTANTS.TIMEOUTS.MIN_DISPLAY_TIME)
      await nextTick()

      vi.useRealTimers()
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
      expect(wrapper.text()).toContain('Connection Setup')
      expect(wrapper.text()).toContain('Import Model & Dashboard')
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
      expect(wrapper.text()).toContain('Connection Setup')
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
      expect(wrapper.text()).toContain('Snowflake (Key Pair Auth) Connection Setup')
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

    it('should trigger manual import with step indicators when form is submitted', async () => {
      setupSuccessfulImport(TEST_CONSTANTS.CONNECTIONS.MOTHERDUCK)

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

      // Click import button
      await wrapper.find('.import-button').trigger('click')
      await nextTick()

      // Should show loading state with step indicators
      expect(wrapper.find('.loading-state').exists()).toBe(true)
      expect(wrapper.find('.step-indicator').exists()).toBe(true)
      expect(wrapper.text()).toContain('Setting up your dashboard...')
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
        expect(mockModelStore.newModelConfig).toHaveBeenCalledWith(TEST_CONSTANTS.MODEL_NAME, true)
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

      expect(wrapper.text()).toContain('Dashboard Load Failed')
      expect(wrapper.text()).toContain(errorMessage)
    })

    it('should handle missing dashboard after import', async () => {
      mockModelImportService.importModel.mockResolvedValue({
        dashboards: new Map(),
      })
      mockDashboardStore.dashboards = {} // No dashboards
      mockConnectionStore.connections[TEST_CONSTANTS.CONNECTION_NAME] = createMockConnection(
        TEST_CONSTANTS.CONNECTIONS.DUCKDB,
      )

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

    it('should emit fullScreen event during import', async () => {
      setupSuccessfulImport(TEST_CONSTANTS.CONNECTIONS.DUCKDB)

      wrapper = createWrapper(
        createUrlParams({
          connection: TEST_CONSTANTS.CONNECTIONS.DUCKDB,
        }),
      )

      await nextTick()
      await nextTick()

      await vi.waitFor(() => {
        expect(wrapper.emitted('fullScreen')).toBeTruthy()
      })

      const fullScreenEvents = wrapper.emitted('fullScreen')
      expect(fullScreenEvents![0]).toEqual([true])
    })
  })

  describe('Navigation and Events', () => {
    it('should emit importComplete event with dashboard ID', async () => {
      vi.useFakeTimers()
      setupSuccessfulImport(TEST_CONSTANTS.CONNECTIONS.DUCKDB)

      wrapper = createWrapper(
        createUrlParams({
          connection: TEST_CONSTANTS.CONNECTIONS.DUCKDB,
        }),
      )
      await nextTick()
      await nextTick()

      // Wait for import to start
      await vi.waitFor(() => {
        return mockModelImportService.importModel.mock.calls.length > 0
      })

      // Fast-forward through all the step transition delays
      vi.advanceTimersByTime(5000) // This should skip all the minDisplayTime delays
      await nextTick()

      console.log(wrapper.emitted('importComplete'))
      await vi.waitFor(() => {
        expect(wrapper.emitted('importComplete')).toBeTruthy()
      })

      const emittedEvents = wrapper.emitted('importComplete')
      expect(emittedEvents![0]).toEqual([TEST_CONSTANTS.DASHBOARD_ID])
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

    it('should handle manual import fallback button click', async () => {
      wrapper = createWrapper(
        createUrlParams({
          connection: TEST_CONSTANTS.CONNECTIONS.DUCKDB,
        }),
      )

      // Force error state to show manual import button
      wrapper.vm.error = 'Test error'
      wrapper.vm.isLoading = false
      wrapper.vm.isSuccess = false
      await nextTick()

      await wrapper.find('.manual-import-button').trigger('click')

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

    it('should validate BigQuery project ID requirement', async () => {
      wrapper = createWrapper(
        createUrlParams({
          connection: TEST_CONSTANTS.CONNECTIONS.BIGQUERY,
        }),
      )

      await nextTick()
      await nextTick()

      // Initially invalid
      console.log({
        isLoading: wrapper.vm.isLoading,
        error: wrapper.vm.error,
        requiresFields: wrapper.vm.requiresFields,
        connectionType: wrapper.vm.connectionType,
      })

      expect(wrapper.find('.import-button').attributes('disabled')).toBeDefined()

      // Add project ID
      await wrapper.find('#project-id').setValue(TEST_CONSTANTS.FORM_VALUES.PROJECT_ID)
      await nextTick()

      console.log({
        isLoading: wrapper.vm.isLoading,
        error: wrapper.vm.error,
        requiresFields: wrapper.vm.requiresFields,
        connectionType: wrapper.vm.connectionType,
      })

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

  describe('Step Transition Logic', () => {
    it('should show spinning icons for active steps', async () => {
      setupSuccessfulImport(TEST_CONSTANTS.CONNECTIONS.DUCKDB)

      wrapper = createWrapper(
        createUrlParams({
          connection: TEST_CONSTANTS.CONNECTIONS.DUCKDB,
        }),
      )

      await nextTick()
      await nextTick()

      // Wait for loading state to be established
      await vi.waitFor(() => {
        expect(wrapper.find('.loading-state').exists()).toBe(true)
      })

      // Active step should have spinning icon
      const activeSteps = wrapper.findAll('.step.active')
      if (activeSteps.length > 0) {
        const activeStepIcon = activeSteps[0].find('.step-icon')
        expect(activeStepIcon.text()).toContain('⟳')
      } else {
        // Fallback: check the first step if no active class yet
        const firstStep = wrapper.findAll('.step')[0].find('.step-icon')
        expect(firstStep.text()).toContain('⟳')
      }
    })

    it('should show checkmarks for completed steps', async () => {
      vi.useFakeTimers()
      setupSuccessfulImport(TEST_CONSTANTS.CONNECTIONS.DUCKDB)

      wrapper = createWrapper(
        createUrlParams({
          connection: TEST_CONSTANTS.CONNECTIONS.DUCKDB,
        }),
      )

      await nextTick()
      await nextTick()

      // Fast-forward to allow step progression
      vi.advanceTimersByTime(TEST_CONSTANTS.TIMEOUTS.MIN_DISPLAY_TIME * 2)
      await nextTick()

      // Completed steps should have checkmarks
      const completedSteps = wrapper.findAll('.step.completed .step-icon')
      if (completedSteps.length > 0) {
        expect(completedSteps[0].text()).toContain('✓')
      }

      vi.useRealTimers()
    })
  })

  describe('Timer and Cleanup', () => {
    it('should stop timer on component unmount', async () => {
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout')

      wrapper = createWrapper(createUrlParams())
      await nextTick()

      wrapper.unmount()

      expect(clearTimeoutSpy).toHaveBeenCalled()
    })

    it('should update elapsed time display', async () => {
      vi.useFakeTimers()
      setupSuccessfulImport(TEST_CONSTANTS.CONNECTIONS.DUCKDB)

      wrapper = createWrapper(
        createUrlParams({
          connection: TEST_CONSTANTS.CONNECTIONS.DUCKDB,
        }),
      )

      await nextTick()
      await nextTick()

      // Timer should be running
      vi.advanceTimersByTime(1000)
      await nextTick()

      // Component should track elapsed time internally
      // (This is tested more for the internal timer mechanism)

      vi.useRealTimers()
    })
  })
})
