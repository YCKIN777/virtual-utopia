<script setup>
import { computed, reactive, ref } from 'vue';
import { RouterLink } from 'vue-router';
import HomepageS2Panel from '../components/HomepageS2Panel.vue';
import ResidentCardsPanel from '../components/ResidentCardsPanel.vue';
import ResidentDirectoryPanel from '../components/ResidentDirectoryPanel.vue';
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

const passwordForm = reactive({
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
});
const passwordErrors = reactive({
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
  submit: '',
});
const passwordBusy = ref(false);
const passwordDone = ref(false);

const submitPasswordChange = async () => {
  passwordErrors.currentPassword = '';
  passwordErrors.newPassword = '';
  passwordErrors.confirmPassword = '';
  passwordErrors.submit = '';
  passwordDone.value = false;

  if (!passwordForm.currentPassword) {
    passwordErrors.currentPassword = '请输入当前密码';
  }

  if (!passwordForm.newPassword) {
    passwordErrors.newPassword = '请输入新密码';
  } else if (passwordForm.newPassword.length < 6) {
    passwordErrors.newPassword = '新密码至少需要 6 个字符';
  }

  if (passwordForm.confirmPassword !== passwordForm.newPassword) {
    passwordErrors.confirmPassword = '两次输入的新密码不一致';
  }

  if (
    passwordErrors.currentPassword ||
    passwordErrors.newPassword ||
    passwordErrors.confirmPassword
  ) {
    return;
  }

  passwordBusy.value = true;

  const result = await worldStore.changePassword({
    currentPassword: passwordForm.currentPassword,
    newPassword: passwordForm.newPassword,
  });

  passwordBusy.value = false;

  if (!result.ok) {
    passwordErrors.submit = result.error || '修改密码失败';
    return;
  }

  passwordForm.currentPassword = '';
  passwordForm.newPassword = '';
  passwordForm.confirmPassword = '';
  passwordDone.value = true;
};
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

    <section class="vu-section vu-section--light">
      <div class="vu-container">
        <header class="vu-section-header">
          <div>
            <span class="vu-kicker">ACCOUNT SECURITY</span>
            <h2>修改密码</h2>
          </div>
          <p>仅能修改本人密码，用户名不可修改。</p>
        </header>

        <form
          class="vu-password-form"
          novalidate
          @submit.prevent="submitPasswordChange"
        >
          <label class="vu-field">
            <span>当前密码</span>
            <input
              v-model="passwordForm.currentPassword"
              type="password"
              autocomplete="current-password"
              :disabled="passwordBusy"
            />
            <small v-if="passwordErrors.currentPassword" class="vu-field__error">
              {{ passwordErrors.currentPassword }}
            </small>
          </label>

          <label class="vu-field">
            <span>新密码</span>
            <input
              v-model="passwordForm.newPassword"
              type="password"
              autocomplete="new-password"
              :disabled="passwordBusy"
            />
            <small v-if="passwordErrors.newPassword" class="vu-field__error">
              {{ passwordErrors.newPassword }}
            </small>
          </label>

          <label class="vu-field">
            <span>确认新密码</span>
            <input
              v-model="passwordForm.confirmPassword"
              type="password"
              autocomplete="new-password"
              :disabled="passwordBusy"
            />
            <small v-if="passwordErrors.confirmPassword" class="vu-field__error">
              {{ passwordErrors.confirmPassword }}
            </small>
          </label>

          <p v-if="passwordErrors.submit" class="vu-form__error" role="alert">
            {{ passwordErrors.submit }}
          </p>

          <p v-if="passwordDone" class="vu-password-done" role="status">
            密码修改成功
          </p>

          <button
            type="submit"
            class="vu-button vu-button--accent"
            :disabled="passwordBusy"
          >
            <span v-if="passwordBusy" class="vu-spinner" aria-hidden="true" />
            {{ passwordBusy ? '正在保存' : '保存新密码' }}
          </button>
        </form>
      </div>
    </section>

    <section class="vu-section vu-section--muted">
      <div class="vu-container">
        <header class="vu-section-header">
          <div>
            <span class="vu-kicker">LIFE CARDS</span>
            <h2>我的主页卡片</h2>
          </div>
          <p>自愿记录，无点赞与排行；单条内容可设置「仅自己」或「原住民可见」。</p>
        </header>

        <ResidentCardsPanel />
      </div>
    </section>

    <section class="vu-section vu-section--light">
      <div class="vu-container">
        <header class="vu-section-header">
          <div>
            <span class="vu-kicker">SHOWCASE & GUESTBOOK</span>
            <h2>展示板与留言簿</h2>
          </div>
          <p>展示板聚合你的公开内容；留言簿仅原住民可见，无点赞与排行。</p>
        </header>

        <HomepageS2Panel />
      </div>
    </section>

    <section class="vu-section vu-section--muted">
      <div class="vu-container">
        <header class="vu-section-header">
          <div>
            <span class="vu-kicker">RESIDENT DIRECTORY</span>
            <h2>原住民名录</h2>
          </div>
          <p>查看全部原住民，点击发起一对一私聊，也可创建临时小群；仅原住民可见。</p>
        </header>

        <ResidentDirectoryPanel />
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

<style scoped>
.vu-password-form {
  display: grid;
  gap: 16px;
  max-width: 420px;
}

.vu-password-done {
  margin: 0;
  color: #bfe8d2;
  font-size: 14px;
}
</style>
