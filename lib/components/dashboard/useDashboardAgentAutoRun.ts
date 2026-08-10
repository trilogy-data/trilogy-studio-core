import { inject, watch, type Ref } from 'vue'
import { useDashboardStore, useChatStore, useConnectionStore, useEditorStore } from '../../stores'
import type { LLMConnectionStoreType } from '../../stores/llmStore'
import type QueryExecutionService from '../../stores/queryExecutionService'
import type { DashboardModel } from '../../dashboards/base'
import { startDashboardAgentRun } from '../../llm/dashboardAgentRuntime'

/**
 * Renderless engine for dashboard-agent kickoff: consume any
 * prompt queued for the dashboard via dashboardStore.pendingChatPrompts (the
 * creator flow and the overseer's create_report write there) and fire the
 * headless dashboard agent. Works identically in the studio shell and the
 * explorer's external-chat mode — the run lives in chatStore, and any UI
 * (global panel, OverseerPanel) observes it reactively.
 */
export function useDashboardAgentAutoRun(
  dashboard: Ref<DashboardModel | null | undefined>,
  opts: { onStarted?: (chatId: string) => void } = {},
) {
  const dashboardStore = useDashboardStore()
  const chatStore = useChatStore()
  const connectionStore = useConnectionStore()
  const editorStore = useEditorStore()
  const llmConnectionStore = inject<LLMConnectionStoreType | null>('llmConnectionStore', null)
  const queryExecutionService = inject<QueryExecutionService | null>('queryExecutionService', null)

  async function submitPrompt(prompt: string): Promise<string | null> {
    const current = dashboard.value
    if (!current || !prompt.trim()) return null
    if (!llmConnectionStore || !queryExecutionService) {
      console.error(
        'Dashboard agent auto-run unavailable: missing llm connection store or query service',
      )
      return null
    }
    try {
      const chatId = await startDashboardAgentRun({
        dashboardId: current.id,
        prompt,
        stores: {
          dashboardStore,
          chatStore,
          connectionStore,
          editorStore,
          llmConnectionStore,
          queryExecutionService,
        },
        deps: {
          llmConnectionStore,
          connectionStore,
          queryExecutionService,
          editorStore,
          dashboardStore,
        },
      })
      opts.onStarted?.(chatId)
      return chatId
    } catch (err) {
      console.error('Dashboard agent run failed to start:', err)
      return null
    }
  }

  watch(
    dashboard,
    (current) => {
      if (!current) return
      const pending = dashboardStore.consumePendingChatPrompt(current.id)
      if (pending) {
        void submitPrompt(pending)
      }
    },
    { immediate: true },
  )

  return { submitPrompt }
}
