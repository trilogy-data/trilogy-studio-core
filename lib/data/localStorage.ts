import EditorInterface from "../editors/editor";
import { ModelConfig } from "../models";
import { BigQueryOauthConnection, DuckDBConnection, MotherDuckConnection } from "../connections";
import { reactive } from "vue";
import AbstractStorage from './storage'

export default class LocalStorage extends AbstractStorage {
    private editorStorageKey: string;
    private connectionStorageKey: string;
    private modelStorageKey: string
    public type: string;

    constructor(prefix: string = "") {
        super()
        this.editorStorageKey = prefix + "editors";
        this.connectionStorageKey = prefix + "connections";
        this.modelStorageKey = prefix + "modelConfig";
        this.type = 'local';
    }

    saveEditor(editor: EditorInterface): void {
        const editors = this.loadEditors();
        editors[editor.name] = editor;
        this.saveEditors(Object.values(editors));
    }

    saveEditors(editorsList: EditorInterface[]): void {
        localStorage.setItem(this.editorStorageKey, JSON.stringify(Object.values(editorsList).map((editor) => editor.toJSON())));
    }

    loadEditors(): Record<string, EditorInterface> {
        const storedData = localStorage.getItem(this.editorStorageKey);
        let raw = storedData ? JSON.parse(storedData) : [];
        // map the raw array to a Record<string, EditorInterface> with the editorInterface wrapped in reactive
        return raw.reduce((acc: Record<string, EditorInterface>, editor: EditorInterface) => {
            acc[editor.name] = reactive(EditorInterface.fromJSON(editor));
            acc[editor.name].storage = 'local';
            return acc;
        }, {});

    }
    deleteEditor(name: string): void {
        const editors = this.loadEditors();
        if (editors[name]) {
            delete editors[name];
            this.saveEditors(Object.values(editors));
        }
    }

    clearEditors(): void {
        localStorage.removeItem(this.editorStorageKey);
    }

    hasEditor(name: string): boolean {
        const editors = this.loadEditors();
        // any editor has the property name == name
        return Object.values(editors).some((editor) => editor.name === name);

    }

    saveConnections(connections: Array<BigQueryOauthConnection | DuckDBConnection | MotherDuckConnection>): void {
        localStorage.setItem(this.connectionStorageKey, JSON.stringify(connections));
    }

    loadConnections(): Record<string, BigQueryOauthConnection | DuckDBConnection | MotherDuckConnection> {
        const storedData = localStorage.getItem(this.connectionStorageKey);
        let raw = storedData ? JSON.parse(storedData) : [];
        // map raw into appropriate connection form using the connection.type field on the connection object
        return raw.reduce((acc: Record<string, BigQueryOauthConnection | DuckDBConnection | MotherDuckConnection >, connection: BigQueryOauthConnection | DuckDBConnection | MotherDuckConnection ) => {
            switch (connection.type) {
                case "bigquery-oauth":
                    // @ts-ignore
                    acc[connection.name] = reactive(BigQueryOauthConnection.fromJSON(connection));
                    break;
                case "duckdb":
                    // @ts-ignore
                    acc[connection.name] = reactive(DuckDBConnection.fromJSON(connection));
                    break;
                case "motherduck":
                    // @ts-ignore
                    acc[connection.name] = reactive(MotherDuckConnection.fromJSON(connection));
                    break;
                // case "sqlserver":
                //     // @ts-ignore
                //     acc[connection.name] = reactive(SQLServerConnection.fromJSON(connection));
                //     break;
                default:
                    break;
            }
            return acc;
        }, {});
    }

    deleteConnection(name: string): void {
        const connections = this.loadConnections();
        if (connections[name]) {
            delete connections[name];
            this.saveConnections(Object.values(connections));
        }
    }

    // model config storage

    loadModelConfig(): Record<string, ModelConfig> {
        const storedData = localStorage.getItem(this.modelStorageKey);
        let raw = storedData ? JSON.parse(storedData) : [];
        return raw.map((modelConfig: ModelConfig) => reactive(ModelConfig.fromJSON(modelConfig)));
    }

    saveModelConfig(modelConfig: ModelConfig[]): void {
        localStorage.setItem(this.modelStorageKey, JSON.stringify(modelConfig));
    }

    clearModelConfig(): void {
        localStorage.removeItem(this.modelStorageKey);
    }




}