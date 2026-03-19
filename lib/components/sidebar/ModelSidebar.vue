<template>
  <sidebar-list title="Models">
    <template #header>
      <div class="models-header">
        <h3 class="font-sans sidebar-header">Models</h3>
        <div class="models-header-actions">
          <button
            class="sidebar-control-button sidebar-header-action"
            @click="creatorVisible = !creatorVisible"
            :data-testid="testTag ? `model-creator-add-${testTag}` : 'model-creator-add'"
          >
            <i class="mdi mdi-plus"></i>
            {{ creatorVisible ? 'Close' : 'New' }}
          </button>
          <loading-button
            class="sidebar-control-button sidebar-header-action"
            :action="saveModels"
            :key-combination="['control', 's']"
            :use-default-style="false"
          >
            Save
          </loading-button>
        </div>
      </div>
    </template>
    <template #actions>
      <model-creator :visible="creatorVisible" @close="creatorVisible = !creatorVisible" />
    </template>

    <template v-for="item in flatList" :key="item.id">
      <sidebar-item
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
          <span v-if="item.type === 'model'" class="right-container">
            <sidebar-overflow-menu
              :items="contextMenuItems(item)"
              tooltip="Model actions"
              @select="handleContextMenuItemClick(item, $event)"
            />
          </span>
        </template>
      </sidebar-item>
    </template>
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
import SidebarOverflowMenu from './SidebarOverflowMenu.vue'
import type { ContextMenuItem } from '../ContextMenu.vue'

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
    let currentDatasource = ''
    let splits = current.split(KeySeparator)
    if (currentType === 'model') {
      currentModel = splits[1]
    } else if (currentType === 'source') {
      currentModel = splits[1]
      currentSource = splits[2]
    } else if (currentType === 'datasource') {
      currentModel = splits[1]
      currentSource = splits[2]
      currentDatasource = splits[3]
    } else if (currentType === 'concept') {
      currentModel = splits[1]
      currentSource = splits[2]
      if (splits.length > 5) {
        currentDatasource = splits[3]
      }
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
          if (
            model.name !== currentModel ||
            source.alias !== currentSource ||
            ds.name !== currentDatasource
          ) {
            collapsedPre[dsId] = true
          }
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

    const contextMenuItems = (item: any): ContextMenuItem[] => {
      if (item.type !== 'model') {
        return []
      }

      return [
        { id: 'refresh-model', label: 'Refresh model', icon: 'mdi-cog-refresh-outline' },
        { id: 'delete-separator', kind: 'separator' },
        { id: 'delete-model', label: 'Delete model', icon: 'mdi-trash-can-outline', danger: true },
      ]
    }

    const handleContextMenuItemClick = (item: any, menuItem: ContextMenuItem) => {
      switch (menuItem.id) {
        case 'refresh-model':
          fetchParseResults(item.name)
          break
        case 'delete-model':
          modelStore.removeModelConfig(item.name)
          break
      }
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
      contextMenuItems,
      handleContextMenuItemClick,
    }
  },

  components: {
    SidebarList,
    SidebarItem,
    ModelCreator,
    LoadingButton,
    Tooltip,
    SidebarOverflowMenu,
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
  align-items: center;
  gap: 4px;
}

.models-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.models-header .sidebar-header {
  margin: 0;
}

.models-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.trilogy-icon {
  width: var(--icon-size);
  height: var(--icon-size);
}

.purpose-key {
  color: #436fe8;
  font-weight: 700;
  padding-right: 2px;
  font-size: 11px;
  opacity: 0.9;
}

.purpose-property {
  color: #de6d2e;
  font-weight: 700;
  padding-right: 2px;
  font-size: 11px;
  opacity: 0.9;
}

.purpose-metric {
  color: #73bd29;
  font-weight: 700;
  padding-right: 2px;
  font-size: 11px;
  opacity: 0.9;
}
</style>
