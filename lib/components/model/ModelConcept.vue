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
import { Concept } from '../../models'
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
  background: var(--query-window-bg);
  height: 100%;
  overflow: hidden;
}

.concept-header {
  background: var(--query-window-bg);
  padding: 18px 20px 12px;
  border-bottom: 1px solid var(--border-light);
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.concept-header h2 {
  margin: 0;
  font-size: var(--page-title-font-size);
  line-height: 1.15;
}

.namespace-badge {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 8px;
  border-radius: 7px;
  font-size: 11px;
  font-weight: 600;
  background: rgba(var(--special-text-rgb), 0.08);
  color: var(--special-text);
  border: 1px solid rgba(var(--special-text-rgb), 0.14);
}

.concept-content {
  padding: 14px 20px 20px;
}

.concept-section {
  margin-bottom: 14px;
}

.concept-section:last-child {
  margin-bottom: 0;
}

.concept-section label {
  display: block;
  font-weight: 600;
  margin-bottom: 6px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-faint);
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
  border-radius: 8px;
  font-size: 12px;
  padding: 2px 8px;
  border: 1px solid var(--border-light);
  color: var(--text-color);
  transition: all 0.2s ease;
}

.lineage-link:hover,
.key-link:hover {
  background: rgba(var(--special-text-rgb), 0.06);
  border-color: rgba(var(--special-text-rgb), 0.16);
}

.key-link {
  color: var(--text-color);
}
</style>
