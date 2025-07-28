<!-- TutorialPromptComponent.vue -->
<template>
  <div class="tutorial-prompt-container">
    <div class="prompt-navigation">
      <button @click="prevPrompt" :disabled="currentIndex === 0" class="nav-button">
        <span class="nav-icon">←</span> Previous
      </button>
      <div class="progress-indicator">{{ currentIndex + 1 }} / {{ prompts.length }}</div>
      <button
        @click="nextPrompt"
        :disabled="currentIndex === prompts.length - 1 || !isCurrentPromptValid"
        class="nav-button"
        data-testid="next-prompt"
      >
        Next <span class="nav-icon">→</span>
      </button>
    </div>

    <div class="prompt-content">
      <div class="prompt-header">
        <h3>{{ currentPrompt.title }}</h3>
        <div
          v-if="hasUserAttempted"
          :class="['validation-status', isCurrentPromptValid ? 'valid' : 'invalid']"
        >
          {{ isCurrentPromptValid ? '✓ Correct!' : '✗ Try again' }}
        </div>
      </div>

      <div class="prompt-description" v-html="currentPrompt.description"></div>

      <div class="prompt-example" v-if="currentPrompt.example">
        <code-block
          language="sql"
          :content="currentPrompt.example"
          :copy="setEditorContent"
        ></code-block>
      </div>
    </div>

    <div class="editor-container">
      <div class="editor-section">
        <editor
          :context="context"
          :editorId="editorId"
          @save-editors="saveEditorsCall"
          ref="editorRef"
          @query-finished="validateResults"
        />
      </div>
      <div class="results-section">
        <results-view
          :editorData="editorStore.editors[editorId]"
          :containerHeight="500"
          @llm-query-accepted="runQuery"
        />
      </div>
    </div>

    <div class="hint-section" v-if="currentPrompt.hints">
      <details>
        <summary>Need a hint?</summary>
        <ul>
          <li v-for="(hint, index) in currentPrompt.hints" :key="index">
            {{ hint }}
          </li>
        </ul>
      </details>
    </div>
  </div>
</template>

<script lang="ts">
import { ref, computed, inject, watch } from 'vue'
import type { EditorStoreType } from '../../stores/editorStore'
import Editor from './editor/Editor.vue'
import ResultsView from './ResultsView.vue'
import CodeBlock from './CodeBlock.vue'
import type { TutorialPrompt } from '../../data/tutorial/docTypes'

interface EditorComponent {
  setContent(content: string): void
  runQuery(): void
}

export default {
  name: 'TutorialPromptComponent',
  components: {
    Editor,
    ResultsView,
    CodeBlock,
  },
  props: {
    // Array of prompts to navigate through
    prompts: {
      type: Array as () => TutorialPrompt[],
      required: true,
    },
    context: {
      type: String,
      default: 'main-trilogy',
    },
    editorId: {
      type: String,
      default: 'tutorial-editor',
    },
  },
  setup(props: { prompts: TutorialPrompt[]; context: string; editorId: string }) {
    const editorStore = inject<EditorStoreType>('editorStore')
    const saveEditors = inject<() => void>('saveEditors')
    const editorRef = ref<EditorComponent | null>(null)

    if (!editorStore || !saveEditors) {
      throw new Error('Editor store or saveEditors function not provided')
    }

    const currentIndex = ref<number>(0)
    const hasUserAttempted = ref<boolean>(false)
    const isCurrentPromptValid = ref<boolean>(false)

    const currentPrompt = computed<TutorialPrompt>(() => props.prompts[currentIndex.value])

    // Watch for editor changes to validate results
    watch(
      () => editorStore.editors[props.editorId]?.results,
      () => {
        if (hasUserAttempted.value) {
          validateResults()
        }
      },
      { deep: true },
    )

    // Reset validation state when changing prompts
    watch(currentIndex, () => {
      hasUserAttempted.value = false
      isCurrentPromptValid.value = false
    })

    function nextPrompt(): void {
      if (currentIndex.value < props.prompts.length - 1 && isCurrentPromptValid.value) {
        currentIndex.value++
      }
    }

    function prevPrompt(): void {
      if (currentIndex.value > 0) {
        currentIndex.value--
      }
    }

    function validateResults(): void {
      hasUserAttempted.value = true
      if (!editorStore) return
      const results = editorStore.editors[props.editorId]?.results

      if (results && currentPrompt.value.validationFn) {
        isCurrentPromptValid.value = currentPrompt.value.validationFn(results)
      } else {
        isCurrentPromptValid.value = false
      }
    }

    function saveEditorsCall(): void {
      if (!saveEditors) return
      saveEditors()
      validateResults()
    }

    function setEditorContent(content: string): void {
      console.log('Setting editor content pre:', content)
      if (editorRef.value) {
        console.log('Setting editor content:', content)
        editorRef.value.setContent(content)
      }
    }
    function runQuery() {
      if (editorRef.value) {
        editorRef.value.runQuery()
      }
    }
    return {
      editorStore,
      runQuery,
      currentIndex,
      currentPrompt,
      hasUserAttempted,
      isCurrentPromptValid,
      nextPrompt,
      prevPrompt,
      validateResults,
      saveEditorsCall,
      setEditorContent,
      editorRef,
    }
  },
}
</script>

<style scoped>
.tutorial-prompt-container {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-color);
  margin-bottom: 20px;
  background-color: var(--bg-color);
  /* height: 800px; */
  overflow: hidden;
}

.prompt-navigation {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px;
  border-bottom: 1px solid var(--border-light);
  background-color: var(--sidebar-bg);
}

.nav-button {
  display: flex;
  align-items: center;
  padding: 6px 12px;
  min-width: 100px;
  justify-content: center;
}

.nav-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.nav-icon {
  margin: 0 4px;
}

.progress-indicator {
  font-size: var(--small-font-size);
  color: var(--text-faint);
}

.prompt-content {
  padding: 10px;
  overflow-y: scroll;
  max-height: 300px;
  border-bottom: 1px solid var(--border-light);
}

.prompt-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.prompt-header h3 {
  margin: 0;
  font-size: var(--big-font-size);
}

.validation-status {
  font-weight: bold;
  padding: 4px 8px;
}

.validation-status.valid {
  background-color: rgba(76, 175, 80, 0.1);
  color: #2e7d32;
}

.validation-status.invalid {
  background-color: #ffd580;
  color: hsl(210, 100%, 50%, 0.75);
}

.prompt-description {
  margin-bottom: 15px;
  font-size: var(--font-size);
}

.prompt-example {
  background-color: var(--result-window-bg);
  padding: 5px;
  margin-bottom: 5px;
}

.example-label {
  font-weight: bold;
  margin-bottom: 5px;
  font-size: var(--small-font-size);
}

.editor-container {
  display: flex;
  flex-direction: column;
  flex: 1;
  /* height: 800px; */
  overflow: hidden;
}

.editor-section {
  height: 300px;
  overflow: hidden;
}

.results-section {
  height: 500px;
  overflow: auto;
  border-top: 1px solid var(--border-light);
}

.hint-section {
  padding: 10px 15px;
  border-top: 1px solid var(--border-light);
  background-color: var(--sidebar-bg);
}

.hint-section details {
  font-size: var(--small-font-size);
}

.hint-section summary {
  cursor: pointer;
  color: var(--special-text);
  font-weight: bold;
}

.hint-section ul {
  margin-top: 10px;
  padding-left: 20px;
}

/* Mobile responsiveness */
@media screen and (max-width: 768px) {
  .tutorial-prompt-container {
    height: auto;
    max-height: 125vh;
  }

  .prompt-navigation {
    flex-wrap: wrap;
  }

  .nav-button {
    min-width: 80px;
    font-size: var(--button-font-size);
  }

  .editor-section {
    height: 600px;
  }

  .results-section {
    height: 400px;
  }
}
</style>
