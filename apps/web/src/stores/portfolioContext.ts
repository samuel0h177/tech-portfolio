import { defineStore } from 'pinia';
import { ref } from 'vue';

export type PortfolioLiveContext = {
  q?: string;
  program?: string;
  status?: string;
  pi?: string;
  total?: number;
};

export type PortfolioProjectContext = {
  id: number;
  title?: string;
  projectCode?: string | null;
};

export const usePortfolioContextStore = defineStore('portfolioContext', () => {
  const liveContext = ref<PortfolioLiveContext | null>(null);
  const projectContext = ref<PortfolioProjectContext | null>(null);

  function setLiveContext(ctx: PortfolioLiveContext | null) {
    liveContext.value = ctx;
  }

  function setProjectContext(ctx: PortfolioProjectContext | null) {
    projectContext.value = ctx;
  }

  return {
    liveContext,
    projectContext,
    setLiveContext,
    setProjectContext,
  };
});
