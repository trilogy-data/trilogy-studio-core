<template>
    <div class="model-display">
        <h2 class="">Models</h2>
        <ul>
            <li v-for="(config, index) in modelConfigs" :key="index" class="mb-6 border rounded-lg p-4">
                <a class="header" :href="`#${config.name}`">{{ config.name }}</a>
            </li>
        </ul>
    </div>
</template>

<script lang="ts">
import { defineComponent, inject } from "vue";
import {
    ModelConfig,
    ModelParseResults,
    Datasource,
    Concept,
    DataType,
    Purpose,
} from "../models"; // Adjust the import path
import type { ModelConfigStoreType } from "../stores/modelStore";
export default defineComponent({
    name: "ModelConfigViewer",
    setup() {
        const modelStore = inject<ModelConfigStoreType>('modelStore');
        if (!modelStore) {
            throw new Error('Model store is not provided!');
        }
        return { modelStore }
    },
    data() {
        return {
        };
    },
    computed: {
        modelConfigs(): Record<string, ModelConfig> {
            console.log(this.modelStore.models);
            return this.modelStore.models;
        },
    },
    methods: {
        fetchParseResults(model: string) {
            const mockParseResults = new ModelParseResults(
                [
                    new Concept(
                        "concept3",
                        "Concept 3",
                        "namespace3",
                        DataType.BOOL,
                        Purpose.PROPERTY
                    ),
                ],
                [new Datasource("Datasource C", "address-c", [], [])]
            );
            this.modelStore.setModelConfigParseResults(model, mockParseResults);
        },
        addNewSource(model: string) {
            const newSource = `source${Math.random().toFixed(3).slice(2)}.sql`;
            this.modelConfigs[model].sources.push(newSource);
        },
    },
});
</script>

<style scoped>
.model-display {
    padding: 10px;
    margin: 0 auto;
}

.model-display ul {
    list-style: none;
    padding: 10px;
    margin-bottom: 1rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
}
</style>