<template>
    <div class="editor-wrapper pa-0 ba-0">
        <div class="editor-entry" ref="editor">
            <slot name="editor"></slot>
        </div>
        <div class="editor-results editor-color" ref="results">
            <slot name="results"></slot>
        </div>
    </div>
</template>

<style>
.editor-wrapper {
    display: flex;
    flex-direction: column;
    flex-wrap: nowrap;
    /* flex: 1 1 100%; */
    height: 100%;
    background-color: var(--main-bg-color);
}

.editor-entry {
    display: flex;
    flex-direction: column;
    flex-wrap: nowrap;
    /* flex: 1 1 calc(100%-60px); */
    height: calc(100% - 24px);
}

.editor-results {
    display: flex;
    flex-direction: column;
    flex-grow: 0;
    flex-shrink: 1;
    /* flex-wrap: wrap; */
    height: calc(100% - 24px);
}

.editor-color {
    background-color: var(--main-bg-color);
    filter: brightness(85%);
}
</style>
<script lang="ts">
import Split from 'split.js';
import { defineComponent, ref } from 'vue';



export default defineComponent({
    name: "VerticalSplitLayout",
    data() {
        return {
            loaded: false,  // Return data as an object inside a function
            editorX: 400,
            editorY: 400,
            split: null as Split.SplitInstance | null,
        };
    },
    setup() {
        const editor = ref(null);
        const results = ref(null);

        return {
            editor,
            results
        }

    },
    mounted() {
        // @ts-ignore
        this.split = Split([this.$refs.editor, this.$refs.results], {
            direction: 'vertical',
            sizes: [60, 40],
            minSize: 200,
            expandToMin: true,
            gutterSize: 0
        });
    },
    methods: {
        // @ts-ignore
        resize(type, pane) { // @ts-ignore
            let editorPane = pane[0];

            // @ts-ignore
            var clientHeight = document.getElementById('editorPane').clientHeight;
            this.editorY = editorPane.size / 100.0 * clientHeight;
        },

    }
});
</script>