import { defineStore } from 'pinia';
import { api } from '@/api/client';

interface AdminUser {
  id: number;
  email: string;
  role: string;
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem('esto_token') as string | null,
    user: null as AdminUser | null,
  }),
  getters: {
    isAuthenticated: (state) => !!state.token,
  },
  actions: {
    async login(email: string, password: string) {
      const { data } = await api.post('/auth/login', { email, password });
      this.token = data.accessToken;
      this.user = data.user;
      localStorage.setItem('esto_token', data.accessToken);
    },
    async fetchMe() {
      if (!this.token) return;
      try {
        const { data } = await api.get('/auth/me');
        this.user = data;
      } catch {
        this.logout();
      }
    },
    logout() {
      this.token = null;
      this.user = null;
      localStorage.removeItem('esto_token');
    },
  },
});
