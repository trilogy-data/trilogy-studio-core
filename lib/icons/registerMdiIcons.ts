import {
  mdiAccountOutline,
  mdiAlertCircle,
  mdiAlertCircleOutline,
  mdiAlphaCCircle,
  mdiArrowExpand,
  mdiAutoFix,
  mdiBookOpenVariant,
  mdiCalendarClockOutline,
  mdiChartAreaspline,
  mdiChartBar,
  mdiChartBox,
  mdiChartBubble,
  mdiChartDonut,
  mdiChartLine,
  mdiChartMultiple,
  mdiChartScatterPlot,
  mdiChartTimeline,
  mdiChartTimelineVariant,
  mdiChat,
  mdiChatOutline,
  mdiChatPlusOutline,
  mdiCheck,
  mdiCheckCircle,
  mdiCheckCircleOutline,
  mdiChevronDoubleDown,
  mdiChevronDoubleUp,
  mdiChevronDown,
  mdiChevronLeft,
  mdiChevronRight,
  mdiChevronUp,
  mdiClose,
  mdiCloseBoxMultipleOutline,
  mdiCloseCircleOutline,
  mdiCodeBraces,
  mdiCodeTags,
  mdiCogOutline,
  mdiCogRefreshOutline,
  mdiCompare,
  mdiContentCopy,
  mdiContentSave,
  mdiContentSaveOutline,
  mdiCreation,
  mdiCreationOutline,
  mdiCubeOutline,
  mdiDatabase,
  mdiDatabaseEditOutline,
  mdiDatabaseOutline,
  mdiDatabasePlusOutline,
  mdiDeleteOutline,
  mdiDotsHorizontal,
  mdiDownloadOutline,
  mdiDuck,
  mdiExportVariant,
  mdiEye,
  mdiEyeOff,
  mdiEyeOutline,
  mdiFile,
  mdiFileDocument,
  mdiFileDocumentEditOutline,
  mdiFileDocumentOutline,
  mdiFileDocumentPlusOutline,
  mdiFileOutline,
  mdiFilterOutline,
  mdiFilterRemoveOutline,
  mdiFilterVariant,
  mdiFlash,
  mdiFolderOutline,
  mdiFormatAlignLeft,
  mdiFormatListBulleted,
  mdiFormatTitle,
  mdiFullscreen,
  mdiGoogle,
  mdiHelp,
  mdiHistory,
  mdiHomeOutline,
  mdiImport,
  mdiKeyOutline,
  mdiKeyVariant,
  mdiLanguageMarkdown,
  mdiLanguagePython,
  mdiLibraryOutline,
  mdiLightbulbOn,
  mdiLinkVariant,
  mdiLoading,
  mdiMagnify,
  mdiMagnifyExpand,
  mdiMap,
  mdiMenu,
  mdiMenuDown,
  mdiMenuRight,
  mdiMinus,
  mdiNoteTextOutline,
  mdiNumeric1BoxOutline,
  mdiOpenInNew,
  mdiPencilOutline,
  mdiPlaylistPlay,
  mdiPlayOutline,
  mdiPlus,
  mdiPowerPlugOutline,
  mdiRefresh,
  mdiRobot,
  mdiRobotOutline,
  mdiServerNetwork,
  mdiSetCenter,
  mdiSourceRepository,
  mdiStarOutline,
  mdiStopCircleOutline,
  mdiSunThermometerOutline,
  mdiTable,
  mdiTableColumn,
  mdiTableLarge,
  mdiTablePlus,
  mdiTagOutline,
  mdiTagSearchOutline,
  mdiTestTube,
  mdiTextBoxOutline,
  mdiTrashCanOutline,
  mdiTree,
  mdiTuneVertical,
  mdiUndo,
  mdiUndoVariant,
  mdiVideo,
  mdiViewDashboard,
  mdiViewDashboardOutline,
} from '@mdi/js'

const ICON_CLASS_NAMES = [
  'mdi-account-outline',
  'mdi-alert-circle',
  'mdi-alert-circle-outline',
  'mdi-alpha-c-circle',
  'mdi-arrow-expand',
  'mdi-auto-fix',
  'mdi-book-open-variant',
  'mdi-calendar-clock-outline',
  'mdi-chart-areaspline',
  'mdi-chart-bar',
  'mdi-chart-box',
  'mdi-chart-bubble',
  'mdi-chart-donut',
  'mdi-chart-line',
  'mdi-chart-multiple',
  'mdi-chart-scatter-plot',
  'mdi-chart-timeline',
  'mdi-chart-timeline-variant',
  'mdi-chat',
  'mdi-chat-outline',
  'mdi-chat-plus-outline',
  'mdi-check',
  'mdi-check-circle',
  'mdi-check-circle-outline',
  'mdi-chevron-double-down',
  'mdi-chevron-double-up',
  'mdi-chevron-down',
  'mdi-chevron-left',
  'mdi-chevron-right',
  'mdi-chevron-up',
  'mdi-close',
  'mdi-close-box-multiple-outline',
  'mdi-close-circle-outline',
  'mdi-code-braces',
  'mdi-code-tags',
  'mdi-cog-outline',
  'mdi-cog-refresh-outline',
  'mdi-compare',
  'mdi-content-copy',
  'mdi-content-save',
  'mdi-content-save-outline',
  'mdi-creation',
  'mdi-creation-outline',
  'mdi-cube-outline',
  'mdi-database',
  'mdi-database-edit-outline',
  'mdi-database-outline',
  'mdi-database-plus-outline',
  'mdi-delete-outline',
  'mdi-dots-horizontal',
  'mdi-download-outline',
  'mdi-duck',
  'mdi-export-variant',
  'mdi-eye',
  'mdi-eye-off',
  'mdi-eye-outline',
  'mdi-file',
  'mdi-file-document',
  'mdi-file-document-edit-outline',
  'mdi-file-document-outline',
  'mdi-file-document-plus-outline',
  'mdi-file-outline',
  'mdi-filter-outline',
  'mdi-filter-remove-outline',
  'mdi-filter-variant',
  'mdi-flash',
  'mdi-folder-outline',
  'mdi-format-align-left',
  'mdi-format-list-bulleted',
  'mdi-format-title',
  'mdi-fullscreen',
  'mdi-google',
  'mdi-help',
  'mdi-history',
  'mdi-home-outline',
  'mdi-import',
  'mdi-key-outline',
  'mdi-key-variant',
  'mdi-language-markdown',
  'mdi-language-python',
  'mdi-library-outline',
  'mdi-lightbulb-on',
  'mdi-link-variant',
  'mdi-loading',
  'mdi-magnify',
  'mdi-magnify-expand',
  'mdi-map',
  'mdi-menu',
  'mdi-menu-down',
  'mdi-menu-right',
  'mdi-minus',
  'mdi-note-text-outline',
  'mdi-numeric-1-box-outline',
  'mdi-open-in-new',
  'mdi-pencil-outline',
  'mdi-playlist-play',
  'mdi-play-outline',
  'mdi-plus',
  'mdi-power-plug-outline',
  'mdi-refresh',
  'mdi-robot',
  'mdi-robot-outline',
  'mdi-server-network',
  'mdi-set-center',
  'mdi-source-repository',
  'mdi-star-outline',
  'mdi-stop-circle-outline',
  'mdi-sun-thermometer-outline',
  'mdi-table',
  'mdi-table-column',
  'mdi-table-large',
  'mdi-table-plus',
  'mdi-tag-outline',
  'mdi-tag-search-outline',
  'mdi-test-tube',
  'mdi-text-box-outline',
  'mdi-trash-can-outline',
  'mdi-tree',
  'mdi-tune-vertical',
  'mdi-undo',
  'mdi-undo-variant',
  'mdi-video',
  'mdi-view-dashboard',
  'mdi-view-dashboard-outline',
] as const

const STYLE_ELEMENT_ID = 'trilogy-mdi-icons'

function toSvgDataUrl(path: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="white" d="${path}"/></svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}

function buildBaseCss(): string {
  return `
.mdi,
.mdi-set {
  display: inline-block;
  width: 1em;
  height: 1em;
  font-size: inherit;
  line-height: inherit;
  vertical-align: middle;
  font-style: normal;
  text-rendering: auto;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.mdi::before {
  content: "";
  display: inline-block;
  width: 1em;
  height: 1em;
  background-color: currentColor;
  vertical-align: top;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  -webkit-mask-position: center;
  mask-position: center;
  -webkit-mask-size: contain;
  mask-size: contain;
}

.mdi.mdi-spin::before {
  animation: trilogy-mdi-spin 2s linear infinite;
  transform-origin: center;
}

.mdi-18px.mdi-set,
.mdi-18px.mdi::before {
  width: 18px;
  height: 18px;
}

.mdi-24px.mdi-set,
.mdi-24px.mdi::before {
  width: 24px;
  height: 24px;
}

.mdi-36px.mdi-set,
.mdi-36px.mdi::before {
  width: 36px;
  height: 36px;
}

.mdi-48px.mdi-set,
.mdi-48px.mdi::before {
  width: 48px;
  height: 48px;
}

@keyframes trilogy-mdi-spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}
`
}

function buildIconCss(): string {
  const iconMap: Record<string, string> = {
    'mdi-account-outline': mdiAccountOutline,
    'mdi-alert-circle': mdiAlertCircle,
    'mdi-alert-circle-outline': mdiAlertCircleOutline,
    'mdi-alpha-c-circle': mdiAlphaCCircle,
    'mdi-arrow-expand': mdiArrowExpand,
    'mdi-auto-fix': mdiAutoFix,
    'mdi-book-open-variant': mdiBookOpenVariant,
    'mdi-calendar-clock-outline': mdiCalendarClockOutline,
    'mdi-chart-areaspline': mdiChartAreaspline,
    'mdi-chart-bar': mdiChartBar,
    'mdi-chart-box': mdiChartBox,
    'mdi-chart-bubble': mdiChartBubble,
    'mdi-chart-donut': mdiChartDonut,
    'mdi-chart-line': mdiChartLine,
    'mdi-chart-multiple': mdiChartMultiple,
    'mdi-chart-scatter-plot': mdiChartScatterPlot,
    'mdi-chart-timeline': mdiChartTimeline,
    'mdi-chart-timeline-variant': mdiChartTimelineVariant,
    'mdi-chat': mdiChat,
    'mdi-chat-outline': mdiChatOutline,
    'mdi-chat-plus-outline': mdiChatPlusOutline,
    'mdi-check': mdiCheck,
    'mdi-check-circle': mdiCheckCircle,
    'mdi-check-circle-outline': mdiCheckCircleOutline,
    'mdi-chevron-double-down': mdiChevronDoubleDown,
    'mdi-chevron-double-up': mdiChevronDoubleUp,
    'mdi-chevron-down': mdiChevronDown,
    'mdi-chevron-left': mdiChevronLeft,
    'mdi-chevron-right': mdiChevronRight,
    'mdi-chevron-up': mdiChevronUp,
    'mdi-close': mdiClose,
    'mdi-close-box-multiple-outline': mdiCloseBoxMultipleOutline,
    'mdi-close-circle-outline': mdiCloseCircleOutline,
    'mdi-code-braces': mdiCodeBraces,
    'mdi-code-tags': mdiCodeTags,
    'mdi-cog-outline': mdiCogOutline,
    'mdi-cog-refresh-outline': mdiCogRefreshOutline,
    'mdi-compare': mdiCompare,
    'mdi-content-copy': mdiContentCopy,
    'mdi-content-save': mdiContentSave,
    'mdi-content-save-outline': mdiContentSaveOutline,
    'mdi-creation': mdiCreation,
    'mdi-creation-outline': mdiCreationOutline,
    'mdi-cube-outline': mdiCubeOutline,
    'mdi-database': mdiDatabase,
    'mdi-database-edit-outline': mdiDatabaseEditOutline,
    'mdi-database-outline': mdiDatabaseOutline,
    'mdi-database-plus-outline': mdiDatabasePlusOutline,
    'mdi-delete-outline': mdiDeleteOutline,
    'mdi-dots-horizontal': mdiDotsHorizontal,
    'mdi-download-outline': mdiDownloadOutline,
    'mdi-duck': mdiDuck,
    'mdi-export-variant': mdiExportVariant,
    'mdi-eye': mdiEye,
    'mdi-eye-off': mdiEyeOff,
    'mdi-eye-outline': mdiEyeOutline,
    'mdi-file': mdiFile,
    'mdi-file-document': mdiFileDocument,
    'mdi-file-document-edit-outline': mdiFileDocumentEditOutline,
    'mdi-file-document-outline': mdiFileDocumentOutline,
    'mdi-file-document-plus-outline': mdiFileDocumentPlusOutline,
    'mdi-file-outline': mdiFileOutline,
    'mdi-filter-outline': mdiFilterOutline,
    'mdi-filter-remove-outline': mdiFilterRemoveOutline,
    'mdi-filter-variant': mdiFilterVariant,
    'mdi-flash': mdiFlash,
    'mdi-folder-outline': mdiFolderOutline,
    'mdi-format-align-left': mdiFormatAlignLeft,
    'mdi-format-list-bulleted': mdiFormatListBulleted,
    'mdi-format-title': mdiFormatTitle,
    'mdi-fullscreen': mdiFullscreen,
    'mdi-google': mdiGoogle,
    'mdi-help': mdiHelp,
    'mdi-history': mdiHistory,
    'mdi-home-outline': mdiHomeOutline,
    'mdi-import': mdiImport,
    'mdi-key-outline': mdiKeyOutline,
    'mdi-key-variant': mdiKeyVariant,
    'mdi-language-markdown': mdiLanguageMarkdown,
    'mdi-language-python': mdiLanguagePython,
    'mdi-library-outline': mdiLibraryOutline,
    'mdi-lightbulb-on': mdiLightbulbOn,
    'mdi-link-variant': mdiLinkVariant,
    'mdi-loading': mdiLoading,
    'mdi-magnify': mdiMagnify,
    'mdi-magnify-expand': mdiMagnifyExpand,
    'mdi-map': mdiMap,
    'mdi-menu': mdiMenu,
    'mdi-menu-down': mdiMenuDown,
    'mdi-menu-right': mdiMenuRight,
    'mdi-minus': mdiMinus,
    'mdi-note-text-outline': mdiNoteTextOutline,
    'mdi-numeric-1-box-outline': mdiNumeric1BoxOutline,
    'mdi-open-in-new': mdiOpenInNew,
    'mdi-pencil-outline': mdiPencilOutline,
    'mdi-playlist-play': mdiPlaylistPlay,
    'mdi-play-outline': mdiPlayOutline,
    'mdi-plus': mdiPlus,
    'mdi-power-plug-outline': mdiPowerPlugOutline,
    'mdi-refresh': mdiRefresh,
    'mdi-robot': mdiRobot,
    'mdi-robot-outline': mdiRobotOutline,
    'mdi-server-network': mdiServerNetwork,
    'mdi-set-center': mdiSetCenter,
    'mdi-source-repository': mdiSourceRepository,
    'mdi-star-outline': mdiStarOutline,
    'mdi-stop-circle-outline': mdiStopCircleOutline,
    'mdi-sun-thermometer-outline': mdiSunThermometerOutline,
    'mdi-table': mdiTable,
    'mdi-table-column': mdiTableColumn,
    'mdi-table-large': mdiTableLarge,
    'mdi-table-plus': mdiTablePlus,
    'mdi-tag-outline': mdiTagOutline,
    'mdi-tag-search-outline': mdiTagSearchOutline,
    'mdi-test-tube': mdiTestTube,
    'mdi-text-box-outline': mdiTextBoxOutline,
    'mdi-trash-can-outline': mdiTrashCanOutline,
    'mdi-tree': mdiTree,
    'mdi-tune-vertical': mdiTuneVertical,
    'mdi-undo': mdiUndo,
    'mdi-undo-variant': mdiUndoVariant,
    'mdi-video': mdiVideo,
    'mdi-view-dashboard': mdiViewDashboard,
    'mdi-view-dashboard-outline': mdiViewDashboardOutline,
  }

  return ICON_CLASS_NAMES.map((iconClassName) => {
    const path = iconMap[iconClassName]

    if (!path) {
      console.warn(`[trilogy-studio-components] Missing MDI path for ${iconClassName}`)
      return ''
    }

    const dataUrl = toSvgDataUrl(path)
    return `
.${iconClassName}::before {
  -webkit-mask-image: ${dataUrl};
  mask-image: ${dataUrl};
}
`
  }).join('')
}

function registerMdiIcons(): void {
  if (typeof document === 'undefined') {
    return
  }

  if (document.getElementById(STYLE_ELEMENT_ID)) {
    return
  }

  const style = document.createElement('style')
  style.id = STYLE_ELEMENT_ID
  style.textContent = buildBaseCss() + buildIconCss()
  document.head.appendChild(style)
}

registerMdiIcons()

export { ICON_CLASS_NAMES, registerMdiIcons }
