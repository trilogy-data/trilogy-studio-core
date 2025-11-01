import { defineStore } from 'pinia'
import { useAnalyticsStore } from './analyticsStore'
import { type ModalItem } from '../data/tips'

export interface UserSettings {
  theme: 'dark' | 'light' | ''
  trilogyResolver: string
  telemetryEnabled: boolean | null
  tipsRead: string[]
  skipAllTips: boolean
  [key: string]: string | boolean | number | null | undefined | string[]
}

const storageKey = 'userSettings'

export const useUserSettingsStore = defineStore('userSettings', {
  state: () => ({
    settings: {
      theme: '',
      trilogyResolver: '',
      telemetryEnabled: null,
      tipsRead: [] as string[],
      skipAllTips:false
    } as UserSettings,
    defaults: {
      theme: 'dark',
      trilogyResolver: 'https://trilogy-service.fly.dev',
      telemetryEnabled: true,
    } as UserSettings,
    isLoading: false,
    hasChanges: false,
    hasLoaded: false,
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
      } else if (key === 'telemetryEnabled') {
        const analyticsStore = useAnalyticsStore()
        analyticsStore.setEnabled(value === true)
      }
      this.hasChanges = true
    },

    getUnreadTips(tips: ModalItem[]) {
      if (this.settings.skipAllTips) {
        return []
      }
      if (!this.settings.tipsRead) {
        this.settings.tipsRead = []
      }
      return tips.filter((tip) => !this.settings.tipsRead.includes(tip.id))
    },
    clearDismissedTips() {
      this.settings.tipsRead = []
      this.hasChanges = true
      this.saveSettings()
    },
    markTipRead(tipId: string) {
      if (!this.settings.tipsRead.includes(tipId)) {
        this.settings.tipsRead.push(tipId)
        this.hasChanges = true
        this.saveSettings()
      }
    },
    clearReadTips() {
      this.settings.tipsRead = []
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
      const currentTheme = this.settings.theme
      this.settings = { ...this.defaults }
      this.settings.theme = currentTheme // Keep the current theme
      this.hasChanges = true
    },

    async saveSettings() {
      this.isLoading = true

      try {
        localStorage.setItem(storageKey, JSON.stringify(this.settings))
        console.log('Settings saved:', this.settings)
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
        const savedSettings = localStorage.getItem(storageKey)
        if (savedSettings) {
          this.settings = JSON.parse(savedSettings)
          // set telemetry
          const analyticsStore = useAnalyticsStore()
          if (this.settings.telemetryEnabled === false) {
            analyticsStore.setEnabled(this.settings.telemetryEnabled)
          }
          if (!this.settings.tipsRead) {
            this.settings.tipsRead = []
          }
          console.log(this.settings.tipsRead)
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
