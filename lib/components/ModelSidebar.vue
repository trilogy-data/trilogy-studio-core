<template>
    <div class="model-display">
        <h2 class="">Models</h2>
        <button @click="saveModels()">Save</button>
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
} from "../models"; // Adjust the import path
import type { ModelConfigStoreType } from "../stores/modelStore";
export default defineComponent({
    name: "ModelConfigViewer",
    setup() {
        const modelStore = inject<ModelConfigStoreType>('modelStore');
        const saveModels = inject('saveModels');
        if (!modelStore || !saveModels) {
            throw new Error('Model store is not provided!');
        }
        return { modelStore, saveModels }
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