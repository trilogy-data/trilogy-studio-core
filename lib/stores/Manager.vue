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
        storageSources: {
            type: Array,
            required: false,
            default: () => []
        },
    },
    setup(props) {
        // provide('connections', props.connections);
        provide('editorStore', props.editorStore);
        provide('connectionStore', props.connectionStore);
        provide('trilogyResolver', props.trilogyResolver)
        provide('storageSources', props.storageSources)
        for (let source of props.storageSources) {
            // @ts-ignore
            let editors = source.loadEditors();
            for (let editor of editors) {
                props.editorStore.addEditor(editor)
            }
        }
        for (let source of props.storageSources) {
            // @ts-ignore
            let connections = source.loadConnections();
            for (let connection of connections) {
                props.connectionStore.addConnection(connection)
            }
        }
        const saveEditors = () => {
            for (let source of props.storageSources) {
                // @ts-ignore
                source.saveEditors(Object.values(props.editorStore.editors).filter((editor) => editor.storage == source.type))
            }
        }
        const saveConnections= () => {
            for (let source of props.storageSources) {
                // @ts-ignore
                source.saveConnections(Object.values(props.connectionStore.connections).filter((connection) => connection.storage = source.type))
            }
        }
        provide('saveEditors', saveEditors,)
        provide('saveConnections', saveConnections,)
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