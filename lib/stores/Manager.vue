<template>
    <slot></slot>
</template>

<script lang="ts">
import IDE from "../views/IDE.vue";
import type {EditorStoreType} from './editorStore';
import type {ConnectionStoreType} from './connectionStore';
import QueryResolver from './resolver';
import { provide } from 'vue';
import type { PropType} from 'vue'
export default {
    name: "ContextManager",
    components: {
        IDE,
    },
    props: {
        connectionStore: {
            type: Object as PropType<ConnectionStoreType>,
            required: true
        },
        editorStore: {
            type: Object as PropType<EditorStoreType>,
            required: true
        },
        trilogyResolver: {
            type: QueryResolver,
            required: true

        },
        editorSources: {
            type: Array,
            required: false,
            default: () => []
        }
    },
    setup(props) {
        // provide('connections', props.connections);
        provide('editorStore', props.editorStore);
        provide('connectionStore', props.connectionStore);
        provide('trilogyResolver', props.trilogyResolver)
        provide('editorSources', props.editorSources)
        for (let source of props.editorSources) {
            let editors = source.loadEditors();
            for (let editor of editors) {
                props.editorStore.addEditor(editor)
            }
        }
        const saveEditors = () => {
            console.log('saving editors')
            for (let source of props.editorSources) {
                source.saveEditors(Object.values(props.editorStore.editors).filter((editor) => editor.type))
            }
        }
        provide('saveEditors', saveEditors)
    },
    computed: {
    },
    data() {
        return {}

    },
    methods: {

    }
};
</script>