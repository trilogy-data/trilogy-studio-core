export const DEFAULT_TEMPERATURE = 0.5
export const DEFAULT_MAX_TOKENS = 10_000

// Provider list for UI components — import these instead of maintaining your own copy
export const PROVIDERS = [
  { value: 'demo', label: 'Demo (limited messages)' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'google', label: 'Google' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'openrouter', label: 'OpenRouter' },
] as const

export type ProviderValue = (typeof PROVIDERS)[number]['value']

export const PROVIDER_LABELS: Record<string, string> = Object.fromEntries(
  PROVIDERS.map((p) => [p.value, p.label]),
)

export const KEY_PLACEHOLDERS: Record<string, string> = {
  anthropic: 'sk-ant-...',
  openai: 'sk-...',
  google: 'AIza...',
  openrouter: 'sk-or-...',
}
