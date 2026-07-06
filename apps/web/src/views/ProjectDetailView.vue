<template>
  <div>
    <v-container style="max-width: 1200px" class="py-6">
      <v-btn variant="text" color="primary" prepend-icon="mdi-arrow-left" to="/" class="mb-3">
        Back to search
      </v-btn>

      <v-progress-linear v-if="loading" indeterminate color="primary" />

      <template v-if="project">
        <div class="d-flex align-center ga-2 mb-2 flex-wrap">
          <v-chip :color="project.programFlag === 'ESTO' ? 'primary' : 'secondary'" label>
            {{ project.programName || project.programFlag }}
          </v-chip>
          <span v-if="project.projectCode" class="font-weight-bold text-medium-emphasis">
            {{ project.projectCode }}
          </span>
          <v-chip :color="project.completed ? 'success' : 'warning'" variant="tonal" label>
            {{ project.statusText || (project.completed ? 'Complete' : 'Active') }}
          </v-chip>
        </div>

        <h1 class="text-h4 font-weight-bold mb-4">{{ project.title }}</h1>

        <v-row>
          <v-col cols="12" md="8">
            <v-card variant="flat" border class="mb-4">
              <v-card-title class="text-subtitle-1 font-weight-bold">Overview</v-card-title>
              <v-divider />
              <v-card-text>
                <p v-if="project.abstract" class="text-body-1" style="white-space: pre-line">
                  {{ project.abstract }}
                </p>
                <p v-else class="text-medium-emphasis">
                  No abstract is indexed for this project. Refer to the Project Summary (Quad) Chart
                  below for details.
                </p>
              </v-card-text>
            </v-card>

            <!-- Quad chart embed -->
            <v-card v-if="project.quadChartUrl" variant="flat" border class="mb-4">
              <v-card-title class="text-subtitle-1 font-weight-bold d-flex align-center">
                Project Summary (Quad) Chart
                <v-spacer />
                <v-btn
                  :href="quadChartProxyUrl"
                  target="_blank"
                  size="small"
                  variant="text"
                  color="primary"
                  append-icon="mdi-open-in-new"
                >
                  Open PDF
                </v-btn>
              </v-card-title>
              <v-divider />
              <iframe
                :src="quadChartProxyUrl"
                style="width: 100%; height: 640px; border: 0"
                title="Quad chart"
              />
            </v-card>
          </v-col>

          <v-col cols="12" md="4">
            <v-card variant="flat" border class="mb-4">
              <v-card-title class="text-subtitle-1 font-weight-bold">Details</v-card-title>
              <v-divider />
              <v-list density="comfortable">
                <v-list-item v-if="project.pi" prepend-icon="mdi-account" title="Principal Investigator"
                  :subtitle="`${project.pi.lastName}, ${project.pi.firstName}`" />
                <v-list-item v-if="project.organization" prepend-icon="mdi-office-building" title="Organization"
                  :subtitle="`${project.organization.name}${orgTypeLabel ? ' · ' + orgTypeLabel : ''}`" />
                <v-list-item v-if="project.completionFy" prepend-icon="mdi-calendar-check"
                  title="Completion" :subtitle="`FY${project.completionFy}`" />
              </v-list>
            </v-card>

            <v-card
              v-if="hasTrl"
              variant="flat"
              border
              class="mb-4"
            >
              <v-card-title class="text-subtitle-1 font-weight-bold">Technology Readiness Level</v-card-title>
              <v-divider />
              <v-card-text>
                <div class="d-flex justify-space-between text-center">
                  <div>
                    <div class="text-caption text-medium-emphasis">Entry</div>
                    <div class="text-h5 font-weight-bold text-primary">{{ project.trlIn ?? '—' }}</div>
                  </div>
                  <v-icon icon="mdi-arrow-right" class="align-self-center" />
                  <div>
                    <div class="text-caption text-medium-emphasis">Current</div>
                    <div class="text-h5 font-weight-bold text-secondary">{{ project.trlCurrent ?? '—' }}</div>
                  </div>
                  <v-icon icon="mdi-arrow-right" class="align-self-center" />
                  <div>
                    <div class="text-caption text-medium-emphasis">Exit</div>
                    <div class="text-h5 font-weight-bold text-success">{{ project.trlOut ?? '—' }}</div>
                  </div>
                </div>
              </v-card-text>
            </v-card>

            <v-card variant="flat" border class="mb-4">
              <v-card-title class="text-subtitle-1 font-weight-bold">Technology Categories</v-card-title>
              <v-divider />
              <v-card-text class="d-flex ga-1 flex-wrap">
                <v-chip v-for="c in project.categories" :key="c.id" color="primary" size="small">
                  {{ c.name }}
                </v-chip>
                <v-chip v-for="c in project.subCategories" :key="'s' + c.id" color="secondary" variant="tonal" size="small">
                  {{ c.name }}
                </v-chip>
              </v-card-text>
            </v-card>

            <v-card v-if="project.documents.length" variant="flat" border>
              <v-card-title class="text-subtitle-1 font-weight-bold">Supporting Documents</v-card-title>
              <v-divider />
              <v-list density="comfortable">
                <v-list-item
                  v-for="d in project.documents"
                  :key="d.id"
                  :href="d.url"
                  target="_blank"
                  prepend-icon="mdi-file-pdf-box"
                  :title="d.fileName"
                  :subtitle="d.fileSize ? formatSize(d.fileSize) : undefined"
                  append-icon="mdi-open-in-new"
                />
              </v-list>
            </v-card>
          </v-col>
        </v-row>
      </template>

      <v-alert v-else-if="error" type="error" variant="tonal" class="mt-4">
        {{ error }}
      </v-alert>
    </v-container>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { api } from '@/api/client';
import type { ProjectDetail } from '@/types';
import { ORG_TYPE_LABELS } from '@/types';

const props = defineProps<{ id: string }>();

const project = ref<ProjectDetail | null>(null);
const loading = ref(false);
const error = ref('');

const hasTrl = computed(
  () => project.value && (project.value.trlIn != null || project.value.trlCurrent != null || project.value.trlOut != null),
);
const orgTypeLabel = computed(() =>
  project.value?.organization?.type ? ORG_TYPE_LABELS[project.value.organization.type] : '',
);

// Stream the quad chart through our API (NASA blocks direct iframe embedding).
const apiBase = import.meta.env.VITE_API_BASE_URL || '/api';
const quadChartProxyUrl = computed(() =>
  project.value?.quadChartUrl ? `${apiBase}/projects/${project.value.id}/quad-chart` : '',
);

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

async function load(id: string) {
  loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get<ProjectDetail>(`/projects/${id}`);
    project.value = data;
  } catch (e: any) {
    error.value = e?.response?.data?.message ?? 'Failed to load project.';
  } finally {
    loading.value = false;
  }
}

watch(() => props.id, load, { immediate: true });
</script>
