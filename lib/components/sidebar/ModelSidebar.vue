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

    <sidebar-item
      v-for="item in flatList"
      :key="item.id"
      :item-id="item.id"
      :name="item.name"
      :indent="item.indent"
      :is-selected="activeModelKey === item.id"
      :is-collapsible="
        ['model'].includes(item.type) ||
        (['source', 'datasource'].includes(item.type) && item.count > 0)
      "
      :is-collapsed="collapsed[item.id]"
      @click="handleClick"
      @toggle="handleToggle"
    >
      <!-- Custom icon slot for different item types -->
      <template #icon>
        <img v-if="item.type === 'source'" :src="trilogyIcon" class="trilogy-icon" />
        <span
          v-else-if="item.type === 'concept'"
          :class="`purpose-${item.concept.purpose.toLowerCase()}`"
        >
          {{ item.concept.purpose.charAt(0).toUpperCase() }}
        </span>
        <i v-else-if="item.type === 'datasource'" class="mdi mdi-table node-icon"></i>
      </template>

      <!-- Custom extra content slot for action buttons -->
      <template #extra-content>
        <span class="right-container hover-icon">
          <tooltip v-if="item.type === 'model'" content="Refresh Model" position="left">
            <loading-button :action="() => fetchParseResults(item.name)">
              <i class="mdi mdi-cog-refresh-outline"></i>
            </loading-button>
          </tooltip>
          <tooltip v-if="item.type === 'model'" content="Delete Model" position="left">
            <i
              class="mdi mdi-delete-outline"
              @click="() => modelStore.removeModelConfig(item.name)"
            ></i>
          </tooltip>
        </span>
      </template>
    </sidebar-item>
  </sidebar-list>
</template>

<script lang="ts">
import { ref, computed, inject } from 'vue'
import SidebarList from './SidebarList.vue'
import SidebarItem from './GenericSidebarItem.vue'
import ModelCreator from '../model/ModelCreator.vue'
import LoadingButton from '../LoadingButton.vue'
import type { ModelConfigStoreType } from '../../stores/modelStore'
import type { EditorStoreType } from '../../stores/editorStore'
import TrilogyResolver from '../../stores/resolver'
import trilogyIcon from '../../static/trilogy_small.webp'
import { KeySeparator } from '../../data/constants'
import { getDefaultValueFromHash } from '../../stores/urlStore'
import { useScreenNavigation } from '../../stores'
import Tooltip from '../Tooltip.vue'

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
    const navigationStore = useScreenNavigation()

    const creatorVisible = ref(false)
    const current = navigationStore.activeModelKey.value || getDefaultValueFromHash('model') || ''
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

    const handleClick = (id: string) => {
      // get last value
      const lastIndex = id.lastIndexOf(KeySeparator)
      const label = lastIndex !== -1 ? id.substring(lastIndex + 1) : id
      navigationStore.openTab('models', label, id)
    }

    const handleToggle = (id: string) => {
      collapsed.value[id] = !collapsed.value[id]
    }

    return {
      creatorVisible,
      flatList,
      collapsed,
      saveModels,
      fetchParseResults,
      trilogyIcon,
      navigationStore,
      handleClick,
      handleToggle,
      modelStore,
    }
  },

  components: {
    SidebarList,
    SidebarItem,
    ModelCreator,
    LoadingButton,
    Tooltip,
  },
}
</script>

<style scoped>
.faint-text {
  color: var(--text-faint);
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

/* Show hover icons when parent sidebar item is hovered */
:deep(.sidebar-item:hover) .hover-icon {
  opacity: 1;
}

.hover-icon {
  opacity: 0;
  transition: opacity 0.2s;
}

/* on mobile, always show hover icons */
@media (max-width: 768px) {
  .hover-icon {
    opacity: 1;
  }
}
</style>
