import { createRouter, createWebHashHistory } from 'vue-router';
import LoginView from '../views/LoginView.vue';
import ProfileView from '../views/ProfileView.vue';
import SceneDetailView from '../views/SceneDetailView.vue';

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      redirect: { name: 'world' },
    },
    {
      path: '/scenes',
      name: 'scenes',
      redirect: { name: 'world' },
    },
    {
      path: '/world',
      name: 'world',
      component: () => import('../views/WorldView.vue'),
    },
    {
      path: '/scenes/:sceneId',
      name: 'scene-detail',
      component: SceneDetailView,
      props: true,
    },
    {
      path: '/login',
      name: 'login',
      component: LoginView,
    },
    {
      path: '/profile',
      name: 'profile',
      component: ProfileView,
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: { name: 'world' },
    },
  ],
  scrollBehavior: () => ({
    top: 0,
  }),
});
