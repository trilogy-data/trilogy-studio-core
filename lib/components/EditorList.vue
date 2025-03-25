<template>
  <sidebar-list title="Editors">
    <template #actions>
      <div class="button-container">
        <button
          @click="creatorVisible = !creatorVisible"
          :data-testid="testTag ? `editor-creator-add-${testTag}` : 'editor-creator-add'"
        >
          {{ creatorVisible ? 'Hide' : 'New' }}
        </button>
        <loading-button :action="saveEditors" :keyCombination="['control', 's']">
          Save
        </loading-button>
      </div>
      <editor-creator-inline
        :visible="creatorVisible"
        @close="creatorVisible = !creatorVisible"
        :testTag="testTag"
      />
      <span
        v-for="tag in EditorTag"
        :key="tag"
        :class="{ 'tag-excluded': !hiddenTags.has(tag) }"
        class="tag"
        @click="toggleTagFilter(tag)"
      >
        {{ hiddenTags.has(tag) ? 'Show' : 'Hide' }} {{ tag.charAt(0).toUpperCase()
        }}{{ tag.slice(1) }} Editors
      </span>
    </template>
    <div
      v-for="item in contentList"
      :key="item.key"
      :data-testid="`editor-list-id-${item.key}`"
      :class="{
        'sidebar-item': item.type !== 'creator',
        'sidebar-item-selected': activeEditor === item.label,
      }"
      @click="clickAction(item.type, item.label, item.key)"
    >
      <div
        v-if="!['creator'].includes(item.type) && !isMobile"
        v-for="_ in item.indent"
        class="sidebar-padding"
      ></div>
      <i
        v-if="!['editor', 'creator'].includes(item.type)"
        :class="collapsed[item.key] ? 'mdi mdi-menu-right' : 'mdi mdi-menu-down'"
      >
      </i>
      <template v-if="item.type == 'editor'">
        <tooltip content="Raw SQL Editor" v-if="item.editor.type == 'sql'">
          <span class="sql">SQL</span>
          <!-- <i class="mdi mdi-alpha-s-box-outline"></i> -->
        </tooltip>
        <tooltip content="Trilogy Editor" class="icon-display" v-else>
          <img :src="trilogyIcon" class="trilogy-icon" />
          <!-- <i class="mdi mdi-alpha-t-box-outline"></i> -->
        </tooltip>
      </template>

      <span class="truncate-text">
        {{ item.label }}
        <span class="text-light" v-if="item.type === 'connection'">
          ({{
            connectionStore.connections[item.label]?.model
              ? connectionStore.connections[item.label]?.model
              : 'No Model Set'
          }})</span
        >
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
          @click.stop="deleteEditor(item.editor)"
          :data-testid="`delete-editor-${item.label}`"
        >
          <i class="mdi mdi-trash-can"></i>
        </span>
      </tooltip>
    </div>
    <div v-if="showDeleteConfirmationState" class="confirmation-overlay" @click.self="cancelDelete">
      <div class="confirmation-dialog">
        <h3>Confirm Deletion</h3>
        <p>Are you sure you want to delete this editor? Contents cannot be recovered.</p>
        <div class="dialog-actions">
          <button class="cancel-btn" data-testid="cancel-editor-deletion" @click="cancelDelete">
            Cancel
          </button>
          <button class="confirm-btn" data-testid="confirm-editor-deletion" @click="confirmDelete">
            Delete
          </button>
        </div>
      </div>
    </div>
  </sidebar-list>
</template>

<script lang="ts">
import { inject, ref, computed, onMounted } from 'vue'
import type { EditorStoreType } from '../stores/editorStore'
import type { ConnectionStoreType } from '../stores/connectionStore'
import EditorCreatorInline from './EditorCreatorInline.vue'
import SidebarList from './SidebarList.vue'
import Tooltip from './Tooltip.vue'
import LoadingButton from './LoadingButton.vue'
import { EditorTag } from '../editors'
import StatusIcon from './StatusIcon.vue'
import type { Connection } from '../connections'
import trilogyIcon from '../static/trilogy.png'
import { getDefaultValueFromHash } from '../stores/urlStore'
import { buildEditorTree } from '../editors'
import EditorCreatorIcon from './EditorCreatorIcon.vue'

export default {
  name: 'EditorList',
  props: {
    activeEditor: String,
    testTag: {
      type: String,
      default: '',
    },
  },
  setup() {
    const editorStore = inject<EditorStoreType>('editorStore')
    const connectionStore = inject<ConnectionStoreType>('connectionStore')
    const isMobile = inject<boolean>('isMobile', false)
    if (!editorStore || !connectionStore) {
      throw new Error('Editor store is not provided!')
    }

    const collapsed = ref<Record<string, boolean>>({})
    const hiddenTags = ref<Set<string>>(new Set([]))
    const creatorVisible = ref(false)
    const toggleCollapse = (key: string) => {
      collapsed.value[key] = !collapsed.value[key]
    }

    const toggleTagFilter = (tag: string) => {
      hiddenTags.value.has(tag) ? hiddenTags.value.delete(tag) : hiddenTags.value.add(tag)
    }
    const current = getDefaultValueFromHash('editor') || ''
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

    onMounted(() => {
      Object.values(editorStore.editors).forEach((item) => {
        let storageKey = `s-${item.storage}`
        let connectionKey = `c-${item.storage}-${item.connection}`
        if (current === item.name) {
          collapsed.value[storageKey] = false
          collapsed.value[connectionKey] = false
        } else {
          // if it's not in collapsed, default to true
          // but if it is, keep it false if it's false
          if (collapsed.value[storageKey] === undefined) {
            collapsed.value[storageKey] = true
          } else if (collapsed.value[storageKey] === false) {
            collapsed.value[storageKey] = false
          }

          if (collapsed.value[connectionKey] === undefined) {
            collapsed.value[connectionKey] = true
          } else if (collapsed.value[connectionKey] === false) {
            collapsed.value[connectionKey] = false
          }
        }
      })
    })

    const contentList = computed(() => {
      return buildEditorTree(Object.values(editorStore.editors), collapsed.value, hiddenTags.value)
    })

    return {
      isMobile,
      connectionStore,
      editorStore,
      EditorTag,
      toggleTagFilter,
      contentList,
      toggleCollapse,
      collapsed,
      hiddenTags,
      trilogyIcon,
      connectionStateToStatus,
      creatorVisible,
    }
  },
  data() {
    return {
      showDeleteConfirmationState: false,
      editorToDelete: null,
    }
  },
  methods: {
    // @ts-ignore
    showDeleteConfirmation(editor) {
      this.editorToDelete = editor.name
      this.showDeleteConfirmationState = true
    },
    cancelDelete() {
      this.showDeleteConfirmationState = false
      this.editorToDelete = null
    },
    confirmDelete() {
      if (this.editorToDelete) {
        this.editorStore.editors[this.editorToDelete].deleted = true
        // sync the deletion
        this.saveEditors()
        // and purge
        this.editorStore.removeEditor(this.editorToDelete)
      }
      this.showDeleteConfirmationState = false
      this.editorToDelete = null
    },
    // @ts-ignore
    deleteEditor(editor) {
      // Replace direct deletion with confirmation
      this.showDeleteConfirmation(editor)
    },
    saveEditors() {
      this.$emit('save-editors')
    },
    clickAction(type: string, label: string, key: string) {
      if (type === 'editor') {
        this.$emit('editor-selected', label)
      } else {
        this.toggleCollapse(key)
      }
    },
  },
  components: {
    EditorCreatorInline,
    EditorCreatorIcon,
    SidebarList,
    Tooltip,
    LoadingButton,
    StatusIcon,
  },
}
</script>

<style scoped>
.sql {
  /* black */
  color: #000000;
  font-style: bold;
  font-size: 8px;
  margin-right: 5px;
}

.trilogy {
  /* reddish */
  color: #ff4d4d;
  font-style: bold;
  margin-right: 5px;
  font-weight: 500;
}

.icon-display {
  display: flex;
  justify-content: center;
  /* Horizontal center */
  align-items: center;
  /* Vertical center */
}

.trilogy-icon {
  width: var(--icon-size);
  height: var(--icon-size);
}

.active-editor {
  font-weight: bold;
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
  /* Push to the right */
  font-size: 8px;
  /* margin-left: 5px; */
  border-radius: 3px;
  padding: 2px;
  background-color: hsl(210, 100%, 50%, 0.25);
  border: 1px solid hsl(210, 100%, 50%, 0.5);
  color: var(--tag-font);
  line-height: 10px;
  cursor: pointer;
}

.tag-container {
  vertical-align: middle;
}

.text-light {
  color: var(--text-faint);
}
</style>
