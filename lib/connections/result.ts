// Enum for column types
export enum ColumnType {
    STRING = "string",
    NUMBER = "number",
    BOOLEAN = "boolean",
    INTEGER = "integer",
    DATE = "date",
    FLOAT = "float",
    UNKNOWN = "unknown",

  }
  
export type ColumnDescription = {
    name: string; // Name of the column
    type: ColumnType; // Using the enum for type
    description?: string; // Optional description for the column
  };
  
  type Row = Readonly<Record<string, any>>; // Represents a row, with column names as keys
  
  export class SqlResult {
    headers: Map<string, ColumnDescription>;
    data:  readonly Row[];
  
    constructor(headers: Map<string, ColumnDescription>, data: readonly Row[]) {
      this.headers = headers;
      this.data = data;
    }

    // Pretty-print the result as a table
    printTable(): void {
      const headerKeys = Array.from(this.headers.keys());
      console.log(headerKeys.join("\t"));
  
      this.data.forEach((row) => {
        console.log(
          headerKeys.map((key) => (row[key] !== undefined ? row[key] : "NULL")).join("\t")
        );
      });
    }
  }
  

  