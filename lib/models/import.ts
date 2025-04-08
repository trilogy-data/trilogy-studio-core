export class ImportFile {
  url: string
  name: string
  alias: string
  purpose: string
  type?: string | undefined

  constructor(url: string, name: string, alias: string, purpose: string) {
    this.url = url
    this.name = name
    this.alias = alias
    this.purpose = purpose
  }
}

export class ModelImport {
  name: string
  engine: string
  description: string
  link: string
  tags: string[]
  components: ImportFile[]

  constructor(
    name: string,
    engine: string,
    description: string,
    link: string,
    tags: string[] = [],
    components: ImportFile[] = [],
  ) {
    this.name = name
    this.engine = engine
    this.components = components
    this.description = description
    this.link = link
    this.tags = tags
  }
}
