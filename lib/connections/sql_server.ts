import BaseConnection from "./base";
import sql from 'mssql';
import { Results, ColumnType } from "../editors/results";


export default class SQLServerConnection extends BaseConnection {

    private connection: sql.Connection;
    private username: string;
    private password: string;

    constructor(name: string, username: string, password: string, model?: string) {
        super(name, 'sqlserver', true, model)
        this.username = username;
        this.password = password;
        this.query_type = 'sqlserver';

    }

    toJSON(): object {
        return {
            name: this.name,
            type: this.type,
            model: this.model,
            username: this.username,
            password: this.password,
        };
    }

    static fromJSON(fields: { name: string; username: string, password: string, model: string | null }): SQLServerConnectionn {
        let base = new SQLServerConnection(fields.name, fields.username, fields.password);
        if (fields.model) {
            base.model = fields.model;
        }
        return base;
    }

    async connect() {
        this.connection = await sql.connect({
            user: this.username,
            password: this.password,
            database: 'AdventureWorks2019',
            server: 'localhost',
            pool: {
                max: 10,
                min: 0,
                idleTimeoutMillis: 30000
            },
        }
        )
    }

    // Example of a custom method for MotherDuck
    async query(sql: string): Promise<Results> {
        if (!this.connected) {
            console.error(`Cannot execute query. ${this.name} is not connected.`);
            throw new Error("Connection not established.");
        }
        const result = await this.connection.query(sql);
        console.log(result);
        let headers = new Map(result.data.columnNames().map((header) => [header, { name: header, type: ColumnType.STRING, description: "" }],));
        //rows are simple arrays of json objects
        return new Results(headers, result.data.toRows());
    }
}