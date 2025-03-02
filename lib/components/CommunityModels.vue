<template>
    <div class="model-page">
        <div class="model-title">Community Models</div>
        <div v-if="files.length">
            <div v-for="file in files" :key="file.name">

                <h3 class="font-semibold">{{ file.name }}</h3>
                <model-creator
                    :formDefaults="{ importAddress: file.downloadUrl, connection: `new-${file.engine}`, name: file.name }"
                    :absolute="false" />
                <div><span class="text-faint">Description:</span> <span>{{ file.description }} </span></div>
                <div><span class="text-faint">Engine:</span> <span>{{ file.engine }}</span></div>

                <div class="toggle-concepts" @click="toggleComponents(file.downloadUrl)">
                    {{ isExpanded[file.downloadUrl] ? 'Hide' : 'Show' }} Files ({{ file.components.length }})
                </div>
                <ul class="mt-2 space-y-1" v-if="isExpanded[file.downloadUrl]">
                    <div v-for="component in file.components" :key="component.url">
                        <a :href="component.url" target="_blank">{{ component.name || 'Unnamed Component' }}</a>
                        <span v-if="component.purpose"> ({{ component.purpose }})</span>
                    </div>
                </ul>
            </div>
        </div>
        <p v-else class="text-gray-500">Loading files...</p>
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import ModelCreator from './ModelCreator.vue'
interface Component {
    url: string;
    name?: string;
    alias?: string;
    purpose?: string;
}

interface FileData {
    name: string;
    description: string;
    engine: string;
    downloadUrl: string;
    components: Component[];
}

const files = ref<FileData[]>([]);
const isExpanded = ref<Record<string, boolean>>({})
const toggleComponents = (index: string) => {
    isExpanded.value[index] = !isExpanded.value[index]
}
const fetchFiles = async () => {
    try {
        const response = await fetch(
            'https://api.github.com/repos/trilogy-data/trilogy-public-models/contents/studio?ref=studio-integration'
        );
        const data: { name: string; download_url: string }[] = await response.json();

        const filePromises = data
            .filter(file => file.name.endsWith('.json'))
            .map(async (file) => {
                const fileResponse = await fetch(file.download_url);
                const fileData: FileData = await fileResponse.json();
                fileData.downloadUrl = file.download_url;
                return fileData;
            });

        files.value = await Promise.all(filePromises);
    } catch (error) {
        console.error('Error fetching files:', error);
    }
};

onMounted(fetchFiles);
</script>

<style scoped>
.model-page {
    width: 100%;
    height: 100%;
    overflow-y: scroll;
    background-color: var(--editor-bg-color);
    padding: 10px;
}


.text-faint {
    color: var(--text-faint);
}

.model-title {
    font-weight: 500;
    cursor: pointer;
    border-radius: 4px;
    display: flex;
    align-items: center;
    font-size: 24px;
}
</style>