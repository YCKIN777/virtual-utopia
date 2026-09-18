<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import IsometricWorldMap from '../components/map/IsometricWorldMap.vue';

const router = useRouter();
const isMapExpanded = ref(false);

const openScene = (scene) => {
  if (isMapExpanded.value) {
    isMapExpanded.value = false;
  }

  router.push({ name: scene.routeName });
};
</script>

<template>
  <main class="page-container py-6 sm:py-8">
    <div class="mb-5 flex items-end justify-between gap-4">
      <div>
        <p class="text-xs font-medium uppercase tracking-[0.16em] text-muted">
          VIRTUAL UTOPIA
        </p>
        <h1
          class="mt-1 text-2xl font-semibold tracking-normal text-ink sm:text-3xl"
        >
          世界地图
        </h1>
      </div>
      <p class="hidden text-sm text-muted sm:block">六处坐标</p>
    </div>

    <IsometricWorldMap v-model:expanded="isMapExpanded" @select="openScene" />
  </main>
</template>
