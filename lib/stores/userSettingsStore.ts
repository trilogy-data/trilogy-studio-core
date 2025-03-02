import { defineStore } from 'pinia'

export interface UserSettings {
  theme: string
  trilogyResolver: string
  [key: string]: string | boolean | number | undefined
}

export const useUserSettingsStore = defineStore('userSettings', {
  state: () => ({
    settings: {
      theme: 'dark',
      trilogyResolver: 'https://trilogy-service.fly.dev',
    } as UserSettings,
    defaults: {
      theme: 'dark',
      trilogyResolver: 'https://trilogy-service.fly.dev',
    } as UserSettings,
    isLoading: false,
    hasChanges: false,
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
      this.hasChanges = true
    },

    toggleTheme() {
      // Remove any existing theme classes
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

    /**
     * Update multiple settings at once
     */
    updateSettings(newSettings: Partial<UserSettings>) {
      this.settings = { ...this.settings, ...newSettings }
      this.hasChanges = true
    },

    /**
     * Reset settings to defaults
     */
    resetToDefaults() {
      this.settings = { ...this.defaults }
      this.hasChanges = true
    },

    /**
     * Save settings (e.g. to localStorage or API)
     */
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
        }
      } catch (error) {
        console.error('Failed to load settings:', error)
      } finally {
        this.isLoading = false
      }
    },
  },
})

export type UserSettingsStoreType = ReturnType<typeof useUserSettingsStore>

export default useUserSettingsStore
