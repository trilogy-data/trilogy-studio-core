<template>
  <div class="settings-container">
    <h2>Settings</h2> 
    <div class="setting" v-for="(value, key) in settings" :key="key">
      <label :for="key">{{ formatLabel(key) }}</label>
      <input v-if="typeof value === 'boolean'" type="checkbox" :id="key" v-model="settings[key]"
        @change="updateSetting(key, settings[key])" />
      <select v-else-if="key === 'theme'"  v-model="settings[key]"
        @input="updateSetting(key, settings[key])">
        <option value="dark">Dark</option>
        <option value="light">Light</option>
      </select>
      <input v-else-if="typeof value === 'string'" type="text" :id="key" v-model="settings[key]"
        @input="updateSetting(key, settings[key])" />
    </div>
    <div class="actions">
      <!-- <button @click="saveSettings" :disabled="isLoading || !hasChanges">Save</button> -->
      <button @click="resetToDefaults" :disabled="isLoading">Reset to Defaults</button>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, computed, onMounted, inject } from 'vue'
import type { UserSettingsStoreType } from "../stores/userSettingsStore";
import { storeToRefs } from 'pinia';

export default defineComponent({
  name: 'UserSettings',
  setup() {
    const userSettingsStore = inject<UserSettingsStoreType>('userSettingsStore');

    // Use storeToRefs to make Pinia state reactive
    const { settings, isLoading, hasChanges } = storeToRefs(userSettingsStore);

    // Load settings when component mounts
    onMounted(() => {
      userSettingsStore.loadSettings();
    });

    const updateSetting = (key: string, value: any) => {
      userSettingsStore.updateSetting(key, value);
    };

    const saveSettings = async () => {
      const success = await userSettingsStore.saveSettings();
      if (success) {
        console.log('Settings saved successfully');
      }
    };

    const resetToDefaults = () => {
      userSettingsStore.resetToDefaults();
    };

    const formatLabel = (key: string) => {
      return key.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase());
    };

    return {
      settings,
      isLoading,
      hasChanges,
      updateSetting,
      saveSettings,
      resetToDefaults,
      formatLabel,
    };
  },
});
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

button {
  padding: 8px 16px;
  cursor: pointer;
  color: var(--text-color);
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>