<template>
    <IDE :editors="editors" :activeEditor="activeEditor"></IDE>
</template>

<script>
import IDE from "../ide/IDE.vue";
import EditorModel from "../models/editor.ts";
import MotherDuckConnection from "../connections/motherduck.ts";
import { provide, defineProps, ref } from 'vue';
import { editor } from "monaco-editor";
export default {
    name: "IDEContextManager",
    components: {
        IDE,
    },
    props: {
        connectionStore: {
            type: Array,
            default: () => [],
        },
        editorStore: {
            type: Array,
            default: () => [],
        },
    },
    setup(props) {
        // provide('connections', props.connections);
        provide('editorStore', props.editorStore);
        provide('connectionStore', props.connectionStore);
    },
    computed: {
        editors() {
            return this.editorStore.editors;
        }
    },
    data() {

        // connection = MotherDuckConnection(
        //     'test-connection',

        // );

        return {
                // editors: [
                //     editor1,
                //     editor2
                // ],
            activeEditor: "Test Editor", // Currently active editor

        };
    },
    methods: {
        // Sets the currently active editor
        setActiveEditor(editor) {
            this.activeEditor = editor;
        },
    }
};
</script>