<template>
  <ModalDialog
    :show="show"
    title="Add Model Store"
    test-id="add-store-modal"
    @close="$emit('close')"
  >
    <template #default>
      <form @submit.prevent="handleSubmit">
        <div class="form-group">
          <label>Store Type: <span class="required">*</span></label>
          <select v-model="storeType" data-testid="store-type-select">
            <option value="generic">Generic</option>
            <option value="github">GitHub Repository</option>
          </select>
        </div>

        <!-- Generic Store Fields -->
        <template v-if="storeType === 'generic'">
          <div class="form-group">
            <label>Store Name:</label>
            <input
              v-model="storeName"
              type="text"
              placeholder="Optional, defaults to the store URL"
              data-testid="store-name-input"
            />
          </div>
          <div class="form-group">
            <label>Base URL: <span class="required">*</span></label>
            <input
              v-model="baseUrl"
              type="url"
              placeholder="e.g., http://localhost:8100"
              data-testid="store-url-input"
              required
            />
            <small>URL should serve an index.json file at /index.json</small>
          </div>

          <div class="cli-tip" data-testid="add-store-cli-tip">
            <div class="cli-tip-title">
              <i class="mdi mdi-lightbulb-on"></i>
              Serving a local model?
            </div>
            <p class="cli-tip-body">
              Run this in your model directory. The Trilogy CLI serves it over HTTP and prints a
              link that opens the model back in this studio.
            </p>
            <div class="cli-tip-command">
              <code data-testid="add-store-cli-command">{{ serveCommand }}</code>
              <button
                type="button"
                class="cli-tip-copy"
                :title="copiedCommand ? 'Copied' : 'Copy command'"
                data-testid="add-store-cli-copy"
                @click="copyServeCommand"
              >
                <i class="mdi" :class="copiedCommand ? 'mdi-check' : 'mdi-content-copy'"></i>
              </button>
            </div>
            <small>Then paste the URL it prints above, or just follow the link.</small>
          </div>
        </template>

        <!-- GitHub Store Fields -->
        <template v-if="storeType === 'github'">
          <div class="form-group">
            <label>Display Name: <span class="required">*</span></label>
            <input
              v-model="storeName"
              type="text"
              placeholder="e.g., My Custom Models"
              data-testid="store-name-input"
              required
            />
          </div>
          <div class="form-group">
            <label>Repository Owner: <span class="required">*</span></label>
            <input
              v-model="owner"
              type="text"
              placeholder="e.g., trilogy-data"
              data-testid="github-owner-input"
              required
            />
          </div>
          <div class="form-group">
            <label>Repository Name: <span class="required">*</span></label>
            <input
              v-model="repo"
              type="text"
              placeholder="e.g., trilogy-public-models"
              data-testid="github-repo-input"
              required
            />
          </div>
          <div class="form-group">
            <label>Branch: <span class="required">*</span></label>
            <input
              v-model="branch"
              type="text"
              placeholder="e.g., main"
              data-testid="github-branch-input"
              required
            />
          </div>
        </template>

        <div v-if="error" class="form-error" data-testid="add-store-error">
          {{ error }}
        </div>
        <div class="dialog-actions">
          <button
            type="button"
            class="cancel-btn"
            data-testid="add-store-cancel"
            @click="$emit('close')"
          >
            Cancel
          </button>
          <button
            type="submit"
            class="confirm-btn"
            data-testid="add-store-submit"
            :disabled="loading"
          >
            {{ loading ? 'Adding...' : 'Add Store' }}
          </button>
        </div>
      </form>
    </template>
  </ModalDialog>
</template>

<script lang="ts">
import { computed, ref, watch } from 'vue'
import type { GenericModelStore, GithubModelStore } from '../../remotes/models'
import {
  buildGenericStoreFallbackName,
  buildGenericStoreId,
  normalizeGenericStoreBaseUrl,
} from '../../remotes/genericStoreMetadata'
import ModalDialog from '../ModalDialog.vue'

export default {
  name: 'AddStoreModal',
  components: {
    ModalDialog,
  },
  props: {
    show: {
      type: Boolean,
      required: true,
    },
    loading: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['close', 'add'],
  setup(props, { emit }) {
    const storeType = ref<'generic' | 'github'>('generic')
    const storeName = ref('')
    const baseUrl = ref('')
    const owner = ref('')
    const repo = ref('')
    const branch = ref('main')
    const error = ref<string | null>(null)
    const copiedCommand = ref(false)

    // Where this studio is served from, minus any hash route — the address the
    // CLI needs so the link it prints comes back here rather than to the
    // public studio it defaults to.
    const serveCommand = computed(() => {
      const base =
        typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : ''
      return base ? `trilogy serve . --studio-url ${base}` : 'trilogy serve .'
    })

    const copyServeCommand = async () => {
      try {
        await navigator.clipboard.writeText(serveCommand.value)
        copiedCommand.value = true
        setTimeout(() => {
          copiedCommand.value = false
        }, 2000)
      } catch (err) {
        console.error('Failed to copy serve command:', err)
      }
    }

    // Reset form when modal is opened
    watch(
      () => props.show,
      (newShow) => {
        if (newShow) {
          storeType.value = 'generic'
          storeName.value = ''
          baseUrl.value = ''
          owner.value = ''
          repo.value = ''
          branch.value = 'main'
          error.value = null
          copiedCommand.value = false
        }
      },
    )

    const handleSubmit = async () => {
      error.value = null

      try {
        if (storeType.value === 'generic') {
          if (!baseUrl.value) {
            error.value = 'Please fill in all required fields'
            return
          }

          const normalizedBaseUrl = normalizeGenericStoreBaseUrl(baseUrl.value)
          const id = buildGenericStoreId(normalizedBaseUrl)

          const store: GenericModelStore = {
            type: 'generic',
            id,
            name: storeName.value || buildGenericStoreFallbackName(normalizedBaseUrl),
            baseUrl: normalizedBaseUrl,
          }

          emit('add', store)
        } else {
          if (!storeName.value || !owner.value || !repo.value || !branch.value) {
            error.value = 'Please fill in all required fields'
            return
          }

          const id = `${owner.value}-${repo.value}-${branch.value}`

          const store: GithubModelStore = {
            type: 'github',
            id,
            name: storeName.value,
            owner: owner.value,
            repo: repo.value,
            branch: branch.value,
          }

          emit('add', store)
        }
      } catch (err) {
        error.value = err instanceof Error ? err.message : 'Failed to add store'
      }
    }

    return {
      storeType,
      storeName,
      baseUrl,
      owner,
      repo,
      branch,
      error,
      handleSubmit,
      serveCommand,
      copyServeCommand,
      copiedCommand,
    }
  },
}
</script>

<style scoped>
.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 4px;
  font-weight: 500;
  font-size: 0.875rem;
}

.required {
  color: #dc2626;
}

.form-group input,
.form-group select {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  font-size: 0.875rem;
  box-sizing: border-box;
}

.form-group input:focus,
.form-group select:focus {
  outline: none;
  border-color: #2563eb;
  box-shadow: 0 0 0 1px #2563eb;
}

.form-group small {
  display: block;
  margin-top: 4px;
  color: #6b7280;
  font-size: 0.75rem;
}

.cli-tip {
  margin-bottom: 16px;
  padding: 10px 12px;
  border: 1px solid var(--markdown-code-border);
  border-radius: 4px;
  background: var(--markdown-code-bg);
}

.cli-tip-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 500;
  font-size: 0.875rem;
  color: var(--text-color);
}

.cli-tip-body {
  margin: 6px 0 8px;
  font-size: 0.75rem;
  line-height: 1.45;
  color: var(--text-faint);
}

.cli-tip-command {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.cli-tip-command code {
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.75rem;
  line-height: 1.5;
  color: var(--text-color);
  /* The URL can be long; wrap rather than widen the dialog. */
  overflow-wrap: anywhere;
}

.cli-tip-copy {
  flex: 0 0 auto;
  padding: 2px 6px;
  background: none;
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-faint);
  cursor: pointer;
  line-height: 1;
}

.cli-tip-copy:hover {
  color: var(--text-color);
}

.cli-tip small {
  display: block;
  margin-top: 8px;
  color: var(--text-faint);
  font-size: 0.75rem;
}

.form-error {
  padding: 8px 12px;
  background: #fee2e2;
  border: 1px solid #fca5a5;
  border-radius: 4px;
  color: #dc2626;
  font-size: 0.875rem;
  margin-bottom: 16px;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}

.cancel-btn {
  background-color: var(--button-bg-color);
  color: var(--text-color);
  border: 1px solid var(--border);
}

.confirm-btn {
  background-color: var(--special-text);
  color: white;
  border: 1px solid var(--special-text);
}

.confirm-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
