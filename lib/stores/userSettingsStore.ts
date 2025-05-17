import { defineStore } from 'pinia'
import { useAnalyticsStore } from './analyticsStore'

export interface UserSettings {
  theme: string
  trilogyResolver: string
  telemetryEnabled: boolean | null
  [key: string]: string | boolean | number | null | undefined
}

export const useUserSettingsStore = defineStore('userSettings', {
  state: () => ({
    settings: {
      theme: '',
      trilogyResolver: '',
      telemetryEnabled: null,
    } as UserSettings,
    defaults: {
      theme: 'dark',
      trilogyResolver: 'https://trilogy-service.fly.dev',
      telemetryEnabled: true,
    } as UserSettings,
    isLoading: false,
    hasChanges: false,
    hasLoaded: false
  }),

  getters: {
    getSettings: (state) => state.settings,
    getDefaults: (state) => state.defaults,
    hasUnsavedChanges: (state) => state.hasChanges,
  },

  actions: {
    /**
     * Update a single setting value
     */
    updateSetting<K extends keyof UserSettings>(key: K, value: UserSettings[K]) {
      this.settings[key] = value
      if (key === 'theme') {
        this.toggleTheme()
      }
      else if (key === 'telemetryEnabled') {
        const analyticsStore = useAnalyticsStore()
        analyticsStore.setEnabled(value === true)
      }
      this.hasChanges = true
    },

    toggleTheme() {
      document.documentElement.classList.remove('dark-theme', 'light-theme')

      // Toggle to opposite theme
      if (this.settings['theme'] === 'light') {
        document.documentElement.classList.add('light-theme')
        // localStorage.setItem('theme', 'light');
      } else {
        document.documentElement.classList.add('dark-theme')
        // localStorage.setItem('theme', 'dark');
      }
    },

    setHasChanges(value: boolean) {
      this.hasChanges = value
    },

    updateSettings(newSettings: Partial<UserSettings>) {
      this.settings = { ...this.settings, ...newSettings }
      this.hasChanges = true
    },

    resetToDefaults() {
      this.settings = { ...this.defaults }
      this.hasChanges = true
    },

    async saveSettings() {
      this.isLoading = true

      try {
        // Here you would typically save to an API or localStorage
        localStorage.setItem('userSettings', JSON.stringify(this.settings))
        this.hasChanges = false
        return true
      } catch (error) {
        console.error('Failed to save settings:', error)
        return false
      } finally {
        this.isLoading = false
      }
    },

    /**
     * Load settings from storage
     */
    loadSettings() {
      this.isLoading = true


      try {
        const savedSettings = localStorage.getItem('userSettings')
        if (savedSettings) {
          this.settings = JSON.parse(savedSettings)
          // set telemetry
          const analyticsStore = useAnalyticsStore()
          if (this.settings.telemetryEnabled === false) {
            analyticsStore.setEnabled(this.settings.telemetryEnabled)
          }
        }
      } catch (error) {
        console.error('Failed to load settings:', error)
      } finally {
        this.isLoading = false
        this.hasLoaded = true
      }
    },
  },
})

export type UserSettingsStoreType = ReturnType<typeof useUserSettingsStore>

export default useUserSettingsStore
