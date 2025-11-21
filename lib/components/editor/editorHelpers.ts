import { KeyMod, KeyCode, type IRange, type IDisposable, Position, type CancellationToken } from 'monaco-editor'
import { editor, languages } from 'monaco-editor/esm/vs/editor/editor.api'

// Maps to track editor instances (exported for component use)
export const editorMap = new Map<string, editor.IStandaloneCodeEditor>()
export const mountedMap = new Map<string, boolean>()

// Types
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

interface Props {
  editorId: string
  context: string
  contents: string
  editorType: string
  theme: string
  scrollPosition?: { line: number; column: number } | null
  editorHeight?: number
}

// Event callback interface
export interface EditorEventCallbacks {
  onContentsChange: (content: string) => void
  onScrollChange: (position: { line: number; column: number }) => void
  onRunQuery: () => void
  onValidateQuery: () => void
  onFormatQuery: () => void
  onSave: () => void
  onGenerateLlmQuery: () => void
  onGoToDefinition: (data: any) => void
}

// Helper function to get editor text (selected or full content)
export const getEditorText = (context: string, fallback: string): string => {
  const editorInstance = editorMap.get(context)
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

// Helper function to get editor range
export const getEditorRange = (context: string): IRange | null => {
  const editorInstance = editorMap.get(context)
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

// Helper function to find import path for go-to-definition
export const findImportPath = (
  word: string, 
  model: editor.ITextModel,
  position: Position
): string | null => {
  const content = model.getValue()
  const lines = content.split('\n')
  
  // Get the line where the cursor is positioned
  const currentLine = lines[position.lineNumber - 1]
  
  console.log('Checking word:', word)
  console.log('Current line:', currentLine)
  
  // Check if we're on an import line
  const importMatch = currentLine.match(/^\s*import\s+(.+?)\s*;/)
  if (!importMatch) {
    console.log('Not on an import line')
    return null
  }
  
  const importStatement = importMatch[1]
  console.log('Import statement:', importStatement)
  
  // Handle different import patterns:
  // 1. import std.money; -> extract "std.money"
  // 2. import order as order; -> extract "order" (the first one)
  // 3. import supplier as supplier; -> extract "supplier" (the first one)
  
  if (importStatement.includes(' as ')) {
    // Pattern: import X as Y
    const asMatch = importStatement.match(/^(.+?)\s+as\s+(.+?)$/)
    if (asMatch) {
      const originalName = asMatch[1].trim()
      const aliasName = asMatch[2].trim()
      
      console.log('Original name:', originalName, 'Alias name:', aliasName)
      
      // Check if the clicked word matches either the original name or the alias
      if (word === originalName || word === aliasName) {
        console.log('Found import path:', originalName)
        return originalName
      }
    }
  } else {
    // Simple import pattern: import std.money;
    const simplePath = importStatement.trim()
    
    // Check if the clicked word is part of this import path
    if (simplePath.includes(word)) {
      console.log('Found import path:', simplePath)
      return simplePath
    }
  }
  
  console.log('Word not found in import statement')
  return null
}

// Shared logic for handling go-to-definition
const handleGoToDefinition = (
  model: editor.ITextModel,
  position: Position,
  onGoToDefinition: null | ((data: any) => void )
): boolean => {
  const word = model.getWordAtPosition(position)
  if (!word) {
    console.log('No word at position')
    return false
  }

  const wordText = word.word
  const range = {
    startLineNumber: position.lineNumber,
    startColumn: word.startColumn,
    endLineNumber: position.lineNumber,
    endColumn: word.endColumn
  }

  console.log('Go to definition triggered for word:', wordText)
  
  // Look for import path
  const importPath = findImportPath(wordText, model, position)
  
  if (importPath && onGoToDefinition) {
    console.log('Triggering go-to-definition callback for import:', importPath)
    
    // Call the callback with the definition data
    onGoToDefinition({
      word: wordText,
      importPath: importPath,
      position: position,
      range: range
    })
    
    return true
  }

  console.log('No import path found for word:', wordText)
  return false
}

// Go to definition provider function
export const provideDefinition = (
  model: editor.ITextModel,
  position: Position,
  token: CancellationToken,
  editorInstance: editor.IStandaloneCodeEditor,
  onGoToDefinition: (data: any) => void
): languages.ProviderResult<languages.Definition> => {
  
  // Use shared logic
  const handled = handleGoToDefinition(model, position, null)
  
  // Return null since we're handling this externally
  // The provider can still be used by other Monaco features
  return null
}

// Setup go-to-definition provider
export const setupGoToDefinitionProvider = (
  editorInstance: editor.IStandaloneCodeEditor,
  editorType: string,
  onGoToDefinition: (data: any) => void,
  providerDisposables: IDisposable[]
): void => {
  // Clear any existing providers
  providerDisposables.forEach(d => d.dispose())
  providerDisposables.length = 0

  const model = editorInstance.getModel()
  if (!model) return

  console.log('Setting up go-to-definition provider for language:', editorType === 'sql' ? 'sql' : 'trilogy')

  const disposable = languages.registerDefinitionProvider(
    editorType === 'sql' ? 'sql' : 'trilogy',
    {
      provideDefinition: (model, position, token) => {
        return provideDefinition(model, position, token, editorInstance, onGoToDefinition)
      }
    }
  )
  
  providerDisposables.push(disposable)
}

// Setup additional click handler for more controlled behavior
export const setupGoToDefinitionClickHandler = (
  editorInstance: editor.IStandaloneCodeEditor,
  onGoToDefinition: (data: any) => void,
  providerDisposables: IDisposable[]
): void => {
  const model = editorInstance.getModel()
  if (!model) return

  console.log('Setting up go-to-definition click handler')

  // Add click handler for Ctrl+Click
  const clickDisposable = editorInstance.onMouseUp((e) => {
    // Only proceed if Ctrl key is held and it's a left click
    if (!e.event.ctrlKey || e.event.buttons !== 0) {
      return
    }

    const position = e.target.position
    if (!position) return

    console.log('Ctrl+Click detected')
    handleGoToDefinition(model, position, onGoToDefinition)
  })
  
  providerDisposables.push(clickDisposable)

  // Add keyboard shortcut for F12 (Go to Definition) - more explicit than provider
  const keyboardDisposable = editorInstance.addCommand(KeyCode.F12, () => {
    const position = editorInstance.getPosition()
    if (!position) return

    console.log('F12 pressed for go-to-definition')
    handleGoToDefinition(model, position, onGoToDefinition)
  })

}

// Define editor themes
export const defineEditorThemes = (): void => {
  // Loop over light/dark, create themes
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
}

// Create and configure the editor
export const createEditor = (
  editorElement: HTMLElement,
  props: Props,
  callbacks: EditorEventCallbacks,
  providerDisposables: IDisposable[]
): void => {
  if (!editorElement) {
    console.error('Editor element is not available')
    return
  }

  // If editor already exists and is mounted, check if it's still valid
  if (editorMap.has(props.context) && mountedMap.get(props.context)) {
    console.log('Editor already mounted, checking validity')
    const editorInstance = editorMap.get(props.context)

    if (editorInstance && editorInstance.getModel()) {
      const editorContainer = editorInstance.getContainerDomNode()
      const currentElement = editorElement

      // Check if the editor is attached to the current DOM element
      if (editorContainer === currentElement) {
        console.log('Editor instance is valid and properly attached, updating content')
        try {
          editorInstance.setValue(props.contents)
          editorInstance.setScrollPosition({
            scrollTop: props.scrollPosition?.line || 1,
            scrollLeft: props.scrollPosition?.column || 1,
          })
          editorInstance.layout()
          return
        } catch (error) {
          console.warn('Error updating existing editor, will recreate:', error)
        }
      } else {
        console.log('Editor is valid but DOM attachment is wrong, disposing and recreating')
        try {
          editorInstance.dispose()
        } catch (error) {
          console.warn('Error disposing editor:', error)
        }
        editorMap.delete(props.context)
        mountedMap.delete(props.context)
      }
    } else {
      console.log('Editor instance is invalid or disposed, cleaning up')
      editorMap.delete(props.context)
      mountedMap.delete(props.context)
    }
  }

  console.log('Creating new editor instance')
  
  // Define themes first
  defineEditorThemes()
  
  // Create editor
  const editorInstance = editor.create(editorElement, {
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

  // Set theme
  editor.setTheme(`trilogyStudio${props.theme}`)

  // Track this editor instance
  editorMap.set(props.context, editorInstance)
  mountedMap.set(props.context, true)

  // Set up go-to-definition provider (must be done after editor creation)
  setupGoToDefinitionProvider(editorInstance, props.editorType, callbacks.onGoToDefinition, providerDisposables)

  // Set up additional click handler for more controlled behavior
  setupGoToDefinitionClickHandler(editorInstance, callbacks.onGoToDefinition, providerDisposables)

  // Set up content change handler
  setupContentChangeHandler(editorInstance, callbacks)
  
  editorInstance.setScrollPosition({
    scrollTop: props.scrollPosition?.line || 1,
    scrollLeft: props.scrollPosition?.column || 1,
  })
  
  // Set up keyboard shortcuts
  setupKeyBindings(editorInstance, props.editorType, callbacks)

  // Apply initial layout
  editorInstance.layout()
}

// Handle editor content changes
export const setupContentChangeHandler = (
  editorInstance: editor.IStandaloneCodeEditor,
  callbacks: EditorEventCallbacks
): void => {
  let suggestDebounceTimer: number | null = null
  let keywordDebounceTimer: number | null = null
  const keywordsToWatch: string[] = [';']
  const keywordDebounceDelay: number = 500

  editorInstance.onDidScrollChange((event) => {
    callbacks.onScrollChange({
      line: event.scrollTop,
      column: 1,
    })
  })

  editorInstance.onDidChangeModelContent((event: IModelContentChangedEvent) => {
    // Emit current content
    const currentContent = editorInstance.getValue()
    callbacks.onContentsChange(currentContent)

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
export const setupKeyBindings = (
  editorInstance: editor.IStandaloneCodeEditor,
  editorType: string,
  callbacks: EditorEventCallbacks
): void => {
  // Validate query: Ctrl+Shift+V
  editorInstance.addCommand(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyV, () => {
    callbacks.onValidateQuery()
  })

  // Run query: Ctrl+Enter
  editorInstance.addCommand(KeyMod.CtrlCmd | KeyCode.Enter, () => {
    callbacks.onRunQuery()
  })

  // Format query: Ctrl+K (not for SQL)
  if (editorType !== 'sql') {
    editorInstance.addCommand(KeyMod.CtrlCmd | KeyCode.KeyK, () => {
      callbacks.onFormatQuery()
    })
  }
  
  // LLM query generation: Ctrl+Shift+Enter
  editorInstance.addCommand(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Enter, () => {
    callbacks.onGenerateLlmQuery()
  })

  // Save: Ctrl+S
  editorInstance.addCommand(KeyMod.CtrlCmd | KeyCode.KeyS, () => {
    callbacks.onSave()
  })

  // Undo: Ctrl+Z
  editorInstance.addCommand(KeyMod.CtrlCmd | KeyCode.KeyZ, () => {
    editorInstance.trigger('ide', 'undo', {})
    callbacks.onContentsChange(editorInstance.getValue())
  })
}

// Utility functions for editor operations
export const setValue = (context: string, value: string): void => {
  const editorInstance = editorMap.get(context)
  if (editorInstance) {
    editorInstance.setValue(value)
  }
}

export const executeEdits = (context: string, source: string, edits: editor.IIdentifiedSingleEditOperation[]): void => {
  const editorInstance = editorMap.get(context)
  if (editorInstance) {
    editorInstance.executeEdits(source, edits)
  }
}

export const setModelMarkers = (context: string, markers: editor.IMarkerData[]): void => {
  const editorInstance = editorMap.get(context)
  if (editorInstance && editorInstance.getModel()) {
    editor.setModelMarkers(editorInstance.getModel()!, 'owner', markers)
  }
}

export const getEditorInstance = (context: string): editor.IStandaloneCodeEditor | undefined => {
  return editorMap.get(context)
}