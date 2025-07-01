import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import { ref, nextTick } from 'vue'
import AutoImportComponent from './DashboardAutoImporter.vue' // Adjust path as needed

// Mock dependencies
const mockDashboardStore = {
  dashboards: {},
  addDashboard: vi.fn()
}

const mockConnectionStore = {
  connections: {},
  newConnection: vi.fn()
}

const mockEditorStore = {
  editors: {},
  newEditor: vi.fn(),
  setEditorContents: vi.fn()
}

const mockModelStore = {
  models: {},
  newModel: vi.fn()
}

const mockSaveDashboards = vi.fn()
const mockSaveAll = vi.fn()

const mockScreenNavigation = {
  setActiveDashboard: vi.fn(),
  setActiveScreen: vi.fn()
}

// Mock ModelImportService
const mockModelImportService = {
  importModel: vi.fn()
}

// Mock the URL store
vi.mock('../stores/urlStore', () => ({
  getDefaultValueFromHash: vi.fn()
}))

// Mock the screen navigation hook
vi.mock('../stores/useScreenNavigation', () => ({
  default: () => mockScreenNavigation
}))

// Mock the ModelImportService
vi.mock('../models/helpers', () => ({
  ModelImportService: vi.fn(() => mockModelImportService)
}))

import { getDefaultValueFromHash } from '../stores/urlStore'

describe('AutoImportComponent', () => {
  let wrapper: VueWrapper<any>
  let mockFetch: any

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks()
    
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

  const createWrapper = (urlParams = {}) => {
    // Setup URL parameter mocks
    vi.mocked(getDefaultValueFromHash).mockImplementation((key, defaultValue) => {
      return urlParams[key as keyof typeof urlParams] || defaultValue
    })

    return mount(AutoImportComponent, {
      global: {
        provide: {
          dashboardStore: mockDashboardStore,
          connectionStore: mockConnectionStore,
          editorStore: mockEditorStore,
          modelStore: mockModelStore,
          saveDashboards: mockSaveDashboards,
          saveAll: mockSaveAll
        }
      }
    })
  }

  describe('Component Initialization', () => {
    it('should throw error if required stores are not provided', () => {
      expect(() => {
        mount(AutoImportComponent, {
          global: {
            provide: {
              // Missing required stores
            }
          }
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
      wrapper = createWrapper({
        model: 'https://example.com/model.json',
        dashboard: 'TestDashboard',
        modelName: 'TestModel',
        connection: 'unsupported'
      })

      await nextTick()
      await nextTick()

      expect(wrapper.find('.error-state').exists()).toBe(true)
      expect(wrapper.text()).toContain('Unsupported connection type: unsupported')
    })

    it('should initialize with correct URL parameters', async () => {
      const urlParams = {
        model: 'https://example.com/model.json',
        dashboard: 'TestDashboard',
        modelName: 'TestModel',
        connection: 'duckdb'
      }

      wrapper = createWrapper(urlParams)

      await nextTick()
      await nextTick()

      // Should not show error state
      expect(wrapper.find('.error-state').exists()).toBe(false)
    })
  })

  describe('DuckDB Auto Import', () => {
    it('should auto-import for DuckDB connection', async () => {
      mockModelImportService.importModel.mockResolvedValue(undefined)
      
      // Mock a dashboard being available after import
      const mockDashboard = {
        id: 'dashboard-123',
        name: 'TestDashboard',
        connection: 'duckdb'
      }
      mockDashboardStore.dashboards = {
        'dashboard-123': mockDashboard
      }

      wrapper = createWrapper({
        model: 'https://example.com/model.json',
        dashboard: 'TestDashboard',
        modelName: 'TestModel',
        connection: 'duckdb'
      })

      await nextTick()
      await nextTick()

      // Wait for auto-import to complete
      await vi.waitFor(() => {
        expect(mockModelImportService.importModel).toHaveBeenCalledWith(
          'TestModel',
          'https://example.com/model.json',
          'duckdb'
        )
      })

      expect(mockSaveAll).toHaveBeenCalled()
    })

    it('should show success state after successful import', async () => {
      mockModelImportService.importModel.mockResolvedValue(undefined)
      
      const mockDashboard = {
        id: 'dashboard-123',
        name: 'TestDashboard',
        connection: 'duckdb'
      }
      
      wrapper = createWrapper({
        model: 'https://example.com/model.json',
        dashboard: 'TestDashboard',
        modelName: 'TestModel',
        connection: 'duckdb'
      })

      // Simulate dashboard being available after import
      mockDashboardStore.dashboards = {
        'dashboard-123': mockDashboard
      }

      await nextTick()
      await nextTick()

      await vi.waitFor(() => {
        expect(wrapper.find('.success-state').exists()).toBe(true)
      })

      expect(wrapper.text()).toContain('Import Successful!')
      expect(wrapper.text()).toContain('TestModel')
      expect(wrapper.text()).toContain('TestDashboard')
    })
  })

  describe('Manual Import with Connection Setup', () => {
    it('should show connection setup form for MotherDuck', async () => {
      wrapper = createWrapper({
        model: 'https://example.com/model.json',
        dashboard: 'TestDashboard',
        modelName: 'TestModel',
        connection: 'motherduck'
      })

      await nextTick()
      await nextTick()

      expect(wrapper.find('.import-form').exists()).toBe(true)
      expect(wrapper.find('#md-token').exists()).toBe(true)
      expect(wrapper.text()).toContain('MotherDuck Connection Setup')
    })

    it('should show connection setup form for BigQuery', async () => {
      wrapper = createWrapper({
        model: 'https://example.com/model.json',
        dashboard: 'TestDashboard',
        modelName: 'TestModel',
        connection: 'bigquery'
      })

      await nextTick()
      await nextTick()

      expect(wrapper.find('.import-form').exists()).toBe(true)
      expect(wrapper.find('#project-id').exists()).toBe(true)
      expect(wrapper.text()).toContain('BigQuery Connection Setup')
    })

    it('should show connection setup form for Snowflake', async () => {
      wrapper = createWrapper({
        model: 'https://example.com/model.json',
        dashboard: 'TestDashboard',
        modelName: 'TestModel',
        connection: 'snowflake'
      })

      await nextTick()
      await nextTick()

      expect(wrapper.find('.import-form').exists()).toBe(true)
      expect(wrapper.find('#snowflake-username').exists()).toBe(true)
      expect(wrapper.find('#snowflake-account').exists()).toBe(true)
      expect(wrapper.find('#snowflake-key').exists()).toBe(true)
      expect(wrapper.text()).toContain('Snowflake Connection Setup')
    })

    it('should validate form and disable import button when invalid', async () => {
      wrapper = createWrapper({
        model: 'https://example.com/model.json',
        dashboard: 'TestDashboard',
        modelName: 'TestModel',
        connection: 'motherduck'
      })

      await nextTick()
      await nextTick()

      const importButton = wrapper.find('.import-button')
      expect(importButton.attributes('disabled')).toBeDefined()
    })

    it('should enable import button when form is valid', async () => {
      wrapper = createWrapper({
        model: 'https://example.com/model.json',
        dashboard: 'TestDashboard',
        modelName: 'TestModel',
        connection: 'motherduck'
      })

      await nextTick()
      await nextTick()

      // Fill in required field
      const tokenInput = wrapper.find('#md-token')
      await tokenInput.setValue('test-token')

      await nextTick()

      const importButton = wrapper.find('.import-button')
      expect(importButton.attributes('disabled')).toBeUndefined()
    })
  })

  describe('Import Process', () => {
    it('should create connection for non-DuckDB types', async () => {
      mockModelImportService.importModel.mockResolvedValue(undefined)
      
      const mockDashboard = {
        id: 'dashboard-123',
        name: 'TestDashboard',
        connection: 'TestModel-connection'
      }
      mockDashboardStore.dashboards = {
        'dashboard-123': mockDashboard
      }

      wrapper = createWrapper({
        model: 'https://example.com/model.json',
        dashboard: 'TestDashboard',
        modelName: 'TestModel',
        connection: 'motherduck'
      })

      await nextTick()
      await nextTick()

      // Fill form and submit
      await wrapper.find('#md-token').setValue('test-token')
      await wrapper.find('.import-button').trigger('click')

      await vi.waitFor(() => {
        expect(mockConnectionStore.newConnection).toHaveBeenCalledWith(
          'TestModel-connection',
          'motherduck',
          expect.objectContaining({
            mdToken: 'test-token'
          })
        )
      })
    })

    it('should create model if it does not exist', async () => {
      mockModelImportService.importModel.mockResolvedValue(undefined)
      
      const mockDashboard = {
        id: 'dashboard-123',
        name: 'TestDashboard',
        connection: 'duckdb'
      }
      mockDashboardStore.dashboards = {
        'dashboard-123': mockDashboard
      }

      wrapper = createWrapper({
        model: 'https://example.com/model.json',
        dashboard: 'TestDashboard',
        modelName: 'TestModel',
        connection: 'duckdb'
      })

      await nextTick()
      await nextTick()

      await vi.waitFor(() => {
        expect(mockModelStore.newModel).toHaveBeenCalledWith('TestModel', 'duckdb')
      })
    })

    it('should handle import errors gracefully', async () => {
      mockModelImportService.importModel.mockRejectedValue(new Error('Import failed'))

      wrapper = createWrapper({
        model: 'https://example.com/model.json',
        dashboard: 'TestDashboard',
        modelName: 'TestModel',
        connection: 'duckdb'
      })

      await nextTick()
      await nextTick()

      await vi.waitFor(() => {
        expect(wrapper.find('.error-state').exists()).toBe(true)
      })

      expect(wrapper.text()).toContain('Import failed')
    })

    it('should handle missing dashboard after import', async () => {
      mockModelImportService.importModel.mockResolvedValue(undefined)
      mockDashboardStore.dashboards = {} // No dashboards

      wrapper = createWrapper({
        model: 'https://example.com/model.json',
        dashboard: 'TestDashboard',
        modelName: 'TestModel',
        connection: 'duckdb'
      })

      await nextTick()
      await nextTick()

      await vi.waitFor(() => {
        expect(wrapper.find('.error-state').exists()).toBe(true)
      })

      expect(wrapper.text()).toContain('Dashboard "TestDashboard" was not found in the imported model')
    })
  })

  describe('Navigation and Events', () => {
    it('should emit importComplete event with dashboard ID', async () => {
      mockModelImportService.importModel.mockResolvedValue(undefined)
      
      const mockDashboard = {
        id: 'dashboard-123',
        name: 'TestDashboard',
        connection: 'duckdb'
      }
      mockDashboardStore.dashboards = {
        'dashboard-123': mockDashboard
      }

      wrapper = createWrapper({
        model: 'https://example.com/model.json',
        dashboard: 'TestDashboard',
        modelName: 'TestModel',
        connection: 'duckdb'
      })

      await nextTick()
      await nextTick()

      await vi.waitFor(() => {
        expect(wrapper.emitted('importComplete')).toBeTruthy()
      })

      const emittedEvents = wrapper.emitted('importComplete')
      expect(emittedEvents![0]).toEqual(['dashboard-123'])
    })

    it('should navigate to dashboard after successful import', async () => {
      vi.useFakeTimers()
      
      mockModelImportService.importModel.mockResolvedValue(undefined)
      
      const mockDashboard = {
        id: 'dashboard-123',
        name: 'TestDashboard',
        connection: 'duckdb'
      }
      mockDashboardStore.dashboards = {
        'dashboard-123': mockDashboard
      }

      wrapper = createWrapper({
        model: 'https://example.com/model.json',
        dashboard: 'TestDashboard',
        modelName: 'TestModel',
        connection: 'duckdb'
      })

      await nextTick()
      await nextTick()

      // Wait for import to complete
      await vi.waitFor(() => {
        expect(wrapper.find('.success-state').exists()).toBe(true)
      })

      // Fast-forward the timeout
      vi.advanceTimersByTime(500)

      expect(mockScreenNavigation.setActiveDashboard).toHaveBeenCalledWith('dashboard-123')
      expect(mockScreenNavigation.setActiveScreen).toHaveBeenCalledWith('dashboard')

      vi.useRealTimers()
    })

    it('should handle cancel button click', async () => {
      wrapper = createWrapper({
        model: 'https://example.com/model.json',
        dashboard: 'TestDashboard',
        modelName: 'TestModel',
        connection: 'motherduck'
      })

      await nextTick()
      await nextTick()

      await wrapper.find('.cancel-button').trigger('click')

      expect(mockScreenNavigation.setActiveScreen).toHaveBeenCalledWith('dashboard')
    })
  })

  describe('Form Validation', () => {
    it('should validate MotherDuck token requirement', async () => {
      wrapper = createWrapper({
        model: 'https://example.com/model.json',
        dashboard: 'TestDashboard',
        modelName: 'TestModel',
        connection: 'motherduck'
      })

      await nextTick()
      await nextTick()

      // Initially invalid
      expect(wrapper.find('.import-button').attributes('disabled')).toBeDefined()

      // Add token
      await wrapper.find('#md-token').setValue('test-token')
      await nextTick()

      // Should be valid now
      expect(wrapper.find('.import-button').attributes('disabled')).toBeUndefined()
    })

    it('should validate all Snowflake required fields', async () => {
      wrapper = createWrapper({
        model: 'https://example.com/model.json',
        dashboard: 'TestDashboard',
        modelName: 'TestModel',
        connection: 'snowflake'
      })

      await nextTick()
      await nextTick()

      // Initially invalid
      expect(wrapper.find('.import-button').attributes('disabled')).toBeDefined()

      // Fill only username
      await wrapper.find('#snowflake-username').setValue('user')
      await nextTick()
      expect(wrapper.find('.import-button').attributes('disabled')).toBeDefined()

      // Fill account
      await wrapper.find('#snowflake-account').setValue('account')
      await nextTick()
      expect(wrapper.find('.import-button').attributes('disabled')).toBeDefined()

      // Fill private key - now should be valid
      await wrapper.find('#snowflake-key').setValue('key')
      await nextTick()
      expect(wrapper.find('.import-button').attributes('disabled')).toBeUndefined()
    })
  })
})