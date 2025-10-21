<template>
  <div class="view-container">
    <CommunityRemote v-if="selectedType === 'root'"/>
  </div>
</template>

<script lang="ts">
import { defineComponent, inject, ref } from 'vue'
import CommunityRemote from './CommunityRemote.vue'
import { KeySeparator } from '../../data/constants'
export default defineComponent({
  name: 'CommunityModelView',
  props: {
    activeCommunityModelKey: {
      type: String,
      required: true,
    },
  },
  setup() {
    const sourceDetails = ref({
      name: '',
      alias: '',
    })
    
    // You'll need to define these or import them
    const modelStore = inject('modelStore') // or however you're providing this
    const connectionStore = inject('connectionStore') // or however you're providing this
    
    return {
      modelStore,
      connectionStore,
      sourceDetails,
    }
  },
  components: {
    CommunityRemote,
  },
  computed: {
    selectedType() {
      if (this.separatorCount === 1) {
        return 'root'
      } else if (this.separatorCount === 2) {
        return 'engine'
      } else if (this.separatorCount === 3) {
        return 'model'
      }
    },
    separatorCount() {
      // You'll need to import or define KeySeparator
      // const KeySeparator = '/' // or whatever your separator is
      return this.activeCommunityModelKey.split(KeySeparator).length
    },
  }
})
</script>

<style scoped>
.view-container {
  height: 100%;
  width: 100%;
  background-color: var(--query-window-bg);
}
.no-selection {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
  width: 100%;
}
</style>