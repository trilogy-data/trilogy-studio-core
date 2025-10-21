export interface ModelRoot {
  owner: string
  repo: string
  branch: string
  displayName?: string
}

export interface Component {
  url: string
  name?: string
  alias?: string
  purpose?: string
  type: 'sql' | 'dashboard' | 'trilogy'
}

export interface ModelFile {
  name: string
  description: string
  engine: string
  downloadUrl: string
  components: Component[]
  modelRoot?: ModelRoot // Add reference to which root this file belongs to
}

// Default model root
export const DEFAULT_MODEL_ROOT: ModelRoot = {
  owner: 'trilogy-data',
  repo: 'trilogy-public-models',
  branch: 'main',
  displayName: 'Trilogy Public Models'
}