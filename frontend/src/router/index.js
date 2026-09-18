import { createRouter, createWebHistory } from 'vue-router';
import HomeView from '../views/HomeView.vue';
import YardSceneView from '../views/scenes/YardSceneView.vue';
import PavilionSceneView from '../views/scenes/PavilionSceneView.vue';
import ResourceWallSceneView from '../views/scenes/ResourceWallSceneView.vue';
import LibrarySceneView from '../views/scenes/LibrarySceneView.vue';
import CabinSceneView from '../views/scenes/CabinSceneView.vue';
import FarForestSceneView from '../views/scenes/FarForestSceneView.vue';

const routes = [
  {
    path: '/',
    name: 'map',
    component: HomeView,
  },
  {
    path: '/scene/yard',
    name: 'yard',
    component: YardSceneView,
    meta: { sceneName: '大院' },
  },
  {
    path: '/scene/pavilion',
    name: 'pavilion',
    component: PavilionSceneView,
    meta: { sceneName: '议事亭' },
  },
  {
    path: '/scene/resource-wall',
    name: 'resource-wall',
    component: ResourceWallSceneView,
    meta: { sceneName: '资源墙' },
  },
  {
    path: '/scene/library',
    name: 'library',
    component: LibrarySceneView,
    meta: { sceneName: '书屋' },
  },
  {
    path: '/scene/cabin',
    name: 'cabin',
    component: CabinSceneView,
    meta: { sceneName: '小屋' },
  },
  {
    path: '/scene/far-forest',
    name: 'far-forest',
    component: FarForestSceneView,
    meta: { sceneName: '远林' },
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/',
  },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
});
