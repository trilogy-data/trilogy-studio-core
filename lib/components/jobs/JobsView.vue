<template>
  <div class="jobs-page">
    <div class="jobs-header">
      <div>
        <div class="eyebrow">Trilogy Local Server</div>
        <h2 class="jobs-title">{{ title }}</h2>
        <p class="jobs-subtitle">{{ subtitle }}</p>
      </div>
      <div class="header-actions">
        <button v-if="selectedStore" class="action-button secondary" @click="showTokenModal = true">
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
          v-if="canShowState && selectedStoreId && stateSnapshot"
          class="action-button secondary"
          @click="refreshState(true)"
          :disabled="stateLoading"
          title="Re-probe the warehouse instead of reading the server's cached snapshot"
        >
          {{ stateLoading ? 'Probing State...' : 'Re-probe State' }}
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
      No local Trilogy stores are configured yet. Open a serve link or add a jobs store from the
      sidebar.
    </div>

    <div v-else class="jobs-body">
      <section class="summary-card">
        <div class="summary-grid">
          <div v-for="item in summaryItems" :key="item.label" class="summary-item">
            <span class="summary-label">{{ item.label }}</span>
            <span class="summary-value">{{ item.value }}</span>
          </div>
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

      <section v-if="selectedType === 'file'" class="state-card">
        <div class="state-header">
          <h3>File</h3>
          <button
            v-if="fileEditorId"
            class="state-inline-button"
            @click="showFileContents = !showFileContents"
          >
            {{ showFileContents ? 'Hide contents' : 'Show contents' }}
          </button>
        </div>

        <div v-if="!fileEditorId" class="state-empty">
          This file is not open as an editor. Add or refresh the store from the sidebar to sync it
          into the IDE.
        </div>

        <div v-else-if="showFileContents" class="file-editor">
          <editor
            :context="fileEditorContext"
            :editorId="fileEditorId"
            :containerHeight="FILE_EDITOR_HEIGHT"
            @save-editors="handleSaveEditors"
          />
        </div>
      </section>

      <section v-if="canShowState" class="state-card">
        <div class="state-header">
          <h3>Asset State</h3>
          <span v-if="stateSnapshot" class="state-as-of">
            {{ stateProvenance }}
          </span>
        </div>

        <div v-if="stateError" class="state-error">
          {{ stateError }}
          <button class="state-inline-button" @click="refreshState()" :disabled="stateLoading">
            Retry
          </button>
        </div>

        <div v-else-if="stateLoading && !stateSnapshot" class="state-empty">Reading state…</div>

        <div v-else-if="!stateSnapshot" class="state-unloaded">
          <button class="action-button" @click="refreshState()" :disabled="stateLoading">
            Refresh State
          </button>
          <span class="state-empty">May run live database queries against your warehouse.</span>
        </div>

        <template v-else>
          <div class="state-chips">
            <div class="state-chip">
              <span class="summary-label">Assets</span>
              <span class="summary-value">{{ stateSnapshot.summary.total }}</span>
            </div>
            <div class="state-chip">
              <span class="summary-label">Managed</span>
              <span class="summary-value">{{ stateSnapshot.summary.managed }}</span>
            </div>
            <div class="state-chip">
              <span class="summary-label">Fresh</span>
              <span class="summary-value state-fresh">{{ stateSnapshot.summary.fresh }}</span>
            </div>
            <div class="state-chip">
              <span class="summary-label">Stale</span>
              <span class="summary-value" :class="{ 'state-stale': stateSnapshot.summary.stale }">
                {{ stateSnapshot.summary.stale }}
              </span>
            </div>
            <div class="state-chip">
              <span class="summary-label">Unknown</span>
              <span class="summary-value state-unknown">{{ stateSnapshot.summary.unknown }}</span>
            </div>
          </div>

          <div v-if="stateLoading" class="state-refreshing">Refreshing…</div>

          <div v-if="!sortedAssets.length" class="state-empty">
            No assets were found for this target.
          </div>

          <div v-for="asset in sortedAssets" :key="asset.address" class="state-asset">
            <div class="state-asset-header" @click="toggleAsset(asset.address)">
              <i
                class="mdi state-caret"
                :class="expandedAssets[asset.address] ? 'mdi-chevron-down' : 'mdi-chevron-right'"
              ></i>
              <span class="state-address">{{ asset.address }}</span>
              <span class="state-pill" :class="`state-pill-${assetStatus(asset)}`">
                {{ assetStatus(asset) }}
              </span>
              <span v-if="asset.managed" class="state-tag">managed</span>
              <span v-if="asset.owner_script" class="state-owner">{{ asset.owner_script }}</span>
              <span class="state-ds-count">
                {{ asset.datasources.length }} datasource{{
                  asset.datasources.length === 1 ? '' : 's'
                }}
              </span>
            </div>

            <div v-if="expandedAssets[asset.address]" class="state-datasources">
              <div
                v-for="datasource in asset.datasources"
                :key="datasource.datasource_id"
                class="state-datasource"
              >
                <div class="state-datasource-header">
                  <span class="state-ds-id">{{ datasource.datasource_id }}</span>
                  <span class="state-pill" :class="`state-pill-${datasource.status}`">
                    {{ datasource.status }}
                  </span>
                  <span v-if="datasource.is_root" class="state-tag">root</span>
                  <span v-if="datasource.refresh_kind" class="state-tag">
                    {{ datasource.refresh_kind }}
                  </span>
                </div>

                <div class="state-ds-meta">
                  <span>Script: {{ datasource.script }}</span>
                  <span>{{ datasource.columns.length }} columns</span>
                  <span v-if="datasource.partition_by.length">
                    Partitioned by {{ partitionColumns(datasource).join(', ') }}
                  </span>
                </div>

                <div v-if="watermarkOf(datasource)" class="state-ds-meta">
                  <span>
                    Watermark ({{ watermarkOf(datasource)?.type }}):
                    {{ watermarkOf(datasource)?.value ?? '—' }}
                  </span>
                  <span>Probed {{ formatIsoTimestamp(watermarkOf(datasource)?.probed_at) }}</span>
                </div>

                <template v-if="datasource.partitions.length">
                  <div class="state-ds-meta">
                    <span>{{ partitionSummary(datasource).total }} partitions</span>
                    <span class="state-fresh">{{ partitionSummary(datasource).fresh }} fresh</span>
                    <span v-if="partitionSummary(datasource).stale" class="state-stale">
                      {{ partitionSummary(datasource).stale }} stale
                    </span>
                    <span v-if="partitionSummary(datasource).unknown" class="state-unknown">
                      {{ partitionSummary(datasource).unknown }} unknown
                    </span>
                    <span v-if="partitionSummary(datasource).missing" class="state-stale">
                      {{ partitionSummary(datasource).missing }} missing
                    </span>
                    <span v-if="partitionSummary(datasource).rowCount !== null">
                      {{ partitionSummary(datasource).rowCount?.toLocaleString() }} rows
                    </span>
                    <span :class="{ 'state-stale': !datasource.partitions_complete }">
                      {{ datasource.partitions_complete ? 'complete' : 'incomplete' }}
                    </span>
                  </div>

                  <button
                    class="state-inline-button"
                    @click="togglePartitions(datasource.datasource_id)"
                  >
                    {{
                      expandedPartitions[datasource.datasource_id]
                        ? 'Hide partitions'
                        : 'Show partitions'
                    }}
                  </button>

                  <div v-if="expandedPartitions[datasource.datasource_id]" class="state-partitions">
                    <div
                      v-for="partition in visiblePartitions(datasource)"
                      :key="partition.partition_id"
                      class="state-partition"
                    >
                      <span class="state-pill" :class="`state-pill-${partition.status}`">
                        {{ partition.status }}
                      </span>
                      <span class="state-partition-key">{{ partitionLabel(partition) }}</span>
                      <span v-if="partition.row_count !== null" class="state-partition-meta">
                        {{ partition.row_count.toLocaleString() }} rows
                      </span>
                      <span v-if="!partition.observed" class="state-tag">not observed</span>
                      <span v-if="partition.stale_reason" class="state-stale-reason">
                        {{ partition.stale_reason }}
                      </span>
                    </div>

                    <div v-if="hiddenPartitionCount(datasource)" class="state-empty">
                      Showing {{ PARTITION_DISPLAY_LIMIT }} of
                      {{ datasource.partitions.length }} partitions, worst status first.
                    </div>
                  </div>
                </template>

                <div v-if="datasource.stale_reason" class="state-stale-reason">
                  {{ datasource.stale_reason }}
                </div>
              </div>
            </div>
          </div>
        </template>
      </section>

      <section class="jobs-list">
        <div class="jobs-list-header">
          <h3>{{ jobsHeading }}</h3>
          <span class="jobs-count"
            >{{ visibleJobs.length }} job{{ visibleJobs.length === 1 ? '' : 's' }}</span
          >
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
                v-if="canStopJob(job)"
                class="job-stop-button"
                @click="stopJob(job.job_id)"
                :disabled="jobsStore.isStoppingJob(job.storeId, job.job_id)"
              >
                {{ jobsStore.isStoppingJob(job.storeId, job.job_id) ? 'Stopping...' : 'Stop' }}
              </button>
              <button
                class="job-refresh-button"
                :class="{ tracking: isActivelyTrackingJob(job) }"
                @click="refreshJob(job.job_id)"
                :disabled="
                  jobsStore.isStoppingJob(job.storeId, job.job_id) || isActivelyTrackingJob(job)
                "
              >
                <span
                  v-if="isActivelyTrackingJob(job)"
                  class="job-button-spinner"
                  aria-hidden="true"
                />
                {{ isActivelyTrackingJob(job) ? 'Tracking' : 'Refresh' }}
              </button>
              <button
                class="job-delete-button"
                @click="deleteJob(job.job_id)"
                :disabled="jobsStore.isStoppingJob(job.storeId, job.job_id)"
              >
                Delete
              </button>
              <div class="job-status" :class="`job-status-${job.status}`">
                {{ job.status }}
              </div>
            </div>
          </div>

          <div v-if="job.pollingState === 'auth-paused'" class="job-polling-warning">
            Polling is paused until this store has a valid token again.
          </div>

          <div v-else-if="job.pollingState === 'not-found'" class="job-polling-warning stopped">
            {{ job.pollingError || 'Polling stopped because the job was not found on the server.' }}
          </div>

          <div v-else-if="job.pollingState === 'stopped'" class="job-polling-warning stopped">
            {{ job.pollingError || 'Polling stopped locally.' }}
          </div>

          <div class="job-meta">
            <span>Job ID: {{ job.job_id }}</span>
            <span>Updated: {{ formatTimestamp(job.updatedAt) }}</span>
            <span>Return code: {{ job.return_code ?? 'running' }}</span>
          </div>

          <div v-if="job.output" class="job-output">
            <div class="output-label">Output</div>
            <div v-if="jobHasFormattedOutput(job.output)" class="output-note">
              Terminal formatting removed for readability.
            </div>
            <pre>{{ formatJobOutput(job.output) }}</pre>
          </div>

          <div v-if="job.error" class="job-output error">
            <div class="output-label">Error</div>
            <div v-if="jobHasFormattedOutput(job.error)" class="output-note">
              Terminal formatting removed for readability.
            </div>
            <pre>{{ formatJobOutput(job.error) }}</pre>
          </div>

          <div v-if="job.pollingError" class="job-output warning">
            <div class="output-label">Polling Issue</div>
            <pre>{{ formatJobOutput(job.pollingError) }}</pre>
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
import { computed, inject, provide, ref, watch } from 'vue'
import { useCommunityApiStore, useJobsApiStore } from '../../stores'
import Editor from '../editor/Editor.vue'
import { findRemoteEditors } from '../../editors/reconcile'
import type { EditorStoreType } from '../../stores/editorStore'
import type { GenericModelStore } from '../../remotes/models'
import { KeySeparator } from '../../data/constants'
import StoreTokenModal from '../StoreTokenModal.vue'
import { hasTerminalControlCodes, stripTerminalControlCodes } from '../../utils/terminalOutput'
import { getEditorTypeForPath, supportsDirectJobsTarget } from '../../editors/fileTypes'
import {
  formatPartitionValues,
  latestObservedWatermark,
  partitionColumnNames,
  rollupAssetStatus,
  sortAssetsByAttention,
  sortPartitionsByAttention,
  summarizePartitions,
  type StateAsset,
  type StateDatasource,
  type StatePartition,
} from '../../remotes/state'

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
const selectedStore = computed(
  () => genericStores.value.find((store) => store.id === selectedStoreId.value) || null,
)
const selectedStoreName = computed(() => selectedStore.value?.name || 'No store selected')
const selectedType = computed<'store' | 'directory' | 'file'>(() => {
  if (keyParts.value.length === 1) {
    return 'store'
  }
  return keyParts.value[1] === 'directory' ? 'directory' : 'file'
})
const selectedTarget = computed(() => decodeURIComponent(keyParts.value[2] || ''))
const filesResponse = computed(() =>
  selectedStoreId.value ? jobsStore.filesByStore[selectedStoreId.value] : undefined,
)
const directoryCount = computed(
  () => filesResponse.value?.directories.filter((entry) => entry.directory !== '').length || 0,
)
const fileCount = computed(
  () => filesResponse.value?.directories.reduce((sum, entry) => sum + entry.files.length, 0) || 0,
)
const storeError = computed(() =>
  selectedStoreId.value ? jobsStore.errors[selectedStoreId.value] : '',
)

// Only facts the rest of the page doesn't already state. The title names the
// selection and the sidebar tree shows where it sits, so repeating the target
// path or the selection type here is noise; store-wide counts only mean
// something on the store overview.
const summaryItems = computed(() => {
  const items = [{ label: 'Store', value: selectedStoreName.value }]

  if (selectedType.value === 'store') {
    items.push({ label: 'Directories', value: String(directoryCount.value) })
    items.push({ label: 'Files', value: String(fileCount.value) })
    return items
  }

  if (selectedType.value === 'directory') {
    items.push({ label: 'Directory', value: selectedTarget.value })
    return items
  }

  const editorType = getEditorTypeForPath(selectedTarget.value)
  if (editorType) {
    items.push({ label: 'Type', value: editorType })
  }

  return items
})

const visibleJobs = computed(() => {
  if (!selectedStoreId.value) {
    return []
  }

  if (selectedType.value === 'store') {
    return jobsStore.getStoreJobs(selectedStoreId.value)
  }

  return jobsStore.getJobsForTarget(selectedStoreId.value, selectedTarget.value)
})

const canRunTarget = computed(() => {
  if (selectedType.value === 'directory') {
    return true
  }

  if (selectedType.value === 'file') {
    return supportsDirectJobsTarget(selectedTarget.value)
  }

  return false
})

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

// Directory and store selections map onto a `/state` target; the store root is
// addressed as `.`. Files are supported by the endpoint too, but the useful
// rollup is per-directory, so keep the surface to branches for now.
const canShowState = computed(() => selectedType.value !== 'file')
const stateTarget = computed(() => (selectedType.value === 'store' ? '.' : selectedTarget.value))

const stateSnapshot = computed(() =>
  selectedStoreId.value ? jobsStore.getState(selectedStoreId.value, stateTarget.value) : null,
)
const stateLoading = computed(() =>
  selectedStoreId.value
    ? jobsStore.isStateLoading(selectedStoreId.value, stateTarget.value)
    : false,
)
const stateError = computed(() =>
  selectedStoreId.value ? jobsStore.getStateError(selectedStoreId.value, stateTarget.value) : '',
)
const sortedAssets = computed(() =>
  stateSnapshot.value ? sortAssetsByAttention(stateSnapshot.value.assets) : [],
)

// Datasources can carry dozens of partitions; show the worst ones and say so.
const PARTITION_DISPLAY_LIMIT = 25
const FILE_EDITOR_HEIGHT = 420

const editorStore = inject<EditorStoreType>('editorStore')
const saveEditors = inject<() => void>('saveEditors')

// This card is a narrow column, not the editor pane — the symbols sidepane
// widens the editor's flex row and has nowhere to go here.
provide('hideEditorSymbols', true)

const showFileContents = ref(false)

// The IDE already syncs every remote file into an editor, so reuse that instead
// of fetching the file again — it carries unsaved edits and saves back through
// the same remote persistence. Matched on store+path rather than a rebuilt id,
// which editorStore is free to suffix on collision.
const fileEditor = computed(() => {
  if (!editorStore || selectedType.value !== 'file' || !selectedStoreId.value) {
    return null
  }

  return (
    findRemoteEditors(editorStore.editors, selectedStoreId.value, selectedTarget.value)[0] || null
  )
})

const fileEditorId = computed(() => fileEditor.value?.id || '')

// Monaco instances are keyed by context; a distinct one keeps this preview from
// stealing the main editor pane's instance for the same file.
const fileEditorContext = computed(() => `jobs:${fileEditorId.value}`)

const handleSaveEditors = () => {
  saveEditors?.()
}

// Collapse when moving to another file so a new selection never opens expanded.
watch(effectiveKey, () => {
  showFileContents.value = false
})

const stateMeta = computed(() =>
  selectedStoreId.value ? jobsStore.getStateMeta(selectedStoreId.value, stateTarget.value) : null,
)

// The server serves from a cache, so "when was the warehouse actually
// observed" is the number that matters — not when we made the request.
const stateProvenance = computed(() => {
  if (!stateSnapshot.value) {
    return ''
  }

  const observedAt = formatIsoTimestamp(
    stateMeta.value?.computedAt || stateSnapshot.value.snapshot_ts,
  )
  const source = stateMeta.value?.cached === null ? '' : stateMeta.value?.cached ? 'cached · ' : ''

  return `${source}probed ${observedAt} · ${stateSnapshot.value.dialect}`
})

const expandedAssets = ref<Record<string, boolean>>({})
const expandedPartitions = ref<Record<string, boolean>>({})

const toggleAsset = (address: string) => {
  expandedAssets.value[address] = !expandedAssets.value[address]
}

const togglePartitions = (datasourceId: string) => {
  expandedPartitions.value[datasourceId] = !expandedPartitions.value[datasourceId]
}

const assetStatus = (asset: StateAsset) => rollupAssetStatus(asset)

const watermarkOf = (datasource: StateDatasource) => latestObservedWatermark(datasource)

const partitionColumns = (datasource: StateDatasource) => partitionColumnNames(datasource)

const partitionSummary = (datasource: StateDatasource) => summarizePartitions(datasource)

const visiblePartitions = (datasource: StateDatasource) =>
  sortPartitionsByAttention(datasource.partitions).slice(0, PARTITION_DISPLAY_LIMIT)

const hiddenPartitionCount = (datasource: StateDatasource) =>
  Math.max(0, datasource.partitions.length - PARTITION_DISPLAY_LIMIT)

const partitionLabel = (partition: StatePartition) => formatPartitionValues(partition)

// Explicit refresh forces a re-probe; the first read of a target is happy to
// take the server's cached snapshot.
const refreshState = async (force = false) => {
  if (!selectedStoreId.value) {
    return
  }

  await jobsStore.fetchStateForTarget(selectedStoreId.value, stateTarget.value, force)
}

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

  if (jobsStore.storeStatus[selectedStoreId.value] === 'connected') {
    await jobsStore.resumeAuthPausedJobs(selectedStoreId.value)
  }
}

const refreshJob = async (jobId: string) => {
  if (!selectedStoreId.value) {
    return
  }

  await jobsStore.pollJob(selectedStoreId.value, jobId)
}

const stopJob = async (jobId: string) => {
  if (!selectedStoreId.value) {
    return
  }

  await jobsStore.stopJob(selectedStoreId.value, jobId)
}

const deleteJob = (jobId: string) => {
  if (!selectedStoreId.value) {
    return
  }

  jobsStore.removeJob(selectedStoreId.value, jobId)
}

const canStopJob = (job: { status: string; pollingState?: string }) =>
  job.status === 'running' && job.pollingState !== 'stopped' && job.pollingState !== 'not-found'

const isActivelyTrackingJob = (job: { status: string; pollingState?: string }) =>
  job.status === 'running' && (job.pollingState ?? 'ok') === 'ok'

const formatJobOutput = (value: string | null | undefined) => stripTerminalControlCodes(value)

const jobHasFormattedOutput = (value: string | null | undefined) => hasTerminalControlCodes(value)

const timestampFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
})

const formatTimestamp = (timestamp: number) => timestampFormatter.format(timestamp)

const formatIsoTimestamp = (value: string | null | undefined) => {
  if (!value) {
    return '—'
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : timestampFormatter.format(parsed)
}
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
  /* minmax(0, 1fr), not the default `auto`: a grid track sized to its content
     lets Monaco's measured width feed back into the column and creep wider
     every layout pass, pushing the whole page right. */
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
}

.summary-card,
.job-card,
.state-card,
.error-card {
  border: 1px solid var(--border-light);
  border-radius: 14px;
  background: var(--editor-bg-color);
  padding: 16px;
  /* Grid items default to min-width: auto, which lets wide content (Monaco,
     long output lines) stretch the card past the page. */
  min-width: 0;
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

.state-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.state-header h3 {
  margin: 0;
}

.state-as-of,
.state-empty,
.state-refreshing,
.state-ds-count,
.state-owner {
  color: var(--text-faint);
  font-size: 0.85rem;
}

.state-chips {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
  gap: 12px;
  margin-bottom: 14px;
}

.state-chip {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.state-fresh {
  color: #16a34a;
}

.state-stale {
  color: #b45309;
}

.state-unknown {
  color: var(--text-faint);
}

.state-asset {
  border-top: 1px solid var(--border-light);
  padding: 10px 0;
}

.state-asset-header {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  cursor: pointer;
}

.state-caret {
  color: var(--text-faint);
}

.state-address,
.state-ds-id {
  font-weight: 600;
}

.state-pill {
  text-transform: uppercase;
  font-size: 10px;
  letter-spacing: 0.06em;
  padding: 3px 8px;
  border-radius: 999px;
  border: 1px solid currentColor;
}

.state-pill-fresh {
  color: #16a34a;
}

.state-pill-stale {
  color: #b45309;
}

.state-pill-unknown {
  color: var(--text-faint);
}

.state-tag {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.15);
  color: var(--text-faint);
}

.state-datasources {
  margin: 8px 0 0 26px;
  display: grid;
  gap: 10px;
}

.state-datasource {
  border-left: 2px solid var(--border-light);
  padding-left: 12px;
}

.state-datasource-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.state-ds-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 4px;
  color: var(--text-faint);
  font-size: 0.8rem;
}

.state-stale-reason {
  margin-top: 4px;
  color: #b45309;
  font-size: 0.85rem;
}

.file-editor {
  margin-top: 12px;
  border: 1px solid var(--border-light);
  border-radius: 10px;
  /* Definite width and height so Monaco measures the box rather than the box
     measuring Monaco. */
  width: 100%;
  min-width: 0;
  height: 460px;
  overflow: hidden;
}

.state-unloaded {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.state-partitions {
  margin-top: 8px;
  display: grid;
  gap: 6px;
}

.state-partition {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 0.85rem;
}

.state-partition-key {
  font-family: var(--font-mono, monospace);
}

.state-partition-meta {
  color: var(--text-faint);
  font-size: 0.8rem;
}

.state-error {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  color: #dc2626;
  font-size: 0.9rem;
}

.state-inline-button {
  border: 1px solid var(--border-light);
  background: transparent;
  color: var(--text-color);
  padding: 4px 10px;
  cursor: pointer;
  border-radius: 999px;
  font-size: 12px;
}

.state-inline-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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

.job-refresh-button.tracking {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.job-stop-button,
.job-delete-button {
  border: 1px solid var(--border-light);
  background: transparent;
  color: var(--text-color);
  padding: 6px 10px;
  cursor: pointer;
  border-radius: 999px;
  font-size: 12px;
}

.job-stop-button {
  color: #b45309;
  border-color: rgba(180, 83, 9, 0.4);
}

.job-delete-button {
  color: #dc2626;
  border-color: rgba(220, 38, 38, 0.35);
}

.job-refresh-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.job-button-spinner {
  width: 12px;
  height: 12px;
  border-radius: 999px;
  border: 2px solid currentColor;
  border-right-color: transparent;
  animation: job-spin 0.8s linear infinite;
}

.job-stop-button:disabled,
.job-delete-button:disabled {
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

.job-status-cancelled {
  color: #b45309;
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

.output-note {
  margin-top: 6px;
  color: var(--text-faint);
  font-size: 0.8rem;
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

.job-polling-warning.stopped {
  color: var(--text-faint);
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

@keyframes job-spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}
</style>
