<template>
  <v-container class="d-flex justify-center align-center" style="min-height: 70vh">
    <v-card variant="flat" border width="420" class="pa-2">
      <v-card-item>
        <div class="d-flex align-center mb-1">
          <v-icon icon="mdi-shield-account" color="primary" class="mr-2" />
          <span class="text-h6 font-weight-bold">Admin Sign In</span>
        </div>
        <div class="text-caption text-medium-emphasis">Manage the ESTO Technology Portfolio catalog.</div>
      </v-card-item>
      <v-card-text>
        <v-form @submit.prevent="submit">
          <v-text-field v-model="email" label="Email" type="email" prepend-inner-icon="mdi-email" class="mb-3" autofocus />
          <v-text-field v-model="password" label="Password" type="password" prepend-inner-icon="mdi-lock" />
          <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mt-3">{{ error }}</v-alert>
          <v-btn type="submit" color="primary" block class="mt-4" :loading="loading">Sign In</v-btn>
        </v-form>
      </v-card-text>
    </v-card>
  </v-container>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

const email = ref('admin@esto.local');
const password = ref('');
const error = ref('');
const loading = ref(false);

async function submit() {
  loading.value = true;
  error.value = '';
  try {
    await auth.login(email.value, password.value);
    const redirect = (route.query.redirect as string) || '/admin/projects';
    router.push(redirect);
  } catch (e: any) {
    error.value = e?.response?.data?.message ?? 'Login failed.';
  } finally {
    loading.value = false;
  }
}
</script>
