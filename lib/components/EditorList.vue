<template>
  <sidebar-list title="Editors">
    <template #actions>
      <div class="button-container">
        <editor-creator />
        <div>
          <loading-button :action="saveEditors" :keyCombination="['control', 's']">
            Save
          </loading-button>
        </div>
      </div>
      <span v-for="tag in EditorTag" :key="tag" :class="{ 'tag-excluded': !hiddenTags.has(tag) }" class="tag"
        @click="toggleTagFilter(tag)">
        {{ hiddenTags.has(tag) ? 'Show' : 'Hide' }} {{ tag.charAt(0).toUpperCase()
        }}{{ tag.slice(1) }} Editors
      </span>
    </template>

    <div v-for="item in contentList" :key="item.key" class="sidebar-item"
      :class="{ 'sidebar-item-selected': activeEditor === item.label }"
      @click="clickAction(item.type, item.label, item.key)">
      <div v-for="_ in item.indent" class="sidebar-padding"></div>
      <i v-if="item.type !== 'editor'" :class="collapsed[item.key] ? 'mdi mdi-menu-right' : 'mdi mdi-menu-down'">
      </i>
      <template v-if="item.type == 'editor'">
        <tooltip content="Raw SQL Editor" v-if="item.editor.type == 'sql'">
          <span class="sql">SQL</span>
          <!-- <i class="mdi mdi-alpha-s-box-outline"></i> -->
        </tooltip>
        <tooltip content="Trilogy Editor" v-else>
          <img :src="trilogyIcon" class="trilogy-icon" />
          <!-- <i class="mdi mdi-alpha-t-box-outline"></i> -->
        </tooltip>
      </template>
      <span>
        {{ item.label }} <span class="text-light" v-if="item.type === 'connection'"> ({{
          connectionStore.connections[item.label]?.model ? connectionStore.connections[item.label]?.model : 'No Model Set' }})</span>
      </span>
      <template v-if="item.type === 'editor'">
        <span class="tag-container">
          <span v-for="tag in item.editor.tags" :key="tag" class="tag">{{ tag }}</span>
        </span>
      </template>
      <template v-else-if="item.type === 'connection'">

        <span class="tag-container">
          <editor-creator :connection="item.label" :offsetRight="true" />
        </span>
        <status-icon :status="connectionStateToStatus(connectionStore.connections[item.label])" />
      </template>

      <tooltip v-if="item.type === 'editor'" content="Delete Editor" position="left">
        <span class="remove-btn" @click.stop="deleteEditor(item.editor)">
          <i class="mdi mdi-close"></i>
        </span>
      </tooltip>
    </div>
  </sidebar-list>
</template>

<script lang="ts">
import { inject, ref, computed } from 'vue'
import type { EditorStoreType } from '../stores/editorStore'
import type { ConnectionStoreType } from '../stores/connectionStore'
import EditorCreator from './EditorCreator.vue'
import SidebarList from './SidebarList.vue'
import Tooltip from './Tooltip.vue'
import LoadingButton from './LoadingButton.vue'
import { EditorTag } from '../editors'
import StatusIcon from './StatusIcon.vue'
import type { Connection } from '../connections'
import trilogyIcon from '../static/trilogy.png'

export default {
  name: 'EditorList',
  props: { activeEditor: String },
  setup() {
    const editorStore = inject<EditorStoreType>('editorStore')
    const connectionStore = inject<ConnectionStoreType>('connectionStore')
    if (!editorStore || !connectionStore) {
      throw new Error('Editor store is not provided!')
    }

    const collapsed = ref<Record<string, boolean>>({})
    const hiddenTags = ref<Set<string>>(new Set([]))

    const toggleCollapse = (key: string) => {
      collapsed.value[key] = !collapsed.value[key]
    }

    const toggleTagFilter = (tag: string) => {
      hiddenTags.value.has(tag) ? hiddenTags.value.delete(tag) : hiddenTags.value.add(tag)
    }

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

    const contentList = computed(() => {
      const list: Array<{
        key: string
        label: string
        type: string
        indent: Array<number>
        editor?: any
      }> = []
      // sort for rendering
      const sorted = Object.values(editorStore.editors).sort(
        (a, b) =>
          a.storage.localeCompare(b.storage) ||
          a.connection.localeCompare(b.connection) ||
          a.name.localeCompare(b.name),
      )
      sorted.forEach((editor) => {
        let storageKey = `s-${editor.storage}`
        let connectionKey = `c-${editor.storage}-${editor.connection}`
        let editorKey = `e-${editor.storage}-${editor.connection}-${editor.name}`

        if (!list.some((item) => item.key === storageKey)) {
          list.push({ key: storageKey, label: editor.storage, type: 'storage', indent: [] })
        }
        if (!list.some((item) => item.key === connectionKey)) {
          if (!collapsed.value[storageKey]) {
            list.push({
              key: connectionKey,
              label: editor.connection,
              type: 'connection',
              indent: [0],
            })
          }
        }
        if (!collapsed.value[storageKey] && !collapsed.value[connectionKey]) {
          if (
            !(hiddenTags.value.size > 0 && editor.tags.some((tag) => hiddenTags.value.has(tag)))
          ) {
            list.push({
              key: editorKey,
              label: editor.name,
              type: 'editor',
              indent: [0, 1],
              editor,
            })
          }
        }
      })
      return list
    })

    return {
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
    }
  },
  methods: {
    //@ts-ignore
    deleteEditor(editor) {
      this.editorStore.removeEditor(editor.name)
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
    EditorCreator,
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

.trilogy-icon {
  width: 12px;
  height: 12px;
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
  flex-wrap: wrap;
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
