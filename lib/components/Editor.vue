<template>
  <div class="parent">
    <error-message v-if="!editorData">An editor by this name could not be found.</error-message>
    <template v-else>
      <div class="menu-bar">
        <div class="menu-left">
          <div class="menu-title" @click="startEditing">
            <span v-if="!isEditing" class="editable-text">
              {{ editorData.name }}
              <span class="edit-indicator">✎</span>
            </span>
            <input
              v-else
              ref="nameInput"
              v-model="editableName"
              @blur="finishEditing"
              @keyup.enter="finishEditing"
              @keyup.esc="cancelEditing"
              class="name-input"
              type="text"
            />
          </div>
          <div class="toggle-group">
            <button
              class="toggle-button tag-inactive"
              :class="{ tag: editorData.tags.includes(EditorTag.SOURCE) }"
              @click="toggleTag()"
            >
              {{ editorData.tags.includes(EditorTag.SOURCE) ? 'Is' : 'Set as' }} Source
            </button>
            <!-- <button class="toggle-button" :class="{ 'toggle-active': editorData.tags.includes('scheduled') }"
            @click="toggleTag('scheduled')">
            Scheduled
          </button> -->
          </div>
        </div>
        <div class="menu-actions">
          <button class="action-item" @click="$emit('save-editors')">Save</button>

          <loading-button :useDefaultStyle="false" class="action-item" :action="validateQuery"
            >Parse</loading-button
          >

          <button
            class="action-item"
            :class="{ 'button-cancel': editorData.loading }"
            @click="runQuery"
          >
            {{ editorData.loading ? 'Cancel' : 'Run' }}
          </button>
        </div>
      </div>
      <div ref="editor" id="editor" class="editor-fix-styles"></div>
    </template>
  </div>
</template>
<style>
.tag {
  /* Push to the right */
  font-size: 8px;
  /* margin-left: 5px; */
  border-radius: 3px;
  padding: 2px;
  background-color: hsl(210, 100%, 50%, 0.25);
  border: 1px solid hsl(210, 100%, 50%, 0.5);
  color: var(--tag-font);
  line-height: 10px;
}

.tag-inactive {
  /* Push to the right */
  font-size: 8px;
  /* margin-left: 5px; */
  border-radius: 3px;
  padding: 2px;
  color: var(--tag-font);
  line-height: 10px;
}

.parent {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.menu-bar {
  background-color: var(--sidebar-bg);
  display: flex;
  flex-wrap: wrap;
  /* Allow content to wrap to a new line */
  gap: 0.5rem;
  /* Add some spacing between wrapped elements */
  padding: 0.25rem;
  justify-content: space-between;
  padding-right: 0.5rem;
}

.menu-actions {
  display: flex;
  flex-wrap: wrap;
  /* Allow buttons to move to a new line */
  justify-content: flex-end;
  gap: 0.5rem;
  /* Spacing between buttons */
  align-items: center;
  flex-grow: 1;
}

.action-item {
  height: 25px;
  width: 80px;
  font-weight: 500;
  cursor: pointer;
  border-radius: 0px;
  border: 1px solid var(--border-color);
  cursor: pointer;
  margin-left: 0.75rem;
  /* margin-right: 0.75rem; */
  transition:
    background-color 0.3s ease,
    color 0.3s ease;
}

.menu-left {
  display: flex;
  align-items: center;
  gap: 1.5rem;
}

.menu-title {
  font-weight: 500;
  cursor: pointer;
  padding: 0.375rem;
  border-radius: 4px;
  display: flex;
  align-items: center;
}

.menu-title:hover .edit-indicator {
  opacity: 1;
}

.editable-text {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.edit-indicator {
  opacity: 0;
  font-size: 0.875rem;
  transition: opacity 0.2s ease;
}

.name-input {
  background: var(--bg-color);
  border: 1px solid #ced4da;
  border-radius: 4px;
  padding: 0.375rem 0.75rem;
  font-size: inherit;
  font-weight: 500;
  width: auto;
  min-width: 200px;
}

.name-input:focus {
  outline: none;
  border-color: #339af0;
  box-shadow: 0 0 0 2px rgba(51, 154, 240, 0.1);
}

.editor-fix-styles {
  text-align: left;
  border: none;
  height: 100%;
  position: relative;
}

.button-cancel {
  background-color: var(--error-color);
  color: white;
  border: 1px solid var(--error-color);
}
</style>
<script lang="ts">
import { defineComponent, inject } from 'vue'

import { MarkerSeverity, editor, KeyMod, KeyCode } from 'monaco-editor'

import type { ConnectionStoreType } from '../stores/connectionStore.ts'
import type { EditorStoreType } from '../stores/editorStore.ts'
import type { UserSettingsStoreType } from '../stores/userSettingsStore.ts'
import type { ModelConfigStoreType } from '../stores/modelStore.ts'
import { Results } from '../editors/results'
import AxiosResolver from '../stores/resolver'
import LoadingButton from './LoadingButton.vue'
import ErrorMessage from './ErrorMessage.vue'
import { EditorTag } from '../editors'
import type { ContentInput } from '../stores/resolver'

let editorMap: Map<string, editor.IStandaloneCodeEditor> = new Map()
let mountedMap: Map<string, boolean> = new Map()

export default defineComponent({
  name: 'Editor',
  props: {
    context: {
      type: String,
      required: true,
    },
    editorName: {
      type: String,
      required: true,
    },
  },
  data() {
    return {
      last_passed_query_text: null,
      prompt: '',
      generatingPrompt: false,
      info: 'Query processing...',
      isEditing: false,
      editableName: '',
    }
  },
  components: {
    LoadingButton,
    ErrorMessage,
  },
  setup() {
    const connectionStore = inject<ConnectionStoreType>('connectionStore')
    const editorStore = inject<EditorStoreType>('editorStore')
    const modelStore = inject<ModelConfigStoreType>('modelStore')
    const trilogyResolver = inject<AxiosResolver>('trilogyResolver')
    const userSettingsStore = inject<UserSettingsStoreType>('userSettingsStore')
    if (!editorStore || !connectionStore || !trilogyResolver || !modelStore || !userSettingsStore) {
      throw new Error('Editor store and connection store and trilogy resolver are not provided!')
    }

    return {
      connectionStore,
      modelStore,
      editorStore,
      trilogyResolver,
      EditorTag,
      userSettingsStore,
    }
  },
  async mounted() {
    this.$nextTick(() => {
      this.createEditor()
    })
    mountedMap.set(this.context, true)
  },
  unmounted() {
    editorMap.get(this.context)?.dispose()
    editorMap.delete(this.context)
    mountedMap.delete(this.context)
  },
  computed: {
    editorData() {
      return this.editorStore.editors[this.editorName]
    },
    error() {
      return this.editorData.error
    },
    loading() {
      return this.editorData.loading
    },
    result() {
      return this.editorData.results
    },
    passedQuery() {
      return this.editorData.contents === this.last_passed_query_text
    },
    generateOverlayVisible() {
      return this.prompt.length > 1 || this.generatingPrompt
    },
  },
  watch: {
    editorName: {
      handler() {
        this.$nextTick(() => {
          this.createEditor()
        })
      },
    },
  },

  methods: {
    toggleTag() {
      this.editorData.tags = this.editorData.tags.includes(EditorTag.SOURCE)
        ? this.editorData.tags.filter((tag) => tag !== EditorTag.SOURCE)
        : [...this.editorData.tags, EditorTag.SOURCE]
    },
    startEditing() {
      this.isEditing = true
      this.editableName = this.editorData.name
      this.$nextTick(() => {
        // @ts-ignore
        this.$refs.nameInput.focus()
      })
    },
    finishEditing() {
      this.isEditing = false
      this.editorData.name = this.editableName
    },
    cancelEditing() {
      this.isEditing = false
    },

    async validateQuery(log: boolean = true) {
      const editorItem = editorMap.get(this.context)
      if (this.loading || !editorItem) {
        return
      }
      // TODO - syntax validation for SQL?
      if (this.editorData.type === 'sql') {
        return
      }
      try {
        if (log) {
          // @ts-ignore
          window.goatcounter.count({
            path: 'studio-query-validate',
            title: this.editorData.type,
            event: true,
          })
        }
      } catch (error) {
        console.log(error)
      }
      const conn = this.connectionStore.connections[this.editorData.connection]
      if (!conn) {
        this.editorData.setError(`Connection ${this.editorData.connection} not found.`)
        return
      }

      let annotations = await this.trilogyResolver.validate_query(editorItem.getValue())
      let model = editorItem.getModel()
      if (!model) {
        return
      }
      MarkerSeverity.Error
      editor.setModelMarkers(model, 'owner', annotations.data.items)
    },
    async runQuery() {
      this.$emit('query-started')
      const editor = editorMap.get(this.context)
      if (this.loading || !editor) {
        return
      }

      try {
        // @ts-ignore
        window.goatcounter.count({
          path: 'studio-query-execution',
          title: this.editorData.type,
          event: true,
        })
      } catch (error) {
        console.log(error)
      }

      const conn = this.connectionStore.connections[this.editorData.connection]
      if (!conn) {
        this.editorData.setError(`Connection ${this.editorData.connection} not found.`)
        return
      }

      if (!conn.connected) {
        this.editorData.setError(`Connection is not active.`)
        return
      }

      // Create an AbortController for cancellation
      const controller = new AbortController()
      this.editorData.cancelCallback = () => {
        controller.abort()
        this.editorData.loading = false
        this.editorData.cancelCallback = null
      }

      try {
        this.editorData.loading = true
        await this.validateQuery(false)
        // Prepare sources if model exists
        const sources: ContentInput[] = conn.model
          ? this.modelStore.models[conn.model].sources.map((source) => ({
              alias: source.alias,
              contents: this.editorStore.editors[source.editor].contents,
            }))
          : []

        // Get selected text or full content
        const selected = editor.getSelection()
        let text =
          selected &&
          !(
            selected.startColumn === selected.endColumn &&
            selected.startLineNumber === selected.endLineNumber
          )
            ? (editor.getModel()?.getValueInRange(selected) as string)
            : editor.getValue()
        // hack for mobile? getValue not returning values
        if (!text) {
          text = this.editorData.contents
        }
        if (!text) {
          this.editorStore.setEditorResults(this.editorName, new Results(new Map(), []))
          return
        }
        // First promise: Resolve query
        const resolveResponse = await Promise.race([
          this.trilogyResolver.resolve_query(text, conn.query_type, this.editorData.type, sources),
          new Promise((_, reject) => {
            controller.signal.addEventListener('abort', () =>
              reject(new Error('Query cancelled by user')),
            )
          }),
        ])
        // @ts-ignore
        if (!resolveResponse.data.generated_sql) {
          this.editorStore.setEditorResults(this.editorName, new Results(new Map(), []))
          return
        }
        // @ts-ignore
        this.editorData.generated_sql = resolveResponse.data.generated_sql

        // Second promise: Execute query
        const sqlResponse = await Promise.race([
          // @ts-ignore
          conn.query(resolveResponse.data.generated_sql),
          new Promise((_, reject) => {
            controller.signal.addEventListener('abort', () =>
              reject(new Error('Query cancelled by user')),
            )
          }),
        ])
        // @ts-ignore
        this.editorStore.setEditorResults(this.editorName, sqlResponse)
      } catch (error) {
        if (error instanceof Error) {
          // Handle abortion vs other errors differently
          const errorMessage = controller.signal.aborted ? 'Query cancelled by user' : error.message
          this.editorData.setError(errorMessage)
        }
      } finally {
        this.editorData.loading = false
        this.editorData.cancelCallback = null
      }
    },
    getEditor() {
      editorMap.get(this.editorName)
    },

    createEditor() {
      let editorElement = document.getElementById('editor')
      if (!editorElement) {
        return
      }

      // if we've already set up the editor
      if (editorMap.has(this.context) && mountedMap.get(this.context)) {
        editorMap.get(this.context)?.setValue(this.editorData.contents)
        return
      }

      const editorItem = editor.create(editorElement, {
        value: this.editorData.contents,
        language: this.editorData.type === 'sql' ? 'sql' : 'trilogy',
        automaticLayout: true,
      })
      editorMap.set(this.context, editorItem)
      editorItem.layout()
      editor.defineTheme('trilogyStudio', {
        base: this.userSettingsStore.getSettings.theme == 'light' ? 'vs' : 'vs-dark', // can also be vs-dark or hc-black
        inherit: true, // can also be false to completely replace the builtin rules
        rules: [
          { token: 'comment', foreground: '#6A9955', fontStyle: 'italic' }, // Green for comments
          { token: 'keyword', foreground: '#569CD6', fontStyle: 'bold' }, // Blue for keywords
          { token: 'definition', foreground: '#E5C07B', fontStyle: 'bold' }, // Light yellow for function definitions
          { token: 'type', foreground: '#4EC9B0', fontStyle: 'bold' }, // Teal for types (like int, string, etc.)
          { token: 'string', foreground: '#CE9178' }, // Light orange for strings
          { token: 'number', foreground: '#B5CEA8' }, // Light green for numbers
          { token: 'operator', foreground: '#D4D4D4' }, // Light gray for operators
          { token: 'delimiter', foreground: '#D4D4D4' }, // Light gray for delimiters (like commas, colons)
          { token: 'function', foreground: '#C586C0', fontStyle: 'bold' }, // Light gray for delimiters (like commas, colons)
          { token: 'hidden', foreground: '#D6D6C8', fontStyle: 'italic' }, // hidden should be whitish
          { token: 'property', foreground: '#BFBFBF' }, //italicize properties
        ],
        colors: {
          // 'editor.foreground': '#F8F8F8',
          // 'editor.background': '#000000',
          // 'editorCursor.foreground': '#8B0000',
          // 'editor.lineHighlightBackground': '#0000FF20',
          // 'editorLineNumber.foreground': '#008800',
          // 'editor.selectionBackground': '#88000030',
          // 'editor.inactiveSelectionBackground': '#88000015'
        },
      })
      editor.setTheme('trilogyStudio')
      editorItem.onDidChangeModelContent(() => {
        this.editorStore.setEditorContents(this.editorName, editorItem.getValue())

        // this.$emit('update:contents', editor.getValue());
        // this.editorData.contents = editor.getValue();
      })
      editorItem.addCommand(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyV, () => {
        this.validateQuery()
      })
      editorItem.addCommand(KeyMod.CtrlCmd | KeyCode.Enter, () => {
        this.runQuery()
      })
      // if (this.genAICallback) {
      //   editorItem.addCommand(KeyMod.CtrlCmd | KeyCode.KeyG, () => {
      //     if (!this.loading) {
      //       this.genAICallback(editorItem.getValue())
      //     }
      //   })
      // }
      // if (this.formatTextCallback) {
      //     editor.addAction({
      //         id: 'format-preql',
      //         label: 'Format Trilogy',
      //         keybindings: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyI],
      //         run: function () {

      //             this.formatTextCallback(editor.getValue()).then((response) => {
      //                 editor.setValue(response)
      //             })
      //         }
      //     });
      // }
      editorItem.addCommand(KeyMod.CtrlCmd | KeyCode.KeyS, () => {
        this.$emit('save-editors')
      })
    },
  },
})
</script>
