import BaseConnection from "./base";
import { Results, ColumnType } from "../editors/results";
import type { ResultColumn } from "../editors/results";


declare var google: any;


export default class BigQueryOauthConnection extends BaseConnection {
    // @ts-ignore
    private accessToken: string;
    private projectId: string;

    constructor(name: string, projectId: string , model?: string) {
        super(name, "bigquery-oauth", false), model;
        this.projectId = projectId;
        this.query_type = 'bigquery';
    }

    toJSON(): object {
        return {
            name: this.name,
            type: this.type,
            model: this.model,
            projectId: this.projectId,
        };
    }

    static fromJSON(fields: { name: string; projectId: string, model:string | null }): BigQueryOauthConnection {
        let base =  new BigQueryOauthConnection(fields.name, fields.projectId);
        if (fields.model) {
            base.model = fields.model;
        }
        return base;
    }
    async connect(): Promise<void> {
        let fun = this;
        try {
            // @ts-ignore
            const onTokenResponse = (response) => {
                fun.accessToken = response.access_token;
            }
            google.accounts.oauth2.initTokenClient({
                client_id: '734709568634-3u732kjmtp8e4bi6te0g7uo9278k104i.apps.googleusercontent.com',
                callback: onTokenResponse,
                // @ts-ignore
                error_callback: (error) => {
                    throw error;
                },
                scope: 'https://www.googleapis.com/auth/bigquery',
            }).requestAccessToken();

        } catch (error) {
            console.log("Error connecting to BigQuery with OAuth", error);
            throw error;
        }
    }

    async query(sql: string): Promise<Results> {
        if (!this.connected) {
            console.error(`Cannot execute query. ${this.name} is not connected.`);
            throw new Error("Connection not established.");
        }

        try {
            // Call BigQuery REST API directly
            const response = await fetch(
                `https://bigquery.googleapis.com/bigquery/v2/projects/${this.projectId}/queries`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${this.accessToken}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        query: sql,
                        useLegacySql: false, // Use standard SQL
                    }),
                }
            );

            if (!response.ok) {
                const errorResponse = await response.json();
                throw new Error(`BigQuery query failed: ${errorResponse.error.message}`);
            }

            const result = await response.json();
            // Map schema to headers
            const headers = new Map(
                result.schema.fields.map((field: any) => [
                    field.name,
                    {
                        name: field.name,
                        type: this.mapBigQueryTypeToColumnType(field.type),
                        description: "",
                    },
                ])
            ) as Map<string, ResultColumn>;
            // @ts-ignore
            const rows = result.rows.map((row) => {
                const rowData: Record<string, string | number | null> = {};
                // @ts-ignore
                row.f.forEach((fieldValue, index) => {
                    const columnName = result.schema.fields[index].name;
                    const value = fieldValue.v;

                    // Parse the value according to the column type
                    const columnType = result.schema.fields[index].type;
                    rowData[columnName] =
                        value === null
                            ? null
                            : columnType === "INTEGER"
                                ? parseInt(value, 10)
                                : columnType === "FLOAT"
                                    ? parseFloat(value)
                                    : value; // Default to string for other types
                });
                return rowData;
            });
            // Return results
            console.log(rows)
            return new Results(headers, rows);
        } catch (error) {
            throw error
        }
    }


    private mapBigQueryTypeToColumnType(type: string): ColumnType {
        switch (type.toLowerCase()) {
            case "string":
            case "bytes":
                return ColumnType.STRING;
            case "integer":
            case "int64":
                return ColumnType.INTEGER;
            case "float":
            case "float64":
                return ColumnType.FLOAT;
            case "boolean":
            case "bool":
                return ColumnType.BOOLEAN;
            case "timestamp":
            case "date":
            case "datetime":
            case "time":
                return ColumnType.DATE;
            default:
                return ColumnType.UNKNOWN;
        }
    }
}