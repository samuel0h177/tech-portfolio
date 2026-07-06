<template>
  <div>
    <div class="d-flex align-center flex-wrap ga-3 mb-4">
      <v-text-field
        v-model="q"
        placeholder="Search title or project ID"
        prepend-inner-icon="mdi-magnify"
        style="max-width: 360px"
        clearable
        hide-details
        @update:model-value="onSearch"
      />
      <v-spacer />
      <v-btn color="primary" prepend-icon="mdi-plus" to="/admin/projects/new">New Project</v-btn>
    </div>

    <v-card variant="flat" border>
      <v-data-table-server
        v-model:items-per-page="pageSize"
        :headers="headers"
        :items="items"
        :items-length="total"
        :loading="loading"
        :page="page"
        @update:options="loadOptions"
      >
        <template #[`item.title`]="{ item }">
          <div class="font-weight-medium" style="max-width: 420px">{{ item.title }}</div>
        </template>
        <template #[`item.programFlag`]="{ item }">
          <v-chip size="x-small" :color="item.programFlag === 'ESTO' ? 'primary' : 'secondary'" label>
            {{ item.programName || item.programFlag }}
          </v-chip>
        </template>
        <template #[`item.pi`]="{ item }">
          {{ item.pi ? item.pi.lastName + ', ' + item.pi.firstName : '—' }}
        </template>
        <template #[`item.completed`]="{ item }">
          <v-chip size="x-small" :color="item.completed ? 'success' : 'warning'" variant="tonal" label>
            {{ item.completed ? 'Complete' : 'Active' }}
          </v-chip>
        </template>
        <template #[`item.actions`]="{ item }">
          <v-btn icon="mdi-pencil" size="small" variant="text" :to="`/admin/projects/${item.id}`" />
          <v-btn icon="mdi-delete" size="small" variant="text" color="error" @click="confirmDelete(item)" />
        </template>
      </v-data-table-server>
    </v-card>

    <v-dialog v-model="deleteDialog" max-width="480">
      <v-card>
        <v-card-title>Delete project?</v-card-title>
        <v-card-text>
          This will permanently remove <strong>{{ target?.title }}</strong> and its document links.
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="deleteDialog = false">Cancel</v-btn>
          <v-btn color="error" :loading="deleting" @click="doDelete">Delete</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snackbar" color="success" timeout="2500">{{ snackbarText }}</v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { api } from '@/api/client';
import type { ProjectListItem } from '@/types';

const headers = [
  { title: 'Program', key: 'programFlag', sortable: false },
  { title: 'Project ID', key: 'projectCode', sortable: false },
  { title: 'Title', key: 'title', sortable: false },
  { title: 'PI', key: 'pi', sortable: false },
  { title: 'Status', key: 'completed', sortable: false },
  { title: '', key: 'actions', sortable: false, align: 'end' as const },
];

const items = ref<ProjectListItem[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(25);
const q = ref('');
const loading = ref(false);

const deleteDialog = ref(false);
const deleting = ref(false);
const target = ref<ProjectListItem | null>(null);
const snackbar = ref(false);
const snackbarText = ref('');

let searchDebounce: ReturnType<typeof setTimeout> | undefined;

async function load() {
  loading.value = true;
  try {
    const { data } = await api.get('/admin/projects', {
      params: { page: page.value, pageSize: pageSize.value, q: q.value || undefined },
    });
    items.value = data.data;
    total.value = data.total;
  } finally {
    loading.value = false;
  }
}

function loadOptions(opts: { page: number; itemsPerPage: number }) {
  page.value = opts.page;
  pageSize.value = opts.itemsPerPage;
  load();
}

function onSearch() {
  if (searchDebounce) clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    page.value = 1;
    load();
  }, 300);
}

function confirmDelete(item: ProjectListItem) {
  target.value = item;
  deleteDialog.value = true;
}

async function doDelete() {
  if (!target.value) return;
  deleting.value = true;
  try {
    await api.delete(`/admin/projects/${target.value.id}`);
    deleteDialog.value = false;
    snackbarText.value = 'Project deleted.';
    snackbar.value = true;
    load();
  } finally {
    deleting.value = false;
  }
}
</script>
