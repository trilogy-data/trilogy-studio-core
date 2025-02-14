<template>
    <div id="interface" class="interface">
        <div class="interface-wrap">
            <div ref="sidebar" class="sidebar">
                <slot name="sidebar"></slot>
            </div>
            <div ref="content" class="nested-page-content pa-0" id="page-content">
                <slot></slot>
            </div>
        </div>
    </div>
</template>
<style>
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
    /* flex-wrap: wrap; */
    height: 100%;
    width: 100%;
    z-index: 51;
    overflow-y:visible;
}

.nested-page-content {
    flex: 1 1 auto;
    max-height: 100%;
    min-width: 350px;
    z-index: 1;
    overflow: scroll;
}

.gutter {
  position: relative;
  &.gutter-horizontal,
  &.gutter-vertical {
    display: flex;
    background-color: transparent;
    z-index: 60;
  }
  &.gutter-horizontal {
    width: 0!important;
    background-color: transparent;
    cursor: ew-resize;
    &:after {
      height: 100%;
      width: 8px;
      left: -2px;
    }
  }
  &.gutter-vertical {
    cursor: ns-resize;
    height: 0!important;
    &:after {
      height: 8px;
      width: 100%;
      top: -4px;
    }
  }
  &:after {
    content: "";
    display: block;
    position: absolute;
    z-index: 60;
  }
}




</style>
<script lang="ts">
import Split from 'split.js';

export default {
    name: "StudioView",
    data() {
        return {
            split: null as Split.SplitInstance | null,
            queryText: "",
            form: false,
            loading: false,
            error: "",
            results: [],
            models: [],
            tab: "models",
            sidebarShown: true
        };
    },
    components: {
    },
    computed: {
        splitElements() {
            return [
                this.$refs.sidebar,
                this.$refs.content
            ];
        }
    },
    methods: {
        beforeDestroy() {
            if (this.split) {
                this.split.destroy();
            }
        },
    },
    mounted() {
        // @ts-ignore
        this.split = Split(this.splitElements, {
            // @ts-ignore
            elementStyle: (_dimension, size) => ({
                "flex-basis": `calc(${size}%)`,
            }),
            sizes: [15, 85],
            minSize: 200,
            expandToMin: true,
            gutterSize: 0,
        });
    }
};
</script>