<template>
  <div class="settings-container">
    <h2>Settings</h2>
    <div class="setting" v-for="[key, value] in Object.entries(settings)" :key="key">
      <label :for="key">{{ formatLabel(key) }}</label>
      <input v-if="typeof value === 'boolean'" type="checkbox" :id="key" v-model="settings[key]" />
      <select
        v-else-if="key === 'theme'"
        v-model="settings[key]"
        @input="
          () => {
            toggleTheme()
          }
        "
      >
        <option value="dark">Dark</option>
        <option value="light">Light</option>
      </select>
      <input v-else-if="typeof value === 'string'" type="text" :id="key" v-model="settings[key]" />
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
</template>
<script lang="ts">
import { defineComponent, onMounted, inject, nextTick } from 'vue'
import type { UserSettingsStoreType } from '../stores/userSettingsStore'
import { storeToRefs } from 'pinia'
export default defineComponent({
  name: 'UserSettings',
  setup() {
    const userSettingsStore = inject<UserSettingsStoreType>('userSettingsStore')
    if (!userSettingsStore) {
      throw new Error('User Settings Store is required')
    }
    const { settings, isLoading, hasChanges } = storeToRefs(userSettingsStore)
    // Load settings when component mounts
    onMounted(() => {
      userSettingsStore.loadSettings()
    })
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
    return {
      settings,
      isLoading,
      hasChanges,
      saveSettings,
      resetToDefaults,
      formatLabel,
      toggleTheme,
    }
  },
})
</script>
<style scoped>
.settings-container {
  padding: 20px;
  border: var(--border);
  background: var(--query-window-bg);
  height: 100%;
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
