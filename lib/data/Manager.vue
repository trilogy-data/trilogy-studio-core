<template>
    <IDE :editors="editors" :activeEditor="activeEditor"></IDE>
</template>

<script>
import IDE from "../ide/IDE.vue";
import EditorModel from "../models/editor.ts";
export default {
    name: "IDEContextManager",
    components: {
        IDE,
    },
    data() {
        const editor1 = new EditorModel(
            { name: "Test Editor", type: "text", connection: "test-connection", contents: 'select 1' },

        )

        const editor2 = new EditorModel(
            { name: "Test Editor 2", type: "text", connection: "test-connection", contents: 'select 1'  },

        )

        return {
            editors: [
                editor1,
                editor2
            ],
            activeEditor: "Test Editor", // Currently active editor
        };
    },
    methods: {
        // Sets the currently active editor
        setActiveEditor(editor) {
            this.activeEditor = editor;
        },
    },
};
</script>