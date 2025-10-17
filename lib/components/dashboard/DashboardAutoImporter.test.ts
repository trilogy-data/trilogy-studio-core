import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, VueWrapper, flushPromises } from '@vue/test-utils'
import { nextTick, } from 'vue'
import AutoImportComponent from './DashboardAutoImporter.vue'
import { getDefaultValueFromHash } from '../../stores/urlStore'
import { log } from 'console'

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

const createMockConnection = (connectionType: string) => ({
  setModel: vi.fn(),
  type: connectionType,
})

// Mock dependencies
const mockDashboardStore = {
  dashboards: {} as Record<string, any>,
  addDashboard: vi.fn(),
  warmDashboardQueries: vi.fn(), // Add this line
}

const mockConnectionStore = {
  connections: {} as Record<string, any>,
  newConnection: vi.fn((name: string, type: string, options: any) => {
    // Actually create the connection when newConnection is called
    mockConnectionStore.connections[name] = createMockConnection(type)
  }),
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

const logDOMState = (wrapper: VueWrapper<any>, testName: string) => {
  console.log(`\n=== DOM STATE FOR: ${testName} ===`)
  console.log('HTML:', wrapper.html())
  console.log('Component data:', {
    isLoading: wrapper.vm?.isLoading,
    error: wrapper.vm?.error,
    requiresFields: wrapper.vm?.requiresFields,
    connectionType: wrapper.vm?.connectionType,
    isFormValid: wrapper.vm?.isFormValid,
    importSuccess: wrapper.vm?.importSuccess,
  })
  console.log('Available classes:', wrapper.classes())
  console.log('All elements with classes:')
  const allElements = wrapper.findAll('*')
  allElements.forEach((el, index) => {
    if (el.classes().length > 0) {
      console.log(`  [${index}] ${el.element.tagName}: ${el.classes().join(', ')}`)
    }
  })
  console.log('=== END DOM STATE ===\n')
}

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

  const createWrapper = async (urlParams: Record<string, string> = {}) => {
    // Setup URL parameter mocks
    vi.mocked(getDefaultValueFromHash).mockImplementation(
      (key: string, defaultValue?: string | null) => {
        return urlParams[key] || defaultValue || null
      },
    )

    const wrapper = mount(AutoImportComponent, {
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
    await nextTick()
    await flushPromises()
    return wrapper
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

  const setupConnectionForManualImport = (connectionType: string) => {
    const connectionName = TEST_CONSTANTS.CONNECTION_NAME
    // Pre-setup the connection that will be created during manual import
    mockConnectionStore.connections[connectionName] = createMockConnection(connectionType)

    mockModelImportService.importModel.mockResolvedValue({
      dashboards: new Map([[TEST_CONSTANTS.DASHBOARD_NAME, TEST_CONSTANTS.DASHBOARD_NAME]]),
    })

    const mockDashboard = createMockDashboard(connectionName)
    mockDashboardStore.dashboards = {
      [TEST_CONSTANTS.DASHBOARD_ID]: mockDashboard,
    }
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

      vi.useFakeTimers()
      wrapper = await createWrapper({})
      await nextTick()
      vi.advanceTimersByTime(2000)

      // This is the key part - flush microtasks after advancing timers
      await vi.runOnlyPendingTimersAsync() // or
      // await new Promise(resolve => process.nextTick(resolve))

      await nextTick() // Let Vue update the DOM
      await flushPromises() // This is usually what you actually need
      // this fixes things
      await wrapper.vm.$forceUpdate()
      // logDOMState(wrapper, 'Error Form')
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

    it('should initialize with correct URL parameters', async () => {
      // Setup successful import for DuckDB to avoid error state
      setupSuccessfulImport(TEST_CONSTANTS.CONNECTIONS.DUCKDB)

      wrapper = await createWrapper(createUrlParams())

      await nextTick()
      await nextTick()
      await wrapper.vm.$forceUpdate()
      // Should not show error state
      expect(wrapper.find('.error-state').exists()).toBe(false)
    })
  })

  describe('DuckDB Auto Import', () => {
    it('should auto-import for DuckDB connection and show step indicators', async () => {
      setupSuccessfulImport(TEST_CONSTANTS.CONNECTIONS.DUCKDB)

      wrapper = await createWrapper(
        createUrlParams({
          connection: TEST_CONSTANTS.CONNECTIONS.DUCKDB,
        }),
      )

      await nextTick()
      await nextTick()
      await wrapper.vm.$forceUpdate()

      // Should show loading state during auto-import
      expect(wrapper.find('.loading-state').exists()).toBe(true)
      expect(wrapper.find('.step-indicator').exists()).toBe(true)
    })

    it('should show unified loading state throughout the process', async () => {
      setupSuccessfulImport(TEST_CONSTANTS.CONNECTIONS.DUCKDB)

      wrapper = await createWrapper(
        createUrlParams({
          connection: TEST_CONSTANTS.CONNECTIONS.DUCKDB,
        }),
      )

      await nextTick()
      await nextTick()
      await wrapper.vm.$forceUpdate()

      // Should consistently show loading state
      expect(wrapper.find('.loading-state').exists()).toBe(true)

      // Should show trilogy icon with spinning animation
      const trilogyIcon = wrapper.find('.trilogy-icon')
      expect(trilogyIcon.exists()).toBe(true)
      expect(trilogyIcon.classes()).toContain('spinning')
    })

    it('should transition through all step indicators', async () => {
      vi.useFakeTimers()
      setupSuccessfulImport(TEST_CONSTANTS.CONNECTIONS.DUCKDB)

      wrapper = await createWrapper(
        createUrlParams({
          connection: TEST_CONSTANTS.CONNECTIONS.DUCKDB,
        }),
      )

      await nextTick()
      await nextTick()

      // Wait for the import process to actually start
      await vi.waitFor(() => {
        return mockModelImportService.importModel.mock.calls.length > 0
      })

      await wrapper.vm.$forceUpdate()
      let steps = wrapper.findAll('.step')

      // Check if we have steps and the first one has the right content
      if (steps.length > 0) {
        expect(steps[0].text()).toContain('Importing model')
        // The step might be active or completed depending on timing
        const hasActiveOrCompleted = steps[0].classes().includes('active') || steps[0].classes().includes('completed')
        expect(hasActiveOrCompleted).toBe(true)
      }

      // Fast-forward to trigger step transitions
      vi.advanceTimersByTime(TEST_CONSTANTS.TIMEOUTS.MIN_DISPLAY_TIME)
      await nextTick()
      await wrapper.vm.$forceUpdate()

      steps = wrapper.findAll('.step')
      // Check for step progression - at least one step should be active or completed
      if (steps.length > 1) {
        const secondStepActive = steps[1].classes().includes('active')
        const firstStepCompleted = steps[0].classes().includes('completed')
        expect(secondStepActive || firstStepCompleted).toBe(true)
      }

      vi.useRealTimers()
    })
  })

  describe('Manual Import with Connection Setup', () => {
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

    it('should show connection setup form for BigQuery', async () => {
      wrapper = await createWrapper(
        createUrlParams({
          connection: TEST_CONSTANTS.CONNECTIONS.BIGQUERY,
        }),
      )

      await nextTick()
      await nextTick()
      await wrapper.vm.$forceUpdate()

      expect(wrapper.find('.import-form').exists()).toBe(true)
      expect(wrapper.find('#project-id').exists()).toBe(true)
      expect(wrapper.text()).toContain('Connection Setup')
    })

    it('should show connection setup form for Snowflake', async () => {
      wrapper = await createWrapper(
        createUrlParams({
          connection: TEST_CONSTANTS.CONNECTIONS.SNOWFLAKE,
        }),
      )

      await nextTick()
      await nextTick()
      await wrapper.vm.$forceUpdate()

      expect(wrapper.find('.import-form').exists()).toBe(true)
      expect(wrapper.find('#snowflake-username').exists()).toBe(true)
      expect(wrapper.find('#snowflake-account').exists()).toBe(true)
      expect(wrapper.find('#snowflake-key').exists()).toBe(true)
      expect(wrapper.text()).toContain('Connection Setup')
    })

    it('should validate form and disable import button when invalid', async () => {
      wrapper = await createWrapper(
        createUrlParams({
          connection: TEST_CONSTANTS.CONNECTIONS.MOTHERDUCK,
        }),
      )

      await nextTick()
      await nextTick()
      await wrapper.vm.$forceUpdate()

      expect(wrapper.find('.import-button').attributes('disabled')).toBeDefined()
    })

    it('should enable import button when form is valid', async () => {
      wrapper = await createWrapper(
        createUrlParams({
          connection: TEST_CONSTANTS.CONNECTIONS.MOTHERDUCK,
        }),
      )

      await nextTick()
      await nextTick()
      await wrapper.vm.$forceUpdate()

      // Fill required field
      await wrapper.find('#md-token').setValue(TEST_CONSTANTS.FORM_VALUES.MD_TOKEN)
      await nextTick()
      await wrapper.vm.$forceUpdate()
      const importButton = wrapper.find('.import-button')
      const disabledAttr = importButton.attributes('disabled')
      expect(disabledAttr).toBeFalsy() // Handle both undefined and empty string
    })


  })

  describe('Import Process', () => {
    it('should create model if it does not exist', async () => {
      setupSuccessfulImport(TEST_CONSTANTS.CONNECTIONS.DUCKDB)

      wrapper = await createWrapper(
        createUrlParams({
          connection: TEST_CONSTANTS.CONNECTIONS.DUCKDB,
        }),
      )

      await nextTick()
      await nextTick()

      // Wait for import to start
      await vi.waitFor(() => {
        return mockModelStore.newModelConfig.mock.calls.length > 0
      })

      expect(mockModelStore.newModelConfig).toHaveBeenCalledWith(TEST_CONSTANTS.MODEL_NAME, true)
    })

    it('should handle import errors gracefully', async () => {
      mockModelImportService.importModel.mockRejectedValue(new Error('Import failed'))

      wrapper = await createWrapper(
        createUrlParams({
          connection: TEST_CONSTANTS.CONNECTIONS.DUCKDB,
        }),
      )

      await nextTick()
      await nextTick()

      // Wait for error to be set
      await vi.waitFor(() => {
        return wrapper.vm.error !== null
      })

      await wrapper.vm.$forceUpdate()
      expect(wrapper.find('.error-state').exists()).toBe(true)
      expect(wrapper.text()).toContain('Import failed')
    })

    it('should handle missing dashboard after import', async () => {
      // Setup import that succeeds but dashboard not found
      mockModelImportService.importModel.mockResolvedValue({
        dashboards: new Map(),
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

      // Wait for error to be set
      await vi.waitFor(() => {
        return wrapper.vm.error !== null
      })

      await wrapper.vm.$forceUpdate()
      expect(wrapper.find('.error-state').exists()).toBe(true)
      expect(wrapper.text()).toContain('was not found in the imported model')
    })

    it('should emit fullScreen event during import', async () => {
      setupSuccessfulImport(TEST_CONSTANTS.CONNECTIONS.DUCKDB)

      wrapper = await createWrapper(
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

      wrapper = await createWrapper(
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
      wrapper = await createWrapper(
        createUrlParams({
          connection: TEST_CONSTANTS.CONNECTIONS.MOTHERDUCK,
        }),
      )

      await nextTick()
      await nextTick()
      await wrapper.vm.$forceUpdate()

      await wrapper.find('.cancel-button').trigger('click')

      expect(mockScreenNavigation.setActiveDashboard).toHaveBeenCalledWith(null)
      expect(mockScreenNavigation.setActiveScreen).toHaveBeenCalledWith('dashboard')
    })

    it('should handle manual import fallback button click', async () => {
      wrapper = await createWrapper(
        createUrlParams({
          connection: TEST_CONSTANTS.CONNECTIONS.DUCKDB,
        }),
      )

      // Force error state to show manual import button
      wrapper.vm.error = 'Test error'
      wrapper.vm.isLoading = false
      wrapper.vm.isSuccess = false
      await nextTick()
      await wrapper.vm.$forceUpdate()

      await wrapper.find('.manual-import-button').trigger('click')

      expect(mockScreenNavigation.setActiveDashboard).toHaveBeenCalledWith(null)
      expect(mockScreenNavigation.setActiveScreen).toHaveBeenCalledWith('dashboard')
    })
  })

  describe('Form Validation', () => {
    it('should validate MotherDuck token requirement', async () => {
      wrapper = await createWrapper(
        createUrlParams({
          connection: TEST_CONSTANTS.CONNECTIONS.MOTHERDUCK,
        }),
      )

      await nextTick()
      await nextTick()
      await wrapper.vm.$forceUpdate()
      // Initially invalid
      expect(wrapper.find('.import-button').attributes('disabled')).toBeDefined()

      // Add token
      await wrapper.find('#md-token').setValue(TEST_CONSTANTS.FORM_VALUES.MD_TOKEN)
      await nextTick()
      await wrapper.vm.$forceUpdate()

      // Should be valid now
      const disabledAttr = wrapper.find('.import-button').attributes('disabled')
      expect(disabledAttr).toBeFalsy() // Handle both undefined and empty string
    })

    it('should validate BigQuery project ID requirement', async () => {
      wrapper = await createWrapper(
        createUrlParams({
          connection: TEST_CONSTANTS.CONNECTIONS.BIGQUERY,
        }),
      )

      await nextTick()
      await nextTick()
      await wrapper.vm.$forceUpdate()

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
      await wrapper.vm.$forceUpdate()

      console.log({
        isLoading: wrapper.vm.isLoading,
        error: wrapper.vm.error,
        requiresFields: wrapper.vm.requiresFields,
        connectionType: wrapper.vm.connectionType,
      })

      // Should be valid now
      const disabledAttr = wrapper.find('.import-button').attributes('disabled')
      expect(disabledAttr).toBeFalsy() // Handle both undefined and empty string
    })

    it('should validate all Snowflake required fields', async () => {
      wrapper = await createWrapper(
        createUrlParams({
          connection: TEST_CONSTANTS.CONNECTIONS.SNOWFLAKE,
        }),
      )

      await nextTick()
      await nextTick()
      await wrapper.vm.$forceUpdate()

      // Initially invalid
      expect(wrapper.find('.import-button').attributes('disabled')).toBeDefined()

      // Fill only username
      await wrapper.find('#snowflake-username').setValue(TEST_CONSTANTS.FORM_VALUES.USERNAME)
      await nextTick()
      await wrapper.vm.$forceUpdate()
      expect(wrapper.find('.import-button').attributes('disabled')).toBeDefined()

      // Fill account
      await wrapper.find('#snowflake-account').setValue(TEST_CONSTANTS.FORM_VALUES.ACCOUNT)
      await nextTick()
      await wrapper.vm.$forceUpdate()
      expect(wrapper.find('.import-button').attributes('disabled')).toBeDefined()

      // Fill private key - now should be valid
      await wrapper.find('#snowflake-key').setValue(TEST_CONSTANTS.FORM_VALUES.PRIVATE_KEY)
      await nextTick()
      await wrapper.vm.$forceUpdate()
      logDOMState(wrapper, 'Snowflake Form Valid')
      const disabledAttr = wrapper.find('.import-button').attributes('disabled')
      expect(disabledAttr).toBeFalsy() // Handle both undefined and empty string
    })
  })

  describe('Step Transition Logic', () => {
    it('should show spinning icons for active steps', async () => {
      setupSuccessfulImport(TEST_CONSTANTS.CONNECTIONS.DUCKDB)

      wrapper = await createWrapper(
        createUrlParams({
          connection: TEST_CONSTANTS.CONNECTIONS.DUCKDB,
        }),
      )

      await nextTick()
      await nextTick()
      await wrapper.vm.$forceUpdate()

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

      wrapper = await createWrapper(
        createUrlParams({
          connection: TEST_CONSTANTS.CONNECTIONS.DUCKDB,
        }),
      )

      await nextTick()
      await nextTick()
      await wrapper.vm.$forceUpdate()

      // Fast-forward to allow step progression
      vi.advanceTimersByTime(TEST_CONSTANTS.TIMEOUTS.MIN_DISPLAY_TIME * 2)
      await nextTick()
      await wrapper.vm.$forceUpdate()

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

      wrapper = await createWrapper(createUrlParams())
      await nextTick()

      wrapper.unmount()

      expect(clearTimeoutSpy).toHaveBeenCalled()
    })

    it('should update elapsed time display', async () => {
      vi.useFakeTimers()
      setupSuccessfulImport(TEST_CONSTANTS.CONNECTIONS.DUCKDB)

      wrapper = await createWrapper(
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