<template>
    <span class="flex relative-container">
        <button @click="createModel">New</button>
        <div v-if="visible" class="absolute-form">
            <form @submit.prevent="submitModelCreation">
                <div>
                    <label for="model-name">Name</label>
                    <input type="text" v-model="modelDetails.name" id="model-name" required />
                    <label for="model-import">Connection</label>
                    <input type="text" v-model="modelDetails.connection" id="model-connection" required />
                    <label for="model-import">Import Address</label>
                    <input type="text" v-model="modelDetails.importAddress" id="model-import" />
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
import { ModelImport, ImportFile } from '../models'
import type { EditorStoreType } from '../stores/editorStore';
import {EditorTag} from '../editors'
import { ModelSource } from '../models'
import Tooltip from './Tooltip.vue';


export async function fetchModelImports(modelImport: ModelImport): Promise<{ name: string; alias: string; content: string }[]> {
    return Promise.all(
        modelImport.components.map(async (component) => {
            try {
                const response = await fetch(component.url);
                if (!response.ok) {
                    throw new Error(`Failed to fetch ${component.url}: ${response.statusText}`);
                }
                const content = await response.text();
                return {
                    name: component.name,
                    alias: component.alias,
                    content,
                };
            } catch (error) {
                console.error(error);
                return {
                    name: component.name,
                    alias: component.alias,
                    content: '', // Return empty content on failure
                };
            }
        })
    );
}


export default defineComponent({
    name: 'ModelCreator',
    components: {
        Tooltip
    },
    setup() {
        // Placeholder for editor details
        const modelDetails = ref({
            name: '',
            importAddress: '',
            connection: '',

        });

        // Array of available connection names
        const connectionStore = inject<ConnectionStoreType>('connectionStore');
        const modelStore = inject<ModelConfigStoreType>('modelStore');
        const editorStore = inject<EditorStoreType>('editorStore');
        if (!connectionStore || !modelStore || !editorStore) {
            throw ("must inject modelStore to ModelCreator")
        }

        let connections = connectionStore.connections;
        //visible
        let visible = ref(false);

        // Function to create the editor by collecting details from the form
        const createModel = () => {
            visible.value = !visible.value;
            modelDetails.value.name = ''; // Reset name field
            modelDetails.value.importAddress = ''; // Reset import field
            modelDetails.value.connection = '';
        };

        // Function to submit the editor details
        const submitModelCreation = async () => {
            if (modelDetails.value.name) {
                visible.value = false;
                // check if it already exists
                if (!modelStore.models[modelDetails.value.name]) {
                    modelStore.newModelConfig(modelDetails.value.name);
                }
                connectionStore.connections[modelDetails.value.connection].setModel(modelDetails.value.name)
                if (modelDetails.value.importAddress) {
                    const data = await fetchModelImports(
                        new ModelImport(
                            'thelook_ecommerce',
                            [
                                new ImportFile(
                                    'https://raw.githubusercontent.com/trilogy-data/trilogy-public-models/refs/heads/main/trilogy_public_models/bigquery/thelook_ecommerce/distribution_centers.preql',
                                    'distribution_centers',
                                    'distribution_centers',
                                    'source'
                                ),
                                new ImportFile(
                                    'https://raw.githubusercontent.com/trilogy-data/trilogy-public-models/refs/heads/main/trilogy_public_models/bigquery/thelook_ecommerce/events.preql',
                                    'events',
                                    'events',
                                    'source'
                                ),
                                new ImportFile(
                                    'https://raw.githubusercontent.com/trilogy-data/trilogy-public-models/refs/heads/main/trilogy_public_models/bigquery/thelook_ecommerce/inventory_items.preql',
                                    'inventory_items',
                                    'inventory_items',
                                    'source'
                                ),
                                new ImportFile(
                                    'https://raw.githubusercontent.com/trilogy-data/trilogy-public-models/refs/heads/main/trilogy_public_models/bigquery/thelook_ecommerce/order_items.preql',
                                    'order_items',
                                    'order_items',
                                    'source'
                                ),
                                new ImportFile(
                                    'https://raw.githubusercontent.com/trilogy-data/trilogy-public-models/refs/heads/main/trilogy_public_models/bigquery/thelook_ecommerce/orders.preql',
                                    'orders',
                                    'orders',
                                    'source'
                                ),
                                new ImportFile(
                                    'https://raw.githubusercontent.com/trilogy-data/trilogy-public-models/refs/heads/main/trilogy_public_models/bigquery/thelook_ecommerce/products.preql',
                                    'products',
                                    'products',
                                    'source'
                                ),
                                new ImportFile(
                                    'https://raw.githubusercontent.com/trilogy-data/trilogy-public-models/refs/heads/main/trilogy_public_models/bigquery/thelook_ecommerce/users.preql',
                                    'users',
                                    'users',
                                    'source'
                                )

                            ]
                        )


                    )
                    modelStore.models[modelDetails.value.name].sources = data.map(response => {
                        if (!editorStore.editors[response.name]) {
                            editorStore.newEditor(response.name, 'trilogy', modelDetails.value.name, response.content)
                        }
                        else {
                            editorStore.editors[response.name].contents = response.content
                            
                        }
                        // add source as a tag
                        editorStore.editors[response.name].tags.push(EditorTag.SOURCE)
                        return new ModelSource(response.name, response.alias)

                    });



                }
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