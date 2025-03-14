<template>
  <div class="results-view">
    <loading-view
      v-if="editorData.loading"
      :cancel="editorData.cancelCallback"
    />
    <error-message v-else-if="editorData.error">
      {{ editorData.error }}
      <template #action v-if="editorData.error === 'Connection is not active.'">
        <loading-button
          :action="handleReconnect"
        >
          Reconnect
          {{ editorData.connection }}
        </loading-button>
      </template>
    </error-message>
    <results-container
      v-else-if="
        editorData.results.headers && editorData.results.headers.size > 0
      "
      :results="editorData.results"
      :generatedSql="editorData.generated_sql || undefined"
      :containerHeight="containerHeight"
      :type="editorData.type"
    />
    <hint-component v-else />
  </div>
</template>

<script lang="ts">
import LoadingView from './LoadingView.vue'
import ErrorMessage from './ErrorMessage.vue'
import LoadingButton from './LoadingButton.vue'
import ResultsContainer from './Results.vue'
import HintComponent from './HintComponent.vue'
import { inject } from 'vue'
import type { ConnectionStoreType } from '../stores/connectionStore.ts'

export default {
  name: 'ResultsView',
  components: {
    LoadingView,
    ErrorMessage,
    LoadingButton,
    ResultsContainer,
    HintComponent
  },
  props: {
    editorData: {
      type: Object,
      required: true
    },
    containerHeight: {
      type: Number,
      default: 0
    }
  },
  setup() {
    const connectionStore = inject<ConnectionStoreType>('connectionStore')
    
    if (!connectionStore) {
      throw new Error('Requires injection of connection store')
    }
    
    return {
      connectionStore
    }
  },
  methods: {
    handleReconnect() {
      if (this.editorData) {
        return this.connectionStore.resetConnection(this.editorData.connection)
          .then(() => {
            if (this.editorData) {
              this.editorData.error = null
            }
          })
      }
      return Promise.resolve()
    }
  }
}
</script>

<style scoped>
.results-view {
  height: 100%;
  display: flex;
  flex-direction: column;
}
</style>