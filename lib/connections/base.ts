// BaseConnection.ts
import { SqlResult, ColumnType } from "./result";
export default abstract class BaseConnection {
    name: string;
    connected: boolean;

    constructor(name: string) {
        this.name = name;
        this.connected = false; // Default to disconnected
    }

    abstract query(sql: string): Promise<SqlResult>;
}
