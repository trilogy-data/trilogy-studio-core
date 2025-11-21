<template>
  <div
    ref="editorElement"
    class="editor-fix-styles"
    :style="{ height: editorHeight ? editorHeight + 'px' : '100%' }"
    data-testid="editor"
  ></div>
</template>

<script lang="ts">
import { defineComponent, onMounted, onUnmounted, ref, watch } from 'vue'
import { editor, type IDisposable } from 'monaco-editor'
import {
  editorMap,
  mountedMap,
  createEditor,
  getEditorText as getEditorTextHelper,
  getEditorRange as getEditorRangeHelper,
  setValue as setValueHelper,
  executeEdits as executeEditsHelper,
  setModelMarkers as setModelMarkersHelper,
  getEditorInstance as getEditorInstanceHelper,
  type EditorEventCallbacks,
} from './editorHelpers'

interface Props {
  editorId: string
  context: string
  contents: string
  editorType: string
  theme: string
  scrollPosition?: { line: number; column: number } | null
  editorHeight?: number
}

export default defineComponent({
  name: 'CodeEditor',
  props: {
    editorId: {
      type: String,
      required: true,
    },
    context: {
      type: String,
      required: true,
    },
    contents: {
      type: String,
      required: true,
    },
    editorType: {
      type: String,
      required: true,
    },
    theme: {
      type: String,
      default: 'light',
    },
    scrollPosition: {
      type: Object as () => { line: number; column: number } | null,
      default: null,
    },
    editorHeight: {
      type: Number,
      required: false,
    },
  },

  emits: [
    'contents-change',
    'run-query',
    'validate-query',
    'format-query',
    'save',
    'scroll-change',
    'generate-llm-query',
    'go-to-definition-requested',
  ],

  setup(props: Props, { emit }) {
    const editorElement = ref<HTMLElement | null>(null)
    const providerDisposables = ref<IDisposable[]>([])

    // Create callbacks object that maps to Vue emit
    const callbacks: EditorEventCallbacks = {
      onContentsChange: (content: string) => emit('contents-change', content),
      onScrollChange: (position: { line: number; column: number }) => emit('scroll-change', position),
      onRunQuery: () => emit('run-query'),
      onValidateQuery: () => emit('validate-query'),
      onFormatQuery: () => emit('format-query'),
      onSave: () => emit('save'),
      onGenerateLlmQuery: () => emit('generate-llm-query'),
      onGoToDefinition: (data: any) => emit('go-to-definition-requested', data),
    }

    // Wrapper functions that use the helpers
    const getEditorText = (fallback: string): string => {
      return getEditorTextHelper(props.context, fallback)
    }

    const getEditorRange = () => {
      return getEditorRangeHelper(props.context)
    }

    const setValue = (value: string): void => {
      setValueHelper(props.context, value)
    }

    const executeEdits = (source: string, edits: editor.IIdentifiedSingleEditOperation[]): void => {
      executeEditsHelper(props.context, source, edits)
    }

    const setModelMarkers = (markers: editor.IMarkerData[]): void => {
      setModelMarkersHelper(props.context, markers)
    }

    const getEditorInstance = (): editor.IStandaloneCodeEditor | undefined => {
      return getEditorInstanceHelper(props.context)
    }

    // Setup on mount
    onMounted(() => {
      if (editorElement.value) {
        createEditor(editorElement.value, props, callbacks, providerDisposables.value)
      }
    })

    // Cleanup on unmount
    onUnmounted(() => {
      const editorInstance = editorMap.get(props.context)
      if (editorInstance) {
        editorInstance.dispose()
        editorMap.delete(props.context)
        mountedMap.delete(props.context)
      }
      
      // Clean up providers
      providerDisposables.value.forEach(d => d.dispose())
      providerDisposables.value = []
    })

    // Watch for editor ID changes
    watch(
      () => props.editorId,
      () => {
        console.log('Editor ID prop changed:', props.editorId)
        if (editorElement.value) {
          createEditor(editorElement.value, props, callbacks, providerDisposables.value)
        }
      },
    )

    watch(
      () => props.editorHeight,
      () => {
        console.log('Editor height prop changed:', props.editorHeight)
        const editorInstance = editorMap.get(props.context)
        if (editorInstance) {
          editorInstance.layout()
        }
      },
    )

    // Watch for theme changes
    watch(
      () => props.theme,
      () => {
        editor.setTheme(`trilogyStudio${props.theme}`)
      },
    )

    // Expose methods to parent component
    return {
      editorElement,
      getEditorText,
      getEditorRange,
      setValue,
      executeEdits,
      getEditorInstance,
      setModelMarkers,
    }
  },
})
</script>

<style scoped>
.editor-fix-styles {
  text-align: left;
  border: none;
  position: relative;
  width: 100%;
}
</style>