//@ts-ignore

import { Range, languages } from 'monaco-editor'
import { dataTypes } from '../language'
import { trilogyLanguageConfiguration, trilogyMonarchLanguage } from './trilogyLanguage'
import useEditorStore from '../stores/editorStore'
export function configureTrilogy() {
  languages.register({ id: 'trilogy' })
  languages.setLanguageConfiguration('trilogy', trilogyLanguageConfiguration)
  languages.setMonarchTokensProvider('trilogy', trilogyMonarchLanguage)

  // add model autocompletion
  function getModelCompletions(word: string, range: Range) {
    const store = useEditorStore()
    // returning a static list of proposals, not even looking at the prefix (filtering is done by the Monaco editor),
    // here you could do a server side lookup
    let completions = store.getCurrentEditorAutocomplete(word)
    return completions.map((completion) => {
      return {
        label: completion.label,
        kind: languages.CompletionItemKind.Variable,
        insertText: completion.insertText,
        range: range,
        commitCharacters: ['\t'],
      }
    })
  }

  function getLastContiguousToken(line: string): string | null {
    const match = line.match(/(\S+)(?:\s*$)/)
    return match ? match[0] : null
  }

  interface Completion {
    label: string
    kind: languages.CompletionItemKind
    insertText: string
    range: Range
  }

  languages.registerCompletionItemProvider('trilogy', {
    provideCompletionItems: function (model, position) {
      // const word = model.getWordUntilPosition(position);
      const lineContent = model.getLineContent(position.lineNumber)
      const cursorIndex = position.column - 1 // Convert Monaco 1-based column to 0-based index
      // Extract all non-whitespace characters before `.`
      const lineToCursor = lineContent.substring(0, cursorIndex)
      const match = getLastContiguousToken(lineToCursor)
      let fullIdentifier = match ? match : ''
      const range = new Range(
        position.lineNumber,
        position.column - fullIdentifier.length,
        position.lineNumber,
        position.column,
      )
      let suggestions: Completion[] = []
      if (fullIdentifier === '') {
        suggestions = []
      } else if (fullIdentifier.endsWith('::')) {
        suggestions = dataTypes.map((type) => ({
          label: `${fullIdentifier}${type.label}`,
          kind: languages.CompletionItemKind.Enum,
          insertText: `${fullIdentifier}${type.label}`,
          range: range,
          commitCharacters: ['\t'],
        }))
      } else {
        suggestions = getModelCompletions(fullIdentifier, range)
      }
      return {
        suggestions: suggestions,
      }
    },
    triggerCharacters: ['.'],
  })
}
