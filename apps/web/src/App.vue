<template>
  <v-app>
    <v-app-bar flat color="#0b3d91" height="72">
      <v-container class="d-flex align-center py-0" style="max-width: 1400px">
        <router-link to="/" class="d-flex align-center text-white" style="text-decoration: none">
          <v-avatar color="white" size="44" class="mr-3">
            <span class="font-weight-black" style="font-size: 15px; color: #0b3d91">ESTO</span>
          </v-avatar>
          <div>
            <div class="eyebrow" style="opacity: 0.85">NASA Earth Science Technology Office</div>
            <div class="text-h6 font-weight-bold" style="line-height: 1.1">Technology Portfolio</div>
          </div>
        </router-link>
        <v-spacer />
        <v-btn variant="text" color="white" to="/" prepend-icon="mdi-home">Home</v-btn>
        <v-btn
          variant="text"
          color="white"
          href="https://esto.nasa.gov"
          target="_blank"
          prepend-icon="mdi-open-in-new"
        >
          ESTO.nasa.gov
        </v-btn>
        <v-btn variant="text" color="white" to="/admin" prepend-icon="mdi-shield-account">Admin</v-btn>
        <v-btn
          icon
          variant="text"
          color="white"
          class="ml-1"
          :title="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
          :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
          @click="toggleTheme"
        >
          <v-icon>{{ isDark ? 'mdi-weather-sunny' : 'mdi-weather-night' }}</v-icon>
        </v-btn>
      </v-container>
    </v-app-bar>

    <v-main>
      <router-view />
    </v-main>

    <v-footer color="#1b1f27" class="text-grey-lighten-1">
      <v-container style="max-width: 1400px">
        <v-row>
          <v-col cols="12" md="8">
            <div class="text-white font-weight-bold mb-1">NASA Earth Science Technology Office</div>
            <div class="text-caption">
              A modern remake of the ESTO Technology Portfolio search. Project data indexed from
              esto.nasa.gov. This is an independent demonstration, not an official NASA website.
            </div>
          </v-col>
          <v-col cols="12" md="4" class="text-md-right text-caption">
            <div>Responsible NASA Official: Michael Seablom</div>
            <div>&copy; {{ new Date().getFullYear() }} NASA ESTO (data source)</div>
          </v-col>
        </v-row>
      </v-container>
    </v-footer>
  </v-app>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useTheme } from 'vuetify';
import { useAuthStore } from '@/stores/auth';
import { DARK_THEME, LIGHT_THEME, THEME_STORAGE_KEY } from '@/plugins/vuetify';

const auth = useAuthStore();
onMounted(() => auth.fetchMe());

const theme = useTheme();
const isDark = computed(() => theme.global.name.value === DARK_THEME);

function toggleTheme() {
  const next = isDark.value ? LIGHT_THEME : DARK_THEME;
  theme.global.name.value = next;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    /* ignore persistence failures */
  }
}
</script>
