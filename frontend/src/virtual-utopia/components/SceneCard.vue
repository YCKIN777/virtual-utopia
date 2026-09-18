<script setup>
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { worldStore } from '../stores/worldStore.js';

const props = defineProps({
  scene: {
    type: Object,
    required: true,
  },
  compact: {
    type: Boolean,
    default: false,
  },
});

const unlocked = computed(() => worldStore.isSceneUnlocked(props.scene.id));
</script>

<template>
  <article class="vu-scene-card" :class="{ 'vu-scene-card--compact': compact }">
    <div
      class="vu-scene-card__visual"
      :style="{
        '--scene-accent': scene.accent,
        '--scene-position': scene.position,
      }"
    >
      <span class="vu-scene-card__index" aria-hidden="true">
        {{ scene.englishName.slice(0, 2) }}
      </span>
      <span class="vu-scene-card__state" :class="{ 'is-locked': !unlocked }">
        {{ unlocked ? '已解锁' : '待解锁' }}
      </span>
    </div>

    <div class="vu-scene-card__body">
      <span class="vu-kicker">{{ scene.category }}</span>
      <h3>{{ scene.name }}</h3>
      <p>{{ scene.summary }}</p>
      <RouterLink
        :to="{
          name: 'scene-detail',
          params: { sceneId: scene.id },
        }"
        class="vu-text-link"
      >
        查看场景
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          aria-hidden="true"
        >
          <path d="M5 12h14" />
          <path d="M13 6l6 6-6 6" />
        </svg>
      </RouterLink>
    </div>
  </article>
</template>
