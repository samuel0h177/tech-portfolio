<template>
  <div>
    <v-btn variant="text" color="primary" prepend-icon="mdi-arrow-left" to="/admin/projects" class="mb-3">
      Back to projects
    </v-btn>
    <h2 class="text-h5 font-weight-bold mb-4">{{ isNew ? 'New Project' : 'Edit Project' }}</h2>

    <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-3" />

    <v-row>
      <v-col cols="12" md="8">
        <v-card variant="flat" border class="mb-4">
          <v-card-text>
            <v-text-field v-model="form.title" label="Title *" class="mb-3" />
            <v-row>
              <v-col cols="12" sm="6">
                <v-select v-model="form.programFlag" :items="['ESTO', 'OTHER']" label="Program Flag *" />
              </v-col>
              <v-col cols="12" sm="6">
                <v-text-field v-model="form.programName" label="Program Name" placeholder="e.g. IIP, ACT" />
              </v-col>
              <v-col cols="12" sm="6">
                <v-text-field v-model="form.projectCode" label="Project ID" placeholder="e.g. IIP-10" />
              </v-col>
              <v-col cols="12" sm="6">
                <v-text-field v-model="form.statusText" label="Status Text" placeholder="e.g. Project Complete FY15" />
              </v-col>
            </v-row>
            <v-textarea v-model="form.abstract" label="Abstract" rows="5" class="mt-3" auto-grow />
          </v-card-text>
        </v-card>

        <v-card variant="flat" border class="mb-4">
          <v-card-title class="text-subtitle-1 font-weight-bold d-flex align-center">
            Supporting Documents
          </v-card-title>
          <v-divider />
          <v-list v-if="documents.length" density="comfortable">
            <v-list-item
              v-for="d in documents"
              :key="d.id"
              :title="d.fileName"
              :subtitle="d.url"
              prepend-icon="mdi-file-pdf-box"
            >
              <template #append>
                <v-btn icon="mdi-delete" size="small" variant="text" color="error" @click="removeDoc(d.id)" />
              </template>
            </v-list-item>
          </v-list>
          <v-card-text v-else class="text-medium-emphasis">No documents linked.</v-card-text>
          <v-divider />
          <v-card-text v-if="!isNew">
            <div class="d-flex ga-2 flex-wrap">
              <v-text-field v-model="newDoc.fileName" label="File name" density="compact" style="min-width: 180px" />
              <v-text-field v-model="newDoc.url" label="URL" density="compact" style="min-width: 260px; flex: 1" />
              <v-btn color="primary" :disabled="!newDoc.fileName || !newDoc.url" @click="addDoc">Add</v-btn>
            </div>
          </v-card-text>
          <v-card-text v-else class="text-caption text-medium-emphasis">
            Save the project first to attach documents.
          </v-card-text>
        </v-card>
      </v-col>

      <v-col cols="12" md="4">
        <v-card variant="flat" border class="mb-4">
          <v-card-text>
            <v-checkbox v-model="form.completed" label="Completed" color="primary" hide-details class="mb-2" />
            <v-text-field v-model.number="form.completionFy" label="Completion FY" type="number" class="mb-3" />
            <v-autocomplete
              v-model="form.piId"
              :items="pis"
              :item-title="piTitle"
              item-value="id"
              label="Principal Investigator"
              clearable
              class="mb-3"
            />
            <v-autocomplete
              v-model="form.organizationId"
              :items="orgs"
              item-title="name"
              item-value="id"
              label="Organization"
              clearable
              class="mb-3"
            />
            <v-select
              v-model="form.categoryIds"
              :items="categories"
              item-title="name"
              item-value="id"
              label="Technology Categories"
              multiple
              chips
              closable-chips
            />
          </v-card-text>
        </v-card>

        <v-card variant="flat" border class="mb-4">
          <v-card-text>
            <div class="text-subtitle-2 font-weight-bold mb-2">Technology Readiness Level</div>
            <v-row>
              <v-col cols="4"><v-text-field v-model.number="form.trlIn" label="In" type="number" /></v-col>
              <v-col cols="4"><v-text-field v-model.number="form.trlCurrent" label="Current" type="number" /></v-col>
              <v-col cols="4"><v-text-field v-model.number="form.trlOut" label="Out" type="number" /></v-col>
            </v-row>
            <v-text-field v-model="form.quadChartUrl" label="Quad Chart URL" class="mt-3" />
          </v-card-text>
        </v-card>

        <div class="d-flex ga-2">
          <v-btn color="primary" block :loading="saving" @click="save">Save</v-btn>
        </div>
      </v-col>
    </v-row>

    <v-snackbar v-model="snackbar" :color="snackbarColor" timeout="2500">{{ snackbarText }}</v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '@/api/client';
import type { CategoryRef, OrgRef, PiRef, ProjectDetail, ProjectDocument } from '@/types';

const props = defineProps<{ id?: string }>();
const router = useRouter();

const isNew = computed(() => !props.id);
const loading = ref(false);
const saving = ref(false);

const form = ref({
  programFlag: 'ESTO' as 'ESTO' | 'OTHER',
  programName: '',
  projectCode: '',
  title: '',
  abstract: '',
  completed: false,
  statusText: '',
  completionFy: undefined as number | undefined,
  trlIn: undefined as number | undefined,
  trlCurrent: undefined as number | undefined,
  trlOut: undefined as number | undefined,
  quadChartUrl: '',
  piId: null as number | null,
  organizationId: null as number | null,
  categoryIds: [] as number[],
});

const pis = ref<PiRef[]>([]);
const orgs = ref<OrgRef[]>([]);
const categories = ref<CategoryRef[]>([]);
const documents = ref<ProjectDocument[]>([]);
const newDoc = ref({ fileName: '', url: '' });

const snackbar = ref(false);
const snackbarText = ref('');
const snackbarColor = ref('success');

const piTitle = (p: PiRef) => `${p.lastName}, ${p.firstName}${p.orgCenter ? ' (' + p.orgCenter + ')' : ''}`;

function notify(text: string, color = 'success') {
  snackbarText.value = text;
  snackbarColor.value = color;
  snackbar.value = true;
}

async function loadRefs() {
  const [p, o, c] = await Promise.all([
    api.get('/admin/pis'),
    api.get('/admin/organizations'),
    api.get('/admin/categories'),
  ]);
  pis.value = p.data;
  orgs.value = o.data;
  categories.value = c.data;
}

async function loadProject() {
  if (isNew.value) return;
  loading.value = true;
  try {
    const { data } = await api.get<ProjectDetail>(`/projects/${props.id}`);
    form.value = {
      programFlag: data.programFlag,
      programName: data.programName ?? '',
      projectCode: data.projectCode ?? '',
      title: data.title,
      abstract: data.abstract ?? '',
      completed: data.completed,
      statusText: data.statusText ?? '',
      completionFy: data.completionFy ?? undefined,
      trlIn: data.trlIn ?? undefined,
      trlCurrent: data.trlCurrent ?? undefined,
      trlOut: data.trlOut ?? undefined,
      quadChartUrl: data.quadChartUrl ?? '',
      piId: data.pi?.id ?? null,
      organizationId: data.organization?.id ?? null,
      categoryIds: [...data.categories, ...data.subCategories].map((c) => c.id),
    };
    documents.value = data.documents;
  } finally {
    loading.value = false;
  }
}

async function save() {
  if (!form.value.title) {
    notify('Title is required.', 'error');
    return;
  }
  saving.value = true;
  try {
    const payload = { ...form.value };
    if (isNew.value) {
      const { data } = await api.post('/admin/projects', payload);
      notify('Project created.');
      router.replace(`/admin/projects/${data.id}`);
    } else {
      await api.put(`/admin/projects/${props.id}`, payload);
      notify('Project saved.');
    }
  } catch (e: any) {
    notify(e?.response?.data?.message ?? 'Save failed.', 'error');
  } finally {
    saving.value = false;
  }
}

async function addDoc() {
  await api.post(`/admin/projects/${props.id}/documents`, {
    fileName: newDoc.value.fileName,
    url: newDoc.value.url,
  });
  newDoc.value = { fileName: '', url: '' };
  await loadProject();
  notify('Document added.');
}

async function removeDoc(docId: number) {
  await api.delete(`/admin/documents/${docId}`);
  documents.value = documents.value.filter((d) => d.id !== docId);
  notify('Document removed.');
}

onMounted(async () => {
  await loadRefs();
  await loadProject();
});
</script>
