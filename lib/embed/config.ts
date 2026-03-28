import {
  computed,
  inject,
  provide,
  type ComputedRef,
  type InjectionKey,
  type MaybeRefOrGetter,
  toValue,
} from 'vue'
import type { UserSettingsStoreType } from '../stores/userSettingsStore'

export type TrilogyThemeMode = 'light' | 'dark'

export interface TrilogyEmbedThemeObject {
  mode?: TrilogyThemeMode
  variables?: Record<string, string | number>
}

export type TrilogyEmbedTheme = TrilogyThemeMode | TrilogyEmbedThemeObject

export interface TrilogyEmbedConfig {
  theme?: TrilogyEmbedTheme
}

export const TRILOGY_EMBED_CONFIG_KEY: InjectionKey<ComputedRef<TrilogyEmbedConfig | null>> =
  Symbol('trilogy-embed-config')

export function normalizeEmbedTheme(
  theme?: TrilogyEmbedTheme | null,
): TrilogyEmbedThemeObject | null {
  if (!theme) {
    return null
  }
  if (typeof theme === 'string') {
    return { mode: theme }
  }
  return theme
}

export function resolveThemeMode(
  embedTheme?: TrilogyEmbedTheme | null,
  settingsTheme?: string | null,
): TrilogyThemeMode {
  const normalizedTheme = normalizeEmbedTheme(embedTheme)
  const explicitMode = normalizedTheme?.mode
  if (explicitMode === 'light' || explicitMode === 'dark') {
    return explicitMode
  }
  if (settingsTheme === 'light' || settingsTheme === 'dark') {
    return settingsTheme
  }
  return 'dark'
}

export function resolveThemeVariables(
  embedTheme?: TrilogyEmbedTheme | null,
): Record<string, string> {
  const normalizedTheme = normalizeEmbedTheme(embedTheme)
  const variables = normalizedTheme?.variables || {}
  return Object.fromEntries(Object.entries(variables).map(([key, value]) => [key, String(value)]))
}

export function provideTrilogyEmbedConfig(config: MaybeRefOrGetter<TrilogyEmbedConfig | null>) {
  const resolved = computed(() => toValue(config))
  provide(TRILOGY_EMBED_CONFIG_KEY, resolved)
  return resolved
}

export function useTrilogyEmbedConfig(): ComputedRef<TrilogyEmbedConfig | null> {
  return inject(
    TRILOGY_EMBED_CONFIG_KEY,
    computed(() => null),
  )
}

export function useResolvedThemeMode(
  settingsStore?: UserSettingsStoreType | null,
): ComputedRef<TrilogyThemeMode> {
  const embedConfig = useTrilogyEmbedConfig()
  return computed(() =>
    resolveThemeMode(embedConfig.value?.theme, settingsStore?.settings.theme || null),
  )
}
