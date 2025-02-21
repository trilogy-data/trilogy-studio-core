<template>
  <div class="concept-container">
    <header class="concept-header">
      <h2>{{ concept.name }}</h2>
      <span class="namespace-badge">{{ concept.namespace }}</span>
      <span v-if="concept.description" class="text-faint">{{ concept.description }}</span>
    </header>

    <div class="concept-content">
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
        <p>{{ concept.purpose }}</p> <span class="text-faint"> {{getPurposeDescription(concept.purpose)}}</span>
      </div>
      <div class="concept-section">
        <label>Lineage</label>
        <div class="link-list">
          <a 
            v-for="item in concept.lineage" 
            :key="item.id"
            href="#"
            @click.prevent="handleLineageClick(item)"
            class="lineage-link"
          >
            {{ item.name }}
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

<script setup>
import { defineProps } from 'vue'

const props = defineProps({
  concept: {
    type: Object,
    required: true,
    validator: (concept) => {
      return concept.name && 
             concept.namespace && 
             concept.address &&
             concept.datatype &&
             concept.purpose &&
             Array.isArray(concept.lineage) &&
             Array.isArray(concept.keys)
    }
  }
})

const handleLineageClick = (item) => {
  console.log('Lineage item clicked:', item)
}

const handleKeyClick = (key) => {
  console.log('Key clicked:', key)
}

const getPurposeDescription = (purpose) => {
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
  background: var(--bg-light);
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  margin: 1rem;
  overflow: hidden;
}

.concept-header {
  background: var(--bg-light);
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
  padding: 0.375rem 0.75rem;
  color: #1971c2;
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