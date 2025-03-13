export class LineageItem {
  token: string
  depth: number
  link?: string

  constructor(token: string, depth: number, link?: string) {
    this.token = token
    this.depth = depth
    this.link = link
  }
}

export enum DataType {
  STRING = 'string',
  BOOL = 'bool',
  MAP = 'map',
  LIST = 'list',
  NUMBER = 'number',
  FLOAT = 'float',
  NUMERIC = 'numeric',
  INTEGER = 'int',
  BIGINT = 'bigint',
  DATE = 'date',
  DATETIME = 'datetime',
  TIMESTAMP = 'timestamp',
  ARRAY = 'array',
  DATE_PART = 'date_part',
  STRUCT = 'struct',
  NULL = 'null',
  UNIX_SECONDS = 'unix_seconds',
  UNKNOWN = 'unknown',
}

export class NumericType {
  precision: number
  scale: number

  constructor(precision: number = 20, scale: number = 5) {
    this.precision = precision
    this.scale = scale
  }

  get dataType(): DataType {
    return DataType.NUMERIC
  }

  get value(): string {
    return this.dataType
  }
}

export class ListType {
  type: DataType | ListType | MapType | NumericType | StructType

  constructor(type: DataType | ListType | MapType | NumericType | StructType) {
    this.type = type
  }

  toString(): string {
    return `ListType<${this.type}>`
  }

  get dataType(): DataType {
    return DataType.LIST
  }

  get value(): string {
    return this.dataType
  }
}

export class MapType {
  keyType: DataType
  valueType: DataType | ListType | MapType | NumericType | StructType

  constructor(
    keyType: DataType,
    valueType: DataType | ListType | MapType | NumericType | StructType,
  ) {
    this.keyType = keyType
    this.valueType = valueType
  }

  get dataType(): DataType {
    return DataType.MAP
  }

  get value(): string {
    return this.dataType
  }
}

export class StructType {
  fields: (DataType | ListType | MapType | NumericType | StructType)[]
  fieldsMap: Record<
    string,
    DataType | ListType | MapType | NumericType | StructType | number | string
  >

  constructor(
    fields: (DataType | ListType | MapType | NumericType | StructType)[],
    fieldsMap: Record<
      string,
      DataType | ListType | MapType | NumericType | StructType | number | string
    >,
  ) {
    this.fields = fields
    this.fieldsMap = fieldsMap
  }

  get dataType(): DataType {
    return DataType.STRUCT
  }

  get value(): string {
    return this.dataType
  }
}

export enum Purpose {
  KEY = 'key',
  PROPERTY = 'property',
  METRIC = 'metric',
}

export class Concept {
  address: string
  name: string
  namespace: string
  datatype: DataType | ListType | MapType | StructType
  purpose: Purpose
  description: string | null
  lineage: LineageItem[]
  keys: string[]

  constructor(
    address: string,
    name: string,
    namespace: string,
    datatype: DataType | ListType | MapType | StructType,
    purpose: Purpose,
    description?: string,
    lineage: LineageItem[] = [],
    keys: string[] = [],
  ) {
    this.address = address
    this.name = name
    this.namespace = namespace
    this.datatype = datatype
    this.purpose = purpose
    this.description = description || null
    this.lineage = lineage
    this.keys = keys
  }

  static fromJSON(data: any): Concept {
    return new Concept(
      data.address,
      data.name,
      data.namespace,
      data.datatype,
      data.purpose,
      data.description,
      data.lineage,
      data.keys,
    )
  }
}

export class Datasource {
  name: string
  address: string
  concepts: Concept[]
  grain: Concept[]

  constructor(name: string, address: string, concepts: Concept[], grain: Concept[]) {
    this.name = name
    this.address = address
    this.concepts = concepts
    this.grain = grain
  }

  static fromJSON(data: any): Datasource {
    return new Datasource(
      data.name,
      data.address,
      data.concepts.map((field: any) => Concept.fromJSON(field)),
      data.grain.map((field: any) => Concept.fromJSON(field)),
    )
  }
}

class ModelParseItem {
  alias: string
  concepts: Concept[]
  datasources: Datasource[]

  constructor(alias: string, concepts: Concept[], datasources: Datasource[]) {
    this.alias = alias
    this.concepts = concepts
    this.datasources = datasources
  }
  static fromJSON(data: any): ModelParseItem {
    return new ModelParseItem(
      data.alias,
      data.concepts.map((concept: any) => Concept.fromJSON(concept)),
      data.datasources.map((datasource: any) => Datasource.fromJSON(datasource)),
    )
  }
}
export class ModelParseResults {
  sources: ModelParseItem[]

  constructor(sources: ModelParseItem[]) {
    this.sources = sources
  }

  static fromJSON(data: any): ModelParseResults {
    return new ModelParseResults(data.items.map((item: any) => ModelParseItem.fromJSON(item)))
  }
}

export class ModelSource {
  editor: string
  alias: string
  concepts: Concept[]
  datasources: Datasource[]

  constructor(editor: string, alias: string, concepts: Concept[], datasources: Datasource[]) {
    this.editor = editor
    this.alias = alias
    this.concepts = concepts || []
    this.datasources = datasources || []
  }

  static fromJSON(source: any): ModelSource {
    return new ModelSource(
      source.editor,
      source.alias,
      (source.concepts || []).map(
        (concept: any) =>
          new Concept(
            concept.address,
            concept.name,
            concept.namespace,
            concept.datatype,
            concept.purpose,
            concept.description,
            concept.lineage,
          ),
      ),
      (source.datasources || []).map(
        (datasource: any) =>
          new Datasource(
            datasource.name,
            datasource.address,
            //
            datasource.concepts,
            datasource.grain,
          ),
      ),
    )
  }
}

export class ModelConfig {
  name: string
  storage: string
  sources: ModelSource[]
  // parseResults: ModelParseResults | null = null
  parseError: string | null = null
  changed: boolean = true

  constructor({
    name,
    sources,
    storage,
  }: {
    name: string
    sources: ModelSource[]
    storage: string
  }) {
    this.name = name
    this.sources = sources
    this.storage = storage
    // this.parseResults = parseResults
    this.changed = true
  }

  setParseResults(parseResults: ModelParseResults) {
    //for each source, if
    this.changed = true
    this.parseError = null
    // for each source, zip in results based on alias
    for (let source of this.sources) {
      let result = parseResults.sources.find((item) => item.alias === source.alias)
      if (result) {
        source.concepts = result.concepts
        source.datasources = result.datasources
      } else {
        this.parseError = `No parse results found for source ${source.alias}`
      }
    }
  }

  setSources(sources: ModelSource[]) {
    this.sources = sources
    this.changed = true
  }

  addModelSource(source: ModelSource) {
    //check if address already exists
    let existing = this.sources.find((s) => s.alias === source.alias)
    if (existing) {
      if (existing.editor === source.editor) {
        return true
      }
      throw new Error(`Alias ${source.alias} already exists`)
    }
    this.sources.push(source)
    this.changed = true
  }
  addModelSourceSimple(editor: string, alias: string) {
    this.addModelSource(new ModelSource(editor, alias, [], []))
  }

  setParseError(parseError: string) {
    this.parseError = parseError
    this.changed = true
  }

  static fromJSON(data: any): ModelConfig {
    let base = new ModelConfig({
      name: data.name,
      storage: data.storage,
      // map sources to fromJSON

      sources: data.sources.map((source: any) => ModelSource.fromJSON(source)),
      // parseResults: data.parseResults ? ModelParseResults.fromJSON(data.parseResults) : null,
    })
    base.changed = false
    return base
  }
}
