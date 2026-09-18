<script setup>
import { computed, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { getSceneById } from '../data/scenes.js';
import { worldStore } from '../stores/worldStore.js';

const route = useRoute();
const router = useRouter();
const scene = computed(() => getSceneById(String(route.params.sceneId || '')));
const busyTaskId = ref('');
const unlocked = computed(() =>
  scene.value ? worldStore.isSceneUnlocked(scene.value.id) : false,
);

const acceptTask = async (task) => {
  busyTaskId.value = task.id;

  try {
    await worldStore.acceptTask({
      sceneId: scene.value.id,
      task,
    });
  } catch (error) {
    if (error.code === 'LOGIN_REQUIRED') {
      worldStore.notify(error.message, 'error');
      await router.push({
        name: 'login',
        query: {
          redirect: route.fullPath,
        },
      });
    } else {
      worldStore.notify(error.message, 'error');
    }
  } finally {
    busyTaskId.value = '';
  }
};
</script>

<template>
  <main v-if="scene" class="vu-page">
    <section
      class="vu-scene-hero"
      :style="{
        '--scene-accent': scene.accent,
        '--scene-position': scene.position,
      }"
    >
      <div class="vu-scene-hero__map" aria-hidden="true" />
      <div class="vu-container vu-scene-hero__inner">
        <RouterLink :to="{ name: 'scenes' }" class="vu-back-link">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            aria-hidden="true"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
          返回场景列表
        </RouterLink>

        <div class="vu-scene-hero__content">
          <div>
            <span class="vu-kicker">{{ scene.englishName }}</span>
            <h1>{{ scene.name }}</h1>
            <p>{{ scene.summary }}</p>
          </div>
          <span class="vu-scene-state" :class="{ 'is-locked': !unlocked }">
            {{ unlocked ? '当前已解锁' : '尚未解锁' }}
          </span>
        </div>
      </div>
    </section>

    <section class="vu-section vu-section--light">
      <div class="vu-container vu-scene-detail-grid">
        <div class="vu-scene-story">
          <span class="vu-kicker">SCENE BACKGROUND</span>
          <h2>场景背景</h2>
          <p>{{ scene.background }}</p>
        </div>

        <aside class="vu-scene-facts">
          <div>
            <span>场景类型</span>
            <strong>{{ scene.category }}</strong>
          </div>
          <div>
            <span>事件数量</span>
            <strong>{{ scene.events.length }}</strong>
          </div>
          <div>
            <span>访问状态</span>
            <strong>{{ unlocked ? '可进入' : '待开放' }}</strong>
          </div>
        </aside>
      </div>
    </section>

    <section class="vu-section vu-section--muted">
      <div class="vu-container">
        <header class="vu-section-header">
          <div>
            <span class="vu-kicker">EVENTS & TASKS</span>
            <h2>场景内事件与任务</h2>
          </div>
          <p>接受的任务会立即写入个人中心，并同步到 Phase5 世界快照。</p>
        </header>

        <div class="vu-event-list">
          <article
            v-for="event in scene.events"
            :key="event.id"
            class="vu-event-card"
          >
            <div class="vu-event-card__label">
              <span>{{ event.type }}</span>
              <small>{{ event.reward }}</small>
            </div>
            <div class="vu-event-card__body">
              <h3>{{ event.title }}</h3>
              <p>{{ event.description }}</p>
            </div>
            <button
              type="button"
              class="vu-button vu-button--dark vu-button--small"
              :disabled="
                busyTaskId === event.id || worldStore.isTaskAccepted(event.id)
              "
              @click="acceptTask(event)"
            >
              <span
                v-if="busyTaskId === event.id"
                class="vu-spinner"
                aria-hidden="true"
              />
              {{
                worldStore.isTaskAccepted(event.id)
                  ? '已接受'
                  : busyTaskId === event.id
                    ? '提交中'
                    : '接受任务'
              }}
            </button>
          </article>
        </div>
      </div>
    </section>
  </main>

  <main v-else class="vu-not-found">
    <div class="vu-container">
      <span class="vu-kicker">SCENE NOT FOUND</span>
      <h1>未找到该场景</h1>
      <RouterLink :to="{ name: 'scenes' }" class="vu-button vu-button--accent">
        返回场景列表
      </RouterLink>
    </div>
  </main>
</template>
