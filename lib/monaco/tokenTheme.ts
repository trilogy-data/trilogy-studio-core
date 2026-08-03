import type { editor } from 'monaco-editor'

/**
 * Colours for the token types produced by the Trilogy Monarch grammar.
 *
 * Shared because two separate call sites define Monaco themes -- `monaco/
 * editorHelpers.ts` for the standalone editor and `components/editor/
 * editorHelpers.ts` for the IDE -- and each used to carry its own copy of this
 * list. Adding a token type to the grammar meant remembering to colour it
 * twice, and any miss showed up as unstyled text in one surface only.
 */
export const trilogyTokenThemeRules: editor.ITokenThemeRule[] = [
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
]
