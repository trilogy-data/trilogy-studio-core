<template>
  <div class="jobs-page">
    <div class="jobs-header">
      <div>
        <div class="eyebrow">Trilogy Local Server</div>
        <h2 class="jobs-title">{{ title }}</h2>
        <p class="jobs-subtitle">{{ subtitle }}</p>
      </div>
      <div class="header-actions">
        <button
          v-if="selectedStore"
          class="action-button secondary"
          @click="showTokenModal = true"
        >
          Set Token
        </button>
        <button
          v-if="selectedStoreId"
          class="action-button secondary"
          @click="jobsStore.fetchFilesForStore(selectedStoreId)"
          :disabled="!!jobsStore.loadingByStore[selectedStoreId]"
        >
          {{ jobsStore.loadingByStore[selectedStoreId] ? 'Refreshing Store...' : 'Refresh Store' }}
        </button>
        <button
          v-if="canRunTarget && selectedStoreId && selectedTarget"
          class="action-button"
          @click="triggerJob('run')"
          :disabled="jobsStore.isSubmitting(selectedStoreId, selectedTarget, 'run')"
        >
          Run
        </button>
        <button
          v-if="canRunTarget && selectedStoreId && selectedTarget"
          class="action-button"
          @click="triggerJob('refresh')"
          :disabled="jobsStore.isSubmitting(selectedStoreId, selectedTarget, 'refresh')"
        >
          Refresh
        </button>
      </div>
    </div>

    <div v-if="!genericStores.length" class="empty-state">
      No local Trilogy stores are configured yet. Open a serve link or add a jobs store from the sidebar.
    </div>

    <div v-else class="jobs-body">
      <section class="summary-card">
        <div class="summary-grid">
          <div class="summary-item">
            <span class="summary-label">Store</span>
            <span class="summary-value">{{ selectedStoreName }}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">Selection</span>
            <span class="summary-value">{{ selectedTypeLabel }}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">Directories</span>
            <span class="summary-value">{{ directoryCount }}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">Files</span>
            <span class="summary-value">{{ fileCount }}</span>
          </div>
        </div>

        <div v-if="selectedTarget" class="target-block">
          <span class="summary-label">Target</span>
          <code>{{ selectedTarget }}</code>
        </div>
      </section>

      <section v-if="storeError" class="error-card">
        <strong>Store error:</strong> {{ storeError }}
        <div class="error-actions" v-if="selectedStore">
          <button class="action-button secondary" @click="showTokenModal = true">Set Token</button>
          <button
            class="action-button secondary"
            @click="jobsStore.fetchFilesForStore(selectedStoreId)"
            :disabled="!!jobsStore.loadingByStore[selectedStoreId]"
          >
            Retry
          </button>
        </div>
      </section>

      <section class="jobs-list">
        <div class="jobs-list-header">
          <h3>{{ jobsHeading }}</h3>
          <span class="jobs-count">{{ visibleJobs.length }} job{{ visibleJobs.length === 1 ? '' : 's' }}</span>
        </div>

        <div v-if="!visibleJobs.length" class="empty-jobs">
          No jobs have been submitted{{ selectedTarget ? ` for ${selectedTarget}` : '' }} yet.
        </div>

        <article v-for="job in visibleJobs" :key="job.job_id" class="job-card">
          <div class="job-card-header">
            <div>
              <div class="job-operation">{{ job.operation.toUpperCase() }}</div>
              <div class="job-target">{{ job.target }}</div>
            </div>
            <div class="job-card-actions">
              <button
                class="job-refresh-button"
                @click="refreshJob(job.job_id)"
                :disabled="jobsStore.isPollingJob(job.storeId, job.job_id)"
              >
                {{ jobsStore.isPollingJob(job.storeId, job.job_id) ? 'Refreshing...' : 'Refresh' }}
              </button>
              <div class="job-status" :class="`job-status-${job.status}`">
                {{ job.status }}
              </div>
            </div>
          </div>

          <div v-if="job.pollingState === 'unable-to-fetch'" class="job-polling-warning">
            Unable to fetch latest status. Polling will continue automatically.
          </div>

          <div class="job-meta">
            <span>Job ID: {{ job.job_id }}</span>
            <span>Updated: {{ formatTimestamp(job.updatedAt) }}</span>
            <span>Return code: {{ job.return_code ?? 'running' }}</span>
          </div>

          <div v-if="job.output" class="job-output">
            <div class="output-label">Output</div>
            <pre>{{ job.output }}</pre>
          </div>

          <div v-if="job.error" class="job-output error">
            <div class="output-label">Error</div>
            <pre>{{ job.error }}</pre>
          </div>

          <div v-if="job.pollingError" class="job-output warning">
            <div class="output-label">Polling Issue</div>
            <pre>{{ job.pollingError }}</pre>
          </div>
        </article>
      </section>
    </div>

    <store-token-modal
      v-if="selectedStore"
      :show="showTokenModal"
      :store-name="selectedStore.name"
      :token="selectedStore.token"
      @close="showTokenModal = false"
      @save="handleTokenSave"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useCommunityApiStore, useJobsApiStore } from '../../stores'
import type { GenericModelStore } from '../../remotes/models'
import { KeySeparator } from '../../data/constants'
import StoreTokenModal from '../StoreTokenModal.vue'

const props = defineProps<{
  activeJobsKey: string
}>()

const communityStore = useCommunityApiStore()
const jobsStore = useJobsApiStore()
const showTokenModal = ref(false)

const genericStores = computed(() =>
  communityStore.stores.filter((store): store is GenericModelStore => store.type === 'generic'),
)

const effectiveKey = computed(() => props.activeJobsKey || genericStores.value[0]?.id || '')
const keyParts = computed(() => effectiveKey.value.split(KeySeparator))
const selectedStoreId = computed(() => keyParts.value[0] || '')
const selectedStore = computed(() =>
  genericStores.value.find((store) => store.id === selectedStoreId.value) || null,
)
const selectedStoreName = computed(() => selectedStore.value?.name || 'No store selected')
const selectedType = computed<'store' | 'directory' | 'file'>(() => {
  if (keyParts.value.length === 1) {
    return 'store'
  }
  return keyParts.value[1] === 'directory' ? 'directory' : 'file'
})
const selectedTarget = computed(() => decodeURIComponent(keyParts.value[2] || ''))
const selectedTypeLabel = computed(() => {
  if (selectedType.value === 'store') {
    return 'Store overview'
  }
  if (selectedType.value === 'directory') {
    return 'Directory'
  }
  return 'File'
})

const filesResponse = computed(() =>
  selectedStoreId.value ? jobsStore.filesByStore[selectedStoreId.value] : undefined,
)
const directoryCount = computed(
  () => filesResponse.value?.directories.filter((entry) => entry.directory !== '').length || 0,
)
const fileCount = computed(
  () =>
    filesResponse.value?.directories.reduce((sum, entry) => sum + entry.files.length, 0) || 0,
)
const storeError = computed(() =>
  selectedStoreId.value ? jobsStore.errors[selectedStoreId.value] : '',
)

const visibleJobs = computed(() => {
  if (!selectedStoreId.value) {
    return []
  }

  if (selectedType.value === 'store') {
    return jobsStore.getStoreJobs(selectedStoreId.value)
  }

  return jobsStore.getJobsForTarget(selectedStoreId.value, selectedTarget.value)
})

const canRunTarget = computed(() => selectedType.value === 'directory' || selectedType.value === 'file')

const title = computed(() => {
  if (selectedType.value === 'store') {
    return selectedStoreName.value
  }
  if (selectedType.value === 'directory') {
    return selectedTarget.value
  }
  const pathParts = selectedTarget.value.split('/')
  return pathParts[pathParts.length - 1] || selectedStoreName.value
})

const subtitle = computed(() => {
  if (selectedType.value === 'store') {
    return 'Track submitted jobs for this remote store and refresh its served assets.'
  }
  return 'Run or refresh this target and watch job output update live.'
})

const jobsHeading = computed(() =>
  selectedType.value === 'store' ? 'Recent Jobs' : 'Jobs For This Target',
)

const triggerJob = async (operation: 'run' | 'refresh') => {
  if (!selectedStoreId.value || !selectedTarget.value) {
    return
  }

  await jobsStore.submitJob(selectedStoreId.value, selectedTarget.value, operation)
}

const handleTokenSave = async (token: string) => {
  if (!selectedStoreId.value) {
    return
  }

  communityStore.updateStoreToken(selectedStoreId.value, token)
  showTokenModal.value = false
  await jobsStore.fetchFilesForStore(selectedStoreId.value)
}

const refreshJob = async (jobId: string) => {
  if (!selectedStoreId.value) {
    return
  }

  await jobsStore.pollJob(selectedStoreId.value, jobId)
}

const formatTimestamp = (timestamp: number) =>
  new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(timestamp)
</script>

<style scoped>
.jobs-page {
  height: 100%;
  overflow-y: auto;
  background: var(--query-window-bg);
  padding: 18px;
  color: var(--text-color);
}

.jobs-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 16px;
}

.eyebrow {
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-faint);
  margin-bottom: 6px;
}

.jobs-title {
  margin: 0;
  font-size: 1.5rem;
}

.jobs-subtitle {
  margin: 8px 0 0;
  color: var(--text-faint);
  max-width: 720px;
}

.header-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.action-button {
  border: 1px solid var(--special-text);
  background: var(--special-text);
  color: white;
  padding: 10px 14px;
  cursor: pointer;
  border-radius: 8px;
}

.action-button.secondary {
  background: transparent;
  color: var(--text-color);
  border-color: var(--border-light);
}

.action-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.jobs-body {
  display: grid;
  gap: 16px;
}

.summary-card,
.job-card,
.error-card {
  border: 1px solid var(--border-light);
  border-radius: 14px;
  background: var(--editor-bg-color);
  padding: 16px;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
}

.summary-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.summary-label,
.output-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-faint);
}

.summary-value {
  font-size: 1rem;
  font-weight: 600;
}

.target-block {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.target-block code {
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(148, 163, 184, 0.08);
}

.jobs-list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.jobs-list-header h3 {
  margin: 0;
}

.jobs-count,
.empty-jobs,
.empty-state {
  color: var(--text-faint);
}

.jobs-list {
  display: grid;
  gap: 12px;
}

.job-card-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.job-card-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.job-operation {
  font-size: 11px;
  letter-spacing: 0.08em;
  color: var(--text-faint);
}

.job-target {
  font-weight: 600;
  margin-top: 4px;
}

.job-status {
  text-transform: uppercase;
  font-size: 11px;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid currentColor;
}

.job-refresh-button {
  border: 1px solid var(--border-light);
  background: transparent;
  color: var(--text-color);
  padding: 6px 10px;
  cursor: pointer;
  border-radius: 999px;
  font-size: 12px;
}

.job-refresh-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.job-status-running {
  color: #2563eb;
}

.job-status-success {
  color: #16a34a;
}

.job-status-error {
  color: #dc2626;
}

.job-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 10px;
  color: var(--text-faint);
  font-size: 0.85rem;
}

.job-output {
  margin-top: 12px;
}

.job-output pre {
  margin: 6px 0 0;
  padding: 12px;
  border-radius: 10px;
  background: rgba(148, 163, 184, 0.08);
  overflow-x: auto;
  white-space: pre-wrap;
}

.job-output.error pre,
.error-card {
  color: #dc2626;
}

.job-polling-warning {
  margin-top: 12px;
  color: #b45309;
  font-size: 0.9rem;
}

.job-output.warning pre {
  color: #b45309;
}

.error-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 12px;
}

@media (max-width: 768px) {
  .jobs-page {
    padding: 12px;
  }

  .jobs-header {
    flex-direction: column;
  }

  .header-actions {
    width: 100%;
  }

  .action-button {
    flex: 1 1 100%;
  }
}
</style>
