<template>
  <div class="results-view" :style="{ height: containerHeight + 'px' }">
    <LLMChatRefinement
      :messages="editorData.chatInteraction.messages"
      :validateFn="editorData.chatInteraction.validationFn"
      :extractionFn="editorData.chatInteraction.extractionFn"
      :mutationFn="editorData.chatInteraction.mutationFn"
      :closeFn="() => editorData.setChatInteraction(null)"
      @accepted="llmQueryAccepted"
      v-if="editorData.chatInteraction"
    />
    <loading-view
      v-else-if="editorData.loading"
      :startTime="editorData.startTime"
      :cancel="editorData.cancelCallback"
    />
    <results-container
      v-else-if="
        (editorData.results.headers && editorData.results.headers.size > 0) || editorData.error
      "
      :results="editorData.results"
      :generatedSql="editorData.generated_sql || undefined"
      :containerHeight="containerHeight"
      :type="editorData.type"
      :chartConfig="editorData.chartConfig"
      :error="editorData.error || undefined"
      :symbols="editorData.completionSymbols"
      @config-change="(config) => editorData.setChartConfig(config)"
      @drilldown-click="(data) => handleDrilldown(data)"
      @refresh-click="() => $emit('refresh-click')"
    />
    <!-- <llm-interaction></llm-interaction> -->
    <hint-component v-else />
  </div>
</template>

<script lang="ts">
import LoadingView from '../LoadingView.vue'
import ErrorMessage from '../ErrorMessage.vue'
import LoadingButton from '../LoadingButton.vue'
import ResultsContainer from './Results.vue'
import HintComponent from '../HintComponent.vue'
import LLMChatRefinement from '../llm/LLMChatRefinement.vue'
import { inject, type PropType } from 'vue'
import type { ConnectionStoreType } from '../../stores/connectionStore.ts'
import type { EditorModel } from '../../main.ts'

export default {
  name: 'ResultsView',
  components: {
    LoadingView,
    ErrorMessage,
    LoadingButton,
    ResultsContainer,
    HintComponent,
    LLMChatRefinement,
  },
  props: {
    editorData: {
      type: Object as PropType<EditorModel>,
      required: true,
    },
    containerHeight: {
      type: Number,
      default: 0,
    },
  },
  setup() {
    const connectionStore = inject<ConnectionStoreType>('connectionStore')

    if (!connectionStore) {
      throw new Error('Requires injection of connection store')
    }

    return {
      connectionStore,
    }
  },
  methods: {
    llmQueryAccepted() {
      this.$emit('llm-query-accepted')
    },
    handleDrilldown(data: any) {
      this.$emit('drilldown-click', data)
    },
  },
}
</script>

<style scoped>
.results-view {
  height: 100%;
  display: flex;
  flex-direction: column;
}
</style>
