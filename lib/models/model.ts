export class LineageItem {
    token: string;
    depth: number;
    link?: string;

    constructor(token: string, depth: number, link?: string) {
        this.token = token;
        this.depth = depth;
        this.link = link;
    }
}

export enum DataType {
    STRING = "string",
    BOOL = "bool",
    MAP = "map",
    LIST = "list",
    NUMBER = "number",
    FLOAT = "float",
    NUMERIC = "numeric",
    INTEGER = "int",
    BIGINT = "bigint",
    DATE = "date",
    DATETIME = "datetime",
    TIMESTAMP = "timestamp",
    ARRAY = "array",
    DATE_PART = "date_part",
    STRUCT = "struct",
    NULL = "null",
    UNIX_SECONDS = "unix_seconds",
    UNKNOWN = "unknown",
}

export class NumericType {
    precision: number;
    scale: number;

    constructor(precision: number = 20, scale: number = 5) {
        this.precision = precision;
        this.scale = scale;
    }

    get dataType(): DataType {
        return DataType.NUMERIC;
    }

    get value(): string {
        return this.dataType;
    }
}

export class ListType {
    type: DataType | ListType | MapType | NumericType | StructType;

    constructor(type: DataType | ListType | MapType | NumericType | StructType) {
        this.type = type;
    }

    toString(): string {
        return `ListType<${this.type}>`;
    }

    get dataType(): DataType {
        return DataType.LIST;
    }

    get value(): string {
        return this.dataType;
    }
}

export class MapType {
    keyType: DataType;
    valueType: DataType | ListType | MapType | NumericType | StructType;

    constructor(
        keyType: DataType,
        valueType: DataType | ListType | MapType | NumericType | StructType
    ) {
        this.keyType = keyType;
        this.valueType = valueType;
    }

    get dataType(): DataType {
        return DataType.MAP;
    }

    get value(): string {
        return this.dataType;
    }
}

export class StructType {
    fields: (DataType | ListType | MapType | NumericType | StructType)[];
    fieldsMap: Record<string, DataType | ListType | MapType | NumericType | StructType | number | string>;

    constructor(
        fields: (DataType | ListType | MapType | NumericType | StructType)[],
        fieldsMap: Record<string, DataType | ListType | MapType | NumericType | StructType | number | string>
    ) {
        this.fields = fields;
        this.fieldsMap = fieldsMap;
    }

    get dataType(): DataType {
        return DataType.STRUCT;
    }

    get value(): string {
        return this.dataType;
    }
}

export enum Purpose {
    KEY = "key",
    PROPERTY = "property",
    METRIC = "metric",
}



export class Concept {
    address: string;
    name: string;
    namespace: string;
    datatype: DataType | ListType | MapType | StructType;
    purpose: Purpose;
    description: string | null;
    lineage: LineageItem[];

    constructor(
        address:string,
        name: string,
        namespace: string,
        datatype: DataType | ListType | MapType | StructType,
        purpose: Purpose,
        description?: string,
        lineage: LineageItem[] = []
    ) {
        this.address = address;
        this.name = name;
        this.namespace = namespace;
        this.datatype = datatype;
        this.purpose = purpose;
        this.description = description || null;
        this.lineage = lineage;
    }
}

export class Datasource {
    name: string;
    address: string;
    fields: Concept[];
    grain: Concept[];

    constructor(name: string, address: string, fields: Concept[], grain: Concept[]) {
        this.name = name;
        this.address = address;
        this.fields = fields;
        this.grain = grain;
    }
}

export class ModelParseResults {
    concepts: Concept[];
    datasources: Datasource[];

    constructor(concepts: Concept[], datasources: Datasource[]) {
        this.concepts = concepts
        this.datasources = datasources
    }

    static fromJSON(data: any): ModelParseResults {
        return new ModelParseResults(
            data.concepts.map((concept: any) => new Concept(
                concept.key,
                concept.name,
                concept.namespace,
                concept.datatype,
                concept.purpose,
                concept.description,
                concept.lineage
            )),
            data.datasources.map((datasource: any) => new Datasource(
                datasource.name,
                datasource.address,
                datasource.fields,
                datasource.grain
            ))
        );
    }
}


export class ModelSource {
    editor:string;
    alias:string;

    constructor(editor:string, alias:string) {
        this.editor = editor;
        this.alias = alias;
    }
}

export class ModelConfig {
    name: string;
    storage: string;
    sources: ModelSource[];
    parseResults: ModelParseResults | null = null;
    parseError: string | null = null;

    constructor({ name, sources, storage, parseResults = null }: { name: string, sources: ModelSource[], storage: string, parseResults: ModelParseResults | null }) {
        this.name = name;
        this.sources = sources;
        this.storage = storage;
        this.parseResults = parseResults;
    }

    static fromJSON(data: any): ModelConfig {
        return new ModelConfig({ name: data.name, storage: data.storage, sources: data.sources, parseResults: data.parseResults ? ModelParseResults.fromJSON(data.parseResults) : null });
    }

}
