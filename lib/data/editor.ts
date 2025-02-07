import EditorInterface from "../models/editor";

export default class EditorLocalStorage {
    private storageKey: string;

    constructor(storageKey: string = "editors") {
        this.storageKey = storageKey;
    }

    /**
     * Save a single editor object to localStorage
     * @param editor The editor object to save
     */
    saveEditor(editor: EditorInterface): void {
        const editors = this.loadEditors();
        editors[editor.name] = editor;
        localStorage.setItem(this.storageKey, JSON.stringify(editors));
    }

    saveEditors(editorsList: EditorInterface[]): void {
        console.log('savinge ditors')
        localStorage.setItem(this.storageKey, JSON.stringify(editorsList));
    }


    /**
     * Load all editors from localStorage
     * @returns A record of all editor objects
     */
    loadEditors(): Record<string, EditorInterface> {
        const storedData = localStorage.getItem(this.storageKey);
        let raw = storedData ? JSON.parse(storedData) : [];
        console.log('loaded data')
        console.log(raw)
        return raw.map((editor: EditorInterface) => EditorInterface.fromJSON(editor));
    }

    /**
     * Load a specific editor by its name
     * @param name The name of the editor to load
     * @returns The editor object or null if it doesn't exist
     */
    loadEditor(name: string): EditorInterface | null {
        const editors = this.loadEditors();
        return editors[name] || null;
    }

    /**
     * Delete a specific editor by its name
     * @param name The name of the editor to delete
     */
    deleteEditor(name: string): void {
        const editors = this.loadEditors();
        if (editors[name]) {
            delete editors[name];
            localStorage.setItem(this.storageKey, JSON.stringify(editors));
        }
    }

    /**
     * Clear all editors from localStorage
     */
    clearEditors(): void {
        localStorage.removeItem(this.storageKey);
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