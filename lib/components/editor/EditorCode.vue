<template>
  <div ref="editorElement" class="editor-fix-styles" data-testid="editor"></div>
</template>

<script lang="ts">
import { defineComponent, onMounted, onUnmounted, ref, watch } from 'vue'
import { KeyMod, KeyCode, type IRange } from 'monaco-editor'
import { editor } from 'monaco-editor/esm/vs/editor/editor.api'

// Maps to track editor instances
const editorMap = new Map<string, editor.IStandaloneCodeEditor>()
const mountedMap = new Map<string, boolean>()

interface Props {
  editorId: string
  context: string
  contents: string
  editorType: string
  theme: string
}

interface IModelContentChange {
  range: IRange
  rangeOffset: number
  rangeLength: number
  text: string
}

interface IModelContentChangedEvent {
  changes: IModelContentChange[]
  eol: string
  versionId: number
  isUndoing: boolean
  isRedoing: boolean
  isFlush: boolean
}

export default defineComponent({
  name: 'CodeEditor',
  props: {
    editorId: {
      type: String,
      required: true,
    },
    context: {
      type: String,
      required: true,
    },
    contents: {
      type: String,
      required: true,
    },
    editorType: {
      type: String,
      required: true,
    },
    theme: {
      type: String,
      default: 'light',
    },
  },

  emits: [
    'contents-change',
    'run-query',
    'validate-query',
    'format-query',
    'save',
    'generate-llm-query',
  ],

  setup(props: Props, { emit }) {
    const editorElement = ref<HTMLElement | null>(null)

    // Returns the editor text (selected or full content)
    const getEditorText = (fallback: string): string => {
      const editorInstance = editorMap.get(props.context)
      if (!editorInstance) return fallback

      const selected = editorInstance.getSelection()
      let text: string | undefined =
        selected &&
        !(
          selected.startColumn === selected.endColumn &&
          selected.startLineNumber === selected.endLineNumber
        )
          ? editorInstance.getModel()?.getValueInRange(selected)
          : editorInstance.getValue()

      // Fallback for mobile
      if (!text) {
        text = fallback
      }

      return text
    }

    // Returns the editor range
    const getEditorRange = (): IRange | null => {
      const editorInstance = editorMap.get(props.context)
      if (!editorInstance) return null

      const selection = editorInstance.getSelection()

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
        return (
          editorInstance.getModel()?.getFullModelRange() || {
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: 1,
            endColumn: 1,
          }
        )
      }
    }

    // Create and configure the editor
    const createEditor = (): void => {
      if (!editorElement.value) {
        console.error('Editor element is not available')
        return
      }

      // If editor already exists and is mounted, just update content
      if (editorMap.has(props.context) && mountedMap.get(props.context)) {
        const editorInstance = editorMap.get(props.context)
        if (editorInstance) {

          editorInstance.setValue(props.contents)
          editorInstance.layout()
          return
        }
      }

      // Create theme

      // Create editor
      const editorInstance = editor.create(editorElement.value, {
        value: props.contents,
        language: props.editorType === 'sql' ? 'sql' : 'trilogy',
        automaticLayout: true,
        autoClosingBrackets: 'always',
        autoClosingOvertype: 'always',
        autoClosingQuotes: 'always',
        acceptSuggestionOnEnter: 'off',
        tabCompletion: 'on',
        wordWrap: 'on',
      })

      //loop over light/dark, create themes
      for (const theme of ['light', 'dark']) {
        // Define the theme with the prefix
        editor.defineTheme(`trilogyStudio${theme}`, {
          base: theme === 'light' ? 'vs' : 'vs-dark',
          inherit: true,
          rules: [
            { token: 'comment', foreground: '#6A9955', fontStyle: 'italic' },
            { token: 'keyword', foreground: '#569CD6', fontStyle: 'bold' },
            { token: 'definition', foreground: '#E5C07B', fontStyle: 'bold' },
            { token: 'type', foreground: '#4EC9B0', fontStyle: 'bold' },
            { token: 'string', foreground: '#CE9178' },
            { token: 'number', foreground: '#B5CEA8' },
            { token: 'operator', foreground: '#D4D4D4' },
            { token: 'delimiter', foreground: '#D4D4D4' },
            { token: 'function', foreground: '#C586C0', fontStyle: 'bold' },
            { token: 'hidden', foreground: '#D6D6C8', fontStyle: 'italic' },
            { token: 'property', foreground: '#BFBFBF' },
          ],
          colors: {},
        })
      }

      // Set theme
      editor.setTheme(`trilogyStudio${props.theme}`)

      // Track this editor instance
      editorMap.set(props.context, editorInstance)
      mountedMap.set(props.context, true)

      // Set up content change handler
      setupContentChangeHandler(editorInstance)

      // Set up keyboard shortcuts
      setupKeyBindings(editorInstance)

      // Apply initial layout
      editorInstance.layout()
    }

    // Handle editor content changes
    const setupContentChangeHandler = (editorInstance: editor.IStandaloneCodeEditor): void => {
      let suggestDebounceTimer: number | null = null
      let keywordDebounceTimer: number | null = null
      const keywordsToWatch: string[] = [';']
      const keywordDebounceDelay: number = 500

      editorInstance.onDidChangeModelContent((event: IModelContentChangedEvent) => {
        // Emit current content
        const currentContent = editorInstance.getValue()
        emit('contents-change', currentContent)

        // Handle suggestion debounce
        if (suggestDebounceTimer) {
          clearTimeout(suggestDebounceTimer)
        }

        suggestDebounceTimer = window.setTimeout(() => {
          if (editorInstance.hasTextFocus() && !editorInstance.getSelection()?.isEmpty()) {
            editorInstance.trigger('completion', 'editor.action.triggerSuggest', { auto: true })
          }
        }, 200)

        // Handle keyword checking with debounce
        if (keywordDebounceTimer) {
          clearTimeout(keywordDebounceTimer)
        }

        keywordDebounceTimer = window.setTimeout(() => {
          try {
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
              console.log('Keyword detected')
            }
          } catch (error) {
            console.error('Error checking keywords:', error)
          }
        }, keywordDebounceDelay)
      })
    }

    // Set up keyboard shortcuts
    const setupKeyBindings = (editorInstance: editor.IStandaloneCodeEditor): void => {
      // Validate query: Ctrl+Shift+V
      editorInstance.addCommand(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyV, () => {
        emit('validate-query')
      })

      // Run query: Ctrl+Enter
      editorInstance.addCommand(KeyMod.CtrlCmd | KeyCode.Enter, () => {
        emit('run-query')
      })

      // Format query: Ctrl+K (not for SQL)
      if (props.editorType !== 'sql') {
        editorInstance.addCommand(KeyMod.CtrlCmd | KeyCode.KeyK, () => {
          emit('format-query')
        })
      }

      // LLM query generation: Ctrl+Shift+Enter
      editorInstance.addCommand(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Enter, () => {
        emit('generate-llm-query')
      })

      // Save: Ctrl+S
      editorInstance.addCommand(KeyMod.CtrlCmd | KeyCode.KeyS, () => {
        emit('save')
      })

      // Undo: Ctrl+Z
      editorInstance.addCommand(KeyMod.CtrlCmd | KeyCode.KeyZ, () => {
        editorInstance.trigger('ide', 'undo', {})
        emit('contents-change', editorInstance.getValue())
      })
    }

    // Update editor value
    const setValue = (value: string): void => {
      const editorInstance = editorMap.get(props.context)
      if (editorInstance) {
        editorInstance.setValue(value)
      }
    }

    // Execute edits on the editor
    const executeEdits = (source: string, edits: editor.IIdentifiedSingleEditOperation[]): void => {
      const editorInstance = editorMap.get(props.context)
      if (editorInstance) {
        editorInstance.executeEdits(source, edits)
      }
    }

    const setModelMarkers = (markers: editor.IMarkerData[]): void => {
      const editorInstance = editorMap.get(props.context)
      if (editorInstance && editorInstance.getModel()) {
        editor.setModelMarkers(editorInstance.getModel()!, 'owner', markers)
      }
    }

    // Get editor instance
    const getEditorInstance = (): editor.IStandaloneCodeEditor | undefined => {
      return editorMap.get(props.context)
    }

    // Setup on mount
    onMounted(() => {
      createEditor()
    })

    // Cleanup on unmount
    onUnmounted(() => {
      const editorInstance = editorMap.get(props.context)
      if (editorInstance) {
        editorInstance.dispose()
        editorMap.delete(props.context)
        mountedMap.delete(props.context)
      }
    })

    // Watch for editor ID changes
    watch(
      () => props.editorId,
      () => {
        createEditor()
      },
    )

    // Watch for theme changes
    watch(
      () => props.theme,
      () => {
        editor.setTheme(`trilogyStudio${props.theme}`)
      },
    )

    // Expose methods to parent component
    return {
      editorElement,
      getEditorText,
      getEditorRange,
      setValue,
      executeEdits,
      getEditorInstance,
      setModelMarkers,
    }
  },
})
</script>

<style scoped>
.editor-fix-styles {
  text-align: left;
  border: none;
  height: 100%;
  position: relative;
  width: 100%;
}

@media screen and (max-width: 768px) {
  .editor-fix-styles {
    height: calc(100%);
  }
}
</style>
