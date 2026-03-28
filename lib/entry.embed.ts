import './icons/registerMdiIcons'
import './embedTheme.css'

export { default as TrilogyEmbedProvider } from './components/TrilogyEmbedProvider.vue'
export {
  TRILOGY_EMBED_CONFIG_KEY,
  normalizeEmbedTheme,
  provideTrilogyEmbedConfig,
  resolveThemeMode,
  resolveThemeVariables,
  useResolvedThemeMode,
  useTrilogyEmbedConfig,
} from './embed/config'
export type {
  TrilogyEmbedConfig,
  TrilogyEmbedTheme,
  TrilogyEmbedThemeObject,
  TrilogyThemeMode,
} from './embed/config'
