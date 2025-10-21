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
  max-height:100%;
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
         console.log(sizes)
        this.updateResultsHeight(sizes)
      },
      onDragEnd: (sizes: number[]) => {
        console.log(sizes)
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
      console.log('Updating results height')
      // @ts-ignore
      // 50 is a constant to account for the header
      let resultHeight = this.$refs.wrapper.getBoundingClientRect().height 
      console.log('Wrapper height:', resultHeight)

      let editorSize = split[0]
      let resultsSize = split[1]

      // let minSize = Math.max(Math.min(editorSize, results) 20)
      


      if (this.$refs.results) {
        // @ts-ignore
        this.resultsHeight = resultHeight * (split[1] / 100) 
        console.log('Results height updated:', this.resultsHeight)
      }
      if (this.$refs.editor) {
        // @ts-ignore
        this.editorHeight = resultHeight * (split[0] / 100) - 50
        console.log('Editor height updated:', this.editorHeight)
      }
    },
  },
})
</script>
