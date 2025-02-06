// MotherDuckConnection.ts
import BaseConnection from "./base";
import { MDConnection } from '@motherduck/wasm-client';
import { SqlResult, ColumnType} from "./result";


export default class MotherDuckConnection extends BaseConnection {
    // private mdToken: string;
    private connection: MDConnection;

    constructor(name: string, mdToken: string) {
        super(name);
        // this.mdToken = mdToken;
        this.connection = MDConnection.create({
            mdToken: mdToken
        });
        this.connected = true;

    }

    // Example of a custom method for MotherDuck
    async query(sql: string): Promise<SqlResult> {
        if (!this.connected) {
            console.error(`Cannot execute query. ${this.name} is not connected.`);
            throw new Error("Connection not established.");
        }
        const result = await this.connection.evaluateQuery(sql);
        let headers = new Map(result.data.columnNames().map((header) => [header, { name: header, type: ColumnType.STRING, description:"" }],));
        return new SqlResult(headers, result.data.toRows());
    }
}