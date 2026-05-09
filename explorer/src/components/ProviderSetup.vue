<script setup lang="ts">
import { onMounted, ref, watch, computed } from 'vue'
import useLLMConnectionStore from '@lib/stores/llmStore'

const emit = defineEmits<{ added: [name: string] }>()

const store = useLLMConnectionStore()

type ProviderKind = 'demo' | 'anthropic' | 'openai' | 'openrouter'

const KINDS: ProviderKind[] = ['demo', 'anthropic', 'openai', 'openrouter']

const kind = ref<ProviderKind>('demo')
const apiKey = ref('')
const model = ref('')
const availableModels = ref<string[]>([])
const fetchingModels = ref(false)
const fetchError = ref<string | null>(null)
const error = ref<string | null>(null)
const busy = ref(false)

const defaultModels: Record<ProviderKind, string> = {
  demo: 'anthropic/claude-sonnet-4-5',
  anthropic: 'claude-sonnet-4-5',
  openai: 'gpt-4o',
  openrouter: 'anthropic/claude-sonnet-4-5',
}

// Auto-derive name from provider kind: one connection per provider, tops.
const derivedName = computed(() => kind.value)

// Prefill from an existing connection of the chosen kind, if present.
// Lets the user open the modal to update just the model without re-typing
// their key (and vice versa).
function loadExistingForKind(k: ProviderKind) {
  const existing = store.connections[k]
  if (existing) {
    apiKey.value = existing.getApiKey() || ''
    model.value = existing.model || ''
  } else {
    apiKey.value = ''
    model.value = ''
  }
}

// Open the form pre-filled with whichever provider is currently active
// (or the first one). Falls back to 'demo' kind for fresh setup.
onMounted(() => {
  const activeName = store.activeConnection
  const first = activeName || Object.keys(store.connections)[0] || ''
  if (first && KINDS.includes(first as ProviderKind)) {
    kind.value = first as ProviderKind
    loadExistingForKind(kind.value)
  }
})

function pickKind(k: ProviderKind) {
  kind.value = k
  // Switching to a different kind: prefill if we already have one, else clear.
  loadExistingForKind(k)
  availableModels.value = []
  fetchError.value = null
  error.value = null
}

// Debounce model fetch as the API key is typed.
let fetchTimer: ReturnType<typeof setTimeout> | null = null
watch([apiKey, kind], ([key, k]) => {
  if (fetchTimer) clearTimeout(fetchTimer)
  if (k === 'demo' || !key || key.length < 8) {
    availableModels.value = []
    fetchError.value = null
    return
  }
  fetchTimer = setTimeout(async () => {
    fetchingModels.value = true
    fetchError.value = null
    try {
      const models = await store.fetchModelsForProvider(k, key)
      availableModels.value = models
      // Prefer what's already selected (e.g. pre-fill from an existing
      // connection). Fall back to the configured default, then to first.
      const current = model.value
      const preferred = defaultModels[k]
      if (current && models.includes(current)) {
        // keep current
      } else if (models.includes(preferred)) {
        model.value = preferred
      } else {
        model.value = models[0] ?? preferred
      }
    } catch (e) {
      availableModels.value = []
      fetchError.value = e instanceof Error ? e.message : String(e)
    } finally {
      fetchingModels.value = false
    }
  }, 350)
})

const canSubmit = computed(() => {
  if (busy.value) return false
  if (kind.value === 'demo') return true
  return apiKey.value.length > 0 && model.value.length > 0
})

async function add() {
  error.value = null
  busy.value = true
  try {
    const opts: Record<string, any> = {
      model: model.value || defaultModels[kind.value],
      saveCredential: true,
    }
    if (kind.value !== 'demo') {
      if (!apiKey.value) throw new Error('API key required')
      opts.apiKey = apiKey.value
    }
    // If a connection already exists for this kind (auto-named after the
    // provider), drop it first so the user can replace credentials cleanly.
    if (store.connections[derivedName.value]) {
      delete store.connections[derivedName.value]
    }
    await store.newConnection(derivedName.value, kind.value, opts)
    emit('added', derivedName.value)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="provider-setup">
    <h2>Connect an LLM provider</h2>
    <p class="hint">
      Demo uses a free shared key (no setup). For real chats, paste an API key.
      Keys live in your browser only — Phase 5 moves them to the OS keychain.
    </p>

    <div class="kind-row">
      <button v-for="k in KINDS" :key="k" :class="{ active: kind === k }" @click="pickKind(k)">
        {{ k }}
      </button>
    </div>

    <div v-if="kind !== 'demo'" class="field">
      <label>API key</label>
      <input v-model="apiKey" type="password" placeholder="sk-..." autocomplete="off" />
    </div>

    <div v-if="kind !== 'demo'" class="field">
      <label>
        Model
        <span v-if="fetchingModels" class="model-status">loading models…</span>
        <span v-else-if="fetchError" class="model-status error-text">
          {{ fetchError }}
        </span>
      </label>
      <select v-if="availableModels.length > 0" v-model="model">
        <option v-for="m in availableModels" :key="m" :value="m">{{ m }}</option>
      </select>
      <input
        v-else
        v-model="model"
        :placeholder="apiKey ? 'Enter a model id' : defaultModels[kind]"
        :disabled="!apiKey"
      />
    </div>

    <button class="primary" :disabled="!canSubmit" @click="add">
      {{ busy ? 'Connecting…' : `Connect ${kind}` }}
    </button>

    <p v-if="error" class="error">{{ error }}</p>
  </div>
</template>

<style scoped>
.provider-setup {
  max-width: 480px;
  margin: 2rem auto;
  padding: 1.5rem;
  border: 1px solid var(--border);
  border-radius: 8px;
}

h2 {
  margin: 0 0 0.5rem;
  font-size: 1.05rem;
  font-weight: 600;
}

.hint {
  color: var(--muted);
  font-size: 0.85rem;
  margin: 0 0 1rem;
  line-height: 1.4;
}

.kind-row {
  display: flex;
  gap: 0.4rem;
  margin-bottom: 1rem;
}

.kind-row button {
  flex: 1;
  padding: 0.4rem 0.6rem;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--fg);
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85rem;
  text-transform: capitalize;
}

.kind-row button.active {
  border-color: var(--accent);
  color: var(--accent);
  background: rgba(59, 130, 246, 0.08);
}

.field {
  margin-bottom: 0.85rem;
}

.field label {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  font-size: 0.8rem;
  color: var(--muted);
  margin-bottom: 0.25rem;
}

.model-status {
  font-size: 0.72rem;
  color: var(--muted);
}

.model-status.error-text {
  color: #ef4444;
  max-width: 70%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.field input,
.field select {
  width: 100%;
  padding: 0.45rem 0.6rem;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg);
  color: var(--fg);
  font-size: 0.9rem;
}

.field input:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

button.primary {
  background: var(--accent);
  color: white;
  padding: 0.55rem 1rem;
  border: none;
  border-radius: 4px;
  font-size: 0.9rem;
  cursor: pointer;
  width: 100%;
  text-transform: capitalize;
}

button.primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.error {
  margin-top: 0.75rem;
  color: #ef4444;
  font-size: 0.85rem;
}
</style>
