import { defineStore } from 'pinia'
import Editor from '../models/editor'
import { Results } from "../models/results";

const useEditorStore = defineStore('editors', {
  state: () => ({
    editors: {} as Record<string, Editor>, // Use an object instead of Map
  }),
  getters: {
    editorList: (state) => Object.keys(state.editors).map(key => state.editors[key])
  },
  actions: {
    newEditor(name: string, type:string, connection:string) {
      let editor = new Editor({name, type, connection, contents:''});
      if (name in this.editors) {
        throw Error(`Editor with ${name} already exists.`);
      }
      this.editors[editor.name] = editor; // Add editor using object notation

    },
    addEditor(editor: Editor) {
      this.editors[editor.name] = editor; // Add editor using object notation
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
        this.editors[name].results = results;
      } else {
        throw new Error(`Editor with name "${name}" not found.`);
      }
    }
  },
});

export type EditorStoreType =  ReturnType<typeof useEditorStore>;

export default useEditorStore;