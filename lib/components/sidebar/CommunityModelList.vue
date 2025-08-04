<template>
  <sidebar-list title="Community Models">
    <template #actions>
      <div class="button-container">
        <button @click="refreshData" :disabled="loading">
          {{ loading ? 'Refreshing...' : 'Refresh' }}
        </button>
      </div>
    </template>

    <CommunityModelListItem
      v-for="item in contentList"
      :key="item.key"
      :item="item"
      :is-collapsed="collapsed[item.key]"
      @item-click="clickAction"
    />
  </sidebar-list>
</template>

<script lang="ts">
import { inject, ref, computed, onMounted } from 'vue';
import { useCommunityApiStore } from '../../stores/communityApiStore';
import SidebarList from './SidebarList.vue';
import CommunityModelListItem from './CommunityModelListItem.vue';
import { buildCommunityModelTree } from '../../models/githubApiService';

export default {
  name: 'CommunityModelList',
  setup() {
    const communityApiStore = useCommunityApiStore();
    const { files, loading, refreshData } = communityApiStore;

    const collapsed = ref<Record<string, boolean>>({});

    const toggleCollapse = (key: string) => {
      if (collapsed.value[key] === undefined) {
        collapsed.value[key] = false;
      }
      collapsed.value[key] = !collapsed.value[key];
    };

    onMounted(() => {
      if (files.length === 0) {
        refreshData();
      }
    });

    const contentList = computed(() => {
      return buildCommunityModelTree(files, collapsed.value);
    });

    return {
      loading,
      refreshData,
      contentList,
      toggleCollapse,
      collapsed,
    };
  },
  methods: {
    clickAction(type: string, objectKey: string, key: string) {
      if (type !== 'model') {
        this.toggleCollapse(key);
      }
    },
  },
  components: {
    SidebarList,
    CommunityModelListItem,
  },
};
</script>
