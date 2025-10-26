<template>
  <div>
    <div
      v-if="item.type === 'creator'"
      :data-testid="`editor-list-id-${item.key}`"
      class="creator-item"
      @click="$emit('item-click', item.type, item.objectKey, item.key)"
    ></div>

    <sidebar-item
      v-else
      :item-id="item.key"
      :name="item.label"
      :indent="item.indent"
      :is-selected="activeEditor === item.objectKey"
      :is-collapsible="!['editor', 'creator'].includes(item.type)"
      :is-collapsed="isCollapsed"
      itemType="editor"
      @click="handleClick"
      @toggle="handleToggle"
    >
      <!-- Custom icon slot for editor types -->
      <template #icon>
        <template v-if="item.type === 'editor'">
          <tooltip content="Raw SQL Editor" v-if="item.editor.type === 'sql'">
            <span class="sql">SQL</span>
          </tooltip>
          <tooltip content="Trilogy Editor" class="icon-display" v-else>
            <img :src="trilogyIcon" class="trilogy-icon" />
          </tooltip>
        </template>
      </template>

      <!-- Custom name slot for connection model info -->
      <template #name>
        {{ item.label }}
        <span class="text-light" v-if="item.type === 'connection'">
          <span class="connection-model" v-if="connectionStore.connections[item.label]?.model">
            ({{ connectionStore.connections[item.label].model }})
          </span>
          <span
            v-else
            class="no-model-text"
            @click.stop="createDefaultModel(item.label)"
            title="Click to create a default model"
          >
            (No Model Set)
          </span>
        </span>
      </template>

      <!-- Custom extra content slot for actions and tags -->
      <template #extra-content>
        <template v-if="item.type === 'editor'">
          <span class="tag-container">
            <span v-for="tag in item.editor.tags" :key="tag" class="tag">{{ tag }}</span>
          </span>

          <tooltip content="Delete Editor" position="left">
            <span
              class="remove-btn hover-icon"
              @click.stop="$emit('delete-editor', item.editor)"
              :data-testid="`delete-editor-${item.label}`"
            >
              <i class="mdi mdi-trash-can-outline"></i>
            </span>
          </tooltip>
        </template>

        <template v-else-if="item.type === 'connection'">
          <span class="tag-container hover-icon">
            <editor-creator-icon :connection="item.label" type="sql" title="New SQL Editor" />
            <editor-creator-icon :connection="item.label" title="New Trilogy Editor" />
          </span>
          <connection-status-icon
            v-if="connectionStore.connections[item.label]"
            :connection="connectionStore.connections[item.label]"
          />
        </template>

        <template v-else-if="item.type === 'folder'">
          <span class="tag-container hover-icon">
            <editor-creator-icon
              :connection="item.connection"
              type="sql"
              title="New SQL Editor"
              :root="item.objectKey"
            />
            <editor-creator-icon
              :connection="item.connection"
              title="New Trilogy Editor"
              :root="item.objectKey"
            />
          </span>
        </template>
      </template>
    </sidebar-item>
  </div>
</template>

<script lang="ts">
import { inject } from 'vue'
import type { ConnectionStoreType } from '../../stores/connectionStore'
import SidebarItem from './GenericSidebarItem.vue'
import Tooltip from '../Tooltip.vue'
import ConnectionStatusIcon from './ConnectionStatusIcon.vue'
import trilogyIcon from '../../static/trilogy_small.webp'
import EditorCreatorIcon from '../editor/EditorCreatorIcon.vue'
import useModelConfigStore from '../../stores/modelStore'

export default {
  name: 'EditorListItem',
  props: {
    item: {
      type: Object,
      required: true,
    },
    activeEditor: {
      type: String,
      default: '',
    },
    isCollapsed: {
      type: Boolean,
      default: false,
    },
    isMobile: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['item-click', 'delete-editor', 'toggle'],
  setup(props, { emit }) {
    const connectionStore = inject<ConnectionStoreType>('connectionStore')
    const saveModels = inject<CallableFunction>('saveModels')
    const saveConnections = inject<CallableFunction>('saveConnections')

    if (!connectionStore || !saveModels || !saveConnections) {
      throw new Error('Connection store is not provided!')
    }

    const modelConfigStore = useModelConfigStore()

    const createDefaultModel = async (connectionName: string) => {
      try {
        // Create a new model with the same name as the connection
        let model = modelConfigStore.newModelConfig(connectionName)

        // Update the connection to use this model
        if (connectionStore.connections[connectionName]) {
          connectionStore.connections[connectionName].model = model.name
        }

        // await saveModels and saveConnections
        await saveModels()
        await saveConnections()
      } catch (error) {
        console.error(`Error creating model for connection ${connectionName}:`, error)
      }
    }

    const handleClick = () => {
      emit('item-click', props.item.type, props.item.objectKey, props.item.key)
    }

    const handleToggle = () => {
      emit('item-click', props.item.type, props.item.objectKey, props.item.key)
    }

    return {
      connectionStore,
      trilogyIcon,
      createDefaultModel,
      handleClick,
      handleToggle,
    }
  },
  components: {
    SidebarItem,
    Tooltip,
    ConnectionStatusIcon,
    EditorCreatorIcon,
  },
}
</script>

<style scoped>
.sql {
  color: var(--text-color);
  font-style: bold;
  font-size: 8px;
  margin-right: 5px;
}

.trilogy-icon {
  width: var(--icon-size);
  height: var(--icon-size);
}

.icon-display {
  display: flex;
  justify-content: center;
  align-items: center;
}

.remove-btn {
  margin-left: auto;
  cursor: pointer;
  flex: 1;
}

.tag-container {
  margin-left: auto;
  display: flex;
}

.tag {
  font-size: 8px;
  border-radius: 3px;
  padding: 2px;
  background-color: hsla(210, 100%, 50%, 0.516);
  border: 1px solid hsl(210, 100%, 50%, 0.5);
  color: var(--tag-font);
  line-height: 10px;
  cursor: pointer;
}

.text-light {
  color: var(--text-faint);
}

.no-model-text {
  cursor: pointer;
  text-decoration: underline dotted;
}

.no-model-text:hover {
  color: var(--primary-color);
}

.creator-item {
  padding: 8px;
  cursor: pointer;
}

/* Show hover icons when parent sidebar item is hovered */
:deep(.sidebar-item:hover) .hover-icon {
  opacity: 1;
}

.hover-icon {
  opacity: 0;
  transition: opacity 0.2s;
}
</style>
