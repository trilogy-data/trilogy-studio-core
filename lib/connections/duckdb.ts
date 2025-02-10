import * as duckdb from '@duckdb/duckdb-wasm';
import duckdb_wasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import mvp_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import duckdb_wasm_eh from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import eh_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';
import BaseConnection from "./base";
import { Results, ColumnType } from '../editors/results'
import type { ResultColumn } from '../editors/results'

const MANUAL_BUNDLES: duckdb.DuckDBBundles = {
    mvp: {
        mainModule: duckdb_wasm,
        mainWorker: mvp_worker,
    },
    eh: {
        mainModule: duckdb_wasm_eh,
        mainWorker: eh_worker,
    },
};

async function createDuckDB() {
    const bundle = await duckdb.selectBundle(MANUAL_BUNDLES);
    // Instantiate the asynchronus version of DuckDB-wasm
    const worker = new Worker(bundle.mainWorker!);
    const logger = new duckdb.ConsoleLogger();
    const db = new duckdb.AsyncDuckDB(logger, worker);
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker)
    return await db.connect()
}

export default class DuckDBConnection extends BaseConnection {
    // @ts-ignore
    private connection: duckdb.AsyncDuckDBConnection;
    static fromJSON(fields: { name: string; }): DuckDBConnection {
        return new DuckDBConnection(fields.name);
    }

    toJSON(): object {
        return {
            name: this.name,
            type: this.type,
        };
    }

    async connect() {
        return createDuckDB().then((conn) => {
            this.connection = conn
        });
    }

    constructor(name: string,) {
        super(name, 'duckdb');
    }

    // Example of a custom method for MotherDuck
    async query(sql: string): Promise<Results> {
        if (!this.connected) {
            console.error(`Cannot execute query. ${this.name} is not connected.`);
            throw new Error("Connection not established.");
        }
        if (!sql) { throw new Error("Query is empty."); }
        const result = await this.connection.query(sql);
        // Map headers (columns) from the result schema
        const schema = result.schema.fields; // Assuming `fields` is the column metadata
        const headers = new Map<string, ResultColumn>();

        schema.forEach((field: any) => {
            headers.set(field.name, {
                name: field.name,
                type: this.mapDuckDBTypeToColumnType(field.type),
                description: "", // Add a description if necessary
            });
        });

        // Map data rows
        const data = result.toArray().map((row) => row.toJSON());
        // Return the SqlResult
        return new Results(headers, data);
    }

    // Helper to map DuckDB column types to your ColumnType enum
    private mapDuckDBTypeToColumnType(duckDBType: string): ColumnType {
        switch (duckDBType) {
            case "VARCHAR":
                return ColumnType.STRING;
            case "INT32":
            case "INT64":
                return ColumnType.INTEGER;
            case "FLOAT":
            case "DOUBLE":
                return ColumnType.FLOAT;
            case "BOOLEAN":
                return ColumnType.BOOLEAN;
            default:
                return ColumnType.UNKNOWN; // Use a fallback if necessary
        }
    }
}

