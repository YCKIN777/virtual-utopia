<script setup>
import { computed, ref } from 'vue';
import SceneCard from '../components/SceneCard.vue';
import { scenes } from '../data/scenes.js';
import { worldStore } from '../stores/worldStore.js';

const activeCategory = ref('全部');
const categories = computed(() => [
  '全部',
  ...new Set(scenes.map((scene) => scene.category)),
]);
const visibleScenes = computed(() =>
  activeCategory.value === '全部'
    ? scenes
    : scenes.filter((scene) => scene.category === activeCategory.value),
);
const unlockedCount = computed(() => worldStore.state.unlockedSceneIds.length);
</script>

<template>
  <main class="vu-page">
    <section class="vu-page-masthead">
      <div class="vu-container vu-page-masthead__inner">
        <div>
          <span class="vu-kicker">SCENE DIRECTORY</span>
          <h1>场景浏览</h1>
          <p>探索公共空间、知识空间、生活空间与尚未完全开放的边界。</p>
        </div>
        <div class="vu-metric">
          <strong>{{ unlockedCount }}</strong>
          <span>/ {{ scenes.length }} 已解锁</span>
        </div>
      </div>
    </section>

    <section class="vu-section vu-section--light">
      <div class="vu-container">
        <div class="vu-category-tabs" role="tablist">
          <button
            v-for="category in categories"
            :key="category"
            type="button"
            role="tab"
            :aria-selected="activeCategory === category"
            :class="{ 'is-active': activeCategory === category }"
            @click="activeCategory = category"
          >
            {{ category }}
          </button>
        </div>

        <div class="vu-scene-grid vu-scene-grid--full">
          <SceneCard
            v-for="scene in visibleScenes"
            :key="scene.id"
            :scene="scene"
          />
        </div>
      </div>
    </section>
  </main>
</template>
