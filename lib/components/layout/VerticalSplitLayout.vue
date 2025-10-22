<template>
  <div ref="wrapper" class="editor-wrapper pa-0 ba-0">
    <div class="editor-entry" ref="editor">
      <slot name="editor" :containerHeight="editorHeight"></slot>
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
  max-height: 100%;
}

.editor-entry {
  display: flex;
  flex-direction: column;
  flex-wrap: nowrap;
  /* flex: 1 1 calc(100%-60px); */
  /* height: 100%; */
}

.editor-results {
  display: flex;
  flex-direction: column;
  flex-grow: 0;
  flex-shrink: 1;
  /* flex-wrap: wrap; */
  /* height: 100%; */
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
      minSize: [250, 250],
      // minSize: 200,
      // expandToMin: true,
      gutterSize: 0,
      onDrag: (sizes: number[]) => {

        this.updateResultsHeight(sizes)
      },
      onDragEnd: (sizes: number[]) => {

        this.updateResultsHeight(sizes)
      },
    })

    // Initialize the results height
    this.updateResultsHeight([60, 40])
  },
  beforeUnmount() {
    if (this.split) {
      this.split.destroy()
      this.split = null
    }

  },
  methods: {
    updateResultsHeight(split: number[]) {

      // @ts-ignore
      // 50 is a constant to account for the header
      let resultHeight = this.$refs.wrapper.getBoundingClientRect().height


      if (this.$refs.results) {
        // @ts-ignore
        this.resultsHeight = resultHeight * (split[1] / 100)
      }
      if (this.$refs.editor) {
        // @ts-ignore
        this.editorHeight = resultHeight * (split[0] / 100) - 50
      }
    },
  },
})
</script>
