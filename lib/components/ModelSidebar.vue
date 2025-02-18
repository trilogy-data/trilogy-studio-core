<template>
  <sidebar-list title="Models">
    <template #actions>
      <div class="button-container">
        <model-create />
        <loading-button :action="saveModels" :key-combination="['control', 's']"
          >Save</loading-button
        >
      </div>
    </template>
    <div v-for="(_, index) in modelConfigs" :key="index" class="storage-group">
      <h4 class="text-sm">{{ index }}</h4>
      <!-- <li v-for="editor in editors" :key="editor.name" class="editor-item p-1" @click="onEditorClick(editor)">
        <div class="editor-content">
          <tooltip content="Raw SQL Editor" v-if="editor.type == 'sql'"><i class="mdi mdi-alpha-s-box-outline"></i>
          </tooltip>
          <tooltip content="Trilogy Editor" v-else> <i class="mdi mdi-alpha-t-box-outline"></i></tooltip>
          <span @click="onEditorClick(editor)" class="padding-left hover:bg-gray-400">{{ editor.name }}</span>
          <span class="editor-connection"> ({{ editor.connection }})</span>
          <span class="remove-btn"><i class="mdi mdi-close" @click="deleteEditor(editor)"></i></span>
        </div>
      </li> -->
    </div>
  </sidebar-list>
</template>

<script lang="ts">
import { defineComponent, inject } from 'vue'
import { ModelConfig } from '../models' // Adjust the import path
import type { ModelConfigStoreType } from '../stores/modelStore'
import ModelCreate from './ModelCreate.vue'
import LoadingButton from './LoadingButton.vue'
import SidebarList from './SidebarList.vue'
export default defineComponent({
  name: 'ModelConfigViewer',
  setup() {
    const modelStore = inject<ModelConfigStoreType>('modelStore')
    const saveModels = inject<Function>('saveModels')
    if (!modelStore || !saveModels) {
      throw new Error('Model store is not provided!')
    }
    return { modelStore, saveModels }
  },
  components: {
    ModelCreate,
    LoadingButton,
    SidebarList,
  },
  data() {
    return {}
  },
  computed: {
    modelConfigs(): Record<string, ModelConfig> {
      return this.modelStore.models
    },
  },
  methods: {},
})
</script>

<style scoped>
.model-display {
  padding: 10px;
  margin: 0 auto;
}

.model-display ul {
  list-style: none;
  padding: 10px;
  margin-bottom: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
</style>
