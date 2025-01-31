

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


export interface ResultColumn {
    name: string
    datatype: string
    // description: string
    purpose: string
}

export interface ResultsInterface {
    headers: Map<String,ResultColumn>
    data: Array<Object>
}

export class Results implements ResultsInterface {

    headers: Map<string,ResultColumn>
    data: Array<Object>

    constructor(data: Array<Array<any>>, headers: Map<string,ResultColumn>) {
        this.data = data
        this.headers = headers
    }
}