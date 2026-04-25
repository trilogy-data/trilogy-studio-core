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
          <tooltip
            content="Python File"
            class="icon-display"
            v-else-if="item.editor.type === 'python'"
          >
            <i class="mdi mdi-language-python python-icon"></i>
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
          <span class="connection-model" v-if="connectionStore.connectionByName(item.label)?.model">
            ({{ connectionStore.connectionByName(item.label).model }})
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
            <sidebar-tag-chip v-for="tag in item.editor.tags" :key="tag" :label="tag" />
          </span>

          <sidebar-overflow-menu
            :items="contextMenuItems"
            tooltip="Editor actions"
            :test-id-base="`editor-actions-${item.key}`"
            @select="handleContextMenuItemClick"
          />
        </template>

        <template v-else-if="item.type === 'connection'">
          <connection-status-icon
            v-if="connectionStore.connectionByName(item.label)"
            :connection="connectionStore.connectionByName(item.label)"
          />
          <sidebar-overflow-menu
            :items="contextMenuItems"
            tooltip="Connection actions"
            :test-id-base="`editor-actions-${item.key}`"
            @select="handleContextMenuItemClick"
          />
        </template>

        <template v-else-if="item.type === 'folder'">
          <sidebar-overflow-menu
            :items="contextMenuItems"
            tooltip="Folder actions"
            :test-id-base="`editor-actions-${item.key}`"
            @select="handleContextMenuItemClick"
          />
        </template>
      </template>
    </sidebar-item>
  </div>
</template>

<script lang="ts">
import { computed, inject } from 'vue'
import type { ConnectionStoreType } from '../../stores/connectionStore'
import type { EditorStoreType } from '../../stores/editorStore'
import SidebarItem from './GenericSidebarItem.vue'
import Tooltip from '../Tooltip.vue'
import ConnectionStatusIcon from './ConnectionStatusIcon.vue'
import trilogyIcon from '../../static/trilogy_small.webp'
import useModelConfigStore from '../../stores/modelStore'
import SidebarTagChip from './SidebarTagChip.vue'
import SidebarOverflowMenu from './SidebarOverflowMenu.vue'
import type { ContextMenuItem } from '../ContextMenu.vue'

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
  emits: ['item-click', 'delete-editor', 'toggle', 'refresh-store'],
  setup(props, { emit }) {
    const connectionStore = inject<ConnectionStoreType>('connectionStore')
    const editorStore = inject<EditorStoreType>('editorStore')
    const saveModels = inject<CallableFunction>('saveModels')
    const saveConnections = inject<CallableFunction>('saveConnections')
    const saveEditors = inject<CallableFunction>('saveEditors')
    const setActiveScreen = inject<CallableFunction>('setActiveScreen')
    const setActiveEditor = inject<CallableFunction>('setActiveEditor')

    if (
      !connectionStore ||
      !editorStore ||
      !saveModels ||
      !saveConnections ||
      !saveEditors ||
      !setActiveScreen ||
      !setActiveEditor
    ) {
      throw new Error('Connection store is not provided!')
    }

    const modelConfigStore = useModelConfigStore()
    const createDefaultModel = async (connectionName: string) => {
      try {
        // Create a new model with the same name as the connection
        let model = modelConfigStore.newModelConfig(connectionName)

        // Update the connection to use this model
        const conn = connectionStore.connectionByName(connectionName)
        if (conn) {
          conn.model = model.name
        }

        // await saveModels and saveConnections
        await saveModels()
        await saveConnections()
      } catch (error) {
        console.error(`Error creating model for connection ${connectionName}:`, error)
      }
    }

    const createNewEditor = async (connection: string, type: string, root = '') => {
      try {
        const timestamp = Date.now()
        let editorName = `new-editor-${timestamp}`
        if (root) {
          editorName = `${root}/${editorName}`
        }

        const editorType = type === 'trilogy' ? 'preql' : type === 'python' ? 'python' : 'sql'
        const isRemote = props.item.storage === 'remote'

        const editor = editorStore.newEditor(
          editorName,
          editorType,
          connection,
          undefined,
          isRemote
            ? {
                storage: 'remote',
                remoteStoreId: props.item.remoteStoreId || null,
                remotePath: editorName,
              }
            : undefined,
        )

        await saveEditors()
        setActiveEditor(editor.id)
        setActiveScreen('editors')
      } catch (error) {
        console.error('Failed to create new editor:', error)
      }
    }

    const contextMenuItems = computed<ContextMenuItem[]>(() => {
      const isRemoteConnectionItem =
        props.item.type === 'connection' && props.item.storage === 'remote'
      const isRemoteFolderItem = props.item.type === 'folder' && props.item.storage === 'remote'

      if (props.item.type === 'editor') {
        return [
          {
            id: 'delete-editor',
            label: 'Delete editor',
            icon: 'mdi-trash-can-outline',
            danger: true,
          },
        ]
      }

      if (props.item.type === 'folder') {
        return [
          { id: 'new-sql', label: 'New SQL editor', icon: 'mdi-file-document-plus-outline' },
          ...(isRemoteFolderItem
            ? ([
                { id: 'new-python', label: 'New Python file', icon: 'mdi-language-python' },
              ] as ContextMenuItem[])
            : []),
          {
            id: 'new-trilogy',
            label: 'New Trilogy editor',
            icon: 'mdi-file-document-plus-outline',
          },
        ]
      }

      if (props.item.type === 'connection') {
        return [
          ...(isRemoteConnectionItem
            ? ([
                { id: 'refresh-store', label: 'Refresh', icon: 'mdi-refresh' },
                { id: 'new-python', label: 'New Python file', icon: 'mdi-language-python' },
              ] as ContextMenuItem[])
            : []),
          { id: 'new-sql', label: 'New SQL editor', icon: 'mdi-file-document-plus-outline' },
          {
            id: 'new-trilogy',
            label: 'New Trilogy editor',
            icon: 'mdi-file-document-plus-outline',
          },
        ]
      }

      return []
    })

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
      createNewEditor,
      contextMenuItems,
      handleClick,
      handleToggle,
    }
  },
  methods: {
    handleContextMenuItemClick(item: ContextMenuItem) {
      switch (item.id) {
        case 'delete-editor':
          this.$emit('delete-editor', this.item.editor)
          break
        case 'refresh-store': {
          const connection = this.connectionStore.connectionByName(this.item.label) as
            | ((typeof this.connectionStore.connections)[string] & {
                remoteStoreId?: string | null
              })
            | undefined
          if (connection?.remoteStoreId) {
            this.$emit('refresh-store', connection.remoteStoreId)
          }
          break
        }
        case 'new-sql':
          this.createNewEditor(
            this.item.type === 'connection' ? this.item.label : this.item.connection,
            'sql',
            this.item.type === 'folder' ? this.item.objectKey : '',
          )
          break
        case 'new-trilogy':
          this.createNewEditor(
            this.item.type === 'connection' ? this.item.label : this.item.connection,
            'trilogy',
            this.item.type === 'folder' ? this.item.objectKey : '',
          )
          break
        case 'new-python':
          this.createNewEditor(
            this.item.type === 'connection' ? this.item.label : this.item.connection,
            'python',
            this.item.type === 'folder' ? this.item.objectKey : '',
          )
          break
      }
    },
  },
  components: {
    SidebarItem,
    Tooltip,
    ConnectionStatusIcon,
    SidebarTagChip,
    SidebarOverflowMenu,
  },
}
</script>

<style scoped src="./sidebarItemChrome.css"></style>
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

.python-icon {
  font-size: var(--icon-size);
  color: #3776ab;
}

.icon-display {
  display: flex;
  justify-content: center;
  align-items: center;
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
</style>
