import * as monaco from 'monaco-editor'
import { KeyMod, KeyCode } from 'monaco-editor'

/**
 * Configure Monaco editor themes
 */
export function configureEditorTheme(theme: 'light' | 'dark' = 'dark'): void {
  // Define the Trilogy theme
  monaco.editor.defineTheme('trilogyStudio', {
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

  // Set the active theme
  monaco.editor.setTheme('trilogyStudio')
}

interface EditorCallbacks {
  onValidate?: () => void
  onRun?: () => void
  onSave?: () => void
  onContentChange?: (content: string) => void
}

/**
 * Create a Monaco editor instance
 */
export function createMonacoEditor(
  domElement: HTMLElement,
  editorOptions: monaco.editor.IStandaloneEditorConstructionOptions = {},
): monaco.editor.IStandaloneCodeEditor {
  const defaultOptions: monaco.editor.IStandaloneEditorConstructionOptions = {
    automaticLayout: true,
    autoClosingBrackets: 'always',
    autoClosingOvertype: 'always',
    autoClosingQuotes: 'always',
    acceptSuggestionOnEnter: 'off',
    tabCompletion: 'on',
    theme: 'trilogyStudio',
    
  }

  // Merge default options with provided options
  const options = { ...defaultOptions, ...editorOptions }

  // Create the editor instance
  return monaco.editor.create(domElement, options)
}

/**
 * Get text from the editor, either selected text or all text
 */
export function getEditorText(
  editor: monaco.editor.IStandaloneCodeEditor | undefined,
  fallback: string = '',
): string {
  if (!editor) return fallback

  const selected = editor.getSelection()
  let text =
    selected &&
    !(
      selected.startColumn === selected.endColumn &&
      selected.startLineNumber === selected.endLineNumber
    )
      ? editor.getModel()?.getValueInRange(selected) || ''
      : editor.getValue()

  // Fallback if getValue returns nothing
  if (!text) {
    text = fallback
  }

  return text
}

/**
 * Get the current selection range in the editor
 */
export function getEditorRange(editor: monaco.editor.IStandaloneCodeEditor): monaco.IRange {
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

/**
 * Setup common keyboard shortcuts for the editor
 */
export function setupEditorKeybindings(
  editor: monaco.editor.IStandaloneCodeEditor,
  callbacks: EditorCallbacks = {},
): void {
  const { onValidate, onRun, onSave } = callbacks

  // Add keyboard shortcuts
  if (onValidate) {
    editor.addCommand(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyV, onValidate)
  }

  if (onRun) {
    editor.addCommand(KeyMod.CtrlCmd | KeyCode.Enter, onRun)
  }

  if (onSave) {
    editor.addCommand(KeyMod.CtrlCmd | KeyCode.KeyS, onSave)
  }

  // Add default undo command
  editor.addCommand(KeyMod.CtrlCmd | KeyCode.KeyZ, () => {
    editor.trigger('ide', 'undo', {})
  })

  // Setup content change handler with debouncing for auto-suggestions
  if (callbacks.onContentChange) {
    let debounceTimer: NodeJS.Timeout | null = null

    editor.onDidChangeModelContent(() => {
      callbacks.onContentChange?.(editor.getValue())

      // Clear previous timer
      if (debounceTimer) {
        clearTimeout(debounceTimer)
      }

      // Set new timer for suggestions
      debounceTimer = setTimeout(() => {
        if (editor.hasTextFocus() && !editor.getSelection()?.isEmpty()) {
          editor.trigger('completion', 'editor.action.triggerSuggest', { auto: true })
        }
      }, 200)
    })
  }
}

/**
 * Set validation markers on editor
 */
export function setEditorMarkers(
  editor: monaco.editor.IStandaloneCodeEditor,
  markers: monaco.editor.IMarkerData[] = [],
): void {
  const model = editor.getModel()
  if (model) {
    monaco.editor.setModelMarkers(model, 'owner', markers)
  }
}

/**
 * Update editor contents preserving cursor position
 */
export function updateEditorContent(
  editor: monaco.editor.IStandaloneCodeEditor,
  content: string,
): void {
  // Remember cursor position
  const position = editor.getPosition()

  // Update content
  editor.setValue(content)

  // Restore cursor position if possible
  if (position) {
    editor.setPosition(position)
  }
}
