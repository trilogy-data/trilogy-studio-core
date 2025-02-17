import { defineStore } from 'pinia'
import Editor from '../editors/editor'
import { Results } from "../editors/results";

const useEditorStore = defineStore('editors', {
  state: () => ({
    editors: {} as Record<string, Editor>, // Use an object instead of Map
  }),
  getters: {
    editorList: (state) => Object.keys(state.editors).map(key => state.editors[key])
  },
  actions: {
    newEditor(name: string, type: string, connection: string, contents: string | undefined) {
      let editor = new Editor({ name, type, connection, storage: 'local', contents: contents || '' });
      if (name in this.editors) {
        throw Error(`Editor with ${name} already exists.`);
      }
      this.editors[editor.name] = editor; // Add editor using object notation

    },
    addEditor(editor: Editor) {
      this.editors[editor.name] = editor; // Add editor using object notation
    },
    removeEditor(name: string) {
      if (this.editors[name]) {
        delete this.editors[name];
      } else {
        throw new Error(`Editor with name "${name}" not found.`);
      }
    },
    setEditorContents(name: string, contents: string) {
      if (this.editors[name]) {
        this.editors[name].contents = contents;
      } else {
        throw new Error(`Editor with name "${name}" not found.`);
      }
    },
    setEditorResults(name: string, results: Results) {
      if (this.editors[name]) {
        let editor = this.editors[name]
        editor.results = results;
        // clean error state
        editor.setError(null);
      } else {
        throw new Error(`Editor with name "${name}" not found.`);
      }
    }
  },
});

export type EditorStoreType = ReturnType<typeof useEditorStore>;

export default useEditorStore;