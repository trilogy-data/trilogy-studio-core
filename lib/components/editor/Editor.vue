<template>
  <div class="parent">
    <error-message v-if="!editorData"
      >An editor by this ID ({{ editorId }}) could not be found.</error-message
    >
    <template v-else>
      <editor-header
        :name="editorData.name"
        :editor-type="editorData.type"
        :tags="editorData.tags"
        :loading="editorData.loading"
        :connection-has-model="connectionHasModel"
        @name-update="updateEditorName"
        @save="$emit('save-editors')"
        @validate="validateQuery"
        @run="runQuery"
        @cancel="cancelQuery"
        @toggle-tag="toggleTag"
        @generate="handleLLMTrigger"
      />
      <div class="editor-content">
        <code-editor
          ref="codeEditor"
          :id="context"
          :editor-id="editorId"
          :context="context"
          :contents="editorData.contents"
          :editor-type="editorData.type"
          :scroll-position="editorData.scrollPosition"
          :theme="userSettingsStore.getSettings.theme"
          :editorHeight="containerHeight"
          @contents-change="handleContentsChange"
          @scroll-change="handlePositionChange"
          @run-query="runQuery"
          @validate-query="validateQuery"
          @format-query="formatQuery"
          @generate-llm-query="handleLLMTrigger"
          @drill-query="drilldownQuery"
          @save="$emit('save-editors')"
          @go-to-definition-requested="goToDefinition"
        />
        <SymbolsPane
          :symbols="editorData.completionSymbols || []"
          @select-symbol="insertSymbol"
          ref="symbolsPane"
          v-if="!isMobile"
          :editorHeight="containerHeight"
        />
      </div>
    </template>
  </div>
</template>

<style>
.editor-content {
  display: flex;
  flex-grow: 1;
  position: relative;
}

.parent {
  display: flex;
  flex-direction: column;
  height: 100%;
}
</style>

<script lang="ts">
import { defineComponent, inject, type PropType } from 'vue'
import type { ConnectionStoreType } from '../../stores/connectionStore.ts'
import type { EditorStoreType } from '../../stores/editorStore.ts'
import type { UserSettingsStoreType } from '../../stores/userSettingsStore.ts'
import type { ModelConfigStoreType } from '../../stores/modelStore.ts'
import type { LLMConnectionStoreType } from '../../stores/llmStore.ts'
import type { NavigationStore } from '../../stores/useScreenNavigation.ts'
import { Results } from '../../editors/results.ts'
import type { QueryInput } from '../../stores/queryExecutionService.ts'

import FetchResolver from '../../stores/resolver.ts'
import type { Import, CompletionItem } from '../../stores/resolver'
import LoadingButton from '../LoadingButton.vue'
import ErrorMessage from '../ErrorMessage.vue'
import { EditorTag } from '../../editors/index.ts'
import type { ContentInput } from '../../stores/resolver.ts'
import QueryExecutionService from '../../stores/queryExecutionService.ts'
import type { QueryResult, QueryUpdate } from '../../stores/queryExecutionService.ts'
import SymbolsPane from '../SymbolsPane.vue'
import EditorHeader from './EditorHeader.vue'
import CodeEditor from './EditorCode.vue'
import { Range } from 'monaco-editor'
import { type AnalyticsStoreType } from '../../stores/analyticsStore.ts'
import { type GoToDefinitionEvent } from './events'

// Define interfaces for the refs
interface CodeEditorRef {
  getEditorInstance: () => any
  getEditorText: (text: string) => string
  getEditorRange: () => any
  setValue: (text: string) => void
  setSelection: (range: Range) => void
  executeEdits: (source: string, edits: any[]) => void
  setModelMarkers: (model: any, owner: string, markers: any[]) => void
}
// Define the query partial interface
export interface QueryPartial {
  text: string
  queryType: string
  editorType: 'trilogy' | 'sql' | 'preql'
  sources: ContentInput[]
  imports: Import[]
}

export default defineComponent({
  name: 'Editor',
  props: {
    context: {
      type: String as PropType<string>,
      required: true,
    },
    editorId: {
      type: String as PropType<string>,
      required: true,
    },
    containerHeight: {
      type: Number as PropType<number>,
      required: false,
    },
  },
  data() {
    return {
      last_passed_query_text: null as string | null,
      prompt: '',
      generatingPrompt: false,
      info: 'Query processing...',
    }
  },
  components: {
    LoadingButton,
    ErrorMessage,
    SymbolsPane,
    EditorHeader,
    CodeEditor,
  },
  emits: ['save-editors', 'save-models', 'query-started', 'query-finished'],
  watch: {
    editorHeight(newHeight) {
      console.log('Editor height changed in Editor:', newHeight)
    },
  },
  setup() {
    const connectionStore = inject<ConnectionStoreType>('connectionStore')
    const editorStore = inject<EditorStoreType>('editorStore')
    const modelStore = inject<ModelConfigStoreType>('modelStore')
    const llmStore = inject<LLMConnectionStoreType>('llmConnectionStore')
    const trilogyResolver = inject<FetchResolver>('trilogyResolver')
    const userSettingsStore = inject<UserSettingsStoreType>('userSettingsStore')
    const isMobile = inject<boolean>('isMobile', false)
    const setActiveEditor = inject<Function>('setActiveEditor')
    const queryExecutionService = inject<QueryExecutionService>('queryExecutionService')
    const analyticsStore = inject<AnalyticsStoreType>('analyticsStore')
    const navigationStore = inject<NavigationStore>('navigationStore')
    if (!analyticsStore) {
      throw new Error('Analytics store is required')
    }
    analyticsStore.log('studio-editor-open', 'editor', true)

    if (
      !editorStore ||
      !connectionStore ||
      !trilogyResolver ||
      !modelStore ||
      !userSettingsStore ||
      !setActiveEditor ||
      !queryExecutionService
    ) {
      throw new Error('Editor store and connection store and trilogy resolver are not provided!')
    }

    return {
      isMobile,
      connectionStore,
      modelStore,
      llmStore,
      editorStore,
      trilogyResolver,
      EditorTag,
      userSettingsStore,
      setActiveEditor,
      queryExecutionService,
      analyticsStore,
      navigationStore,
    }
  },
  computed: {
    connectionHasModel(): boolean {
      if (!this.editorData || !this.editorData.connection) {
        return false
      }
      return this.connectionStore.connections[this.editorData.connection]?.model !== null
    },
    editorData() {
      return this.editorStore.editors[this.editorId]
    },
    error(): string | null {
      return this.editorData.error
    },
    loading(): boolean {
      return this.editorData.loading
    },
    result() {
      return this.editorData.results
    },
    passedQuery(): boolean {
      return this.editorData.contents === this.last_passed_query_text
    },
    generateOverlayVisible(): boolean {
      return this.prompt.length > 1 || this.generatingPrompt
    },
  },
  methods: {
    goToDefinition(e: GoToDefinitionEvent): void {
      let parsedPath = e.importPath.replace('.', '/')
      let model = this.connectionStore.connections[this.editorData.connection].model
      // if the parsedPath starts with 'std', not supported yet
      // exit early
      if (parsedPath.startsWith('std')) {
        return
      }
      if (model) {
        let modelConfig = this.modelStore.models[model]
        let foundEditor = modelConfig.getEditorByName(parsedPath)
        if (foundEditor) {
          this.navigationStore?.openTab('editors', null, foundEditor)
        }
      }
    },
    setContent(newContent: string) {
      // Update the editor store
      this.editorStore.setEditorContents(this.editorId, newContent)

      // Also update the Monaco editor directly if needed
      const codeEditorRef = this.$refs.codeEditor as CodeEditorRef
      if (codeEditorRef) {
        codeEditorRef.setValue(newContent)
      }
    },
    updateEditorName(newName: string): void {
      this.editorStore.updateEditorName(this.editorId, newName)
      let isSource = this.editorData.tags.includes(EditorTag.SOURCE)
      if (isSource) {
        let model = this.connectionStore.connections[this.editorData.connection].model
        if (model) {
          this.modelStore.models[model].updateModelSourceName(this.editorData.id, newName)
          this.$emit('save-models')
        }
      }
      if (this.navigationStore) {
        this.navigationStore.updateTabName('editors', null, this.editorId)
      }
    },

    toggleTag(tag: EditorTag): void {
      if (tag === EditorTag.SOURCE) {
        let isSource = this.editorData.tags.includes(tag)

        if (!isSource) {
          let model = this.connectionStore.connections[this.editorData.connection].model
          if (model) {
            this.modelStore.models[model].addModelSourceSimple(
              this.editorData.id,
              this.editorData.name,
            )
            this.$emit('save-models')
          }
        } else {
          // If it's a source, we need to remove it from the model
          let model = this.connectionStore.connections[this.editorData.connection].model
          if (model) {
            this.modelStore.models[model].removeModelSourceSimple(this.editorData.id)
            this.$emit('save-models')
          }
        }
      }
      this.editorData.tags = this.editorData.tags.includes(tag)
        ? this.editorData.tags.filter((t) => t !== tag)
        : [...this.editorData.tags, tag]
    },

    // New method to handle content changes from the CodeEditor
    handleContentsChange(content: string): void {
      this.editorStore.setEditorContents(this.editorId, content)
    },

    insertSymbol(symbol: CompletionItem): void {
      if (!this.$refs.codeEditor) return
      let codeEditor = this.$refs.codeEditor as CodeEditorRef
      let instance = codeEditor.getEditorInstance()
      const position = instance.getPosition()
      if (position && symbol.insertText) {
        instance.executeEdits('', [
          {
            range: new Range(
              position.lineNumber,
              position.column,
              position.lineNumber,
              position.column,
            ),
            text: symbol.insertText,
          },
        ])
        instance.focus()
      }
    },

    handlePositionChange(scrollPosition: { line: number; column: number }): void {
      this.editorStore.setEditorScrollPosition(this.editorId, scrollPosition)
    },

    async validateQuery(
      log: boolean = true,
      sources: ContentInput[] | null = null,
    ): Promise<Import[] | null> {
      // Early return for SQL
      if (!this.editorData || this.editorData.type === 'sql') {
        console.log('Nothing to validate')
        return null
      }

      try {
        if (log) {
          if (this.analyticsStore) {
            this.analyticsStore.log('studio-query-validate', this.editorData.type, true)
          }
        }
      } catch (error) {
        console.log(error)
      }

      const conn = this.connectionStore.connections[this.editorData.connection]
      if (!conn) {
        console.log('Connection not found')
        this.editorData.setError(`Connection ${this.editorData.connection} not found.`)
        return null
      }

      if (!sources) {
        sources = conn.model
          ? (this.modelStore.models[conn.model].sources || []).map((source) => ({
              alias: source.alias,
              contents: this.editorStore.editors[source.editor]
                ? this.editorStore.editors[source.editor].contents
                : '',
            }))
          : []
      }

      const editorText = this.editorData.contents
      let annotations = await this.trilogyResolver.validate_query(editorText, sources)

      // Get editor instance from CodeEditor
      const codeEditorRef = this.$refs.codeEditor as CodeEditorRef | undefined
      if (codeEditorRef) {
        const editorInstance = codeEditorRef.getEditorInstance()
        if (editorInstance) {
          const model = editorInstance.getModel()
          if (model) {
            codeEditorRef.setModelMarkers(model, 'owner', annotations.data.items)
          }
        }
      }

      this.editorData.completionSymbols = annotations.data.completion_items
      return annotations.data.imports
    },

    async cancelQuery(): Promise<void> {
      if (this.editorData.cancelCallback) {
        await this.editorData.cancelCallback()
      }
      this.editorData.loading = false
    },

    async formatQuery(): Promise<void> {
      const codeEditorRef = this.$refs.codeEditor as CodeEditorRef | undefined
      if (!codeEditorRef) return

      const text = codeEditorRef.getEditorText(this.editorData.contents)
      if (!text) return

      const queryInput = await this.buildQueryArgs(text)
      try {
        const formatted = await this.trilogyResolver.format_query(
          text,
          queryInput.queryType,
          queryInput.editorType,
          queryInput.sources,
          queryInput.imports,
        )
        if (formatted.data && formatted.data.text) {
          codeEditorRef.setValue(formatted.data.text)
          this.editorData.contents = formatted.data.text
        }
      } catch (error) {
        console.error('Error formatting query:', error)
      }
    },

    async buildQueryArgs(text: string): Promise<QueryPartial> {
      // Prepare sources for validation
      // Prepare query input
      const conn = this.connectionStore.connections[this.editorData.connection]
      const sources: ContentInput[] =
        conn && conn.model
          ? (this.modelStore.models[conn.model].sources || []).map((source) => ({
              alias: source.alias,
              contents: this.editorStore.editors[source.editor]
                ? this.editorStore.editors[source.editor].contents
                : '',
            }))
          : []
      // Prepare imports
      let imports: Import[] = []
      if (this.editorData.type !== 'sql') {
        try {
          imports = (await this.validateQuery(false, sources)) || []
        } catch (error) {
          console.log('Validation failed. May not have proper imports.')
        }
      }

      // Create query input object
      const partial: QueryPartial = {
        text,
        queryType: conn ? conn.query_type : '',
        editorType: this.editorData.type,
        sources,
        imports,
      }
      return partial
    },
    async drilldownQuery(remove: string, add: string[], filter: string): Promise<void> {
      const codeEditorRef = this.$refs.codeEditor as CodeEditorRef | undefined
      if (!codeEditorRef) return

      const text = codeEditorRef.getEditorText(this.editorData.contents)
      if (!text) return

      const queryInput = await this.buildQueryArgs(text)
      try {
        const drilldown = await this.trilogyResolver.drilldown_query(
          text,
          queryInput.queryType,
          queryInput.editorType,
          remove,
          add,
          filter,
          // remove,
          // add,
          queryInput.sources,
          queryInput.imports,
        )
        if (drilldown.data && drilldown.data.text) {
          codeEditorRef.setValue(drilldown.data.text)
          this.editorData.contents = drilldown.data.text
        }
        await this.runQuery()
      } catch (error) {
        console.error('Error formatting query:', error)
      }
    },
    async runQuery(): Promise<any> {
      this.$emit('query-started')
      // clear existing error state (but keep refinement session so user can continue chatting)
      this.editorData.setError(null)

      const id = this.editorId
      const codeEditorRef = this.$refs.codeEditor as CodeEditorRef | undefined

      if (this.loading || !codeEditorRef) {
        return
      }

      try {
        if (this.analyticsStore) {
          this.analyticsStore.log('studio-query-execution', this.editorData.type, true)
        }
      } catch (error) {
        console.error(error)
      }

      // Set component to loading state
      this.editorData.startTime = Date.now()
      this.editorData.loading = true

      // Get selected text or full content from CodeEditor
      const text = codeEditorRef.getEditorText(this.editorData.contents)
      if (!text) {
        this.editorStore.setEditorResults(id, new Results(new Map(), []))
        this.editorData.loading = false
        return
      }

      // Create query input object
      const queryPartial = await this.buildQueryArgs(text)
      const queryInput: QueryInput = {
        text,
        editorType: queryPartial.editorType,
        imports: queryPartial.imports,
      }

      // Define callbacks with mounting status checks
      const onProgress = (message: QueryUpdate) => {
        let editor = this.editorStore.editors[id]
        if (message.error) {
          editor.loading = false
          editor.setError(message.message)
        }
        if (message.running) {
          editor.error = null
          editor.loading = true
        }
      }

      const onSuccess = (result: QueryResult) => {
        let editor = this.editorStore.editors[id]
        if (result.success) {
          if (result.generatedSql) {
            editor.generated_sql = result.generatedSql
          }
          if (result.results) {
            // check if the result headers have changed
            // and clear our cached chart config if so
            if (this.editorData.results && this.editorData.results.headers) {
              let identical =
                JSON.stringify(Array.from(this.editorData.results.headers.keys())) ==
                JSON.stringify(Array.from(result.results.headers.keys()))
              // changed is if the map keys are different
              if (!identical) {
                this.editorData.setChartConfig(null)
              }
            }
            this.editorStore.setEditorResults(id, result.results)
          }
        } else if (result.error) {
          editor.setError(result.error)
        }
        // Reset loading state
        editor.loading = false
        editor.cancelCallback = null
        editor.duration = result.executionTime
      }

      const onError = (error: QueryUpdate) => {
        console.error('Query execution error:', error.message)
        let editor = this.editorStore.editors[id]
        editor.setError(error.message || 'An error occurred during query execution')
        editor.generated_sql = error.generatedSql || null
        editor.loading = false
        editor.cancelCallback = null
      }

      // Execute query
      const { resultPromise, cancellation } = await this.queryExecutionService.executeQuery(
        this.editorData.connection,
        queryInput,
        // Starter callback (empty for now)
        () => {},
        // Progress callback
        onProgress,
        // Failure callback
        onError,
        // Success callback
        onSuccess,
      )

      // Handle cancellation callback
      this.editorData.cancelCallback = () => {
        if (cancellation.isActive()) {
          cancellation.cancel()
        }
        let editor = this.editorStore.editors[id]
        editor.loading = false
        editor.cancelCallback = null
      }

      const queryResult = await resultPromise
      this.$emit('query-finished')
      return queryResult
    },

    async handleLLMTrigger(): Promise<void> {
      if (this.editorData.type === 'sql') {
        await this.generateLLMQuerySQL()
      } else {
        await this.generateLLMQuery()
      }
    },

    // Public method to open LLM refinement (called from parent component)
    openLLMRefinement(): void {
      this.handleLLMTrigger()
    },

    // Open LLM refinement session for SQL editor
    async generateLLMQuerySQL(): Promise<void> {
      if (!this.llmStore || !this.editorData) {
        console.error('LLM store or editor data is not available')
        return
      }

      if (!this.loading && this.llmStore) {
        try {
          const editorId = this.editorData.id
          const targetEditor = this.editorStore.editors[editorId]
          if (!targetEditor) {
            throw new Error('Target editor not found.')
          }

          const codeEditorRef = this.$refs.codeEditor as CodeEditorRef | undefined
          if (!codeEditorRef) {
            throw new Error('Code editor reference not found')
          }

          const text = codeEditorRef.getEditorText(this.editorData.contents)
          const range: Range = codeEditorRef.getEditorRange()

          // Set up refinement session
          // Calculate selection range as character offsets
          let selectionRange: { start: number; end: number } | undefined
          let selectedText = ''
          if (range && text) {
            // Convert line/column to character offsets
            const lines = targetEditor.contents.split('\n')
            let startOffset = 0
            for (let i = 0; i < range.startLineNumber - 1; i++) {
              startOffset += lines[i].length + 1 // +1 for newline
            }
            startOffset += range.startColumn - 1

            let endOffset = 0
            for (let i = 0; i < range.endLineNumber - 1; i++) {
              endOffset += lines[i].length + 1
            }
            endOffset += range.endColumn - 1

            selectionRange = { start: startOffset, end: endOffset }
            selectedText = text
          }

          // Reuse existing session if available, otherwise create new one
          if (!this.editorData.hasActiveRefinement()) {
            this.editorData.setRefinementSession({
              messages: [],
              artifacts: [],
              originalContent: targetEditor.contents,
              currentContent: targetEditor.contents,
              selectedText,
              selectionRange,
            })
          }
          // If session exists, just show it (don't overwrite messages/artifacts)
        } catch (error) {
          if (error instanceof Error) {
            console.error('Error generating LLM SQL query:', error)
            this.editorData.setError(error.message)
          } else {
            this.editorData.setError('Unknown error occurred')
          }
        } finally {
          this.editorData.loading = false
        }
      }
    },
    // Open LLM refinement session for Trilogy editor
    async generateLLMQuery(): Promise<void> {
      if (!this.loading && this.llmStore) {
        try {
          const editorId = this.editorData.id
          const targetEditor = this.editorStore.editors[editorId]

          // Get text and range from the CodeEditor
          const codeEditorRef = this.$refs.codeEditor as CodeEditorRef | undefined
          if (!codeEditorRef) {
            throw new Error('Code editor reference not found')
          }

          const text = codeEditorRef.getEditorText(this.editorData.contents)
          const range: Range = codeEditorRef.getEditorRange()

          // Set up refinement session
          // Calculate selection range as character offsets
          let selectionRange: { start: number; end: number } | undefined
          let selectedText = ''
          if (range && text) {
            // Convert line/column to character offsets
            const lines = targetEditor.contents.split('\n')
            let startOffset = 0
            for (let i = 0; i < range.startLineNumber - 1; i++) {
              startOffset += lines[i].length + 1 // +1 for newline
            }
            startOffset += range.startColumn - 1

            let endOffset = 0
            for (let i = 0; i < range.endLineNumber - 1; i++) {
              endOffset += lines[i].length + 1
            }
            endOffset += range.endColumn - 1

            selectionRange = { start: startOffset, end: endOffset }
            selectedText = text
          }

          // Reuse existing session if available, otherwise create new one
          if (!this.editorData.hasActiveRefinement()) {
            this.editorData.setRefinementSession({
              messages: [],
              artifacts: [],
              originalContent: targetEditor.contents,
              currentContent: targetEditor.contents,
              selectedText,
              selectionRange,
            })
          }
          // If session exists, just show it (don't overwrite messages/artifacts)
        } catch (error) {
          if (error instanceof Error) {
            console.error('Error generating LLM query:', error)
            this.editorData.setError(error.message)
          } else {
            this.editorData.setError('Unknown error occured')
          }
        } finally {
          this.editorData.loading = false
        }
      }
    },
  },
})
</script>
