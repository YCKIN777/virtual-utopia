<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { seedResidents } from '../data/residents.js';
import { worldStore } from '../stores/worldStore.js';

const props = defineProps({
  username: { type: String, default: '' },
});

const route = useRoute();
const router = useRouter();

const currentUser = computed(() => worldStore.state.user);
const role = computed(() => worldStore.state.permissions?.role || 'viewer');

const targetUsername = computed(() => props.username || String(route.params.username || ''));

// 身份：self（本人）/ visitor（未登录游客 或 role=viewer 访客）/ resident（其他原住民）
const isSelf = computed(
  () => Boolean(currentUser.value) && currentUser.value.username === targetUsername.value,
);
const isVisitor = computed(() => !currentUser.value || role.value === 'viewer');

const resident = ref(null);
const board = computed(() => worldStore.state.board);
const loading = ref(true);
const errorMessage = ref('');

const displayName = computed(
  () => resident.value?.displayName || resident.value?.username || targetUsername.value,
);

const identityLabel = computed(() => {
  const name = resident.value?.displayName;
  if (!name) return '';
  return seedResidents.some((r) => r.residentName === name) ? 'AI 居民' : '真人';
});

const formatDate = (value) => {
  if (!value) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
};

const load = async () => {
  loading.value = true;
  errorMessage.value = '';
  if (!currentUser.value) {
    loading.value = false;
    return;
  }

  const dirRes = await worldStore.listResidentDirectory();
  if (!dirRes.ok) {
    loading.value = false;
    errorMessage.value = dirRes.error || '加载居民资料失败';
    return;
  }

  resident.value =
    dirRes.residents.find((item) => item.username === targetUsername.value) || null;

  if (!resident.value) {
    loading.value = false;
    errorMessage.value = '未找到该居民';
    return;
  }

  // 访客仅加载公开「简介」；作品/公开内容对访客不加载、不渲染
  if (!isVisitor.value) {
    await worldStore.loadResidentBoard(resident.value.userId);
  }
  loading.value = false;
};

const goBack = () => {
  if (window.history.length > 1) {
    router.back();
  } else {
    router.push({ name: 'profile' });
  }
};

// 本人访问自己的对外主页 → 回到个人中心
watch(
  isSelf,
  (self) => {
    if (self && currentUser.value) {
      router.replace({ name: 'profile' });
    }
  },
  { immediate: true },
);

onMounted(load);
watch(() => targetUsername.value, load);
</script>

<template>
  <main v-if="!currentUser" class="rp-guest">
    <div class="rp-guest__box">
      <span class="rp-kicker">PROFILE REQUIRED</span>
      <h1>登录后查看居民主页</h1>
      <RouterLink :to="{ name: 'login', query: { redirect: route.fullPath } }" class="rp-btn rp-btn--primary">
        前往登录
      </RouterLink>
    </div>
  </main>

  <main v-else class="rp-page">
    <div class="rp-container">
      <button type="button" class="rp-back" @click="goBack">← 返回</button>

      <div v-if="loading" class="rp-empty">正在加载居民资料……</div>

      <div v-else-if="errorMessage" class="rp-empty">{{ errorMessage }}</div>

      <template v-else>
        <header class="rp-topbar">
          <div class="rp-avatar" aria-hidden="true">{{ displayName.slice(0, 1) }}</div>
          <div class="rp-topbar__info">
            <h1 class="rp-topbar__name">{{ displayName }}</h1>
            <div class="rp-topbar__meta">
              <span class="rp-tag" :class="identityLabel === 'AI 居民' ? 'rp-tag--ai' : 'rp-tag--human'">
                {{ identityLabel }}
              </span>
              <span class="rp-at">@{{ resident.username }}</span>
              <span v-if="resident.homePlotId" class="rp-at">· {{ resident.homePlotId }}</span>
            </div>
          </div>
        </header>

        <!-- 访客可见范围提示 -->
        <p v-if="isVisitor" class="rp-scope">
          访客可见范围：仅展示对方的公开简介
        </p>

        <!-- 简介：所有已登录身份可见 -->
        <section class="rp-card">
          <h2 class="rp-card__title">简介</h2>
          <p class="rp-intro">{{ resident.selfIntro || '（这位居民还没有写下简介）' }}</p>
          <div class="rp-meta">
            <span v-if="resident.occupation">职业：{{ resident.occupation }}</span>
            <span v-if="resident.hobbies">爱好：{{ resident.hobbies }}</span>
          </div>
        </section>

        <!-- 作品/公开内容：仅原住民可见；访客不渲染 -->
        <section v-if="!isVisitor" class="rp-card">
          <h2 class="rp-card__title">{{ displayName }}·公开作品</h2>
          <p class="rp-card__sub">仅展示对方标记为「原住民可见」的公开内容</p>
          <div v-if="!board.items.length" class="rp-empty rp-empty--inline">
            对方暂无公开作品
          </div>
          <div v-else class="rp-list">
            <article v-for="item in board.items" :key="item.id" class="rp-item">
              <div class="rp-item__head">
                <strong>{{ item.content?.title || '（无标题）' }}</strong>
              </div>
              <p v-if="item.content?.body" class="rp-item__body">{{ item.content.body }}</p>
              <small class="rp-item__time">{{ formatDate(item.createdAt) }}</small>
            </article>
          </div>
        </section>
        <!-- 「备忘」模块对他人一律不渲染（无 DOM、无占位） -->
      </template>
    </div>
  </main>
</template>

<style scoped>
.rp-page {
  background: var(--vu-paper, #fbfbfd);
  color: var(--vu-ink, #1d1d1f);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  min-height: 100vh;
  padding: 24px 0 48px;
}

.rp-container {
  max-width: 720px;
  margin: 0 auto;
  padding: 0 20px;
  display: grid;
  gap: 18px;
}

.rp-back {
  justify-self: start;
  border: none;
  background: transparent;
  color: var(--vu-accent-dark, #258a41);
  font-size: 14px;
  cursor: pointer;
  padding: 4px 0;
}

.rp-scope {
  margin: 0;
  padding: 10px 14px;
  border-radius: 10px;
  background: rgba(47, 168, 79, 0.08);
  color: var(--vu-accent-dark, #258a41);
  font-size: 13px;
}

.rp-topbar {
  display: flex;
  align-items: center;
  gap: 16px;
}

.rp-avatar {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 24px;
  font-weight: 600;
  color: #fff;
  background: var(--vu-accent, #2fa84f);
  flex-shrink: 0;
}

.rp-topbar__info {
  flex: 1;
  min-width: 0;
}

.rp-topbar__name {
  margin: 0 0 4px;
  font-size: 24px;
  font-weight: 600;
}

.rp-topbar__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.rp-tag {
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
}

.rp-tag--ai {
  background: rgba(47, 168, 79, 0.12);
  color: var(--vu-accent-dark, #258a41);
}

.rp-tag--human {
  background: var(--vu-muted-surface, #f1f1f4);
  color: var(--vu-muted, #6e6e73);
}

.rp-at {
  font-size: 13px;
  color: var(--vu-muted, #6e6e73);
}

.rp-card {
  background: #fff;
  border: 1px solid var(--vu-line, #e3e3e8);
  border-radius: 18px;
  padding: 22px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.rp-card__title {
  margin: 0 0 6px;
  font-size: 20px;
  font-weight: 600;
}

.rp-card__sub {
  margin: 0 0 14px;
  font-size: 12px;
  color: var(--vu-muted, #6e6e73);
}

.rp-intro {
  margin: 0 0 12px;
  font-size: 15px;
  line-height: 1.7;
  color: var(--vu-ink-soft, #424245);
}

.rp-meta {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  color: var(--vu-muted, #6e6e73);
  font-size: 13px;
}

.rp-list {
  display: grid;
  gap: 10px;
}

.rp-item {
  display: grid;
  gap: 6px;
  padding: 14px 16px;
  border: 1px solid var(--vu-line, #e3e3e8);
  border-radius: 12px;
}

.rp-item__head strong {
  font-size: 15px;
}

.rp-item__body {
  margin: 0;
  color: var(--vu-ink-soft, #424245);
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.rp-item__time {
  color: var(--vu-muted, #6e6e73);
  font-size: 12px;
}

.rp-empty {
  padding: 28px;
  text-align: center;
  color: var(--vu-muted, #6e6e73);
  border: 1px dashed var(--vu-line, #e3e3e8);
  border-radius: 12px;
  font-size: 13px;
}

.rp-empty--inline {
  padding: 20px;
}

.rp-btn {
  padding: 9px 18px;
  border: 1px solid var(--vu-line, #e3e3e8);
  border-radius: 999px;
  background: transparent;
  color: var(--vu-ink-soft, #424245);
  cursor: pointer;
  font-size: 14px;
  font-family: inherit;
}

.rp-btn--primary {
  background: var(--vu-accent, #2fa84f);
  color: #fff;
  border-color: transparent;
  font-weight: 600;
}

.rp-guest {
  min-height: 60vh;
  display: grid;
  place-items: center;
  background: var(--vu-paper, #fbfbfd);
  color: var(--vu-ink, #1d1d1f);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
}

.rp-guest__box {
  display: grid;
  gap: 12px;
  justify-items: center;
  text-align: center;
}

.rp-guest__box h1 {
  margin: 0;
  font-size: 24px;
}

.rp-kicker {
  font-size: 12px;
  letter-spacing: 1px;
  color: var(--vu-muted, #6e6e73);
}
</style>
