<template>
  <div class="editor-container">
    <div class="menu-bar">
      <div class="menu-actions">
        <button v-if="editor.type !== 'sql'" class="action-item" @click="() => validateQuery()">
          Parse
        </button>
        <button
          class="action-item"
          @click="generateLLMQuery"
          title="Generate query using AI"
          data-testid="editor-generate-button"
        >
          Generate
        </button>
        <button
          @click="editor.loading ? cancelQuery() : runQuery()"
          class="action-item"
          :class="{ 'button-cancel': editor.loading }"
          data-testid="editor-run-button"
        >
          {{ editor.loading ? 'Cancel' : 'Test' }}
        </button>
      </div>
    </div>
    <div class="editor-content">
      <div
        ref="editorElement"
        class="monaco-editor"
        :class="{
          'monaco-width-with-panel': isPanelVisible,
          'monaco-width-no-panel': !isPanelVisible,
        }"
        data-testid="simple-editor-content"
      ></div>
      <div class="sidebar-panel" v-show="isPanelVisible">
        <SymbolsPane
          :symbols="editor.completionSymbols || []"
          @select-symbol="insertSymbol"
          ref="symbolsPane"
        />
      </div>
      <div class="be-sidebar-container">
        <!-- Icon panel (always visible) -->
        <div class="be-sidebar-icons">
          <button
            class="sidebar-icon-button"
            :class="{ active: isPanelVisible }"
            @click="togglePanel('symbols')"
            title="Symbols"
          >
            <i class="mdi mdi-tag-search-outline"></i>
          </button>
          <!-- Add more icons for other panels here if needed -->
        </div>
      </div>
    </div>
    <div class="result-wrapper">
      <loading-view
        class="loading-view"
        v-if="editor.loading"
        :text="`Loading...`"
        :startTime="editor.startTime"
      />
      <div v-else-if="editor.error" class="error-message">{{ editor.error }}</div>
      <div v-else-if="lastOperation" class="results-summary" data-testid="simple-editor-results">
        <div :class="['status-badge', lastOperation.success ? 'success' : 'error']">
          {{ lastOperation.success ? 'SUCCESS' : 'FAILED' }}
        </div>
        <div class="results-details">
          <div v-if="lastOperation.duration" class="timing">{{ lastOperation.duration }}ms</div>
          <div v-if="lastOperation.rows !== undefined" class="row-count">
            {{ lastOperation.rows }} {{ lastOperation.rows === 1 ? 'row' : 'rows' }}
          </div>
          <div v-if="lastOperation.type" class="operation-type">
            {{ lastOperation.type }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, type PropType } from 'vue'
import * as monaco from 'monaco-editor'
import {
  configureEditorTheme,
  createMonacoEditor,
  getEditorText,
  setupEditorKeybindings,
} from '../monaco/editorHelpers'
import { EditorModel } from '../main'
import { Results } from '../editors/results'
import type { ConnectionStoreType } from '../stores/connectionStore'
import type QueryExecutionService from '../stores/queryExecutionService'
import { type QueryUpdate } from '../stores/queryExecutionService'
import type { Import, CompletionItem } from '../stores/resolver'
import SymbolsPane from './SymbolsPane.vue'
import LoadingView from './LoadingView.vue'

interface OperationState {
  success: boolean
  duration: number
  rows?: number
  type: string
}

let globalEditor: monaco.editor.IStandaloneCodeEditor | null = null

export default defineComponent({
  name: 'EnhancedEditor',
  components: {
    SymbolsPane,
    LoadingView,
  },
  props: {
    onSave: {
      type: null as unknown as PropType<(() => void) | null>,
      required: false,
      default: null,
    },
    theme: {
      type: String,
      default: 'vs-dark',
    },
    initContent: {
      type: String,
      required: false,
      default: '',
    },
    connectionName: {
      type: String,
      required: true,
    },
    imports: {
      type: Array as PropType<Import[]>,
      required: false,
      default: () => [],
    },
  },

  inject: [
    'queryExecutionService',
    'connectionStore',
    'modelStore',
    'editorStore',
    'isMobile',
    'llmConnectionStore',
  ],

  data() {
    return {
      lastOperation: null as OperationState | null,
      editor: new EditorModel({
        id: 'simple-editor',
        name: 'My Query',
        type: 'trilogy',
        connection: this.connectionName,
        storage: 'local',
        contents: this.initContent,
      }),
      // New properties for collapsible sidebar
      activePanel: 'symbols',
      isPanelVisible: false,
    }
  },

  created() {
    // Set initial panel visibility based on mobile status
    // Panel will be collapsed by default on mobile
    this.isPanelVisible = !(this.isMobile as boolean)
  },

  mounted() {
    this.$nextTick(() => {
      this.createEditor()
      // Set up keyboard shortcut to focus on the symbol search box
      document.addEventListener('keydown', this.handleKeyboardShortcuts)
      this.validateQuery()
    })
  },

  beforeUnmount() {
    if (globalEditor) {
      globalEditor.dispose()
    }
    document.removeEventListener('keydown', this.handleKeyboardShortcuts)
  },

  methods: {
    // New methods for panel management
    togglePanel(panelName: string): void {
      if (this.activePanel === panelName && this.isPanelVisible) {
        this.isPanelVisible = false
      } else {
        this.activePanel = panelName
        this.isPanelVisible = true

        // If symbols panel is opened, focus the search box
        if (panelName === 'symbols' && this.$refs.symbolsPane) {
          this.$nextTick(() => {
            this.focusSymbolSearch()
          })
        }
      }

      // Trigger editor layout update to adjust for panel visibility
      if (globalEditor) {
        this.$nextTick(() => {
          globalEditor?.layout()
        })
      }
    },

    closePanel(): void {
      this.isPanelVisible = false
      // Trigger editor layout update
      if (globalEditor) {
        this.$nextTick(() => {
          globalEditor?.layout()
        })
      }
    },

    getPanelTitle(): string {
      switch (this.activePanel) {
        case 'symbols':
          return 'Symbols'
        default:
          return ''
      }
    },

    createEditor(): void {
      // Configure the editor theme
      configureEditorTheme(this.theme === 'vs-dark' ? 'dark' : 'light')

      // Create the editor instance
      globalEditor = createMonacoEditor(this.$refs.editorElement as HTMLElement, {
        value: this.editor.contents || '',
        language: this.editor.type === 'sql' ? 'sql' : 'trilogy',
      })

      // Setup keyboard shortcuts and content change handler
      setupEditorKeybindings(globalEditor, {
        onValidate: () => this.validateQuery(),
        onRun: () => this.runQuery(),
        onGenerateLLM: () => this.generateLLMQuery(), // Add LLM generation shortcut
      })

      // Add symbol insertion shortcut
      globalEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Space, () => {
        this.togglePanel('symbols')
      })

      // Add LLM generate shortcut (ctrl-shift-enter)
      globalEditor.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter,
        () => {
          this.generateLLMQuery()
        },
      )
    },

    handleKeyboardShortcuts(event: KeyboardEvent): void {
      // Ctrl+Shift+O to focus on symbol search (mimicking VS Code)
      if (event.ctrlKey && event.shiftKey && event.key === 'O') {
        this.togglePanel('symbols')
        event.preventDefault()
      }
      // Ctrl+shift+enter to generate with llm
      if (event.ctrlKey && event.shiftKey && event.key === 'Enter') {
        this.generateLLMQuery()
        event.preventDefault()
      }
    },

    focusSymbolSearch(): void {
      const symbolsPane = this.$refs.symbolsPane as typeof SymbolsPane | undefined
      if (symbolsPane && 'focusSearch' in symbolsPane) {
        ;(symbolsPane as any).focusSearch()
      }
    },

    insertSymbol(symbol: CompletionItem): void {
      if (!globalEditor) return

      const position = globalEditor.getPosition()
      if (position && symbol.insertText) {
        globalEditor.executeEdits('', [
          {
            range: new monaco.Range(
              position.lineNumber,
              position.column,
              position.lineNumber,
              position.column,
            ),
            text: symbol.insertText,
          },
        ])
        globalEditor.focus()

        // Auto-collapse panel on mobile after inserting a symbol
        if (this.isMobile) {
          this.closePanel()
        }
      }
    },

    async validateQuery(showMarkers: boolean = true): Promise<Import[]> {
      if (!globalEditor) return []
      const connectionStore = this.connectionStore as ConnectionStoreType
      const queryExecutionService = this.queryExecutionService as QueryExecutionService

      try {
        this.editor.setError(null)
        const text = globalEditor.getValue()

        // Execute validation via injected service
        const conn = connectionStore.connections[this.editor.connection]
        const queryInput = {
          text,
          queryType: conn ? conn.query_type : 'trilogy',
          editorType: this.editor.type,
          sources: [],
          imports: this.imports,
        }

        const annotations = await queryExecutionService.validateQuery(
          this.editor.connection,
          queryInput,
        )

        if (annotations && showMarkers) {
          const model = globalEditor.getModel()
          if (model) {
            monaco.editor.setModelMarkers(model, 'owner', annotations.data.items || [])
          }
          if (annotations.data.completion_items) {
            this.editor.completionSymbols = annotations.data.completion_items
          }
        }
        if (annotations) {
          return annotations.data.imports
        }
        return []
      } catch (error) {
        // check if error is an Error
        if (error instanceof Error) {
          this.editor.setError(error.message || 'Validation failed')
        } else {
          this.editor.setError('Validation failed')
        }
        return []
      }
    },

    async cancelQuery(): Promise<void> {
      if (this.editor.cancelCallback) {
        await this.editor.cancelCallback()
      }
      this.editor.loading = false
    },

    async runQuery(): Promise<void> {
      this.$emit('query-started')
      this.editor.setError(null)
      let queryDone = false

      const connectionStore = this.connectionStore as ConnectionStoreType
      const queryExecutionService = this.queryExecutionService as QueryExecutionService
      const monacoInstance = globalEditor

      if (this.editor.loading || !monacoInstance) {
        return
      }

      try {
        // Analytics tracking (unchanged)
        try {
          // @ts-ignore
          window.goatcounter &&
            // @ts-ignore
            window.goatcounter.count({
              path: 'studio-query-execution',
              title: this.editor.type,
              event: true,
            })
        } catch (error) {
          console.log(error)
        }

        // Set component to loading state
        this.editor.loading = true
        this.lastOperation = null
        this.editor.startTime = Date.now()

        // Prepare query input
        const conn = connectionStore.connections[this.editor.connection]

        // Get selected text or full content
        const text = getEditorText(monacoInstance, this.editor.contents)
        if (!text) {
          this.editor.results = new Results(new Map(), [])
          this.editor.loading = false
          return
        }

        // Create query input object
        const queryInput = {
          text,
          queryType: conn ? conn.query_type : '',
          editorType: this.editor.type,
          imports: this.imports,
        }

        // Execute query
        const { resultPromise, cancellation } = await queryExecutionService.executeQuery(
          this.editor.connection,
          queryInput,
          // Progress callback for connection issues
          () => {},
          (message: QueryUpdate) => {
            if (!queryDone && message.error) {
              this.editor.loading = false
              if (message.message) {
                this.editor.setError(message.message)
              }
            }
            if (!queryDone && message.running) {
              this.editor.error = null
              this.editor.loading = true
            }
          },
        )

        // Handle cancellation callback
        this.editor.cancelCallback = () => {
          if (cancellation.isActive()) {
            cancellation.cancel()
          }
          this.editor.loading = false
          this.editor.cancelCallback = null
        }

        const result = await resultPromise
        queryDone = true

        // Update lastOperation state
        this.lastOperation = {
          success: result.success,
          duration: result.executionTime,
          rows: result.results?.data ? result.results?.data?.length : undefined,
          type: this.editor.type,
        }

        // Update component state based on result
        if (result.success) {
          if (result.generatedSql) {
            this.editor.generated_sql = result.generatedSql
          }
          if (result.results) {
            this.editor.results = result.results
            this.editor.duration = result.executionTime
          }
        } else if (result.error) {
          this.editor.setError(result.error)
        }
      } catch (error) {
        // check if error is an Error
        if (error instanceof Error) {
          this.editor.setError(error.message || 'Query execution failed')
        }
        this.lastOperation = {
          success: false,
          duration: 0,
          type: this.editor.type,
        }
      } finally {
        // Reset loading state
        this.editor.loading = false
        this.editor.cancelCallback = null
        if (globalEditor) {
          globalEditor.layout()
        }
      }
    },

    // Add the LLM query generation method
    async generateLLMQuery(): Promise<void> {
      if (this.editor.loading || !globalEditor) return

      const llmStore = this.llmConnectionStore as any
      const queryExecutionService = this.queryExecutionService as QueryExecutionService
      const connectionStore = this.connectionStore as ConnectionStoreType

      if (!llmStore) {
        this.editor.setError('LLM connection store not available')
        return
      }

      try {
        // Analytics tracking
        try {
          // @ts-ignore
          window.goatcounter &&
            // @ts-ignore
            window.goatcounter.count({
              path: 'studio-llm-generation',
              title: this.editor.type,
              event: true,
            })
        } catch (error) {
          console.log(error)
        }

        // Set loading state
        this.editor.loading = true
        this.editor.startTime = Date.now()
        this.editor.results = new Results(new Map(), [])
        this.editor.setError(null)

        // Get current text and selection range
        const text = globalEditor.getValue()

        // Validate query to get completion symbols
        await this.validateQuery(false)

        // Check if we have completion symbols for LLM generation
        if (!this.editor.completionSymbols || this.editor.completionSymbols.length === 0) {
          throw new Error('There are no imported concepts for LLM generation')
        }

        // Extract concept information for LLM
        const concepts = this.editor.completionSymbols.map((item) => ({
          name: item.label,
          type: item.datatype,
          description: item.description,
        }))

        // Create validator function
        const validator = async (generatedText: string): Promise<boolean> => {
          const conn = connectionStore.connections[this.editor.connection]
          const queryInput = {
            text: generatedText,
            queryType: conn ? conn.query_type : '',
            editorType: this.editor.type,
            imports: this.imports,
          }

          try {
            const { resultPromise } = await queryExecutionService.executeQuery(
              this.editor.connection,
              queryInput,
              () => {},
              () => {},
              (error) => {
                throw error
              },
              () => true,
              true, // Explain mode
            )

            await resultPromise
            return true
          } catch (error) {
            throw error
          }
        }

        // Generate LLM query completion
        const generatedQuery = await llmStore.generateQueryCompletion(text, concepts, validator)

        if (generatedQuery) {
          // Insert the generated query
          globalEditor.setValue(generatedQuery)

          // Update editor content
          this.editor.contents = globalEditor.getValue()

          // Update last operation state
          this.lastOperation = {
            success: true,
            duration: Date.now() - (this.editor.startTime || 0),
            type: 'LLM Generation',
          }
        } else {
          throw new Error('LLM could not successfully generate query')
        }
      } catch (error) {
        if (error instanceof Error) {
          this.editor.setError(error.message)
        } else {
          this.editor.setError('Unknown error occurred during LLM generation')
        }

        this.lastOperation = {
          success: false,
          duration: 0,
          type: 'LLM Generation',
        }
      } finally {
        this.editor.loading = false
        if (globalEditor) {
          globalEditor.layout()
        }
      }
    },

    getContent(): string {
      if (globalEditor) {
        return globalEditor.getValue()
      }
      return this.editor.contents || ''
    },
  },
})
</script>

<style scoped>
.editor-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 400px;
  border: 1px solid var(--border-color, #444);
  overflow: hidden;
}

.menu-bar {
  background-color: var(--sidebar-bg, #252525);
  display: flex;
  padding: 0.25rem;
  justify-content: space-between;
  padding-right: 0.5rem;
  height: 40px;
  min-height: 40px;
}

.menu-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.15rem;
  align-items: center;
  flex-grow: 1;
  height: 100%;
}

.action-item {
  height: 28px;
  width: 80px;
  font-weight: 500;
  cursor: pointer;
  border-radius: 0px;
  border: 1px solid var(--border-color, #444);
  transition:
    background-color 0.3s ease,
    color 0.3s ease;
}

.editor-content {
  display: flex;
  flex-grow: 1;
  position: relative;
  min-height: 250px;
  height: calc(400px - 40px - 40px);
  background-color: var(--sidebar-bg, #252525);
  /* Subtract menu-bar and results-summary heights */
}

.monaco-editor {
  flex: 1;
  min-height: 250px;
  height: 300px;
}

.monaco-width-no-panel {
  width: calc(100% - 32px);
}

.monaco-width-with-panel {
  width: calc(100% - 240px - 32px);
}

/* Sidebar and panel styles */
.be-sidebar-container {
  height: 100%;
  width: 32px;
  right: 0;
  top: 0;
  bottom: 0;
  border-left: 1px solid var(--border-color, #444);
  border-top: 1px solid var(--border-color, #444);
  border-bottom: 1px solid var(--border-color, #444);
}

.sidebar-icons {
  display: flex;
  flex-direction: column;
  background-color: var(--sidebar-bg, #252525);
  border-left: 1px solid var(--border-color, #444);
  padding: 0.5rem 0;
  z-index: 10;
  background-color: var(--sidebar-bg, #252525);
  border-bottom: 1px solid var(--border-color, #444);
}

.sidebar-icon-button {
  width: 32px;
  height: 32px;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  border: none;
  background: transparent;
  color: var(--text-subtle, #aaa);
  transition: background-color 0.2s ease;
  border-radius: 0;
  margin-bottom: 0.25rem;
  border-bottom: 1px solid var(--border-color, #444);
}

.sidebar-icon-button:hover {
  background-color: rgba(255, 255, 255, 0.1);
}

.sidebar-icon-button.active {
  color: var(--accent-color, #0088ff);
  background-color: rgba(0, 136, 255, 0.1);
}

.sidebar-panel {
  width: 240px;
  height: 100%;
  background-color: var(--sidebar-bg, #252525);
  border-left: 1px solid var(--border-color, #444);
  border-top: 1px solid var(--border-color, #444);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: width 0.3s ease;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem;
  border-bottom: 1px solid var(--border-color, #444);
  background-color: var(--sidebar-bg, #1e1e1e);
  min-height: 40px;
  position: sticky;
  top: 0;
  z-index: 10;
}

.panel-header h3 {
  margin: 0;
  font-size: 0.9rem;
  font-weight: normal;
}

.panel-close {
  background: transparent;
  border: none;
  color: var(--text-subtle, #aaa);
  font-size: 1.2rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 4px;
}

.panel-close:hover {
  background-color: rgba(255, 255, 255, 0.1);
}

.panel-content {
  flex-grow: 1;
  overflow-y: auto;
  height: calc(100% - 40px);
}

/* Icon symbols */
.icon-symbols {
  font-style: normal;
  font-size: 1.2rem;
}

.button-cancel {
  background-color: var(--error-color, #d32f2f);
  color: white;
  border: 1px solid var(--error-color, #d32f2f);
}

.error-message {
  background-color: rgba(211, 47, 47, 0.1);
  color: var(--error-color, #d32f2f);
  border-left: 3px solid var(--error-color, #d32f2f);
  margin-bottom: 0.5rem;
  padding-left: 5px;
  min-height: 32px;
  max-height: 80px;
  font-size: 10px;
  overflow-y: scroll;
}

/* Results summary section */
.results-summary {
  display: flex;
  align-items: center;
  padding-left: 5px;
  border-top: 1px solid var(--border-color, #444);
  font-size: 0.85rem;
  background-color: var(--sidebar-bg, #252525);
  gap: 0.5rem;
  height: 32px;
  min-height: 32px;
}

.status-badge {
  font-weight: bold;
  padding: 0.25rem 0.5rem;
  border-radius: 3px;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  height: 18px;
  display: flex;
  align-items: center;
}

.status-badge.success {
  background-color: rgba(76, 175, 80, 0.2);
  color: #4caf50;
  border: 1px solid rgba(76, 175, 80, 0.5);
}

.status-badge.error {
  background-color: rgba(211, 47, 47, 0.2);
  color: #f44336;
  border: 1px solid rgba(211, 47, 47, 0.5);
}

.results-details {
  display: flex;
  gap: 1rem;
  align-items: center;
  color: var(--text-subtle, #aaa);
  height: 100%;
}

.timing,
.row-count,
.operation-type {
  height: 18px;
  display: flex;
  align-items: center;
}

.timing::before {
  content: '⏱️';
  margin-right: 0.25rem;
  font-size: 0.9em;
}

.row-count::before {
  content: '🔢';
  margin-right: 0.25rem;
  font-size: 0.9em;
}

.operation-type {
  font-style: italic;
}

.result-wrapper {
  height: 40px;
  padding: 5px;
  background-color: var(--sidebar-bg, #252525);
}

.loading-view {
  max-height: 32px;
  height: 32px;
  padding: 0;
  flex-direction: row;
  background-color: var(--sidebar-bg, #252525);
  margin-bottom: 0;
}

/* Enhanced Mobile View */
@media screen and (max-width: 768px) {
  .editor-container {
    min-height: 300px;
    height: 100%;
  }

  .menu-bar {
    height: 60px;
    min-height: 60px;
    flex-direction: column;
    padding: 0.5rem;
  }

  .menu-actions {
    justify-content: space-between;
    width: 100%;
    height: 100%;
  }

  .action-item {
    flex-grow: 1;
    width: calc(33% - 0.3rem); /* Adjust for 3 buttons instead of 2 */
    height: 36px;
    font-size: 0.9rem;
  }

  .editor-content {
    height: calc(100% - 60px - 64px);
    /* Adjust for taller menu bar and results summary in mobile */
    min-height: 200px;
  }

  .monaco-editor {
    min-height: 200px;
  }

  /* Mobile sidebar adjustments */
  .sidebar-icons {
    width: 32px;
  }

  .sidebar-panel {
    width: 220px;
    /* Slightly narrower on mobile */
  }

  .results-summary {
    height: 64px;
    min-height: 64px;
    flex-direction: column;
    align-items: flex-start;
    padding: 0.75rem;
  }

  .results-details {
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.25rem;
    justify-content: flex-start;
    width: 100%;
  }

  .status-badge {
    height: 20px;
    font-size: 0.75rem;
  }

  /* Adjustments for touch devices */
  .action-item,
  .sidebar-icon-button,
  .panel-close {
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
  }

  /* Improved mobile scrolling for error messages */
  .error-message {
    max-height: 120px;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }
}
</style>
