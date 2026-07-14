import type { ChatStoreType, ChatExecutionDependencies } from '../stores/chatStore'
import type { ProjectStoreType } from '../stores/projectStore'
import type { DashboardStoreType } from '../stores/dashboardStore'
import type { ToolCallResult } from './sharedToolHelpers'
import type { SubchatKind } from './overseerAgentPrompt'
import { SUBCHAT_KINDS } from './overseerAgentPrompt'
import { summarizeSubchat } from './subchatSummarize'
import { startDashboardAgentRun } from './dashboardAgentRuntime'

/**
 * Tool executor for the (singleton) overseer chat. Spawns and follows up
 * with subchats; never touches data directly. Subchats are scoped to
 * whichever project is currently active when the tool fires — the overseer
 * itself is global, projects come and go.
 *
 * Subchat execution is fire-and-forget; chatStore's terminal logic injects
 * the summary back into the overseer when the subchat finishes.
 */
export class OverseerToolExecutor {
  constructor(
    private chatStore: ChatStoreType,
    private projectStore: ProjectStoreType,
    private overseerChatId: string,
    private deps: ChatExecutionDependencies,
    private dashboardStore?: DashboardStoreType,
  ) {}

  /** Read active project at tool-call time — the overseer can be talked to
   *  across project switches, and we want subchats to land in whichever
   *  project the user is currently looking at. */
  private get activeProjectId(): string {
    return this.projectStore.activeProjectId
  }

  async executeToolCall(toolName: string, toolInput: Record<string, any>): Promise<ToolCallResult> {
    switch (toolName) {
      case 'spawn_subchat':
        return this.spawnSubchat(toolInput.kind, toolInput.task, toolInput.name)
      case 'send_to_subchat':
        return this.sendToSubchat(toolInput.subchat_id, toolInput.message)
      case 'list_subchats':
        return this.listSubchats()
      case 'peek_subchat':
        return this.peekSubchat(toolInput.subchat_id)
      case 'delete_subchat':
        return this.deleteSubchat(toolInput.subchat_id)
      case 'create_report':
        return this.createReport(toolInput.title, toolInput.prompt)
      case 'return_to_user':
        return {
          success: true,
          message: toolInput.message || 'Done.',
          terminatesLoop: true,
        }
      default:
        return {
          success: false,
          error: `Unknown tool: ${toolName}. Available: spawn_subchat, send_to_subchat, list_subchats, return_to_user`,
        }
    }
  }

  private spawnSubchat(kind: any, task: string, label?: string): ToolCallResult {
    if (!SUBCHAT_KINDS.includes(kind as SubchatKind)) {
      return {
        success: false,
        error: `Invalid kind '${kind}'. Must be one of: ${SUBCHAT_KINDS.join(', ')}`,
      }
    }
    if (!task || typeof task !== 'string') {
      return { success: false, error: 'task is required' }
    }
    const projectId = this.activeProjectId
    if (!projectId) {
      return {
        success: false,
        error: 'No active project. Ask the user to create or open a project first.',
      }
    }

    const overseer = this.chatStore.chats[this.overseerChatId]
    if (!overseer) return { success: false, error: 'Overseer chat not found' }

    const project = this.projectStore.projects[projectId]
    // Bind the subchat to the project's data connection (DuckDB) so its
    // queries hit the right place. Falls back to the overseer's connection.
    const dataConnectionId = project?.dataConnectionId || overseer.dataConnectionId
    const dataConnectionName = overseer.dataConnectionName

    const subchat = this.chatStore.newChat(
      overseer.llmConnectionName,
      dataConnectionName,
      label || deriveLabel(kind, task),
      dataConnectionId,
    )
    subchat.kind = kind as SubchatKind
    subchat.parentChatId = this.overseerChatId
    subchat.parentProjectId = projectId
    subchat.changed = true

    this.projectStore.addSubchatToProject(projectId, subchat.id)

    // Fire and forget. The subchat's terminal logic in chatStore will
    // inject its summary back into the overseer when it completes.
    this.chatStore.executeMessage(subchat.id, task, this.deps).catch((err) => {
      console.error(`Subchat ${subchat.id} failed`, err)
    })

    return {
      success: true,
      message: `Spawned ${kind} subchat ${subchat.id} in project "${project?.name ?? projectId}". It is running asynchronously; you'll be notified when it completes.`,
      subchatId: subchat.id,
    }
  }

  private sendToSubchat(subchatId: string, message: string): ToolCallResult {
    if (!subchatId) return { success: false, error: 'subchat_id is required' }
    if (!message) return { success: false, error: 'message is required' }

    const subchat = this.chatStore.chats[subchatId]
    if (!subchat) return { success: false, error: `Subchat ${subchatId} not found` }
    if (subchat.parentChatId !== this.overseerChatId) {
      return { success: false, error: `Subchat ${subchatId} is not a child of this overseer` }
    }
    if (this.chatStore.isChatExecuting(subchatId)) {
      return {
        success: false,
        error: `Subchat ${subchatId} is currently busy. Wait for it to complete (you'll be notified) before sending a follow-up.`,
      }
    }

    this.chatStore.executeMessage(subchatId, message, this.deps).catch((err) => {
      console.error(`Subchat ${subchatId} follow-up failed`, err)
    })

    return {
      success: true,
      message: `Sent follow-up to subchat ${subchatId}. It will resume asynchronously.`,
      subchatId,
    }
  }

  private deleteSubchat(subchatId: string): ToolCallResult {
    if (!subchatId) return { success: false, error: 'subchat_id is required' }
    const subchat = this.chatStore.chats[subchatId]
    if (!subchat) {
      // Self-heal: stale id sitting in some project's subchatIds with no
      // live chat (typically a reload-before-flush orphan). Just clean up
      // the dangling reference instead of erroring — the agent's intent
      // ("get rid of this entry") is satisfied either way.
      let cleaned = 0
      for (const project of Object.values(this.projectStore.projects)) {
        if (project.subchatIds.includes(subchatId)) {
          this.projectStore.removeSubchatFromProject(project.id, subchatId)
          cleaned++
        }
      }
      return cleaned > 0
        ? {
            success: true,
            message: `Subchat ${subchatId} was already gone; removed the dangling reference.`,
          }
        : { success: false, error: `Subchat ${subchatId} not found` }
    }
    if (subchat.parentChatId !== this.overseerChatId) {
      return { success: false, error: `Subchat ${subchatId} is not a child of this overseer` }
    }
    if (this.chatStore.isChatExecuting(subchatId)) {
      return {
        success: false,
        error: `Subchat ${subchatId} is still running. Wait for it to complete before deleting.`,
      }
    }

    const projectId = subchat.parentProjectId || ''
    const name = subchat.name
    this.chatStore.removeChat(subchatId)
    if (projectId) {
      this.projectStore.removeSubchatFromProject(projectId, subchatId)
    }

    return {
      success: true,
      message: `Deleted subchat ${subchatId} ("${name}").`,
    }
  }

  /**
   * Cheap natural-language summary of a subchat's progress, intended for the
   * overseer to check on running work without waiting. Delegates to the
   * shared summarizeSubchat helper so peek and completion stay aligned.
   */
  private async peekSubchat(subchatId: string): Promise<ToolCallResult> {
    if (!subchatId) return { success: false, error: 'subchat_id is required' }
    const subchat = this.chatStore.chats[subchatId]
    if (!subchat) return { success: false, error: `Subchat ${subchatId} not found` }
    if (subchat.parentChatId !== this.overseerChatId) {
      return { success: false, error: `Subchat ${subchatId} is not a child of this overseer` }
    }
    const overseer = this.chatStore.chats[this.overseerChatId]
    if (!overseer) return { success: false, error: 'Overseer chat not found' }
    const provider = this.deps.llmConnectionStore.connections[overseer.llmConnectionName]
    if (!provider) {
      return { success: false, error: `LLM provider "${overseer.llmConnectionName}" not available` }
    }

    const status = this.chatStore.isChatExecuting(subchatId) ? 'still running' : 'idle / finished'
    try {
      const summary = await summarizeSubchat(provider, subchat, 'peek')
      return {
        success: true,
        message: `Peek of ${subchatId} (${subchat.kind}, ${status}):\n\n${summary}`,
      }
    } catch (e) {
      return { success: false, error: `Peek failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  }

  /**
   * Spawn a new report-mode dashboard in the active project and fire the
   * brief at its agent immediately — headless, like spawnSubchat. The run
   * continues in the background via chatStore; opening the report just
   * renders progress. Falls back to queueing the brief (consumed on report
   * open) if the headless kickoff fails.
   */
  private createReport(rawTitle: any, rawPrompt: any): ToolCallResult {
    if (!this.dashboardStore) {
      return {
        success: false,
        error:
          'Dashboard store not available in this overseer session. Ask the user to create the report from the sidebar.',
      }
    }
    const title = typeof rawTitle === 'string' ? rawTitle.trim() : ''
    if (!title) return { success: false, error: 'title is required' }
    const prompt = typeof rawPrompt === 'string' ? rawPrompt.trim() : ''
    if (!prompt) return { success: false, error: 'prompt is required' }

    const projectId = this.activeProjectId
    if (!projectId) {
      return {
        success: false,
        error: 'No active project. Ask the user to create or open a project first.',
      }
    }
    const project = this.projectStore.projects[projectId]
    if (!project) return { success: false, error: 'Active project not found' }

    if (this.dashboardStore.dashboards[title]) {
      return {
        success: false,
        error: `A dashboard named "${title}" already exists. Pick a different title.`,
      }
    }

    let dashboard
    try {
      dashboard = this.dashboardStore.newReport(title, project.dataConnectionId || '')
    } catch (e) {
      return {
        success: false,
        error: `Failed to create report: ${e instanceof Error ? e.message : String(e)}`,
      }
    }
    this.projectStore.addDashboardToProject(projectId, dashboard.id)

    // Fire the brief immediately, headless. Do NOT also queue it as a
    // pending prompt — the mounted panel would auto-send it a second time.
    try {
      startDashboardAgentRun({
        dashboardId: dashboard.id,
        prompt,
        stores: {
          dashboardStore: this.dashboardStore,
          chatStore: this.chatStore,
          connectionStore: this.deps.connectionStore,
          editorStore: this.deps.editorStore,
          llmConnectionStore: this.deps.llmConnectionStore,
          queryExecutionService: this.deps.queryExecutionService,
        },
        deps: this.deps,
      }).catch((err) => {
        console.error(`Report agent kickoff for ${dashboard.id} failed`, err)
      })
    } catch (e) {
      // Degrade to the open-to-start flow rather than losing the brief.
      this.dashboardStore.setPendingChatPrompt(dashboard.id, prompt)
      return {
        success: true,
        message: `Created report "${title}" (id ${dashboard.id}) in project "${project.name}", but could not start the agent in the background (${e instanceof Error ? e.message : String(e)}). The brief will fire when the user opens the report.`,
      }
    }

    return {
      success: true,
      message: `Created report "${title}" (id ${dashboard.id}) in project "${project.name}". The report agent is authoring it now, asynchronously — progress is visible in the report (sidebar → Reports) and its chat.`,
    }
  }

  private listSubchats(): ToolCallResult {
    const projectId = this.activeProjectId
    if (!projectId) return { success: true, message: 'No active project.' }
    const project = this.projectStore.projects[projectId]
    if (!project) return { success: false, error: 'Project not found' }

    // Self-heal: drop subchatIds whose Chat objects vanished (typically a
    // reload-before-flush orphan). Reporting "(missing)" entries to the
    // overseer just baits it into delete attempts that 404.
    const orphans = project.subchatIds.filter((id) => {
      const c = this.chatStore.chats[id]
      return !c || c.deleted
    })
    for (const id of orphans) {
      this.projectStore.removeSubchatFromProject(projectId, id)
    }

    const lines: string[] = []
    for (const id of project.subchatIds) {
      const c = this.chatStore.chats[id]
      if (!c) continue
      const status = this.chatStore.isChatExecuting(id) ? 'running' : 'idle'
      const last = c.messages[c.messages.length - 1]
      const preview = last ? truncate(last.content || '', 80) : ''
      lines.push(`  - ${id} [${c.kind}] (${status}) "${c.name}" — last: ${preview}`)
    }

    return {
      success: true,
      message:
        lines.length > 0
          ? `Subchats in project "${project.name}":\n${lines.join('\n')}`
          : `No subchats in project "${project.name}" yet.`,
    }
  }
}

function deriveLabel(kind: string, task: string): string {
  const words = task.split(/\s+/).slice(0, 6).join(' ')
  return `${kind}: ${truncate(words, 50)}`
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max - 1) + '…'
}
