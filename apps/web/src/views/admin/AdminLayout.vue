<template>
  <v-container style="max-width: 1400px" class="py-6">
    <div class="d-flex align-center mb-4 flex-wrap ga-2">
      <v-icon icon="mdi-cog" color="primary" class="mr-1" />
      <span class="text-h5 font-weight-bold">Portfolio Administration</span>
      <v-spacer />
      <span class="text-body-2 text-medium-emphasis mr-2">{{ auth.user?.email }}</span>
      <v-btn variant="text" prepend-icon="mdi-logout" @click="logout">Sign out</v-btn>
    </div>

    <v-tabs v-model="tab" color="primary" class="mb-4">
      <v-tab value="projects" to="/admin/projects" prepend-icon="mdi-folder-multiple">Projects</v-tab>
      <v-tab value="taxonomy" to="/admin/taxonomy" prepend-icon="mdi-sitemap">Taxonomy &amp; People</v-tab>
    </v-tabs>

    <router-view />
  </v-container>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const router = useRouter();
const tab = ref('projects');

function logout() {
  auth.logout();
  router.push('/admin/login');
}
</script>
