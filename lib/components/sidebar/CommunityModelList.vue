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
      @model-selected="handleModelSelected"
    />
  </sidebar-list>
</template>

<script lang="ts">
import { inject, ref, computed, onMounted } from 'vue';
import { type CommunityApiStoreType } from '../../stores/communityApiStore';
import SidebarList from './SidebarList.vue';

import CommunityModelListItem from './CommunityModelListItem.vue';
import { buildCommunityModelTree } from '../../models/githubApiService';

export default {
  name: 'CommunityModelList',
  setup() {
    const communityApiStore = inject('communityApiStore') as CommunityApiStoreType;
    const { refreshData } = communityApiStore;
    const setActiveScreenWithParams = inject('setActiveScreenWithParams');

    const collapsed = ref<Record<string, boolean>>({'e-duckdb':true, 'e-bigquery':true, 'e-snowflake':true});

    const toggleCollapse = (key: string) => {
      if (collapsed.value[key] === undefined) {
        collapsed.value[key] = false;
      }
      collapsed.value[key] = !collapsed.value[key];
    };

    onMounted(async () => {
      if (communityApiStore.files.length === 0) {
        await refreshData();
        // default collapsed state for all items
      }
    });

    const contentList = computed(() => {
      return buildCommunityModelTree(communityApiStore.files, collapsed.value);
    });

    const loading = computed(() => communityApiStore.loading);

    const handleModelSelected = (modelName: string) => {
      if (setActiveScreenWithParams) {
        (setActiveScreenWithParams as (screen: string, params: Record<string, string>) => void)('community-models', { initialSearch: modelName });
      }
    };

    return {
      loading,
      refreshData,
      contentList,
      toggleCollapse,
      collapsed,
      handleModelSelected,
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
