import { defineStore } from 'pinia'
import { useAnalyticsStore } from './analyticsStore'

export interface UserSettings {
  theme: 'dark' | 'light' | ''
  trilogyResolver: string
  telemetryEnabled: boolean | null
  tipsRead: string[]
  [key: string]: string | boolean | number | null | undefined | string[]

}

const storageKey = 'userSettings'

const tips = [
  {
    id: 'welcome',
    title: 'Welcome!',
    content: 'Welcome to Trilogy, a data IDE! Let\'s get you started with the basics. If you know what you\'re doing, feel free to dismiss these tips.',
    category: 'onboarding'
  },
  {
    id: 'navigation',
    title: 'Navigation',
    content: 'Access different sections through the sidebar on the left. The right side contains a tabbed browser with your primary workspaces. Opening new items will open new tabs.',
    category: 'onboarding'
  },
    {
    id: 'settings',
    title: 'Settings',
    content: 'User settings - such as darkmode - can be accessed through the gear on the bottom of the sidebar.',
    category: 'onboarding'
  },
      {
    id: 'trilogy',
    title: 'Trilogy',
    content: 'Though you can run raw SQL, most rich functionality expects you to write Trilogy, a modified SQL syntax that streamlines analytics. The tutorial in the help section is the best way to get up to speed with it!',
    category: 'onboarding'
  }
]

const editorTips = [
  {
    id: 'editor-intro',
    title: 'Settings',
    content: 'Editors let you run SQL or Trilogy commands. Standard keyboard shortcuts are available',
    category: 'editor'
  },
  {
    id: 'editor-sources',
    title: 'Sources',
    content: 'An editor can be marked as a source via the button in the top right. Sources are special editors that can be imported by other editors using import syntax `import <editor_name> as <alias>. Use this to create reusable abstractions and models.',
    category: 'editor'
  },
]

const dashboardTips = [
  {
    id: 'dashboard-intro',
    title: 'Dashboard',
    content: 'Dashboards are collections of Trilogy queries off a common source file. They natively support cross-filtering, drilldown, global filtering, and othe rinteractivity.',
    category: 'dashboard'
  },
  {
    id: 'dashboard-features',
    title: 'Complex Types',
    content: 'A basic dashboard is just charts and tables, but you can use Markdown blocks and filters to make more rich, interactive experiences. Markdown blocks can have source trilogy queries and have a special syntax for embedding results in line.',
    category: 'announcement'
  }
]

const communityTips = [
  {
    id: 'model-intro',
    title: 'Settings',
    content: 'Packages of data and metadata can be shared as community models. You can use this page to browse and import models. Models are open-source and community contributed.',
    category: 'editor'
  },
  {
    id: 'feature-update',
    title: 'New Feature Available!',
    content: 'The dashboard share links are a special URL that lets you share dashboards with others. It will automatically import the relevant model to support the dashboard.',
    category: 'announcement'
  },
]
export const useUserSettingsStore = defineStore('userSettings', {
  state: () => ({
    settings: {
      theme: '',
      trilogyResolver: '',
      telemetryEnabled: null,
      tipsRead: [] as string[],
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

    getUnreadTips() {
      return tips.filter(tip => !this.settings.tipsRead.includes(tip.id))
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
