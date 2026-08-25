<template>
  <div class="search-page">
    <!-- Hero / search bar -->
    <section class="hero-gradient">
      <v-container style="max-width: 1400px" class="py-8">
        <div class="eyebrow mb-1" style="opacity: 0.85">Explore ESTO-funded technology projects</div>
        <h1 class="text-h4 text-md-h3 font-weight-bold mb-1">Technology Portfolio Search</h1>
        <p class="text-body-1 mb-6" style="max-width: 720px; opacity: 0.9">
          Search over {{ results.total ? formatNumber(baseTotal) : '1,000' }} sensor, information
          system, platform, and computational technology projects advanced by NASA's Earth Science
          Technology Office.
        </p>

        <v-row align="center" no-gutters class="ga-3">
          <v-col cols="12" md="6">
            <v-text-field
              v-model="filters.q"
              placeholder="Search keywords, e.g. lidar OR radar, +formation +flying, cal*"
              prepend-inner-icon="mdi-magnify"
              bg-color="white"
              clearable
              hide-details
              @keyup.enter="fetchResults"
            />
          </v-col>
          <v-col cols="12" md="4">
            <v-autocomplete
              v-model="filters.pi"
              v-model:search="piSearch"
              :items="piItems"
              :loading="piLoading"
              item-title="label"
              return-object
              placeholder="Filter by Principal Investigator"
              prepend-inner-icon="mdi-account-search"
              bg-color="white"
              clearable
              hide-details
              no-filter
            >
              <template #item="{ props: itemProps, item }">
                <v-list-item v-bind="itemProps" :subtitle="`${item.raw.projectCount} project(s)`" />
              </template>
            </v-autocomplete>
          </v-col>
        </v-row>
        <div class="mt-1">
          <AdvancedSearchHelp />
        </div>
      </v-container>
    </section>

    <v-container style="max-width: 1400px" class="py-6">
      <v-row>
        <!-- Facet sidebar -->
        <v-col cols="12" md="3">
          <FacetSidebar
            :facets="facets"
            :program="filters.program"
            :status="filters.status"
            :category-ids="filters.categoryIds"
            :org-types="filters.orgTypes"
            @update:program="filters.program = $event"
            @update:status="filters.status = $event"
            @update:category-ids="filters.categoryIds = $event"
            @update:org-types="filters.orgTypes = $event"
            @clear="clearFilters"
          />
        </v-col>

        <!-- Results -->
        <v-col cols="12" md="9">
          <div class="d-flex align-center flex-wrap ga-3 mb-4 results-toolbar">
            <div>
              <span class="text-h6 font-weight-bold">{{ formatNumber(results.total) }}</span>
              <span> project{{ results.total === 1 ? '' : 's' }} found</span>
            </div>
            <v-spacer />
            <div class="d-flex align-center ga-2">
              <span class="text-body-2 font-weight-medium">Sort by</span>
              <v-select
                v-model="filters.sortBy"
                :items="sortOptions"
                style="max-width: 190px"
                density="compact"
                variant="solo"
                flat
                hide-details
                bg-color="surface"
              />
            </div>
            <v-btn-toggle
              v-model="filters.sortOrder"
              mandatory
              density="compact"
              variant="outlined"
              divided
              class="bg-surface"
            >
              <v-btn value="asc" icon="mdi-sort-ascending" size="small" />
              <v-btn value="desc" icon="mdi-sort-descending" size="small" />
            </v-btn-toggle>
            <v-btn-toggle
              v-model="viewMode"
              mandatory
              density="compact"
              variant="outlined"
              divided
              class="bg-surface"
            >
              <v-btn value="cards" icon="mdi-view-grid-outline" size="small" />
              <v-btn value="table" icon="mdi-table" size="small" />
            </v-btn-toggle>
            <v-btn
              v-if="viewMode === 'table'"
              variant="outlined"
              size="small"
              prepend-icon="mdi-download"
              class="bg-surface"
              :loading="exporting"
              :disabled="!results.total || loading"
              @click="exportCsv"
            >
              Export CSV
            </v-btn>
          </div>

          <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-3" />

          <template v-if="results.data.length">
            <!-- Card view -->
            <div v-if="viewMode === 'cards'" class="d-flex flex-column ga-3">
              <v-card
                v-for="p in results.data"
                :key="p.id"
                variant="flat"
                border
                :to="{ name: 'project-detail', params: { id: p.id } }"
                class="pa-1"
              >
                <v-card-text>
                  <div class="d-flex align-center ga-2 mb-1 flex-wrap">
                    <v-chip size="x-small" :color="p.programFlag === 'ESTO' ? 'primary' : 'secondary'" label>
                      {{ p.programName || p.programFlag }}
                    </v-chip>
                    <span v-if="p.projectCode" class="text-caption font-weight-bold text-medium-emphasis">
                      {{ p.projectCode }}
                    </span>
                    <v-chip size="x-small" :color="p.completed ? 'success' : 'warning'" variant="tonal" label>
                      {{ p.completed ? 'Complete' : 'Active' }}
                    </v-chip>
                  </div>
                  <div class="text-subtitle-1 font-weight-bold result-title mb-2">{{ p.title }}</div>
                  <div class="d-flex align-center flex-wrap ga-4 text-body-2 text-medium-emphasis">
                    <span v-if="p.pi"><v-icon icon="mdi-account" size="14" /> {{ p.pi.lastName }}, {{ p.pi.firstName }}</span>
                    <span v-if="p.organization"><v-icon icon="mdi-office-building" size="14" /> {{ p.organization.name }}</span>
                    <span v-if="p.completionFy"><v-icon icon="mdi-calendar" size="14" /> FY{{ String(p.completionFy).slice(-2) }}</span>
                  </div>
                  <div class="mt-2 d-flex ga-1 flex-wrap">
                    <v-chip v-for="c in p.categories" :key="c.id" size="x-small" variant="outlined" color="primary">
                      {{ c.name }}
                    </v-chip>
                    <v-chip v-for="c in p.subCategories" :key="'s' + c.id" size="x-small" variant="text" color="secondary">
                      {{ c.name }}
                    </v-chip>
                  </div>
                </v-card-text>
              </v-card>
            </div>

            <!-- Table view -->
            <v-card v-else variant="flat" border class="results-table-card">
              <v-table class="results-table">
                <colgroup>
                  <col class="results-table__col-project" />
                  <col class="results-table__col-pi" />
                  <col class="results-table__col-org" />
                  <col class="results-table__col-cat" />
                  <col class="results-table__col-status" />
                  <col class="results-table__col-pdf" />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col">Project</th>
                    <th scope="col">PI</th>
                    <th scope="col">Organization</th>
                    <th scope="col">Category</th>
                    <th scope="col">Status</th>
                    <th scope="col" class="text-center">PDF</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="p in results.data" :key="p.id" style="cursor: pointer" @click="goTo(p.id)">
                    <td class="results-table__project">
                      <div class="d-flex align-center flex-wrap ga-2 mb-1">
                        <span class="text-caption font-weight-bold text-medium-emphasis results-table__truncate">
                          {{ p.programName || p.programFlag }}
                        </span>
                        <span v-if="p.projectCode" class="text-caption font-weight-medium">{{ p.projectCode }}</span>
                      </div>
                      <v-tooltip :text="p.title" location="top">
                        <template #activator="{ props: tipProps }">
                          <div v-bind="tipProps" class="results-table__title">{{ p.title }}</div>
                        </template>
                      </v-tooltip>
                    </td>
                    <td>
                      <v-tooltip
                        v-if="p.pi"
                        :text="`${p.pi.lastName}, ${p.pi.firstName}`"
                        location="top"
                      >
                        <template #activator="{ props: tipProps }">
                          <div v-bind="tipProps" class="results-table__truncate">
                            {{ p.pi.lastName }}, {{ p.pi.firstName }}
                          </div>
                        </template>
                      </v-tooltip>
                      <span v-else>—</span>
                    </td>
                    <td>
                      <v-tooltip v-if="p.organization" :text="p.organization.name" location="top">
                        <template #activator="{ props: tipProps }">
                          <div v-bind="tipProps" class="results-table__truncate">{{ p.organization.name }}</div>
                        </template>
                      </v-tooltip>
                      <span v-else>—</span>
                    </td>
                    <td>
                      <v-tooltip
                        v-if="p.categories.length"
                        :text="p.categories.map((c) => c.name).join(', ')"
                        location="top"
                      >
                        <template #activator="{ props: tipProps }">
                          <div v-bind="tipProps" class="results-table__truncate">
                            {{ p.categories.map((c) => c.name).join(', ') }}
                          </div>
                        </template>
                      </v-tooltip>
                      <span v-else>—</span>
                    </td>
                    <td>
                      <v-chip size="x-small" :color="p.completed ? 'success' : 'warning'" variant="tonal" label>
                        {{ p.completed ? 'Complete' : 'Active' }}
                      </v-chip>
                    </td>
                    <td class="text-center text-no-wrap" @click.stop>
                      <v-tooltip v-if="p.quadChartUrl" text="Open quad chart PDF" location="top">
                        <template #activator="{ props: tipProps }">
                          <v-btn
                            v-bind="tipProps"
                            :href="p.quadChartUrl"
                            target="_blank"
                            icon="mdi-file-pdf-box"
                            variant="text"
                            size="small"
                            color="primary"
                            aria-label="Open quad chart PDF"
                          />
                        </template>
                      </v-tooltip>
                      <span v-else class="text-medium-emphasis">—</span>
                    </td>
                  </tr>
                </tbody>
              </v-table>
            </v-card>

            <div class="d-flex align-center flex-wrap ga-3 mt-4 pagination-bar">
              <v-pagination
                v-model="filters.page"
                :length="results.totalPages"
                :total-visible="7"
                density="comfortable"
              />
              <v-spacer />
              <div class="d-flex align-center ga-2">
                <span class="text-body-2 font-weight-medium">Per page</span>
                <v-select
                  v-model="filters.pageSize"
                  :items="pageSizeOptions"
                  density="compact"
                  variant="solo"
                  flat
                  hide-details
                  style="max-width: 100px"
                  bg-color="surface"
                />
              </div>
            </div>
          </template>

          <v-sheet v-else-if="!loading" border rounded class="pa-10 text-center text-medium-emphasis">
            <v-icon icon="mdi-magnify-remove-outline" size="48" class="mb-2" />
            <div class="text-h6">No projects match your search</div>
            <div>Try broadening your keywords or clearing filters.</div>
          </v-sheet>
        </v-col>
      </v-row>
    </v-container>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import FacetSidebar from '@/components/FacetSidebar.vue';
import AdvancedSearchHelp from '@/components/AdvancedSearchHelp.vue';
import { useProjectSearch } from '@/composables/useProjectSearch';
import { useAssistantStore, type AssistantSearchFilters } from '@/stores/assistant';
import { usePortfolioContextStore } from '@/stores/portfolioContext';
import { downloadCsv } from '@/utils/exportCsv';
import type { PiOption, ProjectListItem } from '@/types';

const router = useRouter();
const assistant = useAssistantStore();
const portfolio = usePortfolioContextStore();
const { filters, results, facets, loading, fetchResults, fetchAllResults, clearFilters, searchPis } =
  useProjectSearch();

function piFromText(text: string): PiOption | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const comma = trimmed.indexOf(',');
  if (comma >= 0) {
    const lastName = trimmed.slice(0, comma).trim();
    const firstName = trimmed.slice(comma + 1).trim() || lastName;
    return {
      id: 0,
      firstName,
      lastName,
      orgCenter: null,
      label: `${lastName}, ${firstName}`,
      projectCount: 0,
    };
  }
  return {
    id: 0,
    firstName: trimmed,
    lastName: trimmed,
    orgCenter: null,
    label: trimmed,
    projectCount: 0,
  };
}

function applyAssistantFilters(next: AssistantSearchFilters) {
  if (next.q !== undefined) filters.q = next.q;
  if (next.program !== undefined) filters.program = next.program;
  if (next.status !== undefined) filters.status = next.status;
  if (next.pi !== undefined) filters.pi = next.pi ? piFromText(next.pi) : null;
  if (next.orgTypes !== undefined) filters.orgTypes = [...next.orgTypes];
  if (next.categoryIds !== undefined) filters.categoryIds = [...next.categoryIds];
  filters.page = 1;
}

watch(
  () => assistant.pendingSearch,
  (pending) => {
    if (!pending) return;
    const next = assistant.consumePendingSearch();
    if (next) applyAssistantFilters(next);
  },
);

watch(
  () => [
    filters.q,
    filters.program,
    filters.status,
    filters.pi,
    results.value.total,
  ],
  () => {
    portfolio.setLiveContext({
      q: filters.q || undefined,
      program: filters.program,
      status: filters.status,
      pi: filters.pi ? `${filters.pi.lastName}, ${filters.pi.firstName}` : undefined,
      total: results.value.total,
    });
  },
  { immediate: true },
);

const viewMode = ref<'cards' | 'table'>('cards');
const baseTotal = ref(0);
const exporting = ref(false);

const sortOptions = [
  { title: 'Relevance', value: 'relevance' },
  { title: 'Title', value: 'title' },
  { title: 'Project ID', value: 'projectCode' },
  { title: 'Completion Year', value: 'completionFy' },
  { title: 'Program', value: 'program' },
  { title: 'Principal Investigator', value: 'pi' },
];

/** Large enough to fetch the full portfolio when "All" is selected (~1,001 projects). */
const ALL_PAGE_SIZE = 10_000;
const pageSizeOptions = [
  { title: '10', value: 10 },
  { title: '25', value: 25 },
  { title: '50', value: 50 },
  { title: '100', value: 100 },
  { title: 'All', value: ALL_PAGE_SIZE },
];

// PI autocomplete
const piItems = ref<PiOption[]>([]);
const piSearch = ref('');
const piLoading = ref(false);
let piDebounce: ReturnType<typeof setTimeout> | undefined;

watch(piSearch, (q) => {
  if (piDebounce) clearTimeout(piDebounce);
  piDebounce = setTimeout(async () => {
    piLoading.value = true;
    try {
      piItems.value = await searchPis(q ?? '');
    } finally {
      piLoading.value = false;
    }
  }, 200);
});

const formatNumber = (n: number) => n.toLocaleString('en-US');

function goTo(id: number) {
  router.push({ name: 'project-detail', params: { id } });
}

const CSV_HEADERS = [
  'Program',
  'Project ID',
  'Title',
  'Principal Investigator',
  'Organization',
  'Category',
  'Status',
  'Quad Chart PDF',
];

function projectToCsvRow(p: ProjectListItem): string[] {
  return [
    p.programName || p.programFlag,
    p.projectCode ?? '',
    p.title,
    p.pi ? `${p.pi.lastName}, ${p.pi.firstName}` : '',
    p.organization?.name ?? '',
    p.categories.map((c) => c.name).join('; '),
    p.completed ? 'Complete' : 'Active',
    p.quadChartUrl ?? '',
  ];
}

async function exportCsv() {
  if (!results.value.total || exporting.value) return;
  exporting.value = true;
  try {
    const rows = await fetchAllResults();
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`esto-portfolio-${stamp}.csv`, CSV_HEADERS, rows.map(projectToCsvRow));
  } finally {
    exporting.value = false;
  }
}

onMounted(async () => {
  piItems.value = await searchPis('');
  if (assistant.pendingSearch) {
    const pending = assistant.consumePendingSearch();
    if (pending) applyAssistantFilters(pending);
  }
  await fetchResults();
  baseTotal.value = results.value.total;
});

onUnmounted(() => {
  portfolio.setLiveContext(null);
});
</script>
