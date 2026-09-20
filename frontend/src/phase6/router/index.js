import { createRouter, createWebHashHistory } from 'vue-router';
import AdminLayout from '../components/AdminLayout.vue';
import DocumentsView from '../views/DocumentsView.vue';
import HistoryView from '../views/HistoryView.vue';
import LoginView from '../views/LoginView.vue';
import PlotAssignmentView from '../views/PlotAssignmentView.vue';
import ResidentApplicationsView from '../views/ResidentApplicationsView.vue';
import VisitorQuotaView from '../views/VisitorQuotaView.vue';
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
      {
        path: 'visitor-quota',
        name: 'visitor-quota',
        component: VisitorQuotaView,
      },
      {
        path: 'plots',
        name: 'plots',
        component: PlotAssignmentView,
      },
      {
        path: 'applications',
        name: 'applications',
        component: ResidentApplicationsView,
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
