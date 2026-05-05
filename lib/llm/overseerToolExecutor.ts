import type { ChatStoreType, ChatExecutionDependencies } from '../stores/chatStore'
import type { ProjectStoreType } from '../stores/projectStore'
import type { ToolCallResult } from './sharedToolHelpers'
import type { SubchatKind } from './overseerAgentPrompt'
import { SUBCHAT_KINDS } from './overseerAgentPrompt'
import { summarizeSubchat } from './subchatSummarize'

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
  ) {}

  /** Read active project at tool-call time — the overseer can be talked to
   *  across project switches, and we want subchats to land in whichever
   *  project the user is currently looking at. */
  private get activeProjectId(): string {
    return this.projectStore.activeProjectId
  }

  async executeToolCall(
    toolName: string,
    toolInput: Record<string, any>,
  ): Promise<ToolCallResult> {
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
    }
  }

  private deleteSubchat(subchatId: string): ToolCallResult {
    if (!subchatId) return { success: false, error: 'subchat_id is required' }
    const subchat = this.chatStore.chats[subchatId]
    if (!subchat) return { success: false, error: `Subchat ${subchatId} not found` }
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

  private listSubchats(): ToolCallResult {
    const projectId = this.activeProjectId
    if (!projectId) return { success: true, message: 'No active project.' }
    const project = this.projectStore.projects[projectId]
    if (!project) return { success: false, error: 'Project not found' }

    const lines = project.subchatIds.map((id) => {
      const c = this.chatStore.chats[id]
      if (!c) return `  - ${id} (missing)`
      const status = this.chatStore.isChatExecuting(id) ? 'running' : 'idle'
      const last = c.messages[c.messages.length - 1]
      const preview = last ? truncate(last.content || '', 80) : ''
      return `  - ${id} [${c.kind}] (${status}) "${c.name}" — last: ${preview}`
    })

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
