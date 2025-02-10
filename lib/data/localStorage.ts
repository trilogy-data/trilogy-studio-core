import EditorInterface from "../models/editor";
import { BigQueryOauthConnection, DuckDBConnection, MotherDuckConnection } from "../connections";
import { reactive } from "vue";

export default class EditorLocalStorage {
    private editorStorageKey: string;
    private connectionStorageKey: string;

    constructor() {
        this.editorStorageKey = "editors";
        this.connectionStorageKey = "connections";
    }

    /**
     * Save a single editor object to localStorage
     * @param editor The editor object to save
     */
    saveEditor(editor: EditorInterface): void {
        const editors = this.loadEditors();
        editors[editor.name] = editor;
        localStorage.setItem(this.editorStorageKey, JSON.stringify(editors));
    }

    saveEditors(editorsList: EditorInterface[]): void {
        localStorage.setItem(this.editorStorageKey, JSON.stringify(editorsList));
    }


    /**
     * Load all editors from localStorage
     * @returns A record of all editor objects
     */
    loadEditors(): Record<string, EditorInterface> {
        const storedData = localStorage.getItem(this.editorStorageKey);
        let raw = storedData ? JSON.parse(storedData) : [];
        return raw.map((editor: EditorInterface) => reactive(EditorInterface.fromJSON(editor)));
    }

    saveConnections(connections: Record<string, BigQueryOauthConnection | DuckDBConnection | MotherDuckConnection>): void {
        localStorage.setItem(this.connectionStorageKey, JSON.stringify(Object.values(connections)));
    }

    loadConnections(): Record<string, BigQueryOauthConnection | DuckDBConnection | MotherDuckConnection> {
        const storedData = localStorage.getItem(this.connectionStorageKey);
        let raw = storedData ? JSON.parse(storedData) : [];
        // map raw into appropriate connection form using the connection.type field on the connection object

        return raw.map((connection) => {
            switch (connection.type) {
                case "bigquery":
                    return reactive(BigQueryOauthConnection.fromJSON(connection));
                case "duckdb":
                    return reactive(DuckDBConnection.fromJSON(connection));
                case "motherduck":
                    return reactive(MotherDuckConnection.fromJSON(connection));
                default:
                    throw new Error(`Unknown connection type: ${connection.type}`);
            }
        });
    }

    deleteConnection(name: string): void {
        const connections = this.loadConnections();
        if (connections[name]) {
            delete connections[name];
            localStorage.setItem(this.connectionStorageKey, JSON.stringify(connections));
        }
    }


    /**
     * Delete a specific editor by its name
     * @param name The name of the editor to delete
     */
    deleteEditor(name: string): void {
        const editors = this.loadEditors();
        if (editors[name]) {
            delete editors[name];
            localStorage.setItem(this.editorStorageKey, JSON.stringify(editors));
        }
    }

    /**
     * Clear all editors from localStorage
     */
    clearEditors(): void {
        localStorage.removeItem(this.editorStorageKey);
    }

    /**
     * Check if an editor exists in localStorage
     * @param name The name of the editor
     * @returns True if the editor exists, false otherwise
     */
    hasEditor(name: string): boolean {
        const editors = this.loadEditors();
        return name in editors;
    }
}