// MotherDuckConnection.ts
import BaseConnection from "./base";
import { MDConnection } from '@motherduck/wasm-client';
import { Results, ColumnType } from "../editors/results";


export default class MotherDuckConnection extends BaseConnection {
    // @ts-ignore
    private connection: MDConnection;
    private mdToken: string;

    constructor(name: string, mdToken: string) {
        super(name, 'motherduck')
        this.mdToken = mdToken;

    }

    toJSON(): object {
        return {
            name: this.name,
            type: this.type,
            mdToken: this.mdToken,
        };
    }

    static fromJSON(fields: { name: string; mdToken: string, model:string | null }): MotherDuckConnection {
        let base = new MotherDuckConnection(fields.name, fields.mdToken);
        if (fields.model) {
            base.model = fields.model;
        }
        return base;
    }

    async connect() {
        this.connection = MDConnection.create({
            mdToken: this.mdToken
        });
    }

    // Example of a custom method for MotherDuck
    async query(sql: string): Promise<Results> {
        if (!this.connected) {
            console.error(`Cannot execute query. ${this.name} is not connected.`);
            throw new Error("Connection not established.");
        }
        const result = await this.connection.evaluateQuery(sql);
        let headers = new Map(result.data.columnNames().map((header) => [header, { name: header, type: ColumnType.STRING, description: "" }],));
        //rows are simple arrays of json objects
        return new Results(headers, result.data.toRows());
    }
}