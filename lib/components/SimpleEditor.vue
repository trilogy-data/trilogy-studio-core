<template>
    <div class="editor-container">
        <div class="menu-bar">
            <div class="menu-actions">
                <button v-if="editor.type !== 'sql'" class="action-item" @click="validateQuery">Parse</button>
                <button @click="editor.loading ? cancelQuery() : runQuery()" class="action-item"
                    :class="{ 'button-cancel': editor.loading }" data-testid="editor-run-button">
                    {{ editor.loading ? 'Cancel' : 'Test' }}
                </button>
            </div>
        </div>

        <div class="editor-content">
            <!-- Main editor pane -->
            <div ref="editorElement" class="monaco-editor"></div>
            
            <!-- Completion symbols pane (imported component) -->
            <SymbolsPane 
                :symbols="editor.completionSymbols || []" 
                @select-symbol="insertSymbol"
                ref="symbolsPane" 
            />
        </div>
        
        <div v-if="editor.error" class="error-message">{{ editor.error }}</div>
        <div v-if="lastOperation" class="results-summary">
            <div :class="['status-badge', lastOperation.success ? 'success' : 'error']">
                {{ lastOperation.success ? 'SUCCESS' : 'FAILED' }}
            </div>
            <div class="results-details">
                <div v-if="lastOperation.duration" class="timing">
                    {{ lastOperation.duration }}ms
                </div>
                <div v-if="lastOperation.rows !== undefined" class="row-count">
                    {{ lastOperation.rows }} {{ lastOperation.rows === 1 ? 'row' : 'rows' }}
                </div>
                <div v-if="lastOperation.type" class="operation-type">
                    {{ lastOperation.type }}
                </div>
            </div>
        </div>
    </div>
</template>

<script lang="ts">
import { defineComponent, ref, type PropType } from 'vue';
import * as monaco from 'monaco-editor';
import {
    configureEditorTheme,
    createMonacoEditor,
    getEditorText,
    setupEditorKeybindings,
    setEditorMarkers
} from '../monaco/editorHelpers';
import { EditorModel } from '../main';
import { Results } from '../editors/results';
import type { ConnectionStoreType } from '../stores/connectionStore';
import type QueryExecutionService from '../stores/queryExecutionService';
import type { Import } from '../stores/resolver';
import SymbolsPane, { type CompletionItem } from './SymbolsPane.vue';

interface OperationState {
    success: boolean;
    duration: number;
    rows?: number;
    type: string;
}

let globalEditor: monaco.editor.IStandaloneCodeEditor | null = null;

export default defineComponent({
    name: 'EnhancedEditor',
    components: {
        SymbolsPane
    },
    props: {
        onSave: {
            type: Function as PropType<(() => void) | null>,
            required: false,
            default: null
        },
        theme: {
            type: String,
            default: 'vs-dark'
        },
        initContent: {
            type: String,
            required: false,
            default: ''
        },
        connectionName: {
            type: String,
            required: true
        },
        imports: {
            type: Array as PropType<Import[]>,
            required: false,
            default: () => []
        }
    },

    inject: [
        'queryExecutionService',
        'connectionStore',
        'modelStore',
        'editorStore'
    ],

    data() {
        return {
            lastOperation: null as OperationState | null,
            editor: new EditorModel({
                name: 'My Query',
                type: 'trilogy',
                connection: this.connectionName,
                storage: 'local',
                contents: this.initContent,
            })
        };
    },

    mounted() {
        this.$nextTick(() => {
            this.createEditor();
            // Set up keyboard shortcut to focus on the symbol search box
            document.addEventListener('keydown', this.handleKeyboardShortcuts);
        });
    },

    beforeUnmount() {
        if (globalEditor) {
            globalEditor.dispose();
        }
        document.removeEventListener('keydown', this.handleKeyboardShortcuts);
    },

    methods: {
        createEditor(): void {
            // Configure the editor theme
            configureEditorTheme(this.theme === 'vs-dark' ? 'dark' : 'light');

            // Create the editor instance
            globalEditor = createMonacoEditor(this.$refs.editorElement as HTMLElement, {
                value: this.editor.contents || '',
                language: this.editor.type === 'sql' ? 'sql' : 'trilogy',
            });

            // Setup keyboard shortcuts and content change handler
            setupEditorKeybindings(globalEditor, {
                onValidate: () => this.validateQuery(),
                onRun: () => this.runQuery(),
            });
            
            // Add symbol insertion shortcut
            globalEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Space, () => {
                this.focusSymbolSearch();
            });
        },

        handleKeyboardShortcuts(event: KeyboardEvent): void {
            // Ctrl+Shift+O to focus on symbol search (mimicking VS Code)
            if (event.ctrlKey && event.shiftKey && event.key === 'O') {
                this.focusSymbolSearch();
                event.preventDefault();
            }
        },

        focusSymbolSearch(): void {
            const symbolsPane = this.$refs.symbolsPane as typeof SymbolsPane | undefined;
            if (symbolsPane && 'focusSearch' in symbolsPane) {
                (symbolsPane as any).focusSearch();
            }
        },

        insertSymbol(symbol: CompletionItem): void {
            if (!globalEditor) return;
            
            const position = globalEditor.getPosition();
            if (position && symbol.insertText) {
                globalEditor.executeEdits('', [
                    {
                        range: new monaco.Range(
                            position.lineNumber,
                            position.column,
                            position.lineNumber,
                            position.column
                        ),
                        text: symbol.insertText
                    }
                ]);
                globalEditor.focus();
            }
        },

        async validateQuery(showMarkers: boolean = true, sources: string[] = []): Promise<Import[]> {
            if (!globalEditor) return [];
            const connectionStore = this.connectionStore as ConnectionStoreType;
            const queryExecutionService = this.queryExecutionService as QueryExecutionService;

            try {
                this.editor.setError(null);
                const text = globalEditor.getValue();

                // Execute validation via injected service
                const conn = connectionStore.connections[this.editor.connection];
                const queryInput = {
                    text,
                    queryType: conn ? conn.query_type : '',
                    editorType: this.editor.type,
                    sources,
                    imports: []
                };

                const annotations = await queryExecutionService.validateQuery(
                    this.editor.connection,
                    queryInput
                );

                if (annotations && showMarkers) {
                    const model = globalEditor.getModel();
                    if (model) {
                        monaco.editor.setModelMarkers(model, 'owner', annotations.data.items || []);
                    }
                    if (annotations.data.completion_items) {
                        this.editor.completionSymbols = annotations.data.completion_items;
                    }
                }
                if (annotations) {
                    return annotations.data.imports;
                }
                return [];

            } catch (error) {
                // check if error is an Error
                if (error instanceof Error) {
                    this.editor.setError(error.message || 'Validation failed');
                }
                else {
                    this.editor.setError('Validation failed');
                }
                return [];
            }
        },

        async cancelQuery(): Promise<void> {
            if (this.editor.cancelCallback) {
                await this.editor.cancelCallback();
            }
            this.editor.loading = false;
        },

        async runQuery(): Promise<void> {
            this.$emit('query-started');
            this.editor.setError(null);
            let queryDone = false;
            const connectionStore = this.connectionStore as ConnectionStoreType;
            const queryExecutionService = this.queryExecutionService as QueryExecutionService;
            const monacoInstance = globalEditor;
            
            if (this.editor.loading || !monacoInstance) {
                return;
            }

            try {
                // Analytics tracking (unchanged)
                try {
                    // @ts-ignore
                    window.goatcounter && window.goatcounter.count({
                        path: 'studio-query-execution',
                        title: this.editor.type,
                        event: true,
                    });
                } catch (error) {
                    console.log(error);
                }

                // Set component to loading state
                this.editor.loading = true;

                // Prepare query input
                const conn = connectionStore.connections[this.editor.connection];

                // Get selected text or full content
                const text = getEditorText(monacoInstance, this.editor.contents);
                if (!text) {
                    this.editor.results = new Results(new Map(), []);
                    this.editor.loading = false;
                    return;
                }

                // Create query input object
                const queryInput = {
                    text,
                    queryType: conn ? conn.query_type : '',
                    editorType: this.editor.type,
                    imports: this.imports,
                };

                // Execute query
                const { resultPromise, cancellation } = await queryExecutionService.executeQuery(
                    this.editor.connection,
                    queryInput,
                    // Progress callback for connection issues
                    () => { },
                    (message: { error?: boolean; text?: string; running?: boolean }) => {
                        if (!queryDone && message.error) {
                            this.editor.loading = false;
                            if (message.text) {
                                this.editor.setError(message.text);
                            }
                        }
                        if (!queryDone && message.running) {
                            this.editor.error = null;
                            this.editor.loading = true;
                        }
                    },
                );

                // Handle cancellation callback
                this.editor.cancelCallback = () => {
                    if (cancellation.isActive()) {
                        cancellation.cancel();
                    }
                    this.editor.loading = false;
                    this.editor.cancelCallback = null;
                };

                const result = await resultPromise;
                queryDone = true;

                // Update lastOperation state
                this.lastOperation = {
                    success: result.success,
                    duration: result.executionTime,
                    rows: result.results?.data ? result.results?.data?.length : undefined,
                    type: this.editor.type
                };

                // Update component state based on result
                if (result.success) {
                    if (result.generatedSql) {
                        this.editor.generated_sql = result.generatedSql;
                    }
                    if (result.results) {
                        this.editor.results = result.results;
                        this.editor.duration = result.executionTime;
                    }
                    this.editor.executed = true;
                } else if (result.error) {
                    this.editor.setError(result.error);
                }
            } catch (error) {
                // check if error is an Error
                if (error instanceof Error) {
                    this.editor.setError(error.message || 'Query execution failed');
                }
                this.lastOperation = {
                    success: false,
                    duration: 0,
                    type: this.editor.type
                };

            } finally {
                // Reset loading state
                this.editor.loading = false;
                this.editor.cancelCallback = null;
                if (globalEditor) {
                    globalEditor.layout();
                }
            }
        },

        getContent(): string {
            if (globalEditor) {
                return globalEditor.getValue();
            }
            return this.editor.contents || '';
        }
    }
});
</script>

<style>
.editor-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    border: 1px solid var(--border-color, #444);
}

.menu-bar {
    background-color: var(--sidebar-bg, #252525);
    display: flex;
    padding: 0.25rem;
    justify-content: space-between;
    padding-right: 0.5rem;
    height: 40px;
}

.menu-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.15rem;
    align-items: center;
    flex-grow: 1;
}

.action-item {
    height: 25px;
    width: 80px;
    font-weight: 500;
    cursor: pointer;
    border-radius: 0px;
    border: 1px solid var(--border-color, #444);
    transition: background-color 0.3s ease, color 0.3s ease;
}

.editor-content {
    display: flex;
    flex-grow: 1;
    position: relative;
    min-height: 250px;
}

.monaco-editor {
    flex: 1;
    min-height: 250px;
    height: 100%;
}

.button-cancel {
    background-color: var(--error-color, #d32f2f);
    color: white;
    border: 1px solid var(--error-color, #d32f2f);
}

.error-message {
    background-color: rgba(211, 47, 47, 0.1);
    color: var(--error-color, #d32f2f);
    padding: 0.5rem;
    border-left: 3px solid var(--error-color, #d32f2f);
    margin-bottom: 0.5rem;
}

/* Results summary section */
.results-summary {
    display: flex;
    align-items: center;
    padding: 0.5rem;
    border-top: 1px solid var(--border-color, #444);
    font-size: 0.85rem;
    background-color: var(--sidebar-bg, #252525);
    gap: 0.5rem;
}

.status-badge {
    font-weight: bold;
    padding: 0.25rem 0.5rem;
    border-radius: 3px;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.status-badge.success {
    background-color: rgba(76, 175, 80, 0.2);
    color: #4caf50;
    border: 1px solid rgba(76, 175, 80, 0.5);
}

.status-badge.error {
    background-color: rgba(211, 47, 47, 0.2);
    color: #f44336;
    border: 1px solid rgba(211, 47, 47, 0.5);
}

.results-details {
    display: flex;
    gap: 1rem;
    align-items: center;
    color: var(--text-subtle, #aaa);
}

.timing::before {
    content: "⏱️";
    margin-right: 0.25rem;
    font-size: 0.9em;
}

.row-count::before {
    content: "🔢";
    margin-right: 0.25rem;
    font-size: 0.9em;
}

.operation-type {
    font-style: italic;
}

@media screen and (max-width: 768px) {
    .editor-content {
        flex-direction: column;
    }
    
    .menu-bar {
        height: 60px;
        flex-direction: column;
    }

    .menu-actions {
        justify-content: center;
        width: 100%;
    }

    .action-item {
        flex-grow: 1;
        width: auto;
    }

    .results-summary {
        flex-direction: column;
        align-items: flex-start;
    }

    .results-details {
        flex-wrap: wrap;
        gap: 0.5rem;
    }
}
</style>