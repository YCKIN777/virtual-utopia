<script setup>
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { scenes } from '../data/scenes.js';
import { worldStore } from '../stores/worldStore.js';

const user = computed(() => worldStore.state.user);
const unlockedScenes = computed(() =>
  scenes.filter((scene) => worldStore.isSceneUnlocked(scene.id)),
);
const taskRecords = computed(() =>
  [...worldStore.state.tasks].sort((left, right) => {
    if (left.status !== right.status) {
      return left.status === 'active' ? -1 : 1;
    }

    return String(right.completedAt).localeCompare(String(left.completedAt));
  }),
);

const formatDate = (value) => {
  if (!value) {
    return '进行中';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
};

const taskSceneName = (sceneId) =>
  scenes.find((scene) => scene.id === sceneId)?.name || '未知场景';
</script>

<template>
  <main v-if="user" class="vu-page">
    <section class="vu-profile-hero">
      <div class="vu-container vu-profile-hero__inner">
        <div class="vu-profile-avatar" aria-hidden="true">
          {{ user.displayName.slice(0, 1) }}
        </div>
        <div class="vu-profile-identity">
          <span class="vu-kicker">RESIDENT PROFILE</span>
          <h1>{{ user.displayName }}</h1>
          <p>{{ user.title }} · @{{ user.username }}</p>
        </div>
        <div class="vu-profile-stats">
          <div>
            <strong>Lv.{{ user.level }}</strong>
            <span>当前等级</span>
          </div>
          <div>
            <strong>{{ user.points }}</strong>
            <span>世界声望</span>
          </div>
          <div>
            <strong>{{ unlockedScenes.length }}</strong>
            <span>已解锁场景</span>
          </div>
        </div>
      </div>
    </section>

    <section class="vu-section vu-section--light">
      <div class="vu-container">
        <header class="vu-section-header">
          <div>
            <span class="vu-kicker">UNLOCKED SCENES</span>
            <h2>已解锁场景</h2>
          </div>
          <p>场景解锁状态会随登录账号同步到 Phase5 世界快照。</p>
        </header>

        <div class="vu-profile-scene-list">
          <RouterLink
            v-for="scene in unlockedScenes"
            :key="scene.id"
            :to="{
              name: 'scene-detail',
              params: { sceneId: scene.id },
            }"
            class="vu-profile-scene"
          >
            <span
              class="vu-profile-scene__mark"
              :style="{ '--scene-accent': scene.accent }"
              aria-hidden="true"
            >
              {{ scene.name.slice(0, 1) }}
            </span>
            <div>
              <strong>{{ scene.name }}</strong>
              <span>{{ scene.category }}</span>
            </div>
            <span aria-hidden="true">→</span>
          </RouterLink>
        </div>
      </div>
    </section>

    <section class="vu-section vu-section--muted">
      <div class="vu-container">
        <header class="vu-section-header">
          <div>
            <span class="vu-kicker">TASK HISTORY</span>
            <h2>我的任务记录</h2>
          </div>
          <p>已接受任务会立即出现在这里，并同步到 Phase5。</p>
        </header>

        <div class="vu-task-table">
          <div class="vu-task-table__head">
            <span>任务</span>
            <span>场景</span>
            <span>状态</span>
            <span>时间</span>
          </div>
          <article
            v-for="task in taskRecords"
            :key="task.id"
            class="vu-task-row"
          >
            <div>
              <strong>{{ task.title }}</strong>
              <small>{{ task.reward }}</small>
            </div>
            <span>{{ taskSceneName(task.sceneId) }}</span>
            <span
              class="vu-task-status"
              :class="`vu-task-status--${task.status}`"
            >
              {{ task.status === 'active' ? '进行中' : '已完成' }}
            </span>
            <span>{{ formatDate(task.completedAt) }}</span>
          </article>
        </div>
      </div>
    </section>
  </main>

  <main v-else class="vu-profile-guest">
    <div class="vu-container">
      <span class="vu-kicker">PROFILE REQUIRED</span>
      <h1>登录后查看个人中心</h1>
      <p>登录后可从 Phase5 载入个人档案与家园快照。</p>
      <RouterLink
        :to="{
          name: 'login',
          query: { redirect: '/profile' },
        }"
        class="vu-button vu-button--accent"
      >
        前往登录
      </RouterLink>
    </div>
  </main>
</template>
