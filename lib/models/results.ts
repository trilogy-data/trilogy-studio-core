

// class QueryOut(BaseModel):
//     connection: str
//     query: str
//     generated_sql: str
//     headers: list[str]
//     results: list[dict]
//     created_at: datetime = Field(default_factory=datetime.now)
//     refreshed_at: datetime = Field(default_factory=datetime.now)
//     duration: Optional[int]
//     columns: Mapping[str, QueryOutColumn] | None
// class QueryOutColumn(BaseModel):
//     name: str
//     datatype: DataType
//     purpose: Purpose

export enum ColumnType {
    STRING = "string",
    NUMBER = "number",
    BOOLEAN = "boolean",
    INTEGER = "integer",
    DATE = "date",
    FLOAT = "float",
    UNKNOWN = "unknown",

  }

type Row = Readonly<Record<string, any>>; // Represents a row, with column names as keys
  
export interface ResultColumn {
    name: string
    type: ColumnType
    description?: string
    // purpose: string
}

export interface ResultsInterface {
    headers: Map<String,ResultColumn>
    data:  readonly Row[];
}



export class Results implements ResultsInterface {

    headers: Map<string,ResultColumn>
    data:  readonly Row[];

    constructor(headers: Map<string,ResultColumn>, data: readonly Row[]) {
        this.data = data
        this.headers = headers
    }

    static fromJSON(json: string | Partial<ResultsInterface>): Results {
        const parsed: Partial<ResultsInterface> = typeof json === "string" ? JSON.parse(json) : json;
    
        // Parse headers
        const headers = new Map<string, ResultColumn>(
          Object.entries(parsed.headers || {}).map(([key, value]) => [
            key,
            {
              name: value.name || key,
              type: value.type || "unknown",
              description: value.description || "",
            },
          ])
        );
    
        // Parse data
        const data = parsed.data || [];
    
        return new Results(headers, data);
      }
}