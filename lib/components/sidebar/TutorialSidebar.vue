<template>
  <sidebar-list title="Documentation">
    <template #actions></template>
    <div v-for="node in documentationNodes" :key="node.id" class="sidebar-item">
      <div
        class="sidebar-content"
        @click="handleClick(node.id)"
        :class="{ 'sidebar-item-selected': isActiveNode(node.id) }"
        :data-testid="node.id"
      >
        <!-- Indentation -->
        <div
          v-for="(_, index) in Array.from({ length: node.indent }, () => 0)"
          :key="index"
          class="sidebar-padding"
        ></div>
        <!-- Toggle Icons for Collapsible Nodes -->
        <span v-if="node.type === 'documentation'">
          <i v-if="!collapsed[node.id]" class="mdi mdi-menu-down"></i>
          <i v-else class="mdi mdi-menu-right"></i>
        </span>
        <i v-else-if="node.type === 'article'" class="mdi mdi-text-box-outline node-icon"></i>
        <!-- Node Name with Extra Info -->
        <span class="truncate-text">
          {{ node.name }}
          <span v-if="node.type === 'documentation'">({{ node.count }})</span>
        </span>
      </div>
    </div>
  </sidebar-list>
</template>

<script lang="ts">
import { ref, computed, inject, onMounted } from 'vue'
import SidebarList from './sidebar/SidebarList.vue'
import type { EditorStoreType } from '../../stores/editorStore'
import { documentation } from '../../data/tutorial/documentation'
import { KeySeparator } from '../../data/constants'
import { getDefaultValueFromHash } from '../../stores/urlStore'

export default {
  name: 'DocumentationSidebar',
  props: {
    activeDocumentationKey: {
      type: String,
      default: '',
      optional: true,
    },
  },
  setup(props) {
    const editorStore = inject<EditorStoreType>('editorStore')
    if (!editorStore) {
      throw new Error('Editor store is not provided!')
    }

    const current = getDefaultValueFromHash('documentationKey') || ''

    const collapsed = ref<Record<string, boolean>>({})

    // Initialize current path and collapse states
    onMounted(() => {
      const splits = current.split(KeySeparator)
      const documentationTitle = splits[1]
      let currentPath = `documentation${KeySeparator}${documentationTitle}`
      // Initialize all nodes as collapsed except those in current path
      documentation.forEach((topic) => {
        const topicId = `documentation${KeySeparator}${topic.title}`
        collapsed.value[topicId] = !currentPath.startsWith(topicId)
      })
    })

    const documentationNodes = computed(() => {
      const list: Array<{ id: string; name: string; indent: number; count: number; type: string }> =
        []

      documentation.forEach((topic) => {
        const topicId = `documentation${KeySeparator}${topic.title}`
        list.push({
          id: topicId,
          name: topic.title,
          indent: 0,
          count: topic.articles.length,
          type: 'documentation',
        })

        if (!collapsed.value[topicId]) {
          topic.articles.forEach((article) => {
            list.push({
              id: `article${KeySeparator}${topic.title}${KeySeparator}${article.title}`,
              name: article.displayName || article.title,
              indent: 1,
              count: article.paragraphs.length,
              type: 'article',
            })
          })
        }
      })

      return list
    })

    const isActiveNode = (id: string) => {
      return id === props.activeDocumentationKey
    }

    const toggleCollapse = (id: string) => {
      collapsed.value[id] = !collapsed.value[id]
    }

    return {
      documentationNodes,
      toggleCollapse,
      collapsed,
      isActiveNode,
    }
  },

  methods: {
    handleClick(id: string) {
      this.toggleCollapse(id)
      this.$emit('documentation-key-selected', id)
    },
  },

  components: {
    SidebarList,
  },
}
</script>

<style scoped>
.node-icon {
  padding-right: 5px;
}

.sidebar-item:hover {
  background-color: var(--button-mouseover);
}

.sidebar-content {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 0 4px;
}

.sidebar-padding {
  width: 7px;
  height: 22px;
  margin-right: 5px;
  border-right: 1px solid var(--border-light);
}
</style>
