<template>
  <div class="editor-wrapper pa-0 ba-0">
    <div class="editor-entry" ref="editor">
      <slot name="editor" :containerHeight="resultsHeight"></slot>
    </div>
    <div class="editor-results editor-color" ref="results">
      <slot name="results" :containerHeight="resultsHeight"></slot>
    </div>
  </div>
</template>

<style>
.editor-wrapper {
  display: flex;
  flex-direction: column;
  flex-wrap: nowrap;
  /* flex: 1 1 100%; */
  height: 99.9%;
  background-color: var(--main-bg-color);
}

.editor-entry {
  display: flex;
  flex-direction: column;
  flex-wrap: nowrap;
  /* flex: 1 1 calc(100%-60px); */
  height: calc(100% - 24px);
}

.editor-results {
  display: flex;
  flex-direction: column;
  flex-grow: 0;
  flex-shrink: 1;
  /* flex-wrap: wrap; */
  height: calc(100% - 24px);
}

.editor-color {
  background-color: var(--main-bg-color);
}
</style>
<script lang="ts">
import Split from 'split.js'
import { defineComponent, ref } from 'vue'

export default defineComponent({
  name: 'VerticalSplitLayout',
  data() {
    return {
      resultsHeight: 0,
      editorHeight: 0,
      split: null as Split.SplitInstance | null,
    }
  },
  setup() {
    const editor = ref(null)
    const results = ref(null)

    return {
      editor,
      results,
    }
  },
  mounted() {
    // @ts-ignore
    this.split = Split([this.$refs.editor, this.$refs.results], {
      direction: 'vertical',
      sizes: [60, 40],
      minSize: 200,
      expandToMin: true,
      gutterSize: 0,
      onDrag: () => {
        window.dispatchEvent(new Event('resize'))
      },
      onDragEnd: () => {
        window.dispatchEvent(new Event('resize'))
      },
    })
    window.addEventListener('resize', this.updateResultsHeight)

    // Initialize the results height
    this.updateResultsHeight()
  },
  beforeUnmount() {
    if (this.split) {
      this.split.destroy()
      this.split = null
    }
    window.removeEventListener('resize', this.updateResultsHeight)
  },
  methods: {
    updateResultsHeight() {
      // @ts-ignore
      if (this.$refs.results) {
        // @ts-ignore
        this.resultsHeight = this.$refs.results.getBoundingClientRect().height
      }
      if (this.$refs.editor) {
        // @ts-ignore
        this.editorHeight = this.$refs.editor.getBoundingClientRect().height
      }
    },
  },
})
</script>
