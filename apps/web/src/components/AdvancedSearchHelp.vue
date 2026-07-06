<template>
  <v-dialog v-model="open" max-width="640">
    <template #activator="{ props: activator }">
      <v-btn
        v-bind="activator"
        variant="text"
        size="small"
        color="primary"
        prepend-icon="mdi-help-circle-outline"
      >
        Advanced search
      </v-btn>
    </template>
    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon icon="mdi-magnify-scan" class="mr-2" color="primary" />
        Advanced Search Options
        <v-spacer />
        <v-btn icon="mdi-close" variant="text" @click="open = false" />
      </v-card-title>
      <v-divider />
      <v-card-text>
        <v-table density="comfortable">
          <thead>
            <tr>
              <th>Syntax</th>
              <th>Meaning</th>
              <th>Example</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.syntax">
              <td><code>{{ row.syntax }}</code></td>
              <td>{{ row.meaning }}</td>
              <td><code>{{ row.example }}</code></td>
            </tr>
          </tbody>
        </v-table>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const open = ref(false);
const rows = [
  { syntax: '+word', meaning: 'Must include the word', example: '+lidar +wind' },
  { syntax: '-word', meaning: 'Must exclude the word', example: '+lidar -esto' },
  { syntax: 'word*', meaning: 'Prefix wildcard', example: 'cal*' },
  { syntax: 'a OR b', meaning: 'Match either term', example: 'radar OR lidar' },
  { syntax: 'word~', meaning: 'Fuzzy / variations', example: 'calibrate~' },
  { syntax: '"phrase"', meaning: 'Exact phrase', example: '"formation flying"' },
  { syntax: '"TRLcurrent=5"', meaning: 'Technology Readiness Level filter', example: '"TRLin=3"' },
];
</script>
