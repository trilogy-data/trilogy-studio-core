<template>
    <span class="flex relative-container">
        <button @click="createModel">Add</button>
        <div v-if="visible" class="absolute-form">
            <form @submit.prevent="submitModelCreation">
                <div>
                    <label for="model-name">Name</label>
                    <input type="text" v-model="modelDetails.name" id="model-name" required />
                </div>

                <button type="submit">Submit</button>
                <button type="button" @click="visible = !visible">Cancel</button>
            </form>
        </div>
    </span>
</template>

<style scoped>

input,
select {
    font-size: 12px;
    border: 1px solid #ccc;
    /* Light gray border for inputs */
    border-radius: 0;
    /* Sharp corners */
    width: 95%;
    /* Full width of the container */
}

input:focus,
select:focus {
    border-color: #4b4b4b;
    /* Dark gray border on focus */
    outline: none;
}

option {
    font-size: 12px;
    font-weight: 300;
}

label {
    font-weight: 300
        /* Dark gray text */
}
</style>
<script lang="ts">
import { defineComponent, ref, inject } from 'vue';
import type { ModelConfigStoreType } from '../stores/modelStore';
import type { ConnectionStoreType } from '../stores/connectionStore';
import Tooltip from './Tooltip.vue';
export default defineComponent({
    name: 'ModelCreator',
    components: {
        Tooltip
    },
    setup() {
        // Placeholder for editor details
        const modelDetails = ref({
            name: '',
            type: 'preql', // Default value
            connection: ''
        });

        // Array of available connection names
        const connectionStore = inject<ConnectionStoreType>('connectionStore');
        const modelStore = inject<ModelConfigStoreType>('modelStore');
        if (!connectionStore || !modelStore) {
            throw ("must inject modelStore to ModelCreator")
        }

        let connections = connectionStore.connections;
        //visible
        let visible = ref(false);

        // Function to create the editor by collecting details from the form
        const createModel = () => {
            visible.value = !visible.value;
            modelDetails.value.name = ''; // Reset name field
        };

        // Function to submit the editor details
        const submitModelCreation = () => {
            if (modelDetails.value.name) {
                visible.value = false;
                modelStore.newModelConfig(modelDetails.value.name);
            }
        };

        return {
            visible,
            modelDetails,
            connections,
            createModel,
            submitModelCreation,
        };
    }
});
</script>