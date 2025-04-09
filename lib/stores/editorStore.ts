import { defineStore } from 'pinia'
import Editor from '../editors/editor'
import { Results } from '../editors/results'
import { EditorTag } from '../editors'

const useEditorStore = defineStore('editors', {
  state: () => ({
    editors: {} as Record<string, Editor>, // Use an object instead of Map
    activeEditorName: '',
    activeEditorId: '',
  }),
  getters: {
    editorList: (state) => Object.keys(state.editors).map((key) => state.editors[key]),
  },
  actions: {
    newEditor(
      name: string,
      type: 'trilogy' | 'sql' | 'preql',
      connection: string,
      contents: string | undefined,
    ) {
      let baseName = name;
      let uniqueName = name;
      let suffix = 1;
      
      // Keep trying new names with incremented suffixes until we find a unique one
      while (uniqueName in this.editors) {
        uniqueName = `${baseName}_${suffix}`;
        suffix++;
      }
      
      let editor = new Editor({
        id: uniqueName,
        name: baseName,
        type,
        connection,
        storage: 'local',
        contents: contents || '',
      });
      
      this.editors[editor.id] = editor;
      return editor;
    },
    addEditor(editor: Editor) {
      this.editors[editor.name] = editor
    },
    getConnectionEditors(connection: string, tags: EditorTag[] = []) {
      // return Object.values(this.editors).filter((editor) => editor.connection === connection)
      let base = Object.values(this.editors).filter((editor) => editor.connection === connection)
      if (tags.length === 0) {
        return base
      }
      return base.filter((editor) => tags.every((tag) => editor.tags.includes(tag)))
    },
    updateEditorName(id: string, newName: string) {
      this.editors[id].name = newName
    },
    removeEditor(id: string) {
      if (this.editors[id]) {
        delete this.editors[id]
      } else {
        throw new Error(`Editor with id "${id}" not found.`)
      }
    },
    setEditorContents(id: string, contents: string) {
      if (this.editors[id]) {
        this.editors[id].setContent(contents)
      } else {
        throw new Error(`Editor with id "${id}" not found.`)
      }
    },
    setEditorResults(id: string, results: Results) {
      if (this.editors[id]) {
        let editor = this.editors[id]
        editor.results = results
        // clean error state
        editor.setError(null)
      } else {
        throw new Error(`Editor with id "${id}" not found.`)
      }
    },
    getCurrentEditorAutocomplete(word: string) {
      let activeEditor = this.editors[this.activeEditorId]
      return activeEditor.getAutocomplete(word)
    },
  },
})

export type EditorStoreType = ReturnType<typeof useEditorStore>

export default useEditorStore
