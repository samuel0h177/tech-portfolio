<template>
  <v-card variant="flat" border class="pa-0">
    <v-card-item class="bg-surface-variant py-3">
      <div class="d-flex align-center">
        <v-icon icon="mdi-filter-variant" class="mr-2" color="primary" />
        <span class="text-subtitle-1 font-weight-bold">Filters</span>
        <v-spacer />
        <v-btn
          v-if="hasActiveFilters"
          size="small"
          variant="text"
          color="primary"
          @click="$emit('clear')"
        >
          Clear
        </v-btn>
      </div>
    </v-card-item>
    <v-divider />

    <div class="pa-3">
      <div class="eyebrow text-medium-emphasis mb-2">Program</div>
      <v-btn-toggle
        :model-value="program"
        mandatory
        density="comfortable"
        color="primary"
        variant="outlined"
        divided
        class="mb-4 d-flex"
        @update:model-value="$emit('update:program', $event)"
      >
        <v-btn value="ALL" size="small" class="flex-grow-1">All</v-btn>
        <v-btn value="ESTO" size="small" class="flex-grow-1">
          ESTO
          <span class="text-caption ml-1 text-medium-emphasis">{{ count(facets?.programs, 'ESTO') }}</span>
        </v-btn>
        <v-btn value="OTHER" size="small" class="flex-grow-1">
          Other
          <span class="text-caption ml-1 text-medium-emphasis">{{ count(facets?.programs, 'OTHER') }}</span>
        </v-btn>
      </v-btn-toggle>

      <div class="eyebrow text-medium-emphasis mb-2">Status</div>
      <v-btn-toggle
        :model-value="status"
        mandatory
        density="comfortable"
        color="primary"
        variant="outlined"
        divided
        class="mb-4 d-flex"
        @update:model-value="$emit('update:status', $event)"
      >
        <v-btn value="ALL" size="small" class="flex-grow-1">All</v-btn>
        <v-btn value="ACTIVE" size="small" class="flex-grow-1">
          Active
          <span class="text-caption ml-1 text-medium-emphasis">{{ count(facets?.status, 'ACTIVE') }}</span>
        </v-btn>
        <v-btn value="COMPLETED" size="small" class="flex-grow-1">
          Complete
          <span class="text-caption ml-1 text-medium-emphasis">{{ count(facets?.status, 'COMPLETED') }}</span>
        </v-btn>
      </v-btn-toggle>

      <v-divider class="mb-3" />
      <div class="eyebrow text-medium-emphasis mb-1">Technology Category</div>
      <div v-for="cat in facets?.categories ?? []" :key="cat.id" class="mb-1">
        <v-checkbox
          :model-value="categoryIds.includes(cat.id)"
          density="compact"
          hide-details
          color="primary"
          @update:model-value="toggleCategory(cat.id)"
        >
          <template #label>
            <span class="font-weight-medium">{{ cat.name }}</span>
            <span class="text-caption text-medium-emphasis ml-1">({{ cat.count }})</span>
          </template>
        </v-checkbox>
        <div v-if="cat.children.length" class="ml-6">
          <v-checkbox
            v-for="child in cat.children"
            :key="child.id"
            :model-value="categoryIds.includes(child.id)"
            density="compact"
            hide-details
            color="secondary"
            @update:model-value="toggleCategory(child.id)"
          >
            <template #label>
              <span class="text-body-2">{{ child.name }}</span>
              <span class="text-caption text-medium-emphasis ml-1">({{ child.count }})</span>
            </template>
          </v-checkbox>
        </div>
      </div>

      <v-divider class="my-3" />
      <div class="eyebrow text-medium-emphasis mb-1">Organization</div>
      <v-checkbox
        v-for="o in facets?.orgTypes ?? []"
        :key="o.value"
        :model-value="orgTypes.includes(o.value)"
        density="compact"
        hide-details
        color="primary"
        @update:model-value="toggleOrg(o.value)"
      >
        <template #label>
          <span>{{ orgLabel(o.value) }}</span>
          <span class="text-caption text-medium-emphasis ml-1">({{ o.count }})</span>
        </template>
      </v-checkbox>
    </div>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { FacetCount, Facets } from '@/types';
import { ORG_TYPE_LABELS } from '@/types';

const props = defineProps<{
  facets: Facets | null;
  program: string;
  status: string;
  categoryIds: number[];
  orgTypes: string[];
}>();

const emit = defineEmits<{
  'update:program': [string];
  'update:status': [string];
  'update:categoryIds': [number[]];
  'update:orgTypes': [string[]];
  clear: [];
}>();

const count = (arr: FacetCount[] | undefined, value: string) =>
  arr?.find((a) => a.value === value)?.count ?? 0;

const orgLabel = (v: string) => ORG_TYPE_LABELS[v] ?? v;

const hasActiveFilters = computed(
  () =>
    props.program !== 'ALL' ||
    props.status !== 'ALL' ||
    props.categoryIds.length > 0 ||
    props.orgTypes.length > 0,
);

function toggleCategory(id: number) {
  const next = props.categoryIds.includes(id)
    ? props.categoryIds.filter((c) => c !== id)
    : [...props.categoryIds, id];
  emit('update:categoryIds', next);
}

function toggleOrg(value: string) {
  const next = props.orgTypes.includes(value)
    ? props.orgTypes.filter((o) => o !== value)
    : [...props.orgTypes, value];
  emit('update:orgTypes', next);
}
</script>
