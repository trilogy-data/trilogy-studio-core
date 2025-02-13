<template>
    <div class="lineage-container">
        <div v-for="(concept, conceptIndex) in config.concepts" :key="conceptIndex" class="concept-card">
            <div class="concept-header">
                <h4 class="concept-name">{{concept.namespace}}.{{ concept.name }}</h4>
                <p class="concept-info">
                    <strong>Datatype:</strong> {{ concept.datatype }} |
                    <strong>Purpose:</strong> {{ concept.purpose }}
                </p>
                <p v-if="concept.description" class="concept-description">{{ concept.description }}</p>
            </div>
            <div class="lineage-display" v-if="concept.lineage.length">
                <div class="lineage-path">
                    <div v-for="(step, stepIndex) in concept.lineage" :key="stepIndex" class="lineage-step">
                        <span class="lineage-token">{{ step.token }}</span>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import type { PropType } from 'vue';
interface LineageStep {
    token: string;
    depth: number;
    link: string | null;
}

interface Concept {
    address: string;
    name: string;
    namespace: string;
    datatype: string;
    purpose: string;
    description: string | null;
    lineage: LineageStep[];
}

interface Config {
    // name: string;
    concepts: Concept[];
    // rendered: string | null;
}

export default defineComponent({
    name: "ConceptLineage",
    props: {
        config: {
            type: Object as PropType<Config>,
            required: true,
        },
    },
});
</script>

<style scoped>
.lineage-container {
    padding: 5px;
    max-width: 800px;
    margin: 0 auto;
    font-family: Arial, sans-serif;
}

.title {
    text-align: center;
    font-size: 1.5rem;
    margin-bottom: 20px;
}

.concept-card {
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 20px;
    background-color: var(--sidebar-bg);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.concept-header {
    margin-bottom: 16px;
}

.concept-name {
    font-size: 1.2rem;
    font-weight: bold;
    margin: 5px;
}

.concept-info {
    font-size: 0.9rem;
}

.concept-description {
    margin-top: 8px;
    font-size: 0.9rem;
    color: #666;
    font-style: italic;
}

.lineage-display {
    margin-top: 16px;
    font-size: .75rem;
    display: flex;
    flex-direction: row;
}

.lineage-path {
    display: flex;
    flex-direction: row;
    flex-wrap:wrap;
}

.lineage-step {
    display: flex;
    align-items: center;
    margin-bottom: 4px;
    margin-left: 4px;
}

.lineage-token {
    background: var(--border-light);
    color: var(--special-text);
    padding: 2px 4px;
    border-radius: 4px;

    font-family: monospace;
}

.no-lineage {
    margin-top: 16px;
    font-size: 0.9rem;
    color: #888;
    text-align: center;
}
</style>