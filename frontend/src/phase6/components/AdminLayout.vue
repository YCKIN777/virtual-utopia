<script setup>
import { computed } from 'vue';
import { RouterLink, RouterView, useRouter } from 'vue-router';
import { authStore } from '../stores/authStore.js';

const router = useRouter();
const user = computed(() => authStore.state.user);
const roleLabel = computed(() => {
  const labels = {
    admin: '管理员',
    editor: '编辑者',
    viewer: '只读用户',
  };

  return labels[user.value?.role] || user.value?.role || '';
});

const logout = async () => {
  await authStore.logout();
  await router.replace({ name: 'login' });
};
</script>

<template>
  <div class="phase6-shell">
    <header class="phase6-header">
      <div class="phase6-header__inner">
        <div class="phase6-brand">
          <span class="phase6-brand__mark" aria-hidden="true">乌</span>
          <span>虚拟乌托邦管理台</span>
        </div>

        <nav class="phase6-nav" aria-label="管理台导航">
          <RouterLink :to="{ name: 'documents' }" class="phase6-nav__link">
            文档管理
          </RouterLink>
          <RouterLink :to="{ name: 'sessions' }" class="phase6-nav__link">
            历史会话
          </RouterLink>
        </nav>

        <div class="phase6-account">
          <div class="phase6-account__identity">
            <strong>{{ user?.displayName || user?.username }}</strong>
            <span>{{ roleLabel }}</span>
          </div>
          <button
            type="button"
            class="phase6-icon-button"
            aria-label="退出登录"
            title="退出登录"
            @click="logout"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              aria-hidden="true"
            >
              <path d="M10 17l5-5-5-5" />
              <path d="M15 12H3" />
              <path d="M15 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
            </svg>
          </button>
        </div>
      </div>
    </header>

    <main class="phase6-main">
      <RouterView />
    </main>
  </div>
</template>
