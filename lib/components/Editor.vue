<template>
  <div class="parent">
    <error-message v-if="!editorData">An editor by this name could not be found.</error-message>
    <template v-else>
      <div class="menu-bar">
        <div class="menu-left">
          <div class="menu-title" @click="startEditing">
            <span v-if="!isEditing" class="editable-text">
              {{ editorData.name }}
              <span class="edit-indicator">✎</span>
            </span>
            <input
              v-else
              ref="nameInput"
              v-model="editableName"
              @blur="finishEditing"
              @keyup.enter="finishEditing"
              @keyup.esc="cancelEditing"
              class="name-input"
              type="text"
            />
          </div>
        </div>
        <div class="menu-actions">
          <button
            v-if="editorData.type === 'sql'"
            class="toggle-button tag-inactive action-item"
            :class="{ tag: editorData.tags.includes(EditorTag.STARTUP_SCRIPT) }"
            @click="toggleTag(EditorTag.STARTUP_SCRIPT)"
          >
            {{ editorData.tags.includes(EditorTag.STARTUP_SCRIPT) ? 'Is' : 'Set as' }} Startup
            Script
          </button>
          <loading-button
            v-if="!(editorData.type === 'sql') && connectionHasModel"
            class="toggle-button tag-inactive action-item"
            :class="{ tag: editorData.tags.includes(EditorTag.SOURCE) }"
            :action="() => toggleTag(EditorTag.SOURCE)"
          >
            {{ editorData.tags.includes(EditorTag.SOURCE) ? 'Is' : 'Set as' }} Source
          </loading-button>
          <button class="action-item" @click="$emit('save-editors')">Save</button>
          <loading-button
            v-if="!(editorData.type === 'sql')"
            :useDefaultStyle="false"
            class="action-item"
            :action="validateQuery"
            >Parse</loading-button
          >

          <button
            @click="() => (editorData.loading ? cancelQuery() : runQuery())"
            class="action-item"
            :class="{ 'button-cancel': editorData.loading }"
            data-testid="editor-run-button"
          >
            {{ editorData.loading ? 'Cancel' : 'Run' }}
          </button>
        </div>
      </div>
      <div class="editor-content">
        <div ref="editor" id="editor" class="editor-fix-styles" data-testid="editor"></div>
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

.tag {
  /* Push to the right */
  font-size: 8px;
  /* margin-left: 5px; */
  border-radius: 3px;
  padding: 2px;
  background-color: hsl(210, 100%, 50%, 0.25);
  border: 1px solid hsl(210, 100%, 50%, 0.5);
  color: var(--tag-font);
  line-height: 10px;
}

.tag-inactive {
  /* Push to the right */
  font-size: 8px;
  /* margin-left: 5px; */
  border-radius: 3px;
  padding: 2px;
  color: var(--tag-font);
  line-height: 10px;
}

.parent {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.menu-bar {
  background-color: var(--sidebar-bg);
  display: flex;
  gap: 0.5rem;
  /* Add some spacing between wrapped elements */
  padding: 0.25rem;
  justify-content: space-between;
  padding-right: 0.5rem;
  height: 40px;
}

.menu-actions {
  display: flex;
  /* Allow buttons to move to a new line */
  justify-content: flex-end;
  gap: 0.15rem;
  /* Spacing between buttons */
  align-items: center;
  flex-grow: 1;
}

.action-item {
  height: 25px;
  width: 80px;
  font-weight: 500;
  cursor: pointer;
  border-radius: 0px;
  border: 1px solid var(--border-color);
  cursor: pointer;
  /* margin-right: 0.75rem; */
  transition:
    background-color 0.3s ease,
    color 0.3s ease;
}

.menu-left {
  display: flex;
  align-items: center;
  gap: 1.5rem;
}

.menu-title {
  font-weight: 500;
  cursor: pointer;
  padding: 0.375rem;
  border-radius: 4px;
  display: flex;
  align-items: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.menu-title:hover .edit-indicator {
  opacity: 1;
}

.editable-text {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.edit-indicator {
  opacity: 0;
  font-size: 0.875rem;
  transition: opacity 0.2s ease;
}

.name-input {
  background: var(--bg-color);
  border: 1px solid #ced4da;
  border-radius: 4px;
  padding: 0.375rem 0.75rem;
  font-size: inherit;
  font-weight: 500;
  width: auto;
  min-width: 200px;
}

.name-input:focus {
  outline: none;
  border-color: #339af0;
  box-shadow: 0 0 0 2px rgba(51, 154, 240, 0.1);
}

.editor-fix-styles {
  text-align: left;
  border: none;
  height: calc(100% - 40px);
  position: relative;
  width: 100%;
}

.button-cancel {
  background-color: var(--error-color);
  color: white;
  border: 1px solid var(--error-color);
}

/* device specific */
@media screen and (max-width: 768px) {
  .menu-bar {
    height: 60px;
    display: block;
  }

  .menu-left {
    justify-content: center;
  }

  .editor-fix-styles {
    height: calc(100% - 80px);
  }

  .menu-actions {
    display: flex;
    justify-content: center;
    flex-wrap: nowrap;
    gap: 0.1rem;
    /* Spacing between buttons */
    align-items: center;
    width: 100%;
  }

  .action-item {
    height: 25px;
    flex-grow: 1;
    /* max-width: 80px; */
    width: auto;
    font-weight: 500;
    cursor: pointer;
    border-radius: 0px;
    border: 1px solid var(--border);
    cursor: pointer;
    margin-left: 0rem;
    transition:
      background-color 0.3s ease,
      color 0.3s ease;
  }

  .menu-left {
    width: 100%;
  }
}
</style>
<script lang="ts">
import { defineComponent, inject } from 'vue'

import { editor, KeyMod, KeyCode } from 'monaco-editor'
import type { IRange } from 'monaco-editor'

import type { ConnectionStoreType } from '../stores/connectionStore.ts'
import type { EditorStoreType } from '../stores/editorStore.ts'
import type { UserSettingsStoreType } from '../stores/userSettingsStore.ts'
import type { ModelConfigStoreType } from '../stores/modelStore.ts'
import type { LLMConnectionStoreType } from '../stores/llmStore.ts'
import { Results } from '../editors/results'
import type { QueryInput } from '../stores/queryExecutionService'

import AxiosResolver from '../stores/resolver'
import type { Import } from '../stores/resolver'
import LoadingButton from './LoadingButton.vue'
import ErrorMessage from './ErrorMessage.vue'
import { EditorTag } from '../editors'
import type { ContentInput } from '../stores/resolver'
import QueryExecutionService from '../stores/queryExecutionService'
import type { QueryResult, QueryUpdate } from '../stores/queryExecutionService'
import SymbolsPane from './SymbolsPane.vue'

let editorMap: Map<string, editor.IStandaloneCodeEditor> = new Map()
let mountedMap: Map<string, boolean> = new Map()

interface QueryPartial {
  text: string
  queryType: string
  editorType: 'trilogy' | 'sql' | 'preql'
  sources: ContentInput[]
  imports: Import[]
}

function getEditorText(editor: editor.IStandaloneCodeEditor, fallback: string): string {
  const selected = editor.getSelection()
  let text =
    selected &&
    !(
      selected.startColumn === selected.endColumn &&
      selected.startLineNumber === selected.endLineNumber
    )
      ? (editor.getModel()?.getValueInRange(selected) as string)
      : editor.getValue()
  // hack for mobile? getValue not returning values
  if (!text) {
    text = fallback
  }
  return text
}

function getEditorRange(editor: editor.IStandaloneCodeEditor): IRange {
  const selection = editor.getSelection()

  // Check if there's a valid selection (not just a cursor position)
  if (
    selection &&
    !(
      selection.startColumn === selection.endColumn &&
      selection.startLineNumber === selection.endLineNumber
    )
  ) {
    // Return the selected range
    return {
      startLineNumber: selection.startLineNumber,
      startColumn: selection.startColumn,
      endLineNumber: selection.endLineNumber,
      endColumn: selection.endColumn,
    }
  } else {
    // No selection, return a range representing the start of the editor
    return {
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 1,
      endColumn: 1,
    }
  }
}

export default defineComponent({
  name: 'Editor',
  props: {
    context: {
      type: String,
      required: true,
    },
    editorId: {
      type: String,
      required: true,
    },
    containerHeight: {
      type: Number,
      required: false,
    },
  },
  data() {
    return {
      last_passed_query_text: null,
      prompt: '',
      generatingPrompt: false,
      info: 'Query processing...',
      isEditing: false,
      editableName: '',
    }
  },
  components: {
    LoadingButton,
    ErrorMessage,
    SymbolsPane,
  },
  setup() {
    const connectionStore = inject<ConnectionStoreType>('connectionStore')
    const editorStore = inject<EditorStoreType>('editorStore')
    const modelStore = inject<ModelConfigStoreType>('modelStore')
    const llmStore = inject<LLMConnectionStoreType>('llmConnectionStore')
    const trilogyResolver = inject<AxiosResolver>('trilogyResolver')
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
  async mounted() {
    this.$nextTick(() => {
      this.createEditor()
      this.validateQuery(false)
    })
    mountedMap.set(this.context, true)
  },
  unmounted() {
    editorMap.get(this.context)?.dispose()
    editorMap.delete(this.context)
    mountedMap.delete(this.context)
  },
  computed: {
    connectionHasModel() {
      return this.connectionStore.connections[this.editorData.connection].model !== null
    },
    editorData() {
      return this.editorStore.editors[this.editorId]
    },
    error() {
      return this.editorData.error
    },
    loading() {
      return this.editorData.loading
    },
    result() {
      return this.editorData.results
    },
    passedQuery() {
      return this.editorData.contents === this.last_passed_query_text
    },
    generateOverlayVisible() {
      return this.prompt.length > 1 || this.generatingPrompt
    },
  },
  watch: {
    editorId: {
      handler() {
        this.$nextTick(() => {
          this.createEditor()
          this.validateQuery(false)
        })
      },
    },
    // containerHeight: {
    //   handler() {
    //     this.$nextTick(() => {
    //       let editor = editorMap.get(this.context)
    //       if (editor) {
    //         editor.layout()
    //       }
    //     })
    //   },
    // },
  },

  methods: {
    toggleTag(tag: EditorTag) {
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
        ? this.editorData.tags.filter((tag) => tag !== tag)
        : [...this.editorData.tags, tag]
    },
    startEditing() {
      this.isEditing = true
      this.editableName = this.editorData.name
      this.$nextTick(() => {
        // @ts-ignore
        this.$refs.nameInput.focus()
      })
    },
    finishEditing() {
      this.isEditing = false
      this.editorStore.updateEditorName(this.editorId, this.editableName)
      this.setActiveEditor(this.editableName)
    },
    cancelEditing() {
      this.isEditing = false
    },

    async validateQuery(
      log: boolean = true,
      sources: ContentInput[] | null = null,
    ): Promise<Import[] | null> {
      const editorItem = editorMap.get(this.context)
      // TODO - syntax validation for SQL?
      if (!editorItem || this.editorData.type === 'sql') {
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
      let annotations = await this.trilogyResolver.validate_query(editorItem.getValue(), sources)
      let model = editorItem.getModel()
      if (!model) {
        return null
      }

      editor.setModelMarkers(model, 'owner', annotations.data.items)
      this.editorData.completionSymbols = annotations.data.completion_items
      return annotations.data.imports
    },
    async cancelQuery() {
      if (this.editorData.cancelCallback) {
        await this.editorData.cancelCallback()
      }
      this.editorData.loading = false
    },

    async formatQuery() {
      const editorItem = editorMap.get(this.context)
      if (!editorItem) {
        return
      }
      const text = getEditorText(editorItem, this.editorData.contents)
      if (!text) {
        return
      }
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
          editorItem.setValue(formatted.data.text)
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

      const editor = editorMap.get(this.context)
      if (this.loading || !editor) {
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

      // Get selected text or full content
      const text = getEditorText(editor, this.editorData.contents)
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
      //callback all use cached editor name
      // in case user has navigated away
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
    },

    getEditor() {
      editorMap.get(this.editorId)
    },

    createEditor() {
      let editorElement = document.getElementById('editor')
      if (!editorElement) {
        return
      }

      // if we've already set up the editor
      if (editorMap.has(this.context) && mountedMap.get(this.context)) {
        editorMap.get(this.context)?.setValue(this.editorData.contents)
        return
      }

      const editorItem = editor.create(editorElement, {
        value: this.editorData.contents,
        language: this.editorData.type === 'sql' ? 'sql' : 'trilogy',
        automaticLayout: true,
        autoClosingBrackets: 'always',
        autoClosingOvertype: 'always',
        autoClosingQuotes: 'always',
        acceptSuggestionOnEnter: 'off',
        tabCompletion: 'on',
      })
      editorMap.set(this.context, editorItem)
      editorItem.layout()
      editor.defineTheme('trilogyStudio', {
        base: this.userSettingsStore.getSettings.theme == 'light' ? 'vs' : 'vs-dark', // can also be vs-dark or hc-black
        inherit: true, // can also be false to completely replace the builtin rules
        rules: [
          { token: 'comment', foreground: '#6A9955', fontStyle: 'italic' }, // Green for comments
          { token: 'keyword', foreground: '#569CD6', fontStyle: 'bold' }, // Blue for keywords
          { token: 'definition', foreground: '#E5C07B', fontStyle: 'bold' }, // Light yellow for function definitions
          { token: 'type', foreground: '#4EC9B0', fontStyle: 'bold' }, // Teal for types (like int, string, etc.)
          { token: 'string', foreground: '#CE9178' }, // Light orange for strings
          { token: 'number', foreground: '#B5CEA8' }, // Light green for numbers
          { token: 'operator', foreground: '#D4D4D4' }, // Light gray for operators
          { token: 'delimiter', foreground: '#D4D4D4' }, // Light gray for delimiters (like commas, colons)
          { token: 'function', foreground: '#C586C0', fontStyle: 'bold' }, // Light gray for delimiters (like commas, colons)
          { token: 'hidden', foreground: '#D6D6C8', fontStyle: 'italic' }, // hidden should be whitish
          { token: 'property', foreground: '#BFBFBF' }, //italicize properties
        ],
        colors: {
          // 'editor.foreground': '#F8F8F8',
          // 'editor.background': '#000000',
          // 'editorCursor.foreground': '#8B0000',
          // 'editor.lineHighlightBackground': '#0000FF20',
          // 'editorLineNumber.foreground': '#008800',
          // 'editor.selectionBackground': '#88000030',
          // 'editor.inactiveSelectionBackground': '#88000015'
        },
      })
      editor.setTheme('trilogyStudio')
      let suggestDebounceTimer: number | null = null
      const keywordsToWatch: string[] = [';'] // customize these
      let keywordDebounceTimer: number | null = null
      const keywordDebounceDelay = 500 // milliseconds
      editorItem.onDidChangeModelContent((event) => {
        // Save editor contents as before
        const currentContent = editorItem.getValue()
        this.editorStore.setEditorContents(this.editorId, currentContent)

        // Handle suggestion debounce (your existing functionality)
        if (suggestDebounceTimer) {
          clearTimeout(suggestDebounceTimer)
        }

        suggestDebounceTimer = window.setTimeout(() => {
          if (editorItem.hasTextFocus() && !editorItem.getSelection()?.isEmpty()) {
            editorItem.trigger('completion', 'editor.action.triggerSuggest', { auto: true })
          }
        }, 200)

        // Add keyword checking with debounce, focusing on changes
        if (keywordDebounceTimer) {
          clearTimeout(keywordDebounceTimer)
        }

        keywordDebounceTimer = window.setTimeout(() => {
          // Get the changes from the event
          const changes = event.changes
          let newContent = ''

          // Extract only the new text that was added
          changes.forEach((change) => {
            if (change.text) {
              newContent += change.text
            }
          })

          // Check if new content contains any of the keywords
          const containsKeyword = keywordsToWatch.some((keyword) =>
            newContent.toLowerCase().includes(keyword.toLowerCase()),
          )

          if (containsKeyword) {
            console.log('statement finished')
          }
        }, keywordDebounceDelay)
      })
      editorItem.addCommand(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyV, () => {
        this.validateQuery()
      })
      editorItem.addCommand(KeyMod.CtrlCmd | KeyCode.Enter, () => {
        this.runQuery()
      })
      if (this.editorData.type !== 'sql') {
        editorItem.addCommand(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Enter, async () => {
          if (!this.loading && this.llmStore) {
            try {
              this.editorData.loading = true
              this.editorData.setError(null)
              await this.validateQuery(false)
              let text = getEditorText(editorItem, this.editorData.contents)
              // get range at time of submission
              let range = getEditorRange(editorItem)
              // run our async call
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
              await Promise.all([this.llmStore.generateQueryCompletion(text, concepts)])
                .then((results) => {
                  let query = results[0]
                  if (query) {
                    let op = { range: range, text: `${text}\n${query}`, forceMoveMarkers: true }
                    editorItem.executeEdits('gen-ai-prompt-shortcut', [op])
                    this.editorData.contents = editorItem.getValue()
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
                this.editorData.setError(error.message)
              } else {
                this.editorData.setError('Unknown error occured')
              }
            } finally {
              this.editorData.loading = false
            }
          }
        })
      }
      if (this.editorData.type !== 'sql') {
        editorItem.addCommand(KeyMod.CtrlCmd | KeyCode.KeyK, async () => {
          this.formatQuery()
        })
      }

      editorItem.addCommand(KeyMod.CtrlCmd | KeyCode.KeyS, () => {
        this.$emit('save-editors')
      })

      editorItem.addCommand(KeyMod.CtrlCmd | KeyCode.KeyZ, () => {
        editorItem.trigger('ide', 'undo', {})
        this.editorData.contents = editorItem.getValue()
      })
    },
  },
})
</script>
