<template>
  <sidebar-list title="Documentation">
    <template #actions></template>
    <sidebar-item
      v-for="node in documentationNodes" 
      :key="node.id"
      :item-id="node.id"
      :name="node.name"
      :indent="node.indent"
      :is-selected="isActiveNode(node.id)"
      :is-collapsible="node.type === 'documentation'"
      :is-collapsed="collapsed[node.id]"
      :icon="node.type === 'article' ? 'mdi-text-box-outline' : ''"
      :extra-info="node.type === 'documentation' ? node.count : ''"
      @click="handleClick"
      @toggle="toggleCollapse"
    />
  </sidebar-list>
</template>

<script lang="ts">
import { ref, computed, inject, onMounted } from 'vue'
import SidebarList from './SidebarList.vue'
import SidebarItem from './GenericSidebarItem.vue'
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

    const handleClick = (id: string) => {
      // Emit the event to parent component
      // Note: In Composition API, we need to access emit differently
      // This would need to be adjusted based on your actual implementation
    }

    return {
      documentationNodes,
      toggleCollapse,
      collapsed,
      isActiveNode,
      handleClick,
    }
  },

  methods: {
    handleClick(id: string) {
      this.$emit('documentation-key-selected', id)
    },
  },

  components: {
    SidebarList,
    SidebarItem,
  },
}
</script>

<style scoped>
/* All styles are now handled by the SidebarItem component */
</style>