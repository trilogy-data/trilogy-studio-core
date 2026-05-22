import { defineStore } from 'pinia'
import { Project } from '../projects/project'
import type { PromptOverrideKind } from '../projects/project'

/**
 * Project store. Mirrors the shape of chatStore: state holds Project
 * instances keyed by id, persistence is delegated to AbstractStorage by
 * external code (a Manager-equivalent in the host app), and stores track
 * `changed` / `deleted` flags so flushes are incremental.
 *
 * Lives in lib/ so studio could adopt projects later. Explorer is the first
 * consumer.
 */
export const useProjectStore = defineStore('projects', {
  state: () => ({
    projects: {} as Record<string, Project>,
    activeProjectId: '' as string,
  }),

  getters: {
    projectList: (state): Project[] => Object.values(state.projects).filter((p) => !p.deleted),

    unsavedProjects: (state): number =>
      Object.values(state.projects).filter((p) => p.changed && !p.deleted).length,

    activeProject: (state): Project | null =>
      state.activeProjectId ? state.projects[state.activeProjectId] || null : null,

    getProjectById:
      (state) =>
      (id: string): Project | null =>
        state.projects[id] || null,
  },

  actions: {
    newProject(name?: string, description: string = ''): Project {
      const project = new Project({
        name: name || `Project ${new Date().toLocaleDateString()}`,
        description,
      })
      this.projects[project.id] = project
      this.activeProjectId = project.id
      return project
    },

    addProject(project: Project): void {
      this.projects[project.id] = project
    },

    removeProject(id: string): void {
      const project = this.projects[id]
      if (!project) return
      project.deleted = true
      project.changed = true
      if (this.activeProjectId === id) {
        this.activeProjectId = ''
      }
    },

    setActiveProject(id: string): void {
      if (this.projects[id] && !this.projects[id].deleted) {
        this.activeProjectId = id
      }
    },

    clearActiveProject(): void {
      this.activeProjectId = ''
    },

    renameProject(id: string, name: string): void {
      this.projects[id]?.setName(name)
    },

    setProjectDescription(id: string, description: string): void {
      this.projects[id]?.setDescription(description)
    },

    setProjectDataConnection(id: string, connectionId: string): void {
      const project = this.projects[id]
      if (!project) return
      if (project.dataConnectionId === connectionId) return
      project.dataConnectionId = connectionId
      project.updatedAt = new Date()
      project.changed = true
    },

    setProjectLLMConnection(id: string, llmConnectionName: string): void {
      const project = this.projects[id]
      if (!project) return
      if (project.llmConnectionName === llmConnectionName) return
      project.llmConnectionName = llmConnectionName
      project.updatedAt = new Date()
      project.changed = true
    },

    setProjectDirectory(id: string, path: string): void {
      this.projects[id]?.setDirectoryPath(path)
    },

    addSubchatToProject(id: string, chatId: string): boolean {
      return this.projects[id]?.addSubchat(chatId) ?? false
    },

    removeSubchatFromProject(id: string, chatId: string): boolean {
      return this.projects[id]?.removeSubchat(chatId) ?? false
    },

    addEditorToProject(id: string, editorId: string): boolean {
      return this.projects[id]?.addEditor(editorId) ?? false
    },

    removeEditorFromProject(id: string, editorId: string): boolean {
      return this.projects[id]?.removeEditor(editorId) ?? false
    },

    addDashboardToProject(id: string, dashboardId: string): boolean {
      return this.projects[id]?.addDashboard(dashboardId) ?? false
    },

    removeDashboardFromProject(id: string, dashboardId: string): boolean {
      return this.projects[id]?.removeDashboard(dashboardId) ?? false
    },

    /** Set the per-project instructions override for an agent kind. Pass
     *  undefined or an empty string to revert to the default. */
    setProjectPromptOverride(
      id: string,
      kind: PromptOverrideKind,
      value: string | undefined,
    ): void {
      this.projects[id]?.setPromptOverride(kind, value)
    },

    /** Hydrate from a Record produced by AbstractStorage.loadProjects(). */
    setProjects(projects: Record<string, Project>): void {
      this.projects = projects
      // Pick first non-deleted as active if nothing is set
      if (!this.activeProjectId) {
        const first = Object.values(projects).find((p) => !p.deleted)
        if (first) this.activeProjectId = first.id
      }
    },
  },
})

export type ProjectStoreType = ReturnType<typeof useProjectStore>
export default useProjectStore
