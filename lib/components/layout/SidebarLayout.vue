<template>
  <div id="interface" class="interface" ref="wrapper">
    <div class="interface-wrap">
      <div ref="sidebar" class="sidebar">
        <slot name="sidebar" :containerWidth="sidebarWidth"></slot>
      </div>
      <div ref="content" class="nested-page-content" id="page-content">
        <slot></slot>
      </div>
    </div>
  </div>
</template>

<style scoped>
.interface {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
}
.interface-wrap {
  display: flex;
  flex-wrap: nowrap;
  flex: 1 1 auto;
  max-height: 100%;
  isolation: isolate;
}
.sidebar {
  background-color: var(--sidebar-bg);
  display: flex;
  flex-direction: column;
  flex-grow: 0;
  flex-shrink: 1;
  height: 100%;
  width: 100%;
  z-index: 51;
  overflow-y: visible;
}
.nested-page-content {
  flex: 1 1 auto;
  max-height: 100%;
  min-width: 350px;
  z-index: 1;
  overflow: auto;
}
</style>

<script lang="ts">
import Split from 'split.js'
export default {
  name: 'StudioView',
  data() {
    return {
      split: null as Split.SplitInstance | null,
      queryText: '',
      form: false,
      loading: false,
      error: '',
      results: [],
      models: [],
      tab: 'models',
      sidebarShown: true,
      sidebarWidth: 0,
    }
  },
  components: {},
  computed: {
    splitElements() {
      return [this.$refs.sidebar, this.$refs.content]
    },
  },
  methods: {
    beforeDestroy() {
      if (this.split) {
        this.split.destroy()
      }
    },
    updateSidebarWidth(sizes: number[]) {
      console.log('Updating sidebar width')
      // @ts-ignore
      let wrapperWidth = this.$refs.wrapper.getBoundingClientRect().width
      console.log('Wrapper width:', wrapperWidth)

      if (this.$refs.sidebar) {
        // @ts-ignore
        this.sidebarWidth = wrapperWidth * (sizes[0] / 100)
        console.log('Sidebar width updated:', this.sidebarWidth)
      }
    },
  },
  mounted() {
    // @ts-ignore
    this.split = Split(this.splitElements, {
      // @ts-ignore
      elementStyle: (_dimension, size) => ({
        'flex-basis': `calc(${size}%)`,
      }),
      sizes: [20, 80],
      minSize: 250,
      expandToMin: true,
      gutterSize: 0,
      onDrag: (sizes: number[]) => {
        console.log(sizes)
        this.updateSidebarWidth(sizes)
      },
      onDragEnd: (sizes: number[]) => {
        console.log(sizes)
        this.updateSidebarWidth(sizes)
      },
    })

    // Initialize the sidebar width
    this.updateSidebarWidth([15, 85])
  },
}
</script>
