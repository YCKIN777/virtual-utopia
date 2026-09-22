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

// 折叠面板状态：默认全部收起，仅顶部个人信息与原住民名录常显
const panels = reactive({
  scenes: false,
  tasks: false,
  password: false,
  cards: false,
  showcase: false,
});
</script>

<template>
  <main v-if="user" class="vu-page vu-profile">
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
        <button
          class="vu-collapse__head"
          type="button"
          :aria-expanded="panels.scenes"
          @click="panels.scenes = !panels.scenes"
        >
          <span class="vu-kicker">UNLOCKED SCENES</span>
          <span class="vu-collapse__title">已解锁场景</span>
          <span class="vu-collapse__chev" :class="{ open: panels.scenes }">▾</span>
        </button>
        <div v-show="panels.scenes" class="vu-collapse__body">
          <p class="vu-collapse__desc">场景解锁状态会随登录账号同步到 Phase5 世界快照。</p>
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
      </div>
    </section>

    <section class="vu-section vu-section--muted">
      <div class="vu-container">
        <button
          class="vu-collapse__head"
          type="button"
          :aria-expanded="panels.tasks"
          @click="panels.tasks = !panels.tasks"
        >
          <span class="vu-kicker">TASK HISTORY</span>
          <span class="vu-collapse__title">我的任务记录</span>
          <span class="vu-collapse__chev" :class="{ open: panels.tasks }">▾</span>
        </button>
        <div v-show="panels.tasks" class="vu-collapse__body">
          <p class="vu-collapse__desc">已接受任务会立即出现在这里，并同步到 Phase5。</p>
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
      </div>
    </section>

    <section class="vu-section vu-section--light">
      <div class="vu-container">
        <button
          class="vu-collapse__head"
          type="button"
          :aria-expanded="panels.password"
          @click="panels.password = !panels.password"
        >
          <span class="vu-kicker">ACCOUNT SECURITY</span>
          <span class="vu-collapse__title">修改密码</span>
          <span class="vu-collapse__chev" :class="{ open: panels.password }">▾</span>
        </button>
        <div v-show="panels.password" class="vu-collapse__body">
          <p class="vu-collapse__desc">仅能修改本人密码，用户名不可修改。</p>
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
      </div>
    </section>

    <section class="vu-section vu-section--muted">
      <div class="vu-container">
        <button
          class="vu-collapse__head"
          type="button"
          :aria-expanded="panels.cards"
          @click="panels.cards = !panels.cards"
        >
          <span class="vu-kicker">LIFE CARDS</span>
          <span class="vu-collapse__title">我的主页卡片</span>
          <span class="vu-collapse__chev" :class="{ open: panels.cards }">▾</span>
        </button>
        <div v-show="panels.cards" class="vu-collapse__body">
          <p class="vu-collapse__desc">
            自愿记录，无点赞与排行；单条内容可设置「仅自己」或「原住民可见」。
          </p>
          <ResidentCardsPanel />
        </div>
      </div>
    </section>

    <section class="vu-section vu-section--light">
      <div class="vu-container">
        <button
          class="vu-collapse__head"
          type="button"
          :aria-expanded="panels.showcase"
          @click="panels.showcase = !panels.showcase"
        >
          <span class="vu-kicker">SHOWCASE &amp; GUESTBOOK</span>
          <span class="vu-collapse__title">展示板与留言簿</span>
          <span class="vu-collapse__chev" :class="{ open: panels.showcase }">▾</span>
        </button>
        <div v-show="panels.showcase" class="vu-collapse__body">
          <p class="vu-collapse__desc">
            展示板聚合你的公开内容；留言簿仅原住民可见，无点赞与排行。
          </p>
          <HomepageS2Panel />
        </div>
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
/* ===== 个人中心：苹果绿 + 白底 + 紧凑排版（仅作用于本页，不改全局逻辑） ===== */
.vu-profile-hero {
  padding: 36px 0;
  color: var(--vu-ink);
  background: #ffffff;
  border-bottom: 1px solid var(--vu-line);
}

.vu-profile-hero__inner {
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 20px;
  align-items: center;
}

.vu-profile-avatar {
  width: 64px;
  height: 64px;
  font-size: 24px;
  color: #ffffff;
  background: var(--vu-accent);
  border-color: rgba(47, 168, 79, 0.25);
}

.vu-profile-identity h1 {
  margin: 6px 0 4px;
  font-size: 28px;
  color: var(--vu-ink);
}

.vu-profile-identity p {
  margin: 0;
  color: var(--vu-muted);
  font-size: 13px;
}

.vu-profile-stats {
  gap: 24px;
}

.vu-profile-stats strong {
  font-size: 18px;
  color: var(--vu-ink);
}

.vu-profile-stats span {
  color: var(--vu-muted);
  font-size: 11px;
}

/* 整页区块收紧 */
.vu-profile .vu-section {
  padding: 30px 0;
}

.vu-profile .vu-section-header {
  margin-bottom: 18px;
  gap: 18px;
}

.vu-profile .vu-section-header h2 {
  font-size: 26px;
}

/* 折叠面板 */
.vu-collapse__head {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  text-align: left;
}

.vu-collapse__head .vu-kicker {
  margin: 0;
}

.vu-collapse__title {
  flex: 1;
  font-size: 24px;
  font-weight: 600;
  line-height: 1.15;
  letter-spacing: -0.02em;
  color: var(--vu-ink);
}

.vu-collapse__chev {
  color: var(--vu-muted);
  font-size: 16px;
  transition: transform 0.2s ease;
}

.vu-collapse__chev.open {
  transform: rotate(180deg);
  color: var(--vu-accent);
}

.vu-collapse__body {
  padding: 6px 0 14px;
}

.vu-collapse__desc {
  margin: 0 0 16px;
  color: var(--vu-muted);
  font-size: 14px;
  line-height: 1.7;
}

/* 折叠体内的卡片/表单间距微调，提升信息密度 */
.vu-collapse__body .vu-profile-scene-list {
  gap: 10px;
}

.vu-collapse__body .vu-profile-scene {
  padding: 13px 15px;
}
</style>
