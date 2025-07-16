<template>
  <sidebar-list title="Models">
    <template #actions>
      <div class="button-container">
        <button
          @click="creatorVisible = !creatorVisible"
          :data-testid="testTag ? `model-creator-add-${testTag}` : 'model-creator-add'"
        >
          {{ creatorVisible ? 'Hide' : 'New' }}
        </button>
        <loading-button :action="saveModels" :key-combination="['control', 's']">
          Save
        </loading-button>
      </div>
      <model-creator :visible="creatorVisible" @close="creatorVisible = !creatorVisible" />
    </template>

    <div
      v-for="item in flatList"
      :key="item.id"
      class="sidebar-item"
      :class="{ 'sidebar-item-selected': activeModelKey === item.id }"
    >
      <div class="sidebar-content" @click="handleClick(item.id)">
        <!-- headericons  -->
        <div
          v-for="(_, index) in Array.from({ length: item.indent }, () => 0)"
          :key="index"
          class="sidebar-padding"
        ></div>

        <span
          @click.stop="handleClick(item.id, true)"
          v-if="['model', 'source', 'datasource'].includes(item.type)"
        >
          <i v-if="!collapsed[item.id]" class="mdi mdi-menu-down"></i>
          <i v-else class="mdi mdi-menu-right"></i>
        </span>
        <img :src="trilogyIcon" class="trilogy-icon" v-if="item.type == 'source'" />
        <span
          v-else-if="item.type == 'concept'"
          :class="`purpose-${item.concept.purpose.toLowerCase()}`"
        >
          {{ item.concept.purpose.charAt(0).toUpperCase() }}
        </span>
        <i v-else-if="item.type == 'datasource'" class="mdi mdi-table"></i>

        <!-- item name -->
        <span class="truncate-text"
          >{{ item.name }}

          <!-- item extra -->
          <span v-if="['model', 'source'].includes(item.type)">({{ item.count }})</span>
          <!-- <span v-if="['concept'].includes(item.type)" class="faint-text">({{ item.concept.datatype }})</span> -->
        </span>

        <!-- right container, flex out -->
        <span class="right-container">
          <loading-button v-if="item.type === 'model'" :action="() => fetchParseResults(item.name)"
            >Parse</loading-button
          >
        </span>
      </div>
    </div>
  </sidebar-list>
</template>

<script lang="ts">
import { ref, computed, inject } from 'vue'
import SidebarList from './SidebarList.vue'
import ModelCreator from './ModelCreator.vue'
import LoadingButton from './LoadingButton.vue'
import type { ModelConfigStoreType } from '../stores/modelStore'
import type { EditorStoreType } from '../stores/editorStore'
import TrilogyResolver from '../stores/resolver'
import trilogyIcon from '../static/trilogy_small.webp'
import { KeySeparator } from '../data/constants'
import { getDefaultValueFromHash } from '../stores/urlStore'

export default {
  name: 'ModelList',
  props: {
    activeModelKey: String,
    testTag: {
      type: String,
      default: '',
    },
  },
  setup() {
    const modelStore = inject<ModelConfigStoreType>('modelStore')
    const saveModels = inject<Function>('saveModels')
    const editorStore = inject<EditorStoreType>('editorStore')
    const trilogyResolver = inject<TrilogyResolver>('trilogyResolver')

    const creatorVisible = ref(false)
    const current = getDefaultValueFromHash('modelKey') || ''
    const currentType = current.split(KeySeparator)[0]
    let currentModel = ''
    let currentSource = ''
    let splits = current.split(KeySeparator)
    if (currentType === 'model') {
      currentModel = splits[1]
    } else if (currentType === 'source') {
      currentModel = splits[1]
      currentSource = splits[2]
    } else if (currentType === 'datasource') {
      currentModel = splits[1]
      currentSource = splits[2]
    } else if (currentType === 'concept') {
      currentModel = splits[1]
      currentSource = splits[2]
    }

    if (!modelStore || !saveModels || !editorStore || !trilogyResolver) {
      throw new Error('Model store is not provided!')
    }

    let collapsedPre = {} as Record<string, boolean>
    // first loop to pre-collapse
    Object.values(modelStore.models).forEach((model) => {
      let modelId = ['model', model.name].join(KeySeparator)
      if (model.name !== currentModel) {
        collapsedPre[modelId] = true
      }

      model.sources.forEach((source) => {
        let sourceId = ['source', model.name, source.alias].join(KeySeparator)
        if (model.name !== currentModel || source.alias !== currentSource) {
          collapsedPre[sourceId] = true
        }
        source.datasources.forEach((ds) => {
          let dsId = ['datasource', model.name, source.alias, ds.name].join(KeySeparator)
          collapsedPre[dsId] = true
        })
      })
    })

    const collapsed = ref<Record<string, boolean>>(collapsedPre)

    const toggleCollapse = (id: string) => {
      collapsed.value[id] = !collapsed.value[id]
    }
    const flatList = computed(() => {
      const list: Array<{
        id: string
        name: string
        indent: number
        count: number
        type: string
        concept: any
      }> = []
      let sorted = Object.values(modelStore.models).sort((a, b) => a.name.localeCompare(b.name))
      sorted.forEach((model) => {
        if (model.deleted) return // Skip deleted models
        let modelId = ['model', model.name].join(KeySeparator)
        list.push({
          id: modelId,
          name: model.name,
          indent: 0,
          count: model.sources.length,
          type: 'model',
          concept: null,
        })

        if (!collapsed.value[modelId]) {
          model.sources.forEach((source) => {
            let sourceId = ['source', model.name, source.alias].join(KeySeparator)
            list.push({
              id: sourceId,
              name: source.alias,
              indent: 1,
              count: source.concepts.length,
              type: 'source',
              concept: null,
            })
            if (!collapsed.value[sourceId]) {
              source.concepts.forEach((concept) => {
                list.push({
                  id: ['concept', model.name, source.alias, concept.namespace, concept.name].join(
                    KeySeparator,
                  ),
                  name:
                    concept.namespace === 'local'
                      ? concept.name
                      : concept.namespace + '.' + concept.name,
                  indent: 2,
                  count: 0,
                  type: 'concept',
                  concept: concept,
                })
              })
              source.datasources.forEach((ds) => {
                let dsId = ['datasource', model.name, source.alias, ds.name].join(KeySeparator)
                list.push({
                  id: dsId,
                  name: ds.name,
                  indent: 2,
                  count: ds.concepts.length,
                  type: 'datasource',
                  concept: null,
                })
                if (!collapsed.value[dsId]) {
                  ds.concepts.forEach((field) => {
                    list.push({
                      id: [
                        'concept',
                        model.name,
                        source.alias,
                        ds.name,
                        field.namespace,
                        field.name,
                      ].join(KeySeparator),
                      name:
                        field.namespace === 'local'
                          ? field.name
                          : field.namespace + '.' + field.name,
                      indent: 3,
                      count: 0,
                      type: 'concept',
                      concept: field,
                    })
                  })
                }
              })
            }
          })
        }
      })
      return list
    })

    const fetchParseResults = (model: string) => {
      return trilogyResolver
        .resolveModel(
          model,
          modelStore.models[model].sources.map((source) => ({
            alias: source.alias,
            contents: (editorStore.editors[source.editor] || { contents: '' }).contents,
          })),
        )
        .then((parseResults) => {
          modelStore.setModelConfigParseResults(model, parseResults)
        })
        .catch((error) => {
          modelStore.setModelParseError(model, error.message)
          console.error('Failed to fetch parse results:', error)
        })
    }

    return {
      creatorVisible,
      flatList,
      toggleCollapse,
      collapsed,
      saveModels,
      fetchParseResults,
      trilogyIcon,
    }
  },
  methods: {
    handleClick(id: string, expandOnly: boolean = false) {
      this.toggleCollapse(id)
      if (expandOnly) {
        return
      }
      this.$emit('model-key-selected', id)
    },
  },
  components: {
    SidebarList,
    ModelCreator,
    LoadingButton,
  },
}
</script>

<style scoped>
.faint-text {
  color: var(--text-faint);
}

.sidebar-content {
  display: flex;
  align-items: center;
  width: 100%;
}

.right-container {
  margin-left: auto;
  display: flex;
  flex-wrap: wrap;
}

.trilogy-icon {
  width: var(--icon-size);
  height: var(--icon-size);
}

.purpose-key {
  color: #436fe8;
  font-weight: bold;
  padding-right: 4px;
  font-size: 12px;
}

.purpose-property {
  color: #de6d2e;
  font-weight: bold;
  padding-right: 4px;
  font-size: 12px;
}

.purpose-metric {
  color: #73bd29;
  font-weight: bold;
  padding-right: 4px;
  font-size: 12px;
}

.sidebar-padding {
  width: 7px;
  height: 22px;
  margin-right: 5px;
  border-right: 1px solid var(--border-light);
}
</style>
