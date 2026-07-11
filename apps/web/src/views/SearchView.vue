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
            <v-card v-else variant="flat" border>
              <v-table density="comfortable">
                <thead>
                  <tr>
                    <th>Program</th>
                    <th>Project ID</th>
                    <th>PI</th>
                    <th>Title</th>
                    <th>Organization</th>
                    <th>Category</th>
                    <th>Status</th>
                    <th class="text-center">Chart</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="p in results.data" :key="p.id" style="cursor: pointer" @click="goTo(p.id)">
                    <td>{{ p.programName || p.programFlag }}</td>
                    <td class="font-weight-medium">{{ p.projectCode }}</td>
                    <td class="text-no-wrap">{{ p.pi ? p.pi.lastName + ', ' + p.pi.firstName : '—' }}</td>
                    <td style="min-width: 280px">{{ p.title }}</td>
                    <td>{{ p.organization?.name ?? '—' }}</td>
                    <td>{{ p.categories.map((c) => c.name).join(', ') }}</td>
                    <td>
                      <v-chip size="x-small" :color="p.completed ? 'success' : 'warning'" variant="tonal" label>
                        {{ p.completed ? 'Complete' : 'Active' }}
                      </v-chip>
                    </td>
                    <td class="text-center" @click.stop>
                      <v-btn
                        v-if="p.quadChartUrl"
                        :href="p.quadChartUrl"
                        target="_blank"
                        icon="mdi-file-chart"
                        variant="text"
                        size="small"
                        color="primary"
                      />
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
                  :items="[10, 25, 50, 100]"
                  density="compact"
                  variant="solo"
                  flat
                  hide-details
                  style="max-width: 90px"
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
import { onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import FacetSidebar from '@/components/FacetSidebar.vue';
import AdvancedSearchHelp from '@/components/AdvancedSearchHelp.vue';
import { useProjectSearch } from '@/composables/useProjectSearch';
import type { PiOption } from '@/types';

const router = useRouter();
const { filters, results, facets, loading, fetchResults, clearFilters, searchPis } = useProjectSearch();

const viewMode = ref<'cards' | 'table'>('cards');
const baseTotal = ref(0);

const sortOptions = [
  { title: 'Relevance', value: 'relevance' },
  { title: 'Title', value: 'title' },
  { title: 'Project ID', value: 'projectCode' },
  { title: 'Completion Year', value: 'completionFy' },
  { title: 'Program', value: 'program' },
  { title: 'Principal Investigator', value: 'pi' },
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

onMounted(async () => {
  piItems.value = await searchPis('');
  await fetchResults();
  baseTotal.value = results.value.total;
});
</script>
