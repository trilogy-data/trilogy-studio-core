import { Editor, EditorTag } from '../editors'
import { ModelImport } from './import'
import { ModelSource } from './model'
import { type EditorStoreType } from '../stores/editorStore'
import { type DashboardStoreType } from '../stores/dashboardStore'
import { type ModelConfigStoreType } from '../stores/modelStore'
import { DashboardModel } from '../dashboards'

export interface ImportOutput {
  dashboards: Map<string, string>
  sql: Map<string, string>
  trilogy: Map<string, string>
}

interface ComponentData {
  name: string
  alias: string
  purpose: EditorTag | null
  content: string
  type?: 'sql' | 'dashboard' | 'trilogy'
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

  /**
   * Fetches model import base definition from URL
   * @param url URL to fetch the model import definition from
   * @returns Promise resolving to ModelImport
   */
  public async fetchModelImportBase(url: string): Promise<ModelImport> {
    const response = await fetch(url)
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
  public async fetchModelImports(modelImport: ModelImport): Promise<ComponentData[]> {
    const results = await Promise.all(
      modelImport.components.map(async (component): Promise<ComponentData | null> => {
        if (component.purpose === 'data') {
          return null // Skip data type, not handled here
        }
        
        try {
          const response = await fetch(component.url)
          if (!response.ok) {
            throw new Error(`Failed to fetch ${component.url}: ${response.statusText}`)
          }
          const content = await response.text()
          return {
            name: component.name,
            alias: component.alias,
            purpose: this.purposeToTag(component.purpose),
            content,
            type: component.type as 'sql' | 'dashboard' | 'trilogy',
          }
        } catch (error) {
          console.error(`Error fetching component ${component.name}:`, error)
          return {
            name: component.name,
            alias: component.alias,
            purpose: this.purposeToTag(component.purpose),
            content: '', // Return empty content on failure
            type: component.type as 'sql' | 'dashboard' | 'trilogy',
          }
        }
      })
    )
    
    // Filter out null values after all promises resolve
    return results.filter((component): component is ComponentData => component !== null)
  }

  /**
   * Creates or updates an editor for a component
   */
  private createOrUpdateEditor(component: ComponentData, connectionName: string): Editor {
    const existing = Object.values(this.editorStore.editors).find(
      (editor) => editor.name === component.name && editor.connection === connectionName,
    )

    let editor: Editor
    if (!existing) {
      const editorType = component.type === 'sql' ? 'sql' : 'trilogy'
      editor = this.editorStore.newEditor(
        component.name,
        editorType,
        connectionName,
        component.content,
      )
    } else {
      editor = existing
      this.editorStore.setEditorContents(existing.id, component.content)
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
    dashboards: Map<string, string>
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
      dashboardObj.state = 'published'

      // Update imports with editor IDs
      dashboardObj.imports = dashboardObj.imports.map((imp) => ({
        ...imp,
        id: this.editorStore.editorList.find(
          (e) => e.name === imp.name && e.connection === connectionName
        )?.id
      }))

      // Check if dashboard already exists
      const existingDashboard = Object.values(this.dashboardStore.dashboards).find(
        (dashboard) =>
          dashboard.name === dashboardObj.name && dashboard.connection === connectionName,
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

      dashboards.set(component.name, dashboardObj.name)
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
  ): Promise<ImportOutput | null> {
    if (!importAddress) {
      return null
    }

    const dashboards = new Map<string, string>()
    const sql = new Map<string, string>()
    const trilogy = new Map<string, string>()

    try {
      const modelImportBase = await this.fetchModelImportBase(importAddress)
      const components = await this.fetchModelImports(modelImportBase)

      // Separate components by type
      const editorComponents = components.filter(c => c.type === 'sql' || c.type === 'trilogy')
      const dashboardComponents = components.filter(c => c.type === 'dashboard')

      // Phase 1: Create/update all editors first
      const modelSources: ModelSource[] = []
      
      for (const component of editorComponents) {
        console.log(`Processing editor: ${component.name}`)
        
        const editor = this.createOrUpdateEditor(component, connectionName)
        
        // Track components by type
        if (component.type === 'sql') {
          sql.set(component.name, component.name)
        } else if (component.type === 'trilogy') {
          trilogy.set(component.name, component.name)
          // Only trilogy components become model sources
          modelSources.push(new ModelSource(editor.id, component.alias || component.name, [], []))
        }
      }

      // Phase 2: Create/update dashboards (now that all editor IDs are available)
      for (const component of dashboardComponents) {
        console.log(`Processing dashboard: ${component.name}`)
        this.createOrUpdateDashboard(component, connectionName, dashboards)
      }

      // Update model sources
      this.modelStore.models[modelName].sources = modelSources
      this.modelStore.models[modelName].changed = true

      return {
        dashboards,
        sql,
        trilogy,
      }
    } catch (error) {
      console.error('Error importing model:', error)
      throw new Error(`Failed to import model definition: ${error}`)
    }
  }
}