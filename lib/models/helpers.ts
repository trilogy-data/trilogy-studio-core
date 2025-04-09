import { Editor, EditorTag } from '../editors';
import { ModelImport } from './import';
import { ModelSource } from './model'

export class ModelImportService {
    private editorStore: any;
    private modelStore: any;

    constructor(editorStore: any, modelStore: any) {
        this.editorStore = editorStore;
        this.modelStore = modelStore;
    }

    /**
     * Fetches model import base definition from URL
     * @param url URL to fetch the model import definition from
     * @returns Promise resolving to ModelImport
     */
    public async fetchModelImportBase(url: string): Promise<ModelImport> {
        const response = await fetch(url);
        const content = await response.text();
        return JSON.parse(content);
    }

    /**
     * Converts purpose string to EditorTag
     * @param purpose Purpose string
     * @returns Corresponding EditorTag or null if no match
     */
    private purposeToTag(purpose: string): EditorTag | null {
        switch (purpose) {
            case 'source':
                return EditorTag.SOURCE;
            case 'setup':
                return EditorTag.STARTUP_SCRIPT;
            default:
                return null;
        }
    }

    /**
     * Fetches all components from a model import definition
     * @param modelImport Model import definition
     * @returns Promise resolving to array of component details
     */
    public async fetchModelImports(modelImport: ModelImport): Promise<
        {
            name: string;
            alias: string;
            purpose: EditorTag | null;
            content: string;
            type?: string | undefined;
        }[]
    > {
        return Promise.all(
            modelImport.components.map(async (component) => {
                try {
                    const response = await fetch(component.url);
                    if (!response.ok) {
                        throw new Error(`Failed to fetch ${component.url}: ${response.statusText}`);
                    }
                    const content = await response.text();
                    return {
                        name: component.name,
                        alias: component.alias,
                        purpose: this.purposeToTag(component.purpose),
                        content,
                        type: component.type,
                    };
                } catch (error) {
                    console.error(error);
                    return {
                        name: component.name,
                        alias: component.alias,
                        purpose: this.purposeToTag(component.purpose),
                        content: '', // Return empty content on failure
                    };
                }
            })
        );
    }

    /**
     * Imports a model from a URL and creates editors for its components
     * @param modelName Name of the model to create
     * @param importAddress URL to import the model from
     * @param connectionName Connection name to associate with the model
     * @returns Promise resolving when import is complete
     */
    public async importModel(modelName: string, importAddress: string, connectionName: string): Promise<void> {
        if (!importAddress) {
            return;
        }

        try {
            const modelImportBase = await this.fetchModelImportBase(importAddress);
            const data = await this.fetchModelImports(modelImportBase);

            // Create model sources from imported components
            this.modelStore.models[modelName].sources = data
                .map((response) => {
                    let editorName = response.name;
                    // @ts-ignore
                    let existing:Editor | undefined = Object.values(this.editorStore.editors).find(
                        // @ts-ignore
                        (editor) => editor.name === editorName && editor.connection === connectionName
                    );
                    // Create or update the editor based on editorName
                    let editor: Editor;
                    if (!existing || (existing === undefined)) {
                        if (response.type === 'sql') {
                            editor = this.editorStore.newEditor(editorName, 'sql', connectionName, response.content);
                        } else {
                            editor = this.editorStore.newEditor(editorName, 'trilogy', connectionName, response.content);
                        }
                    } else {
                        // get the existing one from the filter list
                        editor = existing;
                        this.editorStore.setEditorContents(existing.id, response.content);
                    }

                    // Add source as a tag
                    if (
                        response.purpose &&
                        !this.editorStore.editors[editor.id].tags.includes(response.purpose)
                    ) {
                        this.editorStore.editors[editor.id].tags.push(response.purpose);
                    }

                    if (response.type === 'sql') {
                        return null;
                    }

                    return new ModelSource(editor.id, response.alias || response.name, [], []);
                })
                .filter((source) => source);
        } catch (error) {
            console.error('Error importing model:', error);
            throw new Error('Failed to import model definition');
        }
    }
}