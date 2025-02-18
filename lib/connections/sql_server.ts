// import BaseConnection from "./base";
// import { Results, ColumnType } from "../editors/results";
// import { Connection, Request } from 'tedious'

// export default class SQLServerConnection extends BaseConnection {

//     private connection: Connection | null;
//     private username: string;
//     private password: string;

//     constructor(name: string, username: string, password: string, model?: string) {
//         super(name, 'sqlserver', false, model)
//         this.username = username;
//         this.password = password;
//         this.query_type = 'sql_server';
//         this.connection = null;

//     }

//     toJSON(): object {
//         return {
//             name: this.name,
//             type: this.type,
//             model: this.model,
//             username: this.username,
//             password: this.password,
//         };
//     }

//     static fromJSON(fields: { name: string; username: string, password: string, model: string | null }): SQLServerConnectionn {
//         let base = new SQLServerConnection(fields.name, fields.username, fields.password);
//         if (fields.model) {
//             base.model = fields.model;
//         }
//         return base;
//     }

//     async connect() {
//         const config = {
//             authentication: {
//                 type: 'default',
//                 options: {
//                     userName: this.username,
//                     password: this.password,
//                 }
//             },
//             // database: 'AdventureWorks2019',
//             server: 'localhost',
//             options: {
//                 localHost: 'localhost',
//                 port: 1433 // Default Port
//             }
//         }
//         this.connection = new Connection(config)
//         this.connection.connect(
//             (err) => {
//                 if (err) {
//                     console.error(err);
//                     this.connected = false;
//                     this.error = err.message;
//                     throw err;

//                 } else {
//                     console.log('Connected to SQL Server');
//                 }
//             }
//         )
//     }

//     // Example of a custom method for MotherDuck
//     async query(sql: string): Promise<Results> {
//         if (!this.connected || !this.connection) {
//             console.error(`Cannot execute query. ${this.name} is not connected.`);
//             throw new Error("Connection not established.");
//         }
//         let request = new Request(sql, (err, rowCount, rows) => {
//             if (err) {
//                 console.log(err)
//             }
//             return rows
//         });
//         const result = await this.connection.execSql(request);
//         console.log(result)
//         let headers = new Map(result.data.columnNames().map((header) => [header, { name: header, type: ColumnType.STRING, description: "" }],));
//         //rows are simple arrays of json objects
//         return new Results(headers, result.data.toRows());
//     }
// }
