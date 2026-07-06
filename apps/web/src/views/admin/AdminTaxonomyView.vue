<template>
  <v-row>
    <!-- Categories -->
    <v-col cols="12" md="4">
      <v-card variant="flat" border>
        <v-card-title class="d-flex align-center text-subtitle-1 font-weight-bold">
          Tech Categories
          <v-spacer />
          <v-btn size="small" color="primary" variant="tonal" prepend-icon="mdi-plus" @click="openCat()">Add</v-btn>
        </v-card-title>
        <v-divider />
        <v-list density="compact" max-height="520" class="overflow-y-auto">
          <v-list-item
            v-for="c in categories"
            :key="c.id"
            :title="c.name"
            :subtitle="c.parentId ? 'Sub-category' : 'Top-level'"
            :class="{ 'pl-8': c.parentId }"
          >
            <template #append>
              <v-btn icon="mdi-pencil" size="x-small" variant="text" @click="openCat(c)" />
              <v-btn icon="mdi-delete" size="x-small" variant="text" color="error" @click="delCat(c.id)" />
            </template>
          </v-list-item>
        </v-list>
      </v-card>
    </v-col>

    <!-- PIs -->
    <v-col cols="12" md="4">
      <v-card variant="flat" border>
        <v-card-title class="d-flex align-center text-subtitle-1 font-weight-bold">
          Principal Investigators
          <v-spacer />
          <v-btn size="small" color="primary" variant="tonal" prepend-icon="mdi-plus" @click="openPi()">Add</v-btn>
        </v-card-title>
        <v-divider />
        <v-text-field
          v-model="piFilter"
          density="compact"
          placeholder="Filter"
          prepend-inner-icon="mdi-magnify"
          hide-details
          class="ma-2"
        />
        <v-list density="compact" max-height="460" class="overflow-y-auto">
          <v-list-item
            v-for="p in filteredPis"
            :key="p.id"
            :title="`${p.lastName}, ${p.firstName}`"
            :subtitle="p.orgCenter ?? ''"
          >
            <template #append>
              <v-btn icon="mdi-pencil" size="x-small" variant="text" @click="openPi(p)" />
              <v-btn icon="mdi-delete" size="x-small" variant="text" color="error" @click="delPi(p.id)" />
            </template>
          </v-list-item>
        </v-list>
      </v-card>
    </v-col>

    <!-- Organizations -->
    <v-col cols="12" md="4">
      <v-card variant="flat" border>
        <v-card-title class="d-flex align-center text-subtitle-1 font-weight-bold">
          Organizations
          <v-spacer />
          <v-btn size="small" color="primary" variant="tonal" prepend-icon="mdi-plus" @click="openOrg()">Add</v-btn>
        </v-card-title>
        <v-divider />
        <v-text-field
          v-model="orgFilter"
          density="compact"
          placeholder="Filter"
          prepend-inner-icon="mdi-magnify"
          hide-details
          class="ma-2"
        />
        <v-list density="compact" max-height="460" class="overflow-y-auto">
          <v-list-item
            v-for="o in filteredOrgs"
            :key="o.id"
            :title="o.name"
            :subtitle="o.type ? ORG_TYPE_LABELS[o.type] : 'Unclassified'"
          >
            <template #append>
              <v-btn icon="mdi-pencil" size="x-small" variant="text" @click="openOrg(o)" />
              <v-btn icon="mdi-delete" size="x-small" variant="text" color="error" @click="delOrg(o.id)" />
            </template>
          </v-list-item>
        </v-list>
      </v-card>
    </v-col>
  </v-row>

  <!-- Category dialog -->
  <v-dialog v-model="catDialog" max-width="460">
    <v-card>
      <v-card-title>{{ catForm.id ? 'Edit' : 'Add' }} Category</v-card-title>
      <v-card-text>
        <v-text-field v-model="catForm.name" label="Name" class="mb-3" />
        <v-select
          v-model="catForm.parentId"
          :items="topCategories"
          item-title="name"
          item-value="id"
          label="Parent (optional)"
          clearable
        />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="catDialog = false">Cancel</v-btn>
        <v-btn color="primary" @click="saveCat">Save</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <!-- PI dialog -->
  <v-dialog v-model="piDialog" max-width="460">
    <v-card>
      <v-card-title>{{ piForm.id ? 'Edit' : 'Add' }} Principal Investigator</v-card-title>
      <v-card-text>
        <v-text-field v-model="piForm.firstName" label="First name" class="mb-3" />
        <v-text-field v-model="piForm.lastName" label="Last name" class="mb-3" />
        <v-text-field v-model="piForm.orgCenter" label="Organization / Center" />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="piDialog = false">Cancel</v-btn>
        <v-btn color="primary" @click="savePi">Save</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <!-- Org dialog -->
  <v-dialog v-model="orgDialog" max-width="460">
    <v-card>
      <v-card-title>{{ orgForm.id ? 'Edit' : 'Add' }} Organization</v-card-title>
      <v-card-text>
        <v-text-field v-model="orgForm.name" label="Name" class="mb-3" />
        <v-select
          v-model="orgForm.type"
          :items="orgTypeItems"
          label="Type"
          clearable
        />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="orgDialog = false">Cancel</v-btn>
        <v-btn color="primary" @click="saveOrg">Save</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <v-snackbar v-model="snackbar" color="success" timeout="2000">{{ snackbarText }}</v-snackbar>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api } from '@/api/client';
import type { CategoryRef, OrgRef, PiRef } from '@/types';
import { ORG_TYPE_LABELS } from '@/types';

const categories = ref<CategoryRef[]>([]);
const pis = ref<PiRef[]>([]);
const orgs = ref<OrgRef[]>([]);

const piFilter = ref('');
const orgFilter = ref('');
const snackbar = ref(false);
const snackbarText = ref('');

const orgTypeItems = Object.entries(ORG_TYPE_LABELS).map(([value, title]) => ({ value, title }));
const topCategories = computed(() => categories.value.filter((c) => !c.parentId));

const filteredPis = computed(() =>
  piFilter.value
    ? pis.value.filter((p) => `${p.lastName} ${p.firstName}`.toLowerCase().includes(piFilter.value.toLowerCase()))
    : pis.value,
);
const filteredOrgs = computed(() =>
  orgFilter.value
    ? orgs.value.filter((o) => o.name.toLowerCase().includes(orgFilter.value.toLowerCase()))
    : orgs.value,
);

function notify(text: string) {
  snackbarText.value = text;
  snackbar.value = true;
}

async function loadAll() {
  const [c, p, o] = await Promise.all([
    api.get('/admin/categories'),
    api.get('/admin/pis'),
    api.get('/admin/organizations'),
  ]);
  categories.value = c.data;
  pis.value = p.data;
  orgs.value = o.data;
}

// Category CRUD
const catDialog = ref(false);
const catForm = ref<{ id?: number; name: string; parentId: number | null }>({ name: '', parentId: null });
function openCat(c?: CategoryRef) {
  catForm.value = c ? { id: c.id, name: c.name, parentId: c.parentId ?? null } : { name: '', parentId: null };
  catDialog.value = true;
}
async function saveCat() {
  if (catForm.value.id) await api.put(`/admin/categories/${catForm.value.id}`, catForm.value);
  else await api.post('/admin/categories', catForm.value);
  catDialog.value = false;
  await loadAll();
  notify('Category saved.');
}
async function delCat(id: number) {
  await api.delete(`/admin/categories/${id}`);
  await loadAll();
  notify('Category deleted.');
}

// PI CRUD
const piDialog = ref(false);
const piForm = ref<{ id?: number; firstName: string; lastName: string; orgCenter: string }>({
  firstName: '',
  lastName: '',
  orgCenter: '',
});
function openPi(p?: PiRef) {
  piForm.value = p
    ? { id: p.id, firstName: p.firstName, lastName: p.lastName, orgCenter: p.orgCenter ?? '' }
    : { firstName: '', lastName: '', orgCenter: '' };
  piDialog.value = true;
}
async function savePi() {
  if (piForm.value.id) await api.put(`/admin/pis/${piForm.value.id}`, piForm.value);
  else await api.post('/admin/pis', piForm.value);
  piDialog.value = false;
  await loadAll();
  notify('PI saved.');
}
async function delPi(id: number) {
  await api.delete(`/admin/pis/${id}`);
  await loadAll();
  notify('PI deleted.');
}

// Org CRUD
const orgDialog = ref(false);
const orgForm = ref<{ id?: number; name: string; type: string | null }>({ name: '', type: null });
function openOrg(o?: OrgRef) {
  orgForm.value = o ? { id: o.id, name: o.name, type: o.type } : { name: '', type: null };
  orgDialog.value = true;
}
async function saveOrg() {
  if (orgForm.value.id) await api.put(`/admin/organizations/${orgForm.value.id}`, orgForm.value);
  else await api.post('/admin/organizations', orgForm.value);
  orgDialog.value = false;
  await loadAll();
  notify('Organization saved.');
}
async function delOrg(id: number) {
  await api.delete(`/admin/organizations/${id}`);
  await loadAll();
  notify('Organization deleted.');
}

onMounted(loadAll);
</script>
