import { Editor, EditorTag } from '../editors'
import { ModelImport } from './import'
import { ModelSource } from './model'
import { type EditorStoreType } from '../stores/editorStore'
import { type DashboardStoreType } from '../stores/dashboardStore'
import { type ModelConfigStoreType } from '../stores/modelStore'
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
    const content = await response.text()
    return JSON.parse(content)
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
  public async fetchModelImports(modelImport: ModelImport): Promise<
    {
      name: string
      alias: string
      purpose: EditorTag | null
      content: string
      type?: 'sql' | 'dashboard' | undefined
    }[]
  > {
    return Promise.all(
      modelImport.components.map(async (component) => {
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
            type: component.type as 'sql' | 'dashboard' | undefined,
          }
        } catch (error) {
          console.error(error)
          return {
            name: component.name,
            alias: component.alias,
            purpose: this.purposeToTag(component.purpose),
            content: '', // Return empty content on failure
          }
        }
      }),
    )
  }

  /**
   * Imports a model from a URL and creates editors for its components
   * @param modelName Name of the model to create
   * @param importAddress URL to import the model from
   * @param connectionName Connection name to associate with the model
   * @returns Promise resolving when import is complete
   */
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
  ): Promise<void> {
    if (!importAddress) {
      return
    }

    try {
      const modelImportBase = await this.fetchModelImportBase(importAddress)
      const data = await this.fetchModelImports(modelImportBase)

      // Process imported components
      //@ts-ignore
      this.modelStore.models[modelName].sources = data
        .map((response) => {
          // Handle dashboard imports
          if (response.type === 'dashboard' && response.content) {
            try {
              // Parse dashboard JSON
              const dashboardObj = JSON.parse(response.content)

              // Set storage to "local"
              dashboardObj.storage = 'local'

              // Set connection to the selected connection
              dashboardObj.connection = connectionName

              // Check if a dashboard with the same name already exists on this connection
              const existingDashboard = Object.values(this.dashboardStore.dashboards).find(
                (dashboard) =>
                  dashboard.name === dashboardObj.name && dashboard.connection === connectionName,
              )

              if (existingDashboard) {
                // Reuse the existing dashboard's ID
                dashboardObj.id = existingDashboard.id

                // Update the existing dashboard
                this.dashboardStore.dashboards[existingDashboard.id] = dashboardObj
              } else {
                // No existing dashboard found, generate a new ID
                dashboardObj.id = Math.random().toString(36).substring(2, 15)

                // Add it to dashboard store
                this.dashboardStore.addDashboard(dashboardObj)
              }

              // Return null as we don't need to create a model source for dashboards
              return null
            } catch (error) {
              console.error('Error importing dashboard:', error)
              return null
            }
          }

          // Handle non-dashboard components (SQL and trilogy files)
          let editorName = response.name
          // @ts-ignore
          let existing: Editor | undefined = Object.values(this.editorStore.editors).find(
            // @ts-ignore
            (editor) => editor.name === editorName && editor.connection === connectionName,
          )

          // Create or update the editor based on editorName
          let editor: Editor
          if (!existing || existing === undefined) {
            if (response.type === 'sql') {
              editor = this.editorStore.newEditor(
                editorName,
                'sql',
                connectionName,
                response.content,
              )
            } else {
              editor = this.editorStore.newEditor(
                editorName,
                'trilogy',
                connectionName,
                response.content,
              )
            }
          } else {
            // get the existing one from the filter list
            editor = existing
            this.editorStore.setEditorContents(existing.id, response.content)
          }

          // Add source as a tag
          if (
            response.purpose &&
            !this.editorStore.editors[editor.id].tags.includes(response.purpose)
          ) {
            this.editorStore.editors[editor.id].tags.push(response.purpose)
          }

          if (response.type === 'sql') {
            return null
          }

          return new ModelSource(editor.id, response.alias || response.name, [], [])
        })
        .filter((source) => source)

      // Mark changes
      this.modelStore.models[modelName].changed = true
    } catch (error) {
      console.error('Error importing model:', error)
      throw new Error('Failed to import model definition')
    }
  }
}
