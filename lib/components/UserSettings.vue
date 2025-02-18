<template>
  <div class="settings-container">
    <h2>User Settings (placeholder)</h2>

    <div class="setting" v-for="(value, key) in settings" :key="key">
      <label :for="key">{{ formatLabel(key) }}</label>
      <input v-if="typeof value === 'boolean'" type="checkbox" :id="key" v-model="settings[key]" />
      <input v-else-if="typeof value === 'string'" type="text" :id="key" v-model="settings[key]" />
    </div>

    <button @click="saveSettings">Save</button>
  </div>
</template>

<script lang="ts">
import { defineComponent, reactive } from 'vue'
// Assume we'll use Pinia for state management later
// import { useUserSettingsStore } from "@/stores/userSettings";

export default defineComponent({
  name: 'UserSettings',
  setup() {
    // Placeholder mock settings (assume these will come from Pinia)
    const settings = reactive({
      theme: 'dark',
      notifications: true,
      language: 'English',
    })

    const saveSettings = () => {
      console.log('Settings saved:', settings)
      // In the future, this would update the Pinia store
      // userSettingsStore.updateSettings(settings);
    }

    const formatLabel = (key: string) => {
      return key.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase())
    }

    return {
      settings,
      saveSettings,
      formatLabel,
    }
  },
})
</script>

<style scoped>
.settings-container {
  padding: 20px;
  border: var(--border);
  border-radius: 8px;
  background: var(--main-bg-color);
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
</style>
