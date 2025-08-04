
import { defineStore } from 'pinia';
import { ref, computed }from 'vue';
import {
  fetchModelFiles,
  filterModelFiles,
  getAvailableEngines,
  type ModelFile,
} from '../models/githubApiService';
import type { ModelConfigStoreType } from './modelStore';

export const useCommunityApiStore = defineStore('communityApi', () => {
  const files = ref<ModelFile[]>([]);
  const error = ref<string | null>(null);
  const loading = ref(false);

  const fetchFiles = async (): Promise<void> => {
    error.value = null;
    loading.value = true;

    const result = await fetchModelFiles();
    files.value = result.files;
    error.value = result.error;

    loading.value = false;
  };

  const refreshData = async (): Promise<void> => {
    await fetchFiles();
  };

  const filteredFiles = (
    searchQuery: string,
    selectedEngine: string,
    importStatus: 'all' | 'imported' | 'not-imported',
    modelStore: ModelConfigStoreType,
  ) => {
    const modelExists = (name: string): boolean => {
      return name in modelStore.models;
    };

    return filterModelFiles(
      files.value,
      searchQuery,
      selectedEngine,
      importStatus,
      modelExists,
    );
  };

  const availableEngines = computed(() => {
    return getAvailableEngines(files.value);
  });

  return {
    files,
    error,
    loading,
    fetchFiles,
    refreshData,
    filteredFiles,
    availableEngines,
  };
});



export type CommunityApiStoreType = ReturnType<typeof useCommunityApiStore>;
export default useCommunityApiStore;