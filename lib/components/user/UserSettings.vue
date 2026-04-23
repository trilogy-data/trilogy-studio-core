<template>
  <div class="settings-container">
    <div class="tabs">
      <button
        :class="['tab-button', { 'tab-active': activeTab === 'general' }]"
        @click="activeTab = 'general'"
        data-testid="settings-tab-general"
      >
        General
      </button>
      <button
        :class="['tab-button', { 'tab-active': activeTab === 'storage' }]"
        @click="activeTab = 'storage'"
        data-testid="settings-tab-storage"
      >
        Storage
      </button>
    </div>

    <div v-show="activeTab === 'general'" class="tab-panel">
      <h2>Settings</h2>
      <div class="setting" v-for="[key, value] in Object.entries(settings)" :key="key">
        <label :for="key">{{ formatLabel(key) }}</label>
        <input
          v-if="typeof value === 'boolean'"
          type="checkbox"
          :id="key"
          v-model="settings[key]"
          @change="() => userSettingsStore.updateSetting(key, settings[key])"
        />
        <select v-else-if="key === 'theme'" v-model="settings[key]" @change="onThemeChange">
          <option value="dark">Dark</option>
          <option value="light">Light</option>
        </select>
        <div v-else-if="key === 'tipsRead'">
          <button class="button" @click="clearDismissedTips" :disabled="isLoading">
            Reshow Dismissed Popups ({{ settings.tipsRead.length }})
          </button>
        </div>
        <input
          v-else-if="typeof value === 'string'"
          type="text"
          :id="key"
          v-model="settings[key]"
          :data-testid="`settings-${key}`"
          @input="onSettingChange"
        />
      </div>
      <div class="actions">
        <button class="button" @click="saveSettings" :disabled="isLoading || !hasChanges">
          Save
        </button>
        <button class="button" @click="resetToDefaults" :disabled="isLoading">
          Reset to Defaults
        </button>
      </div>
    </div>

    <div v-show="activeTab === 'storage'" class="tab-panel">
      <StorageManager />
    </div>
  </div>
</template>
<script lang="ts">
import { defineComponent, onMounted, inject, nextTick, ref } from 'vue'
import type { UserSettingsStoreType } from '../../stores/userSettingsStore'
import { storeToRefs } from 'pinia'
import StorageManager from './StorageManager.vue'
export default defineComponent({
  name: 'UserSettings',
  components: { StorageManager },
  setup() {
    const userSettingsStore = inject<UserSettingsStoreType>('userSettingsStore')
    if (!userSettingsStore) {
      throw new Error('User Settings Store is required')
    }
    const { settings, isLoading, hasChanges } = storeToRefs(userSettingsStore)
    const activeTab = ref<'general' | 'storage'>('general')

    // Load settings when component mounts
    onMounted(() => {
      if (!userSettingsStore.hasLoaded) {
        userSettingsStore.loadSettings()
      }
    })

    const onSettingChange = () => {
      userSettingsStore.setHasChanges(true)
    }

    const onThemeChange = () => {
      userSettingsStore.setHasChanges(true)
      nextTick(() => {
        userSettingsStore.toggleTheme()
      })
    }

    const toggleTheme = () => {
      nextTick(() => {
        userSettingsStore.toggleTheme()
      })
    }

    const saveSettings = async () => {
      const success = await userSettingsStore.saveSettings()
      if (success) {
        console.log('Settings saved successfully')
      }
    }

    const resetToDefaults = () => {
      userSettingsStore.resetToDefaults()
    }

    const formatLabel = (key: string) => {
      return key.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase())
    }

    const clearDismissedTips = async () => {
      await userSettingsStore.clearDismissedTips()
    }

    return {
      settings,
      isLoading,
      hasChanges,
      activeTab,
      clearDismissedTips,
      saveSettings,
      resetToDefaults,
      formatLabel,
      toggleTheme,
      onSettingChange,
      onThemeChange,
      userSettingsStore,
    }
  },
})
</script>
<style scoped>
.settings-container {
  border: var(--border);
  background: var(--query-window-bg);
  height: 100%;
  display: flex;
  flex-direction: column;
}

.tabs {
  display: flex;
  border-bottom: 1px solid var(--border-color);
  padding: 0 20px;
  flex-shrink: 0;
  gap: 2px;
}

.tab-button {
  display: flex;
  align-items: center;
  padding: 10px 12px;
  background-color: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  border-radius: 0;
  cursor: pointer;
  user-select: none;
  color: var(--text-faint);
  font-size: var(--font-size);
  opacity: 0.54;
  transition:
    background-color 0.16s ease,
    border-color 0.16s ease,
    color 0.16s ease,
    opacity 0.16s ease;
}

.tab-button:hover {
  background-color: rgba(var(--special-text-rgb, 37, 99, 235), 0.05);
}

.tab-button.tab-active {
  border-bottom-color: var(--special-text);
  color: var(--text-color);
  opacity: 1;
}

.tab-panel {
  flex: 1;
  overflow: auto;
  padding: 20px;
}

.tab-panel > h2:first-child {
  margin-top: 0;
}

.setting {
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  gap: 10px;
}

label {
  flex: 1;
}

.telemetry-setting {
  margin-top: 20px;
  padding-top: 15px;
  border-top: 1px solid var(--border-color);
}

.actions {
  display: flex;
  gap: 10px;
  margin-top: 20px;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
