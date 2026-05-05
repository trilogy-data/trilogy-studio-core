<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ChatArtifact } from '@lib/chats/chat'
import useProjectStore from '@lib/stores/projectStore'
import useChatStore from '@lib/stores/chatStore'
import ArtifactsPane from '@lib/components/llm/ArtifactsPane.vue'

/**
 * Middle-column workspace view. Aggregates artifacts (charts, tables,
 * markdown, code) across all subchats in the active project so the user
 * can see what's been produced without digging into individual subchat
 * transcripts. The overseer never produces artifacts itself — it only
 * orchestrates — so we don't include its (non-existent) ones here.
 */
const projectStore = useProjectStore()
const chatStore = useChatStore()

interface AggregatedArtifact {
  artifact: ChatArtifact
  subchatId: string
  subchatKind: string
  subchatName: string
}

const aggregated = computed<AggregatedArtifact[]>(() => {
  const project = projectStore.activeProject
  if (!project) return []
  const out: AggregatedArtifact[] = []
  for (const id of project.subchatIds) {
    const sub = chatStore.chats[id]
    if (!sub || sub.deleted) continue
    for (const a of sub.artifacts) {
      out.push({
        artifact: a,
        subchatId: sub.id,
        subchatKind: sub.kind,
        subchatName: sub.name,
      })
    }
  }
  return out
})

const flatArtifacts = computed(() => aggregated.value.map((a) => a.artifact))

const activeIndex = ref(-1)
function setActive(i: number) {
  activeIndex.value = i
}

const visibleCount = computed(() => flatArtifacts.value.filter((a) => !a.hidden).length)
</script>

<template>
  <section class="workspace">
    <header class="workspace-head">
      <span class="title">Workspace</span>
      <span v-if="visibleCount > 0" class="count">
        {{ visibleCount }} artifact{{ visibleCount === 1 ? '' : 's' }}
      </span>
    </header>

    <div v-if="!projectStore.activeProject" class="empty">
      <p>Open a project to see its work.</p>
    </div>

    <div v-else-if="flatArtifacts.length === 0" class="empty">
      <p>No artifacts yet.</p>
      <p class="hint">
        Ask the overseer to run an analysis — analyst subchats render results here.
      </p>
    </div>

    <div v-else class="artifacts-host">
      <ArtifactsPane
        :artifacts="flatArtifacts"
        :activeArtifactIndex="activeIndex"
        @update:activeArtifactIndex="setActive"
      />
    </div>
  </section>
</template>

<style scoped>
.workspace {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  border-right: 1px solid var(--border);
  overflow: hidden;
}

.workspace-head {
  height: var(--explorer-header-height);
  padding: 0 var(--explorer-header-padding-inline);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: var(--explorer-header-gap);
  background: var(--panel-header-bg);
  flex-shrink: 0;
}

.title {
  color: var(--explorer-header-title-color);
  font-size: var(--explorer-header-title-font-size);
  font-weight: var(--explorer-header-title-font-weight);
  letter-spacing: var(--explorer-header-title-letter-spacing);
  line-height: var(--explorer-header-title-line-height);
  text-transform: var(--explorer-header-title-text-transform);
}

.count {
  font-size: 0.78rem;
  color: var(--muted);
}

.empty {
  margin: auto;
  text-align: center;
  color: var(--muted);
  padding: 2rem;
}

.empty p {
  margin: 0.25rem 0;
}

.hint {
  font-size: 0.82rem;
  opacity: 0.8;
  max-width: 320px;
}

.artifacts-host {
  flex: 1;
  display: flex;
  min-height: 0;
  overflow: auto;
}
</style>
