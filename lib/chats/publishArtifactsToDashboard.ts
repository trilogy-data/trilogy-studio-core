/**
 * Converts chat artifacts into a new dashboard.
 *
 * Artifact types are mapped to dashboard cell types:
 *   - 'chart'    → dashboard 'chart' (query + chartConfig)
 *   - 'results'  → dashboard 'table' (query)
 *   - 'markdown' → dashboard 'markdown' (MarkdownData { markdown, query })
 *   - 'code'     → dashboard 'markdown' (rendered as code block)
 *   - 'custom'   → skipped
 */
import type { ChatArtifact } from './chat'
import {
  DashboardModel,
  CELL_TYPES,
  type CellType,
  type MarkdownData,
} from '../dashboards/base'

export interface PublishOptions {
  /** Dashboard name. Falls back to "Chat Artifacts". */
  name?: string
  /** Connection name to associate with the dashboard. */
  connection: string
  /** Dashboard imports (data sources used by the chat). */
  imports?: { id: string; name: string; alias: string }[]
}

/**
 * Create a DashboardModel from an array of ChatArtifacts.
 *
 * The caller is responsible for adding the returned model to the dashboard store.
 */
export function publishArtifactsToDashboard(
  artifacts: ChatArtifact[],
  options: PublishOptions,
): DashboardModel {
  const dashboardName = options.name || 'Chat Artifacts'
  const dashboard = new DashboardModel({
    id: dashboardName,
    name: dashboardName,
    connection: options.connection,
    storage: 'local',
    state: 'editing',
  })

  if (options.imports) {
    dashboard.imports = options.imports.map((imp) => ({ ...imp }))
  }

  // Layout constants
  const FULL_WIDTH = 20 // grid is 0-20
  const HALF_WIDTH = 10

  // Arrange items: alternate full-width and side-by-side pairs
  for (const artifact of artifacts) {
    const mapped = mapArtifactToDashboardItem(artifact)
    if (!mapped) continue

    const { type, content, name, chartConfig, height } = mapped

    const itemId = dashboard.addItem(type, 0, 0, FULL_WIDTH, height, null, name)

    // Set the content (addItem only accepts string, but we may need MarkdownData)
    if (typeof content === 'object') {
      dashboard.gridItems[itemId].content = content
    } else {
      dashboard.gridItems[itemId].content = content
    }

    if (chartConfig) {
      dashboard.gridItems[itemId].chartConfig = chartConfig
    }
  }

  dashboard.changed = true
  return dashboard
}

interface MappedItem {
  type: CellType
  content: string | MarkdownData
  name: string
  chartConfig?: any
  height: number
}

function mapArtifactToDashboardItem(artifact: ChatArtifact): MappedItem | null {
  switch (artifact.type) {
    case 'chart': {
      const query = artifact.config?.query || ''
      return {
        type: CELL_TYPES.CHART,
        content: query,
        name: artifact.config?.title || 'Chart',
        chartConfig: artifact.config?.chartConfig,
        height: 10,
      }
    }

    case 'results': {
      const query = artifact.config?.query || ''
      return {
        type: CELL_TYPES.TABLE,
        content: query,
        name: artifact.config?.title || 'Table',
        height: 10,
      }
    }

    case 'markdown': {
      const mdData: MarkdownData = {
        markdown: artifact.data?.markdown || '',
        query: artifact.data?.query || '',
      }
      return {
        type: CELL_TYPES.MARKDOWN,
        content: mdData,
        name: artifact.config?.title || 'Markdown',
        height: mdData.query ? 10 : 4,
      }
    }

    case 'code': {
      // Wrap code in a markdown code block
      const language = artifact.config?.language || 'sql'
      const codeContent = artifact.data || ''
      const md = `\`\`\`${language}\n${codeContent}\n\`\`\``
      return {
        type: CELL_TYPES.MARKDOWN,
        content: md,
        name: artifact.config?.title || 'Code',
        height: 4,
      }
    }

    default:
      // Skip 'custom' and unknown types
      return null
  }
}
