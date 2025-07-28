<template>
  <div
    :data-testid="`editor-list-id-${item.key}`"
    :class="{
      'sidebar-item': item.type !== 'creator',
      'sidebar-item-selected': activeEditor === item.objectKey,
    }"
    @click="$emit('item-click', item.type, item.objectKey, item.key)"
  >
    <div
      v-if="!['creator'].includes(item.type) && !isMobile"
      v-for="_ in item.indent"
      class="sidebar-padding"
    ></div>
    <i
      v-if="!['editor', 'creator'].includes(item.type)"
      :class="isCollapsed ? 'mdi mdi-menu-right' : 'mdi mdi-menu-down'"
    >
    </i>
    <template v-if="item.type == 'editor'">
      <tooltip content="Raw SQL Editor" v-if="item.editor.type == 'sql'">
        <span class="sql">SQL</span>
      </tooltip>
      <tooltip content="Trilogy Editor" class="icon-display" v-else>
        <img :src="trilogyIcon" class="trilogy-icon" />
      </tooltip>
    </template>

    <span class="truncate-text">
      {{ item.label }}
      <span class="text-light" v-if="item.type === 'connection'">
        <span v-if="connectionStore.connections[item.label]?.model">
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
    </span>

    <template v-if="item.type === 'editor'">
      <span class="tag-container">
        <span v-for="tag in item.editor.tags" :key="tag" class="tag">{{ tag }}</span>
      </span>
    </template>
    <template v-else-if="item.type === 'connection'">
      <span class="tag-container">
        <editor-creator-icon :connection="item.label" type="sql" title="New SQL Editor" />
        <editor-creator-icon :connection="item.label" title="New Trilogy Editor" />
      </span>
      <status-icon :status="connectionStateToStatus(connectionStore.connections[item.label])" />
    </template>

    <tooltip v-if="item.type === 'editor'" content="Delete Editor" position="left">
      <span
        class="remove-btn"
        @click.stop="$emit('delete-editor', item.editor)"
        :data-testid="`delete-editor-${item.label}`"
      >
        <i class="mdi mdi-trash-can"></i>
      </span>
    </tooltip>
  </div>
</template>

<script lang="ts">
import { inject } from 'vue'
import type { ConnectionStoreType } from '../../stores/connectionStore'
import Tooltip from './Tooltip.vue'
import StatusIcon from './StatusIcon.vue'
import type { Connection } from '../../connections'
import trilogyIcon from '../static/trilogy_small.webp'
import EditorCreatorIcon from './editor/EditorCreatorIcon.vue'
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
  emits: ['item-click', 'delete-editor'],
  setup() {
    const connectionStore = inject<ConnectionStoreType>('connectionStore')
    const saveModels = inject<CallableFunction>('saveModels')
    const saveConnections = inject<CallableFunction>('saveConnections')
    if (!connectionStore || !saveModels || !saveConnections) {
      throw new Error('Connection store is not provided!')
    }

    const modelConfigStore = useModelConfigStore()

    const connectionStateToStatus = (connection: Connection | null) => {
      if (!connection) {
        return 'disabled'
      }
      if (connection.running) {
        return 'running'
      } else if (connection.connected) {
        return 'connected'
      } else {
        return 'disabled'
      }
    }

    const createDefaultModel = async (connectionName: string) => {
      try {
        // Create a new model with the same name as the connection
        let model = modelConfigStore.newModelConfig(connectionName)

        // Update the connection to use this model
        if (connectionStore.connections[connectionName]) {
          connectionStore.connections[connectionName].model = model.name
        }

        // await saveMOdels and saveConnections
        await saveModels()
        await saveConnections()
      } catch (error) {
        console.error(`Error creating model for connection ${connectionName}:`, error)
      }
    }

    return {
      connectionStore,
      trilogyIcon,
      connectionStateToStatus,
      createDefaultModel,
    }
  },
  components: {
    Tooltip,
    StatusIcon,
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
</style>
