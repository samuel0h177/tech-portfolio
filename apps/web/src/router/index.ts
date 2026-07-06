import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const routes = [
  {
    path: '/',
    name: 'search',
    component: () => import('@/views/SearchView.vue'),
  },
  {
    path: '/projects/:id',
    name: 'project-detail',
    component: () => import('@/views/ProjectDetailView.vue'),
    props: true,
  },
  {
    path: '/admin/login',
    name: 'admin-login',
    component: () => import('@/views/admin/AdminLoginView.vue'),
  },
  {
    path: '/admin',
    component: () => import('@/views/admin/AdminLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', redirect: { name: 'admin-projects' } },
      { path: 'projects', name: 'admin-projects', component: () => import('@/views/admin/AdminProjectsView.vue') },
      { path: 'projects/new', name: 'admin-project-new', component: () => import('@/views/admin/AdminProjectEditView.vue') },
      { path: 'projects/:id', name: 'admin-project-edit', component: () => import('@/views/admin/AdminProjectEditView.vue'), props: true },
      { path: 'taxonomy', name: 'admin-taxonomy', component: () => import('@/views/admin/AdminTaxonomyView.vue') },
    ],
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
});

router.beforeEach((to) => {
  if (to.meta.requiresAuth) {
    const auth = useAuthStore();
    if (!auth.isAuthenticated) {
      return { name: 'admin-login', query: { redirect: to.fullPath } };
    }
  }
  return true;
});

export default router;
