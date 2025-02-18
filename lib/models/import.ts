export class ImportFile {
  url: string
  name: string
  alias: string
  purpose: string

  constructor(url: string, name: string, alias: string, purpose: string) {
    this.url = url
    this.name = name
    this.alias = alias
    this.purpose = purpose
  }
}

export class ModelImport {
  name: string
  components: ImportFile[]

  constructor(name: string, components: ImportFile[]) {
    this.name = name
    this.components = components
  }
}
