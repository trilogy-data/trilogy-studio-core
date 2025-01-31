<template>
    <div :key="editorData.name" ref="editor" id="editor" class="editor-fix-styles">
        <!-- <div id="editor" > </div> -->
    </div>
</template>
<style scoped>
.editor-fix-styles {
    text-align: left;
    border: none;
}
</style>
<script lang="ts">
import { defineComponent } from 'vue';
import Editor from '../models/editor'
import * as monaco from 'monaco-editor';

export default defineComponent({
    name: 'Editor',
    props: {
        editorData: {
            type: Editor,
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
        }

    },
    data() {
        return {
            last_passed_query_text: null,
            form: null,
            prompt: '',
            generatingPrompt: false,
            info: 'Query processing...',
            editor: null as monaco.IEditor | null,
            editorX: 400,
            editorY: 400,

        }
    },
    components: {
    },
    mounted() {
        this.createEditor()
    },
    computed: {
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
        }

    },
    methods: {
        createEditor() {
            console.log(this.submitCallback)
            let editorElement = document.getElementById('editor')
            if (!editorElement) {
                return
            }
            const editor = monaco.editor.create(editorElement, {
                value: this.editorData.contents,
                language: 'sql',
                automaticLayout: true,
            })
            this.editor = editor;
            // this.addMonacoEditor({ editor: editor, name: this.editorData.name })
            editor.layout({ height: 400, width:400 });
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
                this.editorData.contents = editor.getValue();
            });

            if (this.submitCallback) {
                editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
                    if (!this.loading) {
                        this.submitCallback(editor.getValue());
                    }
                });
            }
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
                        this.formatText(editor.getValue()).then((response) => {
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