<script setup>
import { computed } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { worldStore } from '../stores/worldStore.js';

const router = useRouter();
const user = computed(() => worldStore.state.user);
const isLoggedIn = computed(() => Boolean(user.value));

const logout = () => {
  worldStore.logout();
  router.push({ name: 'home' });
};
</script>

<template>
  <header class="vu-header">
    <div class="vu-container vu-header__inner">
      <RouterLink
        :to="{ name: 'home' }"
        class="vu-brand"
        aria-label="返回虚拟乌托邦首页"
      >
        <span class="vu-brand__mark" aria-hidden="true">乌</span>
        <span>
          <strong>虚拟乌托邦</strong>
          <small>VIRTUAL UTOPIA</small>
        </span>
      </RouterLink>

      <nav class="vu-nav" aria-label="主导航">
        <RouterLink :to="{ name: 'world' }" class="vu-nav__link">
          3D世界
        </RouterLink>
        <RouterLink :to="{ name: 'profile' }" class="vu-nav__link">
          个人中心
        </RouterLink>
      </nav>

      <div class="vu-header__account">
        <template v-if="isLoggedIn">
          <RouterLink :to="{ name: 'profile' }" class="vu-user-pill">
            <span class="vu-avatar" aria-hidden="true">
              {{ user.displayName.slice(0, 1) }}
            </span>
            <span>{{ user.displayName }}</span>
          </RouterLink>
          <button
            type="button"
            class="vu-icon-button"
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
        </template>

        <template v-else>
          <RouterLink
            :to="{ name: 'register' }"
            class="vu-button vu-button--light vu-button--small"
          >
            注册
          </RouterLink>
          <RouterLink
            :to="{ name: 'login' }"
            class="vu-button vu-button--light vu-button--small"
          >
            登录
          </RouterLink>
        </template>
      </div>
    </div>
  </header>
</template>
