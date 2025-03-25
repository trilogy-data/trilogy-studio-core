<template>
    <div class="view-container">
        <div v-if="selectedType === 'table' && selectedTableDetails" class="model-display">
            <ConnectionTable :table="selectedTableDetails" :database="selectedDatabase" :connectionName="selectedConnection" />
        </div>
    </div>
</template>

<style scoped>
.view-container {
    height: 100%;
    width:100%;
    overflow-y: scroll;
    background-color: var(--query-window-bg);
}
</style>

<script lang="ts">
import { defineComponent, inject, ref } from 'vue'
import type { ModelConfigStoreType } from '../stores/modelStore'
import type { ConnectionStoreType } from '../stores/connectionStore'
import ConnectionTable from './ConnectionTable.vue'
import { KeySeparator } from '../data/constants'
export default defineComponent({
    name: 'ConnectionView',
    props: {
        activeConnectionKey: {
            type: String,
            required: true,
        },
    },
    setup() {
        const sourceDetails = ref({
            name: '',
            alias: '',
        })

        const modelStore = inject<ModelConfigStoreType>('modelStore')
        const connectionStore = inject<ConnectionStoreType>('connectionStore')
        if (!modelStore || !connectionStore) {
            throw new Error('Missing store injection')
        }
        return {
            modelStore,
            connectionStore,
            sourceDetails,
        }
    },
    components: {
        ConnectionTable
    },
    computed: {
        selectedType() {
            let separatorCount = this.activeConnectionKey.split(KeySeparator).length
            if (separatorCount === 1) {
                return 'connection'
            } else if (separatorCount === 2) {
                return 'database'
            } else if (separatorCount === 3) {
                return 'table'
            }
        },
        selectedPath() {
            return this.activeConnectionKey.split(KeySeparator).slice(1)
        },
        selectedTable() {
            return this.activeConnectionKey.split(KeySeparator)[2]
        },
        selectedConnection() {
            return this.activeConnectionKey.split(KeySeparator)[0]
        },
        selectedDatabase() {
            return this.activeConnectionKey.split(KeySeparator)[1]
        },
        selectedTableDetails() {
            return this.connectionStore.connections[this.selectedConnection].getLocalTable(this.selectedDatabase, this.selectedTable)
        },
    },
    methods: {
        saveEditorsCall() {
            this.$emit('save-editors')
        },
    },
})
</script>