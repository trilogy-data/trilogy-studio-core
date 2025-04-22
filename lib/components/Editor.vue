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
      />
      <div class="editor-content">
        <!-- Replace the original editor with our CodeEditor component -->
        <code-editor
          ref="codeEditor"
          :editor-id="editorId"
          :context="context"
          :contents="editorData.contents"
          :editor-type="editorData.type"
          :theme="userSettingsStore.getSettings.theme"
          @contents-change="handleContentsChange"
          @run-query="runQuery"
          @validate-query="validateQuery"
          @format-query="formatQuery"
          @generate-llm-query="generateLLMQuery"
          @save="$emit('save-editors')"
        />
        <SymbolsPane
          :symbols="editorData.completionSymbols || []"
          ref="symbolsPane"
          v-if="!isMobile"
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
  min-height: 250px;
}

.parent {
  display: flex;
  flex-direction: column;
  height: 100%;
}
</style>

<script lang="ts">
import { defineComponent, inject, type PropType } from 'vue'
import type { ConnectionStoreType } from '../stores/connectionStore.ts'
import type { EditorStoreType } from '../stores/editorStore.ts'
import type { UserSettingsStoreType } from '../stores/userSettingsStore.ts'
import type { ModelConfigStoreType } from '../stores/modelStore.ts'
import type { LLMConnectionStoreType } from '../stores/llmStore.ts'
import { Results } from '../editors/results'
import type { QueryInput } from '../stores/queryExecutionService'

import FetchResolver from '../stores/resolver'
import type { Import } from '../stores/resolver'
import LoadingButton from './LoadingButton.vue'
import ErrorMessage from './ErrorMessage.vue'
import { EditorTag } from '../editors'
import type { ContentInput } from '../stores/resolver'
import QueryExecutionService from '../stores/queryExecutionService'
import type { QueryResult, QueryUpdate } from '../stores/queryExecutionService'
import SymbolsPane from './SymbolsPane.vue'
import EditorHeader from './EditorHeader.vue'
import CodeEditor from './EditorCode.vue'

// Define interfaces for the refs
interface CodeEditorRef {
  getEditorInstance: () => any
  getEditorText: (text: string) => string
  getEditorRange: () => any
  setValue: (text: string) => void
  executeEdits: (source: string, edits: any[]) => void
  setModelMarkers: (model: any, owner: string, markers: any[]) => void
}
// Define the query partial interface
interface QueryPartial {
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
    }
  },
  computed: {
    connectionHasModel(): boolean {
      return this.connectionStore.connections[this.editorData.connection].model !== null
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
    },

    toggleTag(tag: EditorTag): void {
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
      }
      this.editorData.tags = this.editorData.tags.includes(tag)
        ? this.editorData.tags.filter((t) => t !== tag)
        : [...this.editorData.tags, tag]
    },

    // New method to handle content changes from the CodeEditor
    handleContentsChange(content: string): void {
      this.editorStore.setEditorContents(this.editorId, content)
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
          // @ts-ignore
          window.goatcounter.count({
            path: 'studio-query-validate',
            title: this.editorData.type,
            event: true,
          })
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
          ? this.modelStore.models[conn.model].sources.map((source) => ({
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
          ? this.modelStore.models[conn.model].sources.map((source) => ({
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

    async runQuery(): Promise<any> {
      this.$emit('query-started')
      this.editorData.setError(null)
      const id = this.editorId
      const codeEditorRef = this.$refs.codeEditor as CodeEditorRef | undefined

      if (this.loading || !codeEditorRef) {
        return
      }

      try {
        // Analytics tracking (unchanged)
        // @ts-ignore
        window.goatcounter.count({
          path: 'studio-query-execution',
          title: this.editorData.type,
          event: true,
        })
      } catch (error) {
        console.log(error)
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
        queryType: queryPartial.queryType,
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
        console.log(`calling success callback for ${id}`)
        let editor = this.editorStore.editors[id]
        if (result.success) {
          if (result.generatedSql) {
            editor.generated_sql = result.generatedSql
          }
          if (result.results) {
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

      const onError = (error: any) => {
        console.error('Query execution error:', error)
        let editor = this.editorStore.editors[id]
        editor.setError(error.message || 'An error occurred during query execution')
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

      await resultPromise
      this.$emit('query-finished')
    },

    // Add the LLM query generation method
    async generateLLMQuery(): Promise<void> {
      if (!this.loading && this.llmStore) {
        try {
          let editorId = this.editorData.id
          this.editorData.loading = true
          this.editorData.startTime = Date.now()
          this.editorData.results = new Results(new Map(), [])
          this.editorData.setError(null)

          // Get text and range from the CodeEditor
          const codeEditorRef = this.$refs.codeEditor as CodeEditorRef | undefined
          if (!codeEditorRef) {
            throw new Error('Code editor reference not found')
          }

          const text = codeEditorRef.getEditorText(this.editorData.contents)
          const range = codeEditorRef.getEditorRange()

          await this.validateQuery(false)

          // Run our async call
          let concepts = this.editorData.completionSymbols.map((item) => ({
            name: item.label,
            type: item.datatype,
            description: item.description,
          }))

          if (concepts.length === 0) {
            this.editorData.setError('There are no imported concepts for LLM generation')
            throw new Error(
              'Invalid editor for LLM generation - there are no parsed concepts. Check imports and concept definitions.',
            )
          }

          const validator = async (text: string): Promise<boolean> => {
            const queryPartial = await this.buildQueryArgs(text)
            const queryInput: QueryInput = {
              // run an explain here, not the query
              text,
              queryType: queryPartial.queryType,
              editorType: queryPartial.editorType,
              imports: queryPartial.imports,
            }

            const onError = (error: any) => {
              throw error
            }

            let results = await this.queryExecutionService.executeQuery(
              this.editorData.connection,
              queryInput,
              // Starter callback (empty for now)
              () => {},
              // Progress callback
              () => {},
              // Failure callback
              onError,
              // Success callback
              () => {
                return true
              },
              true,
            )
            // wait on that promise
            await results.resultPromise
            return true
          }

          await this.llmStore
            .generateQueryCompletion(text, concepts, validator)
            .then((query) => {
              if (query) {
                // Get the target editor directly
                let targetEditor = this.editorStore.editors[editorId]
                if (!targetEditor) {
                  throw new Error('Target editor not found.')
                }

                // Determine where to insert the query text
                // If we have a range, calculate the insertion position
                let insertionPosition = range
                  ? range.startLineNumber
                  : targetEditor.contents.split('\n').length

                // Split the content into lines
                let contentLines = targetEditor.contents.split('\n')

                // Insert the query at the appropriate position
                contentLines.splice(insertionPosition, 0, query)

                // Update the editor contents directly
                targetEditor.setContent(contentLines.join('\n'))

                // Also update the CodeEditor with the new content
                if (this.editorData.id === editorId && this.$refs.codeEditor) {
                  const codeEditorRef = this.$refs.codeEditor as CodeEditorRef
                  let op = { range: range, text: `${text}\n${query}`, forceMoveMarkers: true }
                  codeEditorRef.executeEdits('gen-ai-prompt-shortcut', [op])
                }
              } else {
                throw new Error('LLM could not successfully generate query.')
              }
            })
            .catch((error) => {
              this.editorData.setError(error)
              throw error
            })
            .finally(() => {})
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
