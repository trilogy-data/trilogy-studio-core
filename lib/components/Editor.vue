<template>
    <div :key="editorName" ref="editor" id="editor" class="editor-fix-styles">
    </div>
</template>
<style scoped>
.editor-fix-styles {
    text-align: left;
    border: none;
    height: 100%;
}
</style>
<script lang="ts">
import { defineComponent, inject } from 'vue';

import * as monaco from 'monaco-editor';

import type {ConnectionStoreType} from '../stores/connectionStore.ts';
import type {EditorStoreType} from '../stores/editorStore.ts';
import AxiosResolver from '../stores/resolver.ts'

export default defineComponent({
    name: 'Editor',
    props: {
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
            editor: null as monaco.editor.IStandaloneCodeEditor | null,
            // editorX: 400,
            // editorY: 400,

        }
    },
    components: {
    },
    setup() {
        type ResolverType = typeof AxiosResolver;
        const connectionStore = inject<ConnectionStoreType>('connectionStore');
        const editorStore = inject<EditorStoreType>('editorStore');
        const trilogyResolver = inject<ResolverType>('trilogyResolver');
        if (!editorStore || !connectionStore || !trilogyResolver) {
            throw new Error('Editor store and connection store and trilogy resolver are not provided!');
        }

        return { connectionStore, editorStore, trilogyResolver };
    },
    mounted() {
        console.log('editor mounted')
        this.createEditor()
    },
    unmounted() {
        console.log('editor unmounted')
    },
    computed: {
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
    },

    methods: {
        getEditor() {
            return this.editor;
        },
        createEditor() {
            // let editorData = this.editorStore.editors[this.editorName]
            let editorElement = document.getElementById('editor')
            if (!editorElement) {
                return
            }
            // if we've already set up the editor
            if (this.editor) {
                return
            }
            const editor = monaco.editor.create(editorElement, {
                value: this.editorData.contents,
                language: 'sql',
                automaticLayout: true,
                height: '100%'
            })
            this.editor = editor;
            editor.layout();
            // this.addMonacoEditor({ editor: editor, name: this.editorData.name })
            // editor.layout({ height: this.y, width: this.x });
            monaco.editor.defineTheme('trilogyStudio', {
                base: 'vs-dark', // can also be vs-dark or hc-black
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
                // this.$emit('update:contents', editor.getValue());
                // this.editorData.contents = editor.getValue();
            });


            editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
                if (!this.loading) {
                    let conn = this.connectionStore.connections[this.editorData.connection];
                    this.trilogyResolver.resolve_query(editor.getValue(), conn.type, this.editorData.type).then((response) => {
                        conn.query(response.data.generated_sql).then((sql_response) => {
                            // console.log(response)
                            this.editorStore.setEditorResults(this.editorName, sql_response)
                            console.log(this.editorData.results)
                        }).catch((error) => {
                            console.error(error)
                            this.editorData.setError(error.message);
                            // this.editorData.results = null;
                        });
                    }).catch((error:Error) => {
                        console.error(error)
                        this.editorData.setError(error.message);
                        // this.editorData.results = null;
                    });
                }
            });
            if (this.genAICallback) {
                editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyG, () => {
                    if (!this.loading) {
                        this.genAICallback(editor.getValue());
                    }
                });
            }
            if (this.formatTextCallback) {
                editor.addAction({
                    id: 'format-preql',
                    label: 'Format Trilogy',
                    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyI],
                    run: function () {
                        this.formatTextCallback(editor.getValue()).then((response) => {
                            editor.setValue(response)
                        })
                    }
                });
            }

            if (this.saveCallback) {
                editor.addAction({
                    id: 'save-preql',
                    label: 'Save Trilogy',
                    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
                    run: function () {
                        this.saveCallback(editor.getValue())
                    }
                });
            }



        }

    }
})
</script>