import BaseConnection from "./base";
import sql from 'mssql';
import { Results, ColumnType } from "../editors/results";


export default class SQLServerConnection extends BaseConnection {

    private connection: sql.ConnectionPool | null;
    private username: string;
    private password: string;

    constructor(name: string, username: string, password: string, model?: string) {
        super(name, 'sqlserver', false, model)
        this.username = username;
        this.password = password;
        this.query_type = 'sqlserver';
        this.connection = null;

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
        const config = {
            user: this.username,
            password: this.password,
            database: 'AdventureWorks2019',
            server: '127.0.0.1',
        }
        this.connection = await sql.connect(
            config
        )
    }

    // Example of a custom method for MotherDuck
    async query(sql: string): Promise<Results> {
        if (!this.connected || !this.connection) {
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