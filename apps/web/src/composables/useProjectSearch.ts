import { reactive, ref, watch } from 'vue';
import { api } from '@/api/client';
import type { Facets, PiOption, SearchResponse } from '@/types';

export function useProjectSearch() {
  const filters = reactive({
    q: '',
    pi: null as PiOption | null,
    program: 'ALL',
    status: 'ALL',
    categoryIds: [] as number[],
    orgTypes: [] as string[],
    sortBy: 'relevance',
    sortOrder: 'asc' as 'asc' | 'desc',
    page: 1,
    pageSize: 25,
  });

  const results = ref<SearchResponse>({ data: [], total: 0, page: 1, pageSize: 25, totalPages: 0 });
  const facets = ref<Facets | null>(null);
  const loading = ref(false);
  let debounce: ReturnType<typeof setTimeout> | undefined;

  function buildParams() {
    const params: Record<string, string> = {
      program: filters.program,
      status: filters.status,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder,
      page: String(filters.page),
      pageSize: String(filters.pageSize),
    };
    if (filters.q.trim()) params.q = filters.q.trim();
    if (filters.pi) params.pi = `${filters.pi.lastName}, ${filters.pi.firstName}`;
    if (filters.categoryIds.length) params.categoryIds = filters.categoryIds.join(',');
    if (filters.orgTypes.length) params.orgTypes = filters.orgTypes.join(',');
    return params;
  }

  async function fetchResults() {
    loading.value = true;
    try {
      const params = buildParams();
      const [res, fac] = await Promise.all([
        api.get<SearchResponse>('/projects', { params }),
        api.get<Facets>('/facets', { params }),
      ]);
      results.value = res.data;
      facets.value = fac.data;
    } finally {
      loading.value = false;
    }
  }

  function scheduleFetch(resetPage = true) {
    if (resetPage) filters.page = 1;
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(fetchResults, 250);
  }

  // Refetch when filters change (reset to page 1), except when only the page changes.
  watch(
    () => [
      filters.q,
      filters.pi,
      filters.program,
      filters.status,
      filters.categoryIds,
      filters.orgTypes,
      filters.sortBy,
      filters.sortOrder,
      filters.pageSize,
    ],
    () => scheduleFetch(true),
    { deep: true },
  );

  watch(
    () => filters.page,
    () => scheduleFetch(false),
  );

  function clearFilters() {
    filters.program = 'ALL';
    filters.status = 'ALL';
    filters.categoryIds = [];
    filters.orgTypes = [];
  }

  async function searchPis(q: string): Promise<PiOption[]> {
    const { data } = await api.get<PiOption[]>('/pi', { params: q ? { q } : {} });
    return data;
  }

  return { filters, results, facets, loading, fetchResults, clearFilters, searchPis };
}
