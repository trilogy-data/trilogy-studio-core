<script setup lang="ts">
// Phase 1 proof-of-reuse: import a real type and a real runtime class from lib.
// Once Phase 2 lands the projectStore + storage adapter, this file becomes
// the explorer shell (sidebar | chat | artifacts). For now it just shows
// that explorer can reach into lib.
import { ref } from 'vue'
import { Chat } from '@lib/chats/chat'

const sampleChat = ref(
  new Chat({
    name: 'Sample chat',
    dataConnectionName: 'duckdb-local',
    llmConnectionName: 'anthropic-claude-opus-4-7',
    messages: [
      { role: 'user', content: 'Show me the top 5 rows of orders.' },
      {
        role: 'assistant',
        content: 'I would run a Trilogy query and chart the result.',
      },
    ],
  }),
)
</script>

<template>
  <main class="explorer-root">
    <header class="hero">
      <h1>Trilogy Explorer</h1>
      <p class="tagline">AI-native data exploration. Chat first, files second.</p>
    </header>

    <section class="status">
      <h2>Phase 1 — Skeleton</h2>
      <p>
        This window is a Vue 3 + Vite app that pulls types and runtime code
        directly from <code>../lib</code>. No fork, no copy. The instance below
        was constructed from lib's <code>Chat</code> class:
      </p>
      <pre class="snapshot">{{ sampleChat.serialize() }}</pre>
      <p class="muted">
        See <a href="../README.md">explorer/README.md</a> for principles and the
        full plan.
      </p>
    </section>
  </main>
</template>

<style scoped>
.explorer-root {
  max-width: 720px;
  margin: 0 auto;
  padding: 4rem 2rem;
}

.hero h1 {
  margin: 0 0 0.25rem;
  font-size: 2rem;
  font-weight: 600;
}

.tagline {
  margin: 0;
  color: var(--muted);
}

.status {
  margin-top: 3rem;
  padding-top: 2rem;
  border-top: 1px solid var(--border);
}

.status h2 {
  margin: 0 0 1rem;
  font-size: 1.1rem;
  font-weight: 500;
  color: var(--accent);
}

.snapshot {
  background: rgba(127, 127, 127, 0.08);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 1rem;
  font-size: 0.85rem;
  overflow-x: auto;
  white-space: pre-wrap;
}

.muted {
  color: var(--muted);
  font-size: 0.9rem;
}

code {
  background: rgba(127, 127, 127, 0.12);
  padding: 0.1rem 0.35rem;
  border-radius: 3px;
  font-size: 0.9em;
}
</style>
