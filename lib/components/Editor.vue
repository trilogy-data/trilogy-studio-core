<template>
    <div ref="editor" id="editor" class="editor-fix-styles">
        <!-- <button class="absolute-button bottom-run" @onClick=runQuery>Run</button>
        <button class="absolute-button bottom-reset" >Reset Editor</button> -->
    </div>

</template>
<style scoped>
.editor-fix-styles {
    text-align: left;
    border: none;
    height: 100%;
    /* position: relative; */
}

.absolute-button {
    position: absolute;
    bottom: 16px;
    /* Distance from the bottom of the container */
    right: 16px;
    /* Distance from the right of the container */
    margin-top: 8px;
    /* Add space between the buttons */
    padding: 8px 16px;
    background-color: transparent;
    /* Transparent background */
    color: #007bff;
    border: 1px solid #007bff;
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 0.3s ease, color 0.3s ease;
    z-index: 99;
}

.bottom-run {
    bottom: 16px;
    right: 16px;
}

.bottom-reset {
    bottom: 16px;
    right: 100px;
}
</style>
<script lang="ts">
import { defineComponent, inject } from 'vue';

import * as monaco from 'monaco-editor';

import type { ConnectionStoreType } from '../stores/connectionStore.ts';
import type { EditorStoreType } from '../stores/editorStore.ts';
import type { ModelConfigStoreType } from '../stores/modelStore.ts';
import { Results } from '../editors/results'
import AxiosResolver from '../stores/resolver'
import type { ContentInput } from '../stores/resolver'

let editorMap: Map<string, monaco.editor.IStandaloneCodeEditor> = new Map();
let mountedMap: Map<string, boolean> = new Map();

export default defineComponent({
    name: 'Editor',
    props: {
        context: {
            type: String,
            required: true
        },
        editorName: {
            type: String,
            required: true
        },
        connection: {
            type: Object,
            default: null
        },
        submitCallback: {
            type: Function,
            default: null
        },
        genAICallback: {
            type: Function,
            default: null
        },
        formatTextCallback: {
            type: Function,
            default: null
        },
        saveCallback: {
            type: Function,
            default: null
        },
        y: {
            type: Number,
            default: 400
        },
        x: {
            type: Number,
            default: 400
        }


    },
    data() {
        return {
            last_passed_query_text: null,
            form: null,
            prompt: '',
            generatingPrompt: false,
            info: 'Query processing...',
            // editor: null as monaco.editor.IStandaloneCodeEditor | null,
            // editorX: 400,
            // editorY: 400,

        }
    },
    components: {
    },
    setup() {

        const connectionStore = inject<ConnectionStoreType>('connectionStore');
        const editorStore = inject<EditorStoreType>('editorStore');
        const modelStore = inject<ModelConfigStoreType>('modelStore');
        const trilogyResolver = inject<AxiosResolver>('trilogyResolver');
        if (!editorStore || !connectionStore || !trilogyResolver || !modelStore) {
            throw new Error('Editor store and connection store and trilogy resolver are not provided!');
        }
        
        return { connectionStore, modelStore, editorStore, trilogyResolver };
    },
    mounted() {
        this.createEditor()
        mountedMap.set(this.context, true);
    },
    unmounted() {
        editorMap.get(this.context)?.dispose();
        mountedMap.delete(this.context);
    },
    computed: {
        prefersLight() {
            return window.matchMedia('(prefers-color-scheme: light)').matches;
        },
        editorData() {
            return this.editorStore.editors[this.editorName]
        },
        error() {
            return this.editorData.error
        },
        loading() {
            return this.editorData.loading
        },
        result() {
            return this.editorData.results
        },
        passedQuery() {
            return this.editorData.contents === this.last_passed_query_text
        },
        generateOverlayVisible() {
            return this.prompt.length > 1 || this.generatingPrompt
        },


    },
    watch: {
        editorName: {
            handler() {
                console.log('editorName changed')
                this.createEditor()
            },
        }
    },

    methods: {
        runQuery() {
            const editor = editorMap.get(this.context);
            if (this.loading) {
                return;
            }
            if (!editor) {
                return;
            }
            let conn = this.connectionStore.connections[this.editorData.connection];
            if (!conn) {
                this.editorData.setError(`Connection ${this.editorData.connection} not found.`);
                return;
            }

            var sources: ContentInput[] = [];
            if (conn.model) {
                sources = this.modelStore.models[conn.model].sources.map((source) => {
                    return {
                        alias: source.alias,
                        contents: this.editorStore.editors[source.editor].contents
                    }
                });
            }
            var selected: monaco.Selection | monaco.Range | null = editor.getSelection();
            var text: string;
            if (selected && !(selected.startColumn === selected.endColumn && selected.startLineNumber === selected.endLineNumber)) {
                text = editor.getModel()?.getValueInRange(selected) as string;

            }
            else {
                text = editor.getValue();
            }
            this.trilogyResolver.resolve_query(text, conn.type, this.editorData.type, sources).then((response) => {
                if (!response.data.generated_sql) {
                    this.editorStore.setEditorResults(this.editorName, new Results(new Map(), []))
                    return
                }
                conn.query(response.data.generated_sql).then((sql_response) => {
                    this.editorStore.setEditorResults(this.editorName, sql_response)
                }).catch((error) => {
                    this.editorData.setError(error.message);
                });
            }).catch((error: Error) => {
                this.editorData.setError(error.message);
            });
        },
        getEditor() {
            editorMap.get(this.editorName);
        },
        createEditor() {
            console.log('creating editor')
            let editorElement = document.getElementById('editor')
            if (!editorElement) {
                return
            }
            // if we've already set up the editor
            if (editorMap.has(this.context) && mountedMap.get(this.context)) {
                console.log('editor already exists')
                editorMap.get(this.context)?.setValue(this.editorData.contents)
                return
            }
            const editor = monaco.editor.create(editorElement, {
                value: this.editorData.contents,
                language: 'sql',
                automaticLayout: true,
            })
            editorMap.set(this.context, editor);
            editor.layout();
            monaco.editor.defineTheme('trilogyStudio', {
                base: this.prefersLight ? 'vs' : 'vs-dark', // can also be vs-dark or hc-black
                inherit: true, // can also be false to completely replace the builtin rules
                rules: [
                    { token: 'comment', foreground: 'ffa500', fontStyle: 'italic underline' },
                    { token: 'comment.js', foreground: '008800', fontStyle: 'bold' },
                    { token: 'comment.css', foreground: '0000ff' } // will inherit fontStyle from `comment` above
                ],
                colors: {
                    // 'editor.foreground': '#F8F8F8',
                    // 'editor.background': '#000000',
                    // 'editorCursor.foreground': '#8B0000',
                    // 'editor.lineHighlightBackground': '#0000FF20',
                    // 'editorLineNumber.foreground': '#008800',
                    // 'editor.selectionBackground': '#88000030',
                    // 'editor.inactiveSelectionBackground': '#88000015'
                }
            });
            monaco.editor.setTheme('trilogyStudio');
            editor.onDidChangeModelContent(() => {
                this.editorStore.setEditorContents(this.editorName, editor.getValue())
                console.log('changed')

                // this.$emit('update:contents', editor.getValue());
                // this.editorData.contents = editor.getValue();
            });


            editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
                this.runQuery();
            });
            if (this.genAICallback) {
                editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyG, () => {
                    if (!this.loading) {
                        this.genAICallback(editor.getValue());
                    }
                });
            }
            // if (this.formatTextCallback) {
            //     editor.addAction({
            //         id: 'format-preql',
            //         label: 'Format Trilogy',
            //         keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyI],
            //         run: function () {

            //             this.formatTextCallback(editor.getValue()).then((response) => {
            //                 editor.setValue(response)
            //             })
            //         }
            //     });
            // }
            editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
                this.$emit("save-editors");
            });


        }

    }
})
</script>