import { Editor, EditorTag } from '../editors'
import { normalizeRemoteEditorPath } from '../editors/editor'
import { reconcileRemoteEditor } from '../editors/reconcile'
import { ModelImport } from './import'
import { ModelSource } from './model'
import { type EditorStoreType } from '../stores/editorStore'
import { type DashboardStoreType } from '../stores/dashboardStore'
import { type ModelConfigStoreType } from '../stores/modelStore'
import { DashboardModel } from '../dashboards'
import { computeConnectionId } from '../connections/base'
import { normalizeGenericStoreBaseUrl } from '../remotes/genericStoreMetadata'
import type { EditorType } from '../editors/editor'

// Maps are component.name -> created editor.id (or dashboard.id).
// Using IDs avoids ambiguity when a remote import has produced editors that
// share names with local ones; callers can index editorStore.editors directly.
export interface ImportOutput {
  dashboards: Map<string, string>
  sql: Map<string, string>
  trilogy: Map<string, string>
  python: Map<string, string>
}

interface ComponentData {
  name: string
  alias: string
  purpose: EditorTag | null
  content: string
  url: string
  type?: 'sql' | 'dashboard' | 'trilogy' | 'python'
}

export interface ModelImportOptions {
  token?: string
  remote?: boolean
  remoteStoreId?: string | null
  remoteBaseUrl?: string | null
}

export class ModelImportService {
  private editorStore: EditorStoreType
  private modelStore: ModelConfigStoreType
  private dashboardStore: DashboardStoreType

  constructor(
    editorStore: EditorStoreType,
    modelStore: ModelConfigStoreType,
    dashboardStore: DashboardStoreType,
  ) {
    this.editorStore = editorStore
    this.modelStore = modelStore
    this.dashboardStore = dashboardStore
  }

  private buildRequestInit(token?: string): RequestInit | undefined {
    if (!token) {
      return undefined
    }

    return {
      headers: {
        'X-Trilogy-Token': token,
      },
    }
  }

  /**
   * Fetches model import base definition from URL
   * @param url URL to fetch the model import definition from
   * @returns Promise resolving to ModelImport
   */
  public async fetchModelImportBase(url: string, token?: string): Promise<ModelImport> {
    const response = await fetch(url, this.buildRequestInit(token))
    if (!response.ok) {
      throw new Error(`Failed to fetch model import from ${url}: ${response.statusText}`)
    }
    const content = await response.text()
    try {
      return JSON.parse(content)
    } catch (error) {
      throw new Error(`Invalid JSON in model import from ${url}: ${error}`)
    }
  }

  /**
   * Converts purpose string to EditorTag
   * @param purpose Purpose string
   * @returns Corresponding EditorTag or null if no match
   */
  private purposeToTag(purpose: string): EditorTag | null {
    switch (purpose) {
      case 'source':
        return EditorTag.SOURCE
      case 'setup':
        return EditorTag.STARTUP_SCRIPT
      default:
        return null
    }
  }

  /**
   * Fetches all components from a model import definition
   * @param modelImport Model import definition
   * @returns Promise resolving to array of component details
   */
  public async fetchModelImports(
    modelImport: ModelImport,
    token?: string,
  ): Promise<ComponentData[]> {
    const results = await Promise.all(
      modelImport.components.map(async (component): Promise<ComponentData | null> => {
        if (component.purpose === 'data') {
          return null // Skip data type, not handled here
        }

        try {
          const response = await fetch(component.url, this.buildRequestInit(token))
          if (!response.ok) {
            throw new Error(`Failed to fetch ${component.url}: ${response.statusText}`)
          }
          const content = await response.text()
          return {
            name: component.name,
            alias: component.alias,
            purpose: this.purposeToTag(component.purpose),
            content,
            url: component.url,
            type: component.type as 'sql' | 'dashboard' | 'trilogy' | 'python',
          }
        } catch (error) {
          console.error(`Error fetching component ${component.name}:`, error)
          return {
            name: component.name,
            alias: component.alias,
            purpose: this.purposeToTag(component.purpose),
            content: '', // Return empty content on failure
            url: component.url,
            type: component.type as 'sql' | 'dashboard' | 'trilogy' | 'python',
          }
        }
      }),
    )

    // Filter out null values after all promises resolve
    return results.filter((component): component is ComponentData => component !== null)
  }

  /**
   * Creates or updates an editor for a component
   */
  private getComponentEditorType(component: ComponentData): EditorType {
    switch (component.type) {
      case 'sql':
        return 'sql'
      case 'python':
        return 'python'
      case 'trilogy':
      default:
        return 'preql'
    }
  }

  private getRemoteEditorPath(component: ComponentData): string {
    const editorType = this.getComponentEditorType(component)

    if (component.name?.trim()) {
      return normalizeRemoteEditorPath(component.name, editorType)
    }

    if (component.url?.trim()) {
      try {
        const componentUrl = new URL(component.url)
        const fileName = decodeURIComponent(
          componentUrl.pathname.split('/').filter(Boolean).pop() || '',
        )
        return normalizeRemoteEditorPath(fileName, editorType)
      } catch {
        return normalizeRemoteEditorPath(component.url, editorType)
      }
    }

    return normalizeRemoteEditorPath('untitled', editorType)
  }

  private resolveRemotePath(
    component: ComponentData,
    remoteBaseUrl?: string | null,
  ): string | null {
    if (component.name?.trim()) {
      return this.getRemoteEditorPath(component)
    }

    if (!remoteBaseUrl) {
      return null
    }

    try {
      const normalizedBaseUrl = `${normalizeGenericStoreBaseUrl(remoteBaseUrl)}/`
      const baseUrl = new URL(normalizedBaseUrl)
      const componentUrl = new URL(component.url, baseUrl)

      if (
        componentUrl.origin !== baseUrl.origin ||
        !componentUrl.pathname.startsWith(baseUrl.pathname)
      ) {
        return null
      }

      const relativePath = componentUrl.pathname.slice(baseUrl.pathname.length)
      return decodeURIComponent(relativePath)
    } catch {
      return null
    }
  }

  private createOrUpdateEditor(
    component: ComponentData,
    connectionName: string,
    options: ModelImportOptions = {},
  ): Editor {
    const remotePath = options.remote
      ? this.resolveRemotePath(component, options.remoteBaseUrl)
      : null
    const editorName = options.remote ? remotePath || component.name : component.name
    const editorType = this.getComponentEditorType(component)

    let editor: Editor
    if (options.remote && options.remoteStoreId) {
      const path = remotePath || editorName
      editor = reconcileRemoteEditor(this.editorStore, {
        id: `remote:${options.remoteStoreId}:${encodeURIComponent(path)}`,
        name: editorName,
        type: editorType,
        connection: connectionName,
        contents: component.content,
        tags: [],
        remoteStoreId: options.remoteStoreId,
        remotePath: path,
      })
    } else {
      // Manifest imports always produce local editors; ignore any remote
      // editor that happens to share a name + connection so we don't
      // accidentally overwrite remote-store contents from a local import.
      const existing = Object.values(this.editorStore.editors).find(
        (e) =>
          e.name === editorName && e.connection === connectionName && e.storage !== 'remote',
      )
      if (existing) {
        editor = existing
        this.editorStore.setEditorContents(existing.id, component.content)
      } else {
        editor = this.editorStore.newEditor(
          editorName,
          editorType,
          connectionName,
          component.content,
        )
      }
    }

    // Add purpose as a tag if not already present
    if (component.purpose && !editor.tags.includes(component.purpose)) {
      this.editorStore.editors[editor.id].tags.push(component.purpose)
    }

    return editor
  }

  /**
   * Creates or updates a dashboard
   */
  private createOrUpdateDashboard(
    component: ComponentData,
    connectionName: string,
    dashboards: Map<string, string>,
  ): void {
    if (!component.content) {
      console.warn(`Dashboard ${component.name} has no content, skipping`)
      return
    }

    try {
      const dashboardObj = DashboardModel.fromSerialized(JSON.parse(component.content))

      // Configure dashboard properties
      dashboardObj.storage = 'local'
      dashboardObj.connection = connectionName
      dashboardObj.connectionId = computeConnectionId({ name: connectionName, storage: 'local' })
      dashboardObj.state = 'published'

      // Resolve each import to a local editor ID. Manifest imports only ever
      // create local editors, so a remote-origin editor that happens to share
      // the same name + connection must not be referenced here.
      dashboardObj.imports = dashboardObj.imports.map((imp) => ({
        ...imp,
        id:
          this.editorStore.editorList.find(
            (e) =>
              e.name === imp.name &&
              e.connection === connectionName &&
              e.storage !== 'remote',
          )?.id || '',
      }))

      // Same scoping for the existing-dashboard lookup: a remote dashboard
      // sharing the name shouldn't be overwritten by a local manifest import.
      const existingDashboard = Object.values(this.dashboardStore.dashboards).find(
        (dashboard) =>
          dashboard.name === dashboardObj.name &&
          dashboard.connection === connectionName &&
          dashboard.storage !== 'remote',
      )

      if (existingDashboard) {
        // Update existing dashboard
        dashboardObj.id = existingDashboard.id
        this.dashboardStore.dashboards[existingDashboard.id] = dashboardObj
      } else {
        // Create new dashboard
        dashboardObj.id = Math.random().toString(36).substring(2, 15)
        this.dashboardStore.addDashboard(dashboardObj)
      }

      dashboards.set(component.name, dashboardObj.id)
    } catch (error) {
      console.error(`Error importing dashboard ${component.name}:`, error)
    }
  }

  /**
   * Imports a model from a URL and creates editors for its components
   * @param modelName Name of the model to create
   * @param importAddress URL to import the model from
   * @param connectionName Connection name to associate with the model
   * @returns Promise resolving when import is complete
   */
  public async importModel(
    modelName: string,
    importAddress: string,
    connectionName: string,
    options: ModelImportOptions = {},
  ): Promise<ImportOutput | null> {
    if (!importAddress) {
      return null
    }

    const dashboards = new Map<string, string>()
    const sql = new Map<string, string>()
    const trilogy = new Map<string, string>()
    const python = new Map<string, string>()

    try {
      const modelImportBase = await this.fetchModelImportBase(importAddress, options.token)
      const components = await this.fetchModelImports(modelImportBase, options.token)

      // Separate components by type
      const editorComponents = components.filter(
        (c) => c.type === 'sql' || c.type === 'trilogy' || c.type === 'python',
      )
      const dashboardComponents = components.filter((c) => c.type === 'dashboard')

      // Phase 1: Create/update all editors first
      const modelSources: ModelSource[] = []

      for (const component of editorComponents) {
        console.log(`Processing editor: ${component.name}`)

        const editor = this.createOrUpdateEditor(component, connectionName, options)

        // Track components by type — values are editor IDs so callers can
        // index editorStore.editors directly without a fragile name lookup.
        if (component.type === 'sql') {
          sql.set(component.name, editor.id)
        } else if (component.type === 'trilogy') {
          trilogy.set(component.name, editor.id)
          // Only trilogy components become model sources
          modelSources.push(new ModelSource(editor.id, component.alias || component.name, [], []))
        } else if (component.type === 'python') {
          python.set(component.name, editor.id)
        }
      }

      // Phase 2: Create/update dashboards (now that all editor IDs are available)
      for (const component of dashboardComponents) {
        console.log(`Processing dashboard: ${component.name}`)
        this.createOrUpdateDashboard(component, connectionName, dashboards)
      }

      // Update model sources
      this.modelStore.models[modelName].sources = modelSources
      this.modelStore.models[modelName].storage = options.remote ? 'remote' : 'local'
      this.modelStore.models[modelName].changed = true

      return {
        dashboards,
        sql,
        trilogy,
        python,
      }
    } catch (error) {
      console.error('Error importing model:', error)
      throw new Error(`Failed to import model definition: ${error}`)
    }
  }
}
