// // BigQueryConnection.ts
// import BaseConnection from "./base";
// import { BigQuery } from "@google-cloud/bigquery";
// import { Results, ColumnType } from "../models/results";

// export default class BigQueryServiceConnection extends BaseConnection {
//     // @ts-ignore
//     private bigQueryClient: BigQuery;
//     private projectId: string;
//     private keyContents: string;

//     constructor(name: string, projectId: string, keyContents: string) {
//         super(name, 'bigquery');
//         this.projectId = projectId;
//         this.keyContents = keyContents;
//     }

//     async connect(): Promise<void> {
//         try {
//             this.bigQueryClient = new BigQuery({
//                 projectId: this.projectId,
//                 keyFilename: this.keyContents,
//             });
//             this.connected = true;
//         } catch (error) {
//             if (error instanceof Error) {
//                 console.error(`Failed to connect to BigQuery: ${error.message}`);
//             }
//             throw new Error("Connection to BigQuery could not be established.");
//         }
//     }

//     async query(sql: string): Promise<Results> {
//         if (!this.connected) {
//             console.error(`Cannot execute query. ${this.name} is not connected.`);
//             throw new Error("Connection not established.");
//         }

//         try {
//             const [rows, job] = await this.bigQueryClient.query({ query: sql });
//             const metadata = await job.getMetadata();
//             const schema = metadata[0].schema.fields;

//             // Convert schema to a headers map
//             const headers = new Map(
//                 schema.map((field) => [
//                     field.name,
//                     {
//                         name: field.name,
//                         type: this.mapBigQueryTypeToColumnType(field.type),
//                         description: field.description || "",
//                     },
//                 ])
//             );

//             return new Results(headers, rows);
//         } catch (error) {
//             if (error instanceof Error) {
//                 console.error(`Query execution failed: ${error.message}`);
//             }
//             throw error;
//         }
//     }

//     private mapBigQueryTypeToColumnType(type: string): ColumnType {
//         switch (type.toLowerCase()) {
//             case "string":
//             case "bytes":
//                 return ColumnType.STRING;
//             case "integer":
//             case "int64":
//                 return ColumnType.INTEGER;
//             case "float":
//             case "float64":
//                 return ColumnType.FLOAT;
//             case "boolean":
//             case "bool":
//                 return ColumnType.BOOLEAN;
//             case "timestamp":
//             case "date":
//             case "datetime":
//             case "time":
//                 return ColumnType.DATE;
//             default:
//                 return ColumnType.UNKNOWN;
//         }
//     }
// }