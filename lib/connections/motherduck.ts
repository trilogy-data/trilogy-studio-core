// MotherDuckConnection.ts
import BaseConnection from "./base";
import { MDConnection } from '@motherduck/wasm-client';
import { Results, ColumnType} from "../models/results";


export default class MotherDuckConnection extends BaseConnection {
    // private mdToken: string;
    private connection: MDConnection;

    constructor(name: string, mdToken: string) {
        super(name, 'motherduck')
        // this.mdToken = mdToken;
        this.connection = MDConnection.create({
            mdToken: mdToken
        });
        this.connected = true;
    }

    // Example of a custom method for MotherDuck
    async query(sql: string): Promise<Results> {
        if (!this.connected) {
            console.error(`Cannot execute query. ${this.name} is not connected.`);
            throw new Error("Connection not established.");
        }
        const result = await this.connection.evaluateQuery(sql);
        let headers = new Map(result.data.columnNames().map((header) => [header, { name: header, type: ColumnType.STRING, description:"" }],));
        return new Results(headers, result.data.toRows());
    }
}