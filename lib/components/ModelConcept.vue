<template>
  <div class="concept-container">
    <header class="concept-header">
      <h2>{{ concept.name }}</h2>
      <span class="namespace-badge">{{ concept.namespace }}</span>
    </header>

    <div class="concept-content">
      <div v-if="concept.description" class="concept-section">
        <label>Description</label>
        <span>{{ concept.description }}</span>
      </div>

      <div class="concept-section">
        <label>Address</label>
        <span>{{ concept.address }}</span>
      </div>

      <div class="concept-section">
        <label>Data Type</label>
        <span>{{ concept.datatype }}</span>
      </div>

      <div class="concept-section">
        <label>Purpose</label>
        <p>{{ concept.purpose }}</p>
        <span class="text-faint"> {{ getPurposeDescription(concept.purpose) }}</span>
      </div>
      <div class="concept-section">
        <label>Lineage</label>
        <div class="link-list">
          <a
            v-for="item in concept.lineage"
            :key="item.token"
            href="#"
            @click.prevent="handleLineageClick(item)"
            class="lineage-link"
          >
            {{ item.token }}
          </a>
        </div>
      </div>

      <div class="concept-section">
        <label>Keys</label>
        <div class="link-list">
          <a
            v-for="key in concept.keys"
            :key="key"
            href="#"
            @click.prevent="handleKeyClick(key)"
            class="key-link"
          >
            {{ key }}
          </a>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Concept } from '../models'
// @ts-ignore
const _ = defineProps({
  concept: {
    type: Concept,
    required: true,
  },
})
// @ts-ignore
const handleLineageClick = (item) => {
  console.log('Lineage item clicked:', item)
}
// @ts-ignore
const handleKeyClick = (key) => {
  console.log('Key clicked:', key)
}

const getPurposeDescription = (purpose: string) => {
  switch (purpose) {
    case 'property':
      return 'A property is an attribute associated with one or more keys. A customer name is a property of a customer key.'
    case 'metric':
      return 'A metric is an aggregation of a field to a defined key grain (or to the grain of query, if none is defined). '
    case 'key':
      return 'A unique identifier of a grain of data.'
    default:
      return ''
  }
}
</script>

<style scoped>
.text-faint {
  color: var(--text-faint);
}
.concept-container {
  background: var(--result-window-bg);
  margin: 1rem;
  overflow: hidden;
}

.concept-header {
  background: var(--result-window-bg);
  padding: 1.5rem;
  border-bottom: 1px solid var(--border-light);
  display: flex;
  align-items: center;
  gap: 1rem;
}

.concept-header h2 {
  margin: 0;
  font-size: 1.5rem;
}

.namespace-badge {
  padding: 0.25rem 0.75rem;
  border-radius: 16px;
  font-size: 0.875rem;
}

.concept-content {
  padding: 1.5rem;
}

.concept-section {
  margin-bottom: 1.5rem;
}

.concept-section:last-child {
  margin-bottom: 0;
}

.concept-section label {
  display: block;
  font-weight: 600;
  margin-bottom: 0.5rem;
  font-size: 0.875rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.concept-section p {
  margin: 0;
  line-height: 1.5;
}

.link-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.lineage-link,
.key-link {
  display: inline-block;
  text-decoration: none;
  border-radius: 4px;
  font-size: 0.875rem;
  transition: all 0.2s ease;
}

.lineage-link:hover,
.key-link:hover {
  background: #1971c2;
}

.key-link {
  /* color: #495057; */
}

.key-link:hover {
  background: #495057;
}
</style>
