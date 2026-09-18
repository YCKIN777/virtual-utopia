import { createRouter, createWebHashHistory } from 'vue-router';
import AdminLayout from '../components/AdminLayout.vue';
import DocumentsView from '../views/DocumentsView.vue';
import HistoryView from '../views/HistoryView.vue';
import LoginView from '../views/LoginView.vue';
import { authStore } from '../stores/authStore.js';

const routes = [
  {
    path: '/login',
    name: 'login',
    component: LoginView,
  },
  {
    path: '/',
    component: AdminLayout,
    meta: {
      requiresAuth: true,
    },
    children: [
      {
        path: '',
        redirect: '/documents',
      },
      {
        path: 'documents',
        name: 'documents',
        component: DocumentsView,
      },
      {
        path: 'sessions',
        name: 'sessions',
        component: HistoryView,
      },
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/documents',
  },
];

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

router.beforeEach(async (to) => {
  if (to.meta.requiresAuth) {
    const authenticated = await authStore.ensureSession();

    if (!authenticated) {
      return {
        name: 'login',
        query: {
          redirect: to.fullPath,
        },
      };
    }
  }

  if (to.name === 'login' && authStore.state.token) {
    return {
      name: 'documents',
    };
  }

  return true;
});
