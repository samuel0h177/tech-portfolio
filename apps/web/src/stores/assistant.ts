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

export type AssistantLiveContext = {
  q?: string;
  program?: string;
  status?: string;
  pi?: string;
  total?: number;
};

export type AssistantProjectContext = {
  id: number;
  title?: string;
  projectCode?: string | null;
};

export const useAssistantStore = defineStore('assistant', () => {
  const open = ref(false);
  const pendingSearch = ref<AssistantSearchFilters | null>(null);
  const liveContext = ref<AssistantLiveContext | null>(null);
  const projectContext = ref<AssistantProjectContext | null>(null);

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

  function setLiveContext(ctx: AssistantLiveContext | null) {
    liveContext.value = ctx;
  }

  function setProjectContext(ctx: AssistantProjectContext | null) {
    projectContext.value = ctx;
  }

  return {
    open,
    pendingSearch,
    liveContext,
    projectContext,
    openPanel,
    closePanel,
    togglePanel,
    requestSearch,
    consumePendingSearch,
    setLiveContext,
    setProjectContext,
  };
});
