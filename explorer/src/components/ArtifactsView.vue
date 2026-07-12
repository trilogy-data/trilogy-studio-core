<script setup lang="ts">
import { computed, ref, watch } from 'vue'
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
 *
 * When `subchatId` is set (an "analysis" selected in the sidebar), the view
 * narrows to just that subchat's artifacts.
 */
const props = defineProps<{ subchatId?: string }>()

const projectStore = useProjectStore()
const chatStore = useChatStore()

const focusedSubchat = computed(() => {
  if (!props.subchatId) return null
  const c = chatStore.chats[props.subchatId]
  return c && !c.deleted ? c : null
})

interface AggregatedArtifact {
  artifact: ChatArtifact
  subchatId: string
  subchatKind: string
  subchatName: string
}

const aggregated = computed<AggregatedArtifact[]>(() => {
  const project = projectStore.activeProject
  if (!project) return []
  const ids = focusedSubchat.value ? [focusedSubchat.value.id] : project.subchatIds
  const out: AggregatedArtifact[] = []
  for (const id of ids) {
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

// The expanded-artifact index points into flatArtifacts; a filter change
// reshuffles that list, so drop the selection rather than expand a stranger.
watch(
  () => props.subchatId,
  () => {
    activeIndex.value = -1
  },
)

const visibleCount = computed(() => flatArtifacts.value.filter((a) => !a.hidden).length)
</script>

<template>
  <section class="workspace">
    <header class="workspace-head">
      <template v-if="focusedSubchat">
        <span class="kind-tag" :class="`kind-${focusedSubchat.kind}`">
          {{ focusedSubchat.kind }}
        </span>
        <span class="title" :title="focusedSubchat.name">{{ focusedSubchat.name }}</span>
      </template>
      <span v-else class="title">Workspace</span>
      <span v-if="visibleCount > 0" class="count">
        {{ visibleCount }} artifact{{ visibleCount === 1 ? '' : 's' }}
      </span>
    </header>

    <div v-if="!projectStore.activeProject" class="empty">
      <p>Open a project to see its work.</p>
    </div>

    <div v-else-if="flatArtifacts.length === 0" class="empty">
      <p>No artifacts yet{{ focusedSubchat ? ' in this analysis' : '' }}.</p>
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

.kind-tag {
  font-size: 0.62rem;
  text-transform: uppercase;
  font-weight: 700;
  padding: 0.05rem 0.35rem;
  border-radius: 3px;
  letter-spacing: 0.04em;
  background: rgba(127, 127, 127, 0.12);
  color: var(--muted);
  flex-shrink: 0;
}

.kind-tag.kind-architect {
  background: rgba(168, 85, 247, 0.18);
  color: #9333ea;
}

.kind-tag.kind-analyst {
  background: rgba(16, 185, 129, 0.18);
  color: #059669;
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
