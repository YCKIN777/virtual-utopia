import { createRouter, createWebHashHistory } from 'vue-router';
import LoginView from '../views/LoginView.vue';
import ProfileView from '../views/ProfileView.vue';
import RegisterView from '../views/RegisterView.vue';
import SceneDetailView from '../views/SceneDetailView.vue';

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      // shell 下线：唯一入口为 3D 世界（WorldView 全屏沉浸）
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
      path: '/register',
      name: 'register',
      component: RegisterView,
    },
    {
      path: '/profile',
      name: 'profile',
      component: ProfileView,
    },
    {
      path: '/resident/:username',
      name: 'resident-profile',
      component: () => import('../views/ResidentProfileView.vue'),
      props: true,
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
