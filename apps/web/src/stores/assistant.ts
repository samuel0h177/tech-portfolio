import { defineStore } from 'pinia';
import { ref } from 'vue';

export type AssistantSearchFilters = {
  q?: string;
  program?: string;
  status?: string;
  pi?: string;
  orgTypes?: string[];
  categoryIds?: number[];
};

export const useAssistantStore = defineStore('assistant', () => {
  const open = ref(false);
  const pendingSearch = ref<AssistantSearchFilters | null>(null);

  function openPanel() {
    open.value = true;
  }

  function closePanel() {
    open.value = false;
  }

  function togglePanel() {
    open.value = !open.value;
  }

  function requestSearch(filters: AssistantSearchFilters) {
    pendingSearch.value = { ...filters };
  }

  function consumePendingSearch(): AssistantSearchFilters | null {
    const next = pendingSearch.value;
    pendingSearch.value = null;
    return next;
  }

  return {
    open,
    pendingSearch,
    openPanel,
    closePanel,
    togglePanel,
    requestSearch,
    consumePendingSearch,
  };
});
