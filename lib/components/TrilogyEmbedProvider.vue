<script setup lang="ts">
import { computed } from 'vue'
import {
  provideTrilogyEmbedConfig,
  resolveThemeMode,
  resolveThemeVariables,
  type TrilogyEmbedTheme,
} from '../embed/config'

const props = defineProps<{
  theme?: TrilogyEmbedTheme
}>()

const config = computed(() => ({
  theme: props.theme,
}))

provideTrilogyEmbedConfig(config)

const themeMode = computed(() => resolveThemeMode(props.theme))
const themeVariables = computed(() => resolveThemeVariables(props.theme))
</script>

<template>
  <div
    class="trilogy-embed-provider"
    :class="`trilogy-embed-theme-${themeMode}`"
    :style="themeVariables"
  >
    <slot />
  </div>
</template>

<style scoped>
.trilogy-embed-provider {
  width: 100%;
  height: 100%;
}
</style>
