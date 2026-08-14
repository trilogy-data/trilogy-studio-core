import { defineStore } from 'pinia'
import Editor from '../editors/editor'
import type { EditorRefinementSession } from '../editors/editor'
import { Results } from '../editors/results'
import type { ChartConfig } from '../editors/results'
import { EditorTag } from '../editors'
import { normalizeRemoteEditorPath, type EditorType } from '../editors/editor'
import useConnectionStore from './connectionStore'
import { useChatStore } from './chatStore'
import { disposeRefinementChat } from '../llm/editorRefinementRuntime'

// Refinement execution now runs on chatStore.executeMessage via
// lib/llm/editorRefinementRuntime.ts; this store only manages the session
// (content diff, selection, backing chat pointer) and accept/discard.

const useEditorStore = defineStore('editors', {
  state: () => ({
    editors: {} as Record<string, Editor>, // Use an object instead of Map
    activeEditorName: '',
    activeEditorId: '',
  }),
  getters: {
    editorList: (state) => Object.keys(state.editors).map((key) => state.editors[key]),
    unsavedEditors: (state) => {
      return Object.values(state.editors).filter((editor) => editor.changed).length
    },
  },
  actions: {
    newEditor(
      name: string,
      type: EditorType,
      connection: string,
      contents: string | undefined,
      options: {
        storage?: string
        remoteStoreId?: string | null
        remotePath?: string | null
        remotePersisted?: boolean
      } = {},
    ) {
      const connectionStore = useConnectionStore()
      const connectionRef = connectionStore.connectionByName(connection) as
        { storage?: string; remoteStoreId?: string | null } | undefined
      const storage = options.storage || connectionRef?.storage || 'local'
      const remoteStoreId =
        options.remoteStoreId ||
        (storage === 'remote' ? connectionRef?.remoteStoreId || null : null)
      const baseName = storage === 'remote' ? normalizeRemoteEditorPath(name, type) : name
      const remotePath =
        storage === 'remote'
          ? normalizeRemoteEditorPath(options.remotePath || baseName, type)
          : null
      const baseId =
        storage === 'remote'
          ? `remote:${remoteStoreId || 'store'}:${encodeURIComponent(remotePath || baseName)}`
          : baseName
      let uniqueId = baseId
      let suffix = 1

      while (this.editors[uniqueId]) {
        uniqueId = `${baseId}#${suffix}`
        suffix++
      }

      let editor = new Editor({
        id: uniqueId,
        name: baseName,
        type,
        connection,
        storage,
        contents: contents || '',
        remoteStoreId,
        remotePath: remotePath || undefined,
        remotePersisted: options.remotePersisted || false,
      })

      this.editors[editor.id] = editor
      return editor
    },
    addEditor(editor: Editor) {
      this.editors[editor.id] = editor
    },
    getEditorByName(name: string): Editor | undefined {
      // Prefer live editors: deletion is a soft flag, so a deleted editor can
      // otherwise permanently shadow a live one recreated with the same name.
      const matches = Object.values(this.editors).filter((editor) => editor.name === name)
      return matches.find((editor) => !editor.deleted) ?? matches[0]
    },
    getConnectionEditors(connectionId: string, tags: EditorTag[] = []) {
      const base = Object.values(this.editors).filter(
        (editor) => editor.connectionId === connectionId,
      )
      if (tags.length === 0) {
        return base
      }
      return base.filter((editor) => tags.every((tag) => editor.tags.includes(tag)))
    },
    updateEditorName(id: string, newName: string) {
      this.editors[id].setName(newName)
    },
    removeEditor(id: string) {
      if (this.editors[id]) {
        this.editors[id].deleted = true
      } else {
        return false
      }
    },
    setEditorScrollPosition(id: string, scrollPosition: { line: number; column: number }) {
      if (this.editors[id]) {
        this.editors[id].scrollPosition = scrollPosition
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
      if (!this.activeEditorId) {
        return []
      }
      let activeEditor = this.editors[this.activeEditorId]
      if (!word) {
        return []
      }
      return activeEditor.getAutocomplete(word)
    },

    // ==================== Refinement Session Management ====================

    /** Start a new refinement session for an editor */
    startRefinementSession(
      editorId: string,
      options: {
        selectedText?: string
        selectionRange?: { start: number; end: number }
      } = {},
    ): void {
      const editor = this.editors[editorId]
      if (!editor) return

      const session: EditorRefinementSession = {
        messages: [],
        artifacts: [],
        originalContent: editor.contents,
        originalChartConfig: editor.chartConfig || undefined,
        currentContent: editor.contents,
        currentChartConfig: editor.chartConfig || undefined,
        selectedText: options.selectedText,
        selectionRange: options.selectionRange,
        wasLoading: false,
      }
      editor.setRefinementSession(session)
    },

    /** Update the refinement session for an editor */
    updateRefinementSession(editorId: string, updates: Partial<EditorRefinementSession>): void {
      const editor = this.editors[editorId]
      if (!editor || !editor.refinementSession) return

      editor.setRefinementSession({
        ...editor.refinementSession,
        ...updates,
      })
    },

    /** Clear refinement session for an editor, disposing its backing chat. */
    clearRefinementSession(editorId: string): void {
      const editor = this.editors[editorId]
      if (!editor) return

      disposeRefinementChat(editorId, { editorStore: this, chatStore: useChatStore() })
      editor.setRefinementSession(null)
    },

    /** Discard refinement and restore original content */
    discardRefinement(
      editorId: string,
      callbacks?: {
        onContentChange?: (content: string) => void
        onChartConfigChange?: (config: ChartConfig) => void
        onDiscard?: () => void
      },
    ): void {
      const editor = this.editors[editorId]
      if (!editor?.refinementSession) return

      const session = editor.refinementSession

      // Restore original content
      editor.setContent(session.originalContent)
      callbacks?.onContentChange?.(session.originalContent)

      if (session.originalChartConfig) {
        editor.setChartConfig(session.originalChartConfig)
        callbacks?.onChartConfigChange?.(session.originalChartConfig)
      }

      callbacks?.onDiscard?.()
      this.clearRefinementSession(editorId)
    },

    /** Accept refinement changes */
    acceptRefinement(
      editorId: string,
      callbacks?: {
        onFinish?: (message?: string) => void
      },
    ): void {
      callbacks?.onFinish?.('Changes accepted')
      this.clearRefinementSession(editorId)
    },
  },
})

export type EditorStoreType = ReturnType<typeof useEditorStore>

export default useEditorStore
