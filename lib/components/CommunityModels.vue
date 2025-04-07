<template>
  <div class="model-page">
    <div class="model-content">
      <div class="model-title">Community Models</div>

      <div class="filters my-4">
        <div class="filter-row flex gap-4 mb-2">
          <div class="search-box flex-grow">
            <label class="text-faint filter-label">Name</label>
            <input
              type="text"
              data-testid="community-model-search"
              v-model="searchQuery"
              placeholder="Search by model name..."
            />
          </div>

          <div class="engine-filter">
            <label class="text-faint filter-label">Model Engine</label>
            <select v-model="selectedEngine" class="px-3 py-2 border rounded">
              <option value="">All Engines</option>
              <option v-for="engine in availableEngines" :key="engine" :value="engine">
                {{ engine }}
              </option>
            </select>
          </div>

          <div class="import-status-filter">
            <label class="text-faint filter-label">Import Status</label>
            <select v-model="importStatus" class="px-3 py-2 border rounded">
              <option value="all">All Models</option>
              <option value="imported">Imported Only</option>
              <option value="not-imported">Not Imported</option>
            </select>
          </div>
        </div>

        <!-- <div class="branch-selector flex gap-4 items-center">
        <label class="text-faint filter-label">Public Repo Branch</label>
        <select v-model="selectedBranch" class="px-3 py-2 border rounded" @change="fetchFiles">
          <option v-for="branch in branches" :key="branch" :value="branch">
            {{ branch }}
          </option>
        </select>
      </div> -->
      </div>

      <div v-if="filteredFiles.length">
        <div v-for="file in filteredFiles" :key="file.name" class="model-item">
          <div class="font-semibold flex items-center">
            <span
              class="imported-indicator mr-2"
              v-if="modelExists(file.name)"
              :data-testid="`imported-${file.name}`"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="check-icon"
              >
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </span>
            {{ file.name }} <span class="text-faint">({{ file.engine }})</span>
          </div>
          <button
            @click="creatorIsExpanded[file.name] = !creatorIsExpanded[file.name]"
            :data-testid="`import-${file.name}`"
          >
            {{
              creatorIsExpanded[file.name] ? 'Hide' : modelExists(file.name) ? 'Reload' : 'Import'
            }}
          </button>
          <div class="model-creator-container" v-if="creatorIsExpanded[file.name]">
            <model-creator
              :formDefaults="{
                importAddress: file.downloadUrl,
                connection: getDefaultConnection(file.engine),
                name: file.name,
              }"
              :absolute="false"
              :visible="creatorIsExpanded[file.name]"
              @close="creatorIsExpanded[file.name] = !creatorIsExpanded[file.name]"
            />
          </div>
          <div>
            <span class="text-faint">Description:</span> <span>{{ file.description }} </span>
          </div>
          <div class="toggle-concepts" @click="toggleComponents(file.downloadUrl)">
            {{ isExpanded[file.downloadUrl] ? 'Hide' : 'Show' }} Files ({{
              file.components.length
            }})
          </div>
          <ul class="mt-2 space-y-1" v-if="isExpanded[file.downloadUrl]">
            <div v-for="component in file.components" :key="component.url">
              <a :href="component.url" target="_blank">{{
                component.name || 'Unnamed Component'
              }}</a>
              <span v-if="component.purpose"> ({{ component.purpose }})</span>
            </div>
          </ul>
        </div>
      </div>
      <p v-if="error" class="text-error">{{ error }}</p>
      <p v-else-if="loading" class="text-loading">Loading community models...</p>
      <p v-else-if="!filteredFiles.length" class="text-faint mt-4">
        No models match your search criteria.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, defineProps, inject } from 'vue'
import ModelCreator from './ModelCreator.vue'
import { type ModelConfigStoreType } from '../stores/modelStore'
const props = defineProps({
  initialSearch: {
    type: String,
    default: '',
  },
})
interface Component {
  url: string
  name?: string
  alias?: string
  purpose?: string
}

interface FileData {
  name: string
  description: string
  engine: string
  downloadUrl: string
  components: Component[]
}

const files = ref<FileData[]>([])
const isExpanded = ref<Record<string, boolean>>({})
const creatorIsExpanded = ref<Record<string, boolean>>({})
const error = ref<string | null>(null)
const searchQuery = ref(props.initialSearch)
const selectedEngine = ref('')
const importStatus = ref('all') // New ref for import status filter
const loading = ref(false)

// GitHub branch support
const selectedBranch = ref('main')
const branches = ref(['main', 'develop', 'staging'])

const repoOwner = 'trilogy-data'
const repoName = 'trilogy-public-models'

const modelStore = inject<ModelConfigStoreType>('modelStore')
if (!modelStore) {
  throw new Error('ModelConfigStore not found in context')
}

const modelExists = (name: string) => {
  return name in modelStore.models
}

const toggleComponents = (index: string) => {
  isExpanded.value[index] = !isExpanded.value[index]
}

const availableEngines = computed(() => {
  const engines = new Set<string>()
  files.value.forEach((file) => {
    if (file.engine) {
      engines.add(file.engine)
    }
  })
  return Array.from(engines).sort()
})

const getDefaultConnection = (engine: string) => {
  switch (engine) {
    case 'bigquery':
      return 'new-bigquery-oauth'
    case 'duckdb':
      return 'new-duckdb'
    default:
      return `new-${engine}`
  }
}

const filteredFiles = computed(() => {
  return files.value.filter((file) => {
    const nameMatch = file.name.toLowerCase().includes(searchQuery.value.toLowerCase())
    const engineMatch = !selectedEngine.value || file.engine === selectedEngine.value

    // Handle the import status filter
    let importMatch = true
    if (importStatus.value !== 'all') {
      const isImported = modelExists(file.name)
      importMatch =
        (importStatus.value === 'imported' && isImported) ||
        (importStatus.value === 'not-imported' && !isImported)
    }

    return nameMatch && engineMatch && importMatch
  })
})

const fetchBranches = async () => {
  try {
    const response = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/branches`)
    if (response.status === 200) {
      const branchData = await response.json()
      branches.value = branchData.map((branch: { name: string }) => branch.name)
    }
  } catch (err) {
    console.error('Error fetching branches:', err)
    // Keep default branches if we can't fetch them
  }
}

const fetchFiles = async () => {
  error.value = null
  loading.value = true
  files.value = []

  try {
    const contentsUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/contents/studio?ref=${selectedBranch.value}`
    const response = await fetch(contentsUrl)

    if (response.status != 200) {
      throw new Error(`Error fetching community data: ${await response.text()}`)
    }

    const data: { name: string; download_url: string }[] = await response.json()

    const filePromises = data
      .filter((file) => file.name.endsWith('.json'))
      .map(async (file) => {
        // Construct raw content URL with the selected branch
        const rawUrl = `https://raw.githubusercontent.com/${repoOwner}/${repoName}/${selectedBranch.value}/studio/${file.name}`
        const fileResponse = await fetch(rawUrl)

        if (!fileResponse.ok) {
          throw new Error(`Error fetching file ${file.name}: ${fileResponse.statusText}`)
        }

        const fileData: FileData = await fileResponse.json()
        fileData.downloadUrl = rawUrl
        return fileData
      })

    files.value = await Promise.all(filePromises)
  } catch (rawError) {
    if (rawError instanceof Error) {
      error.value = rawError.message
    } else {
      error.value = 'Error fetching files'
    }
    console.error('Error fetching community data:', rawError)
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await fetchBranches()
  await fetchFiles()
})
</script>

<style scoped>
.model-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.model-name {
  font-weight: 600;
  font-size: var(--big-font-size);
  color: var(--heading-color);
}

.model-engine-badge {
  font-size: 12px;
  padding: 3px 8px;
  border-radius: 12px;
  background-color: var(--accent-color-faint);
  color: var(--accent-color);
}
.font-semibold {
  font-weight: 500;
  font-size: var(--big-font-size);
}

.filter-label {
  padding-right: 4px;
}

.model-page {
  width: 100%;
  height: 100%;
  background-color: var(--editor-bg-color);
}

.model-content {
  padding: 10px;
}
.model-item {
  border: 1px solid var(--border);
  padding: 16px;
  margin-bottom: 20px;
  transition: box-shadow 0.2s ease;
  background-color: var(--card-bg-color, rgba(255, 255, 255, 0.03));
}

.model-item:hover {
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}
.text-loading {
  color: var(--text-faint);
  font-size: 24px;
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

.toggle-concepts {
  cursor: pointer;
  color: var(--link-color);
  margin-top: 8px;
  margin-bottom: 8px;
}

.filters {
  background-color: var(--sidebar-bg-color);
  padding: 12px;
}

.text-error {
  color: var(--error-color, #e53935);
}

.branch-selector {
  margin-top: 8px;
}

.bg-button {
  background-color: var(--button-bg);
}

.bg-button-hover:hover {
  background-color: var(--button-hover-bg);
}

/* New styles for the imported model indicator */
.imported-indicator {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.check-icon {
  color: #22c55e; /* Green color for the checkmark */
  stroke-width: 3;
}

/* Make filter row more responsive */
.filter-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

@media (max-width: 768px) {
  .filter-row > div {
    flex: 1 0 100%;
    margin-bottom: 8px;
  }
}
</style>
