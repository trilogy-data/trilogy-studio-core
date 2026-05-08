<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import useProjectStore from '@lib/stores/projectStore'
import type { PromptOverrideKind } from '@lib/projects/project'
import {
  OVERSEER_DEFAULT_INSTRUCTIONS,
  ANALYST_DEFAULT_INSTRUCTIONS,
} from '@lib/llm/overseerAgentPrompt'
import { getArchitectDefaultInstructions } from '@lib/llm/architectAgentPrompt'

/**
 * Per-project prompt overrides for each agent kind. The overridable portion
 * is the static instructions block — dynamic context (files, connections,
 * subchats) is still appended automatically when the prompt builds.
 */

interface KindEntry {
  key: PromptOverrideKind
  label: string
  blurb: string
}

const KINDS: KindEntry[] = [
  {
    key: 'overseer',
    label: 'Overseer',
    blurb:
      'Top-level orchestrator. Delegates to architect and analyst subchats — never queries data directly.',
  },
  {
    key: 'architect',
    label: 'Architect',
    blurb:
      'Builds the Trilogy data model from raw files. Writes .preql files, validates them, smoke-tests with a query.',
  },
  {
    key: 'analyst',
    label: 'Analyst',
    blurb:
      "Answers the overseer's questions — runs queries, builds charts, surfaces findings. Sits on top of the generic chat-agent prompt.",
  },
]

const projectStore = useProjectStore()
const project = computed(() => projectStore.activeProject)

function defaultFor(kind: PromptOverrideKind): string {
  switch (kind) {
    case 'overseer':
      return OVERSEER_DEFAULT_INSTRUCTIONS
    case 'architect':
      return getArchitectDefaultInstructions()
    case 'analyst':
      return ANALYST_DEFAULT_INSTRUCTIONS
  }
}

const activeKind = ref<PromptOverrideKind>('overseer')
const draft = ref('')
const justSaved = ref(false)
let savedFlashTimer: ReturnType<typeof setTimeout> | null = null

const storedValue = computed(() => project.value?.promptOverrides[activeKind.value] ?? '')
const defaultValue = computed(() => defaultFor(activeKind.value))
const isOverridden = computed(() => !!storedValue.value)
const isDirty = computed(() => {
  const baseline = storedValue.value || defaultValue.value
  return draft.value !== baseline
})

function loadFromStore() {
  draft.value = storedValue.value || defaultValue.value
}
loadFromStore()

// Re-load the draft when the active kind or project changes — but NOT when
// storedValue alone changes, because storedValue updates as a direct result
// of the user clicking Save and we want the local draft to remain in sync
// with what was just saved without an extra round-trip clobbering the UI.
watch([activeKind, () => project.value?.id], loadFromStore)

function flashSaved() {
  justSaved.value = true
  if (savedFlashTimer) clearTimeout(savedFlashTimer)
  savedFlashTimer = setTimeout(() => {
    justSaved.value = false
  }, 1800)
}

function pickKind(k: PromptOverrideKind) {
  if (isDirty.value) {
    const proceed = window.confirm(
      `You have unsaved changes to the ${activeKind.value} prompt. Discard them?`,
    )
    if (!proceed) return
  }
  activeKind.value = k
}

function save() {
  if (!project.value) return
  const trimmed = draft.value.trim()
  // Saving content identical to the default clears the override — keeps the
  // override map small and means future default tweaks flow through.
  if (trimmed === defaultValue.value.trim()) {
    projectStore.setProjectPromptOverride(project.value.id, activeKind.value, undefined)
    draft.value = defaultValue.value
  } else {
    projectStore.setProjectPromptOverride(project.value.id, activeKind.value, trimmed)
    // Mirror what was actually stored (trimmed) so isDirty correctly reads
    // false after save and the user can see the "saved" indicator.
    draft.value = trimmed
  }
  flashSaved()
}

function resetToDefault() {
  if (!project.value) return
  projectStore.setProjectPromptOverride(project.value.id, activeKind.value, undefined)
  draft.value = defaultValue.value
  if (savedFlashTimer) clearTimeout(savedFlashTimer)
  justSaved.value = false
}
</script>

<template>
  <div class="prompts-pane">
    <div v-if="!project" class="no-project">
      <p>Open a project to edit its prompt overrides.</p>
      <p class="dim">
        Prompts are stored per-project — each workspace can shape its own agents without affecting
        the rest.
      </p>
    </div>

    <template v-else>
      <header class="pm-head">
        <div class="proj-tag">
          Project: <strong>{{ project.name }}</strong>
        </div>
        <p class="dim">
          Edit the static instructions for each agent kind. Dynamic context (files, connections,
          subchats) is appended automatically — you don't need to include it. Saving an unchanged
          prompt clears the override; reset restores the default.
        </p>
      </header>

      <div class="kind-row">
        <button
          v-for="k in KINDS"
          :key="k.key"
          :class="{ active: activeKind === k.key }"
          @click="pickKind(k.key)"
        >
          {{ k.label }}
          <span v-if="project.promptOverrides[k.key]" class="dot" title="Customized" />
        </button>
      </div>

      <p class="kind-blurb">{{ KINDS.find((k) => k.key === activeKind)?.blurb }}</p>

      <div class="status-row">
        <span class="status" :class="{ override: isOverridden }">
          {{ isOverridden ? 'Custom (project override)' : 'Default' }}
        </span>
        <span v-if="isDirty" class="status dirty">unsaved changes</span>
        <span v-else-if="justSaved" class="status ok">saved</span>
      </div>

      <textarea
        v-model="draft"
        class="prompt-area"
        spellcheck="false"
        rows="18"
        :placeholder="defaultValue"
      />

      <div class="actions">
        <button class="ghost" :disabled="!isOverridden && !isDirty" @click="resetToDefault">
          Reset to default
        </button>
        <button class="primary" :disabled="!isDirty" @click="save">Save</button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.prompts-pane {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  padding: 1rem 1.2rem 1.2rem;
  height: 100%;
  min-height: 0;
}

.no-project {
  text-align: center;
  margin: 2rem auto;
  max-width: 360px;
  color: var(--muted);
}

.no-project p {
  margin: 0 0 0.5rem;
}

.dim {
  color: var(--muted);
  font-size: 0.82rem;
  margin: 0.2rem 0 0;
  line-height: 1.45;
}

.pm-head {
  border-bottom: 1px solid var(--border);
  padding-bottom: 0.6rem;
}

.proj-tag {
  font-size: 0.78rem;
  color: var(--muted);
}

.proj-tag strong {
  color: var(--fg);
  margin-left: 0.2rem;
}

.kind-row {
  display: flex;
  gap: 0.4rem;
}

.kind-row button {
  flex: 1;
  padding: 0.45rem 0.7rem;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--fg);
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
}

.kind-row button.active {
  border-color: var(--accent);
  color: var(--accent);
  background: rgba(59, 130, 246, 0.08);
}

.kind-row button .dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #f59e0b;
}

.kind-blurb {
  margin: 0;
  font-size: 0.78rem;
  color: var(--muted);
  line-height: 1.4;
}

.status-row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.status {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 0.15rem 0.5rem;
  border-radius: 3px;
  background: rgba(127, 127, 127, 0.15);
  color: var(--muted);
  font-weight: 600;
}

.status.override {
  background: rgba(245, 158, 11, 0.18);
  color: #d97706;
}

.status.dirty {
  background: rgba(239, 68, 68, 0.15);
  color: #dc2626;
}

.status.ok {
  background: rgba(16, 185, 129, 0.18);
  color: #059669;
}

.prompt-area {
  flex: 1;
  min-height: 220px;
  width: 100%;
  resize: vertical;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg);
  color: var(--fg);
  padding: 0.6rem 0.7rem;
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 0.82rem;
  line-height: 1.45;
  outline: none;
}

.prompt-area:focus {
  border-color: var(--accent);
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

.actions button {
  padding: 0.45rem 0.9rem;
  border-radius: 4px;
  font-size: 0.85rem;
  cursor: pointer;
  border: 1px solid var(--border);
}

.actions .ghost {
  background: transparent;
  color: var(--fg);
}

.actions .ghost:hover:not(:disabled) {
  background: rgba(127, 127, 127, 0.1);
}

.actions .primary {
  background: var(--accent);
  border-color: var(--accent);
  color: white;
}

.actions .primary:disabled,
.actions .ghost:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
