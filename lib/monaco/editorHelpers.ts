import * as monaco from 'monaco-editor';
import { KeyMod, KeyCode } from 'monaco-editor';

/**
 * Configure Monaco editor themes
 * @param {string} theme - 'light' or 'dark'
 */
export function configureEditorTheme(theme = 'dark') {
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
      { token: 'property', foreground: '#BFBFBF' }
    ],
    colors: {}
  });

  // Set the active theme
  monaco.editor.setTheme('trilogyStudio');
}

/**
 * Create a Monaco editor instance
 * @param {HTMLElement} domElement - DOM element to attach the editor to
 * @param {Object} editorOptions - Editor options
 * @returns {monaco.editor.IStandaloneCodeEditor} Monaco editor instance
 */
export function createMonacoEditor(domElement, editorOptions = {}) {
  const defaultOptions = {
    automaticLayout: true,
    autoClosingBrackets: 'always',
    autoClosingOvertype: 'always',
    autoClosingQuotes: 'always',
    acceptSuggestionOnEnter: 'off',
    tabCompletion: 'on',
    theme: 'trilogyStudio'
  };

  // Merge default options with provided options
  const options = { ...defaultOptions, ...editorOptions };
  
  // Create the editor instance
  return monaco.editor.create(domElement, options);
}

/**
 * Get text from the editor, either selected text or all text
 * @param {monaco.editor.IStandaloneCodeEditor} editor - Monaco editor instance
 * @param {string} fallback - Fallback text if editor doesn't return any
 * @returns {string} Selected text or all editor text
 */
export function getEditorText(editor, fallback = '') {
  if (!editor) return fallback;
  
  const selected = editor.getSelection();
  let text = selected && 
    !(selected.startColumn === selected.endColumn && 
      selected.startLineNumber === selected.endLineNumber)
    ? (editor.getModel()?.getValueInRange(selected) || '')
    : editor.getValue();
    
  // Fallback if getValue returns nothing
  if (!text) {
    text = fallback;
  }
  
  return text;
}

/**
 * Get the current selection range in the editor
 * @param {monaco.editor.IStandaloneCodeEditor} editor - Monaco editor instance
 * @returns {monaco.IRange} Selection range
 */
export function getEditorRange(editor) {
  const selection = editor.getSelection();

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
    };
  } else {
    // No selection, return a range representing the start of the editor
    return {
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 1,
      endColumn: 1,
    };
  }
}

/**
 * Setup common keyboard shortcuts for the editor
 * @param {monaco.editor.IStandaloneCodeEditor} editor - Monaco editor instance
 * @param {Object} callbacks - Callback functions for different actions
 * @param {Function} callbacks.onValidate - Callback for validation (Ctrl+Shift+V)
 * @param {Function} callbacks.onRun - Callback for running query (Ctrl+Enter)
 * @param {Function} callbacks.onSave - Callback for saving (Ctrl+S)
 * @param {Function} callbacks.onContentChange - Callback when content changes
 */
export function setupEditorKeybindings(editor, callbacks = {}) {
  const { onValidate, onRun, onSave } = callbacks;
  
  // Add keyboard shortcuts
  if (onValidate) {
    editor.addCommand(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyV, onValidate);
  }
  
  if (onRun) {
    editor.addCommand(KeyMod.CtrlCmd | KeyCode.Enter, onRun);
  }
  
  if (onSave) {
    editor.addCommand(KeyMod.CtrlCmd | KeyCode.KeyS, onSave);
  }
  
  // Add default undo command
  editor.addCommand(KeyMod.CtrlCmd | KeyCode.KeyZ, () => {
    editor.trigger('ide', 'undo', {});
  });
  
  // Setup content change handler with debouncing for auto-suggestions
  if (callbacks.onContentChange) {
    let debounceTimer = null;
    
    editor.onDidChangeModelContent(() => {
      callbacks.onContentChange(editor.getValue());
      
      // Clear previous timer
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      
      // Set new timer for suggestions
      debounceTimer = setTimeout(() => {
        if (editor.hasTextFocus() && !editor.getSelection()?.isEmpty()) {
          editor.trigger('completion', 'editor.action.triggerSuggest', { auto: true });
        }
      }, 200);
    });
  }
}

/**
 * Set validation markers on editor
 * @param {monaco.editor.IStandaloneCodeEditor} editor - Monaco editor instance
 * @param {Array} markers - Markers to set
 */
export function setEditorMarkers(editor, markers = []) {
  const model = editor.getModel();
  if (model) {
    monaco.editor.setModelMarkers(model, 'owner', markers);
  }
}

/**
 * Update editor contents preserving cursor position
 * @param {monaco.editor.IStandaloneCodeEditor} editor - Monaco editor instance
 * @param {string} content - New content
 */
export function updateEditorContent(editor, content) {
  // Remember cursor position
  const position = editor.getPosition();
  
  // Update content
  editor.setValue(content);
  
  // Restore cursor position if possible
  if (position) {
    editor.setPosition(position);
  }
}