import type { ScreenType } from '../../stores/useScreenNavigation'

const FALLBACK_TAB_ICON = 'mdi mdi-file-document-outline'

/**
 * Screen -> icon for anything that renders a tab strip: the desktop TabbedBrowser
 * and the mobile tab switcher have to agree, so they read the same map.
 */
const TAB_ICONS: Record<ScreenType, string> = {
  editors: 'mdi mdi-file-document-edit-outline',
  connections: 'mdi mdi-database-outline',
  llms: 'mdi mdi-creation-outline',
  dashboard: 'mdi mdi-chart-multiple',
  'dashboard-import': 'mdi mdi-chart-multiple',
  'asset-import': 'mdi mdi-import',
  models: 'mdi mdi-set-center',
  'community-models': 'mdi mdi-library-outline',
  jobs: 'mdi mdi-playlist-play',
  tutorial: 'mdi mdi-help',
  settings: 'mdi mdi-cog-outline',
  profile: 'mdi mdi-account-outline',
  welcome: 'mdi mdi-home-outline',
  '': FALLBACK_TAB_ICON,
}

/** Only the screens whose name doesn't survive plain title-casing. */
const SCREEN_LABELS: Partial<Record<ScreenType, string>> = {
  llms: 'LLMs',
}

export function getTabIcon(screen: string): string {
  return TAB_ICONS[screen as ScreenType] || FALLBACK_TAB_ICON
}

/** Human-readable screen name: 'dashboard-import' -> 'Dashboard Import'. */
export function getScreenLabel(screen: string): string {
  return (
    SCREEN_LABELS[screen as ScreenType] ??
    screen
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  )
}
