import { defineStore } from 'pinia'
import Editor  from '../models/editor'
import { Results } from "../models/results";

const useEditorStore = defineStore('editors', {
    state: () => ({
      editors: {} as Record<string, Editor>, // Use an object instead of Map
    }),
    // getters: {
    //   editors: (state) => state.editors,
    // },
    actions: {
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


export default useEditorStore;