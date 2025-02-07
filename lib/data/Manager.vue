<template>
    <slot></slot>
</template>

<script lang="ts">
import IDE from "../views/IDE.vue";
import EditorStore from "./editors";
import ConnectionStore from './connections';
import QueryResolver from './resolver';
import { provide, PropType  } from 'vue';
export default {
    name: "ContextManager",
    components: {
        IDE,
    },
    props: {
        connectionStore: {
            type: Object as PropType<ReturnType<typeof ConnectionStore>>,
            required: true
        },
        editorStore: {
            type: Object as PropType<ReturnType<typeof EditorStore>>,
            required: true
        },
        trilogyResolver: {
            type: QueryResolver,
            required: true

        }
    },
    setup(props) {
        // provide('connections', props.connections);
        provide('editorStore', props.editorStore);
        provide('connectionStore', props.connectionStore);
        provide('trilogyResolver', props.trilogyResolver)
    },
    computed: {
    },
    data() {
        return {}

    }
};
</script>