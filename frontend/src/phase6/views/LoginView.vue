<script setup>
import { reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { authStore } from '../stores/authStore.js';

const route = useRoute();
const router = useRouter();
const form = reactive({
  username: '',
  password: '',
});
const loading = ref(false);
const errorMessage = ref('');
// 主世界端口提示：管理台与主世界是同源后端、不同前端 origin，会话不互通
const portHint = (() => {
  try {
    const mainWorldPort = (import.meta.env?.VITE_MAIN_WORLD_PORT) || '5199';
    return `localhost:${mainWorldPort}`;
  } catch {
    return '主世界';
  }
})();

const sha256Hex = async (value) => {
  const text = String(value ?? '');
  try {
    if (globalThis.crypto?.subtle) {
      const data = new TextEncoder().encode(text);
      const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
    }
  } catch {
    // 降级
  }
  return text;
};

const submit = async () => {
  errorMessage.value = '';

  if (!form.username.trim() || !form.password) {
    errorMessage.value = '请输入用户名和密码';
    return;
  }

  loading.value = true;

  try {
    await authStore.login({
      username: form.username.trim(),
      password: await sha256Hex(form.password),
    });
    const redirect =
      typeof route.query.redirect === 'string'
        ? route.query.redirect
        : '/documents';
    await router.replace(redirect);
  } catch (error) {
    errorMessage.value =
      error.code === 'PHASE5_UNAUTHORIZED' || error.statusCode === 401
        ? '用户名或密码错误'
        : error.message || '登录失败';
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <main class="phase6-login-page">
    <section class="phase6-login-card">
      <div class="phase6-login-brand">
        <span class="phase6-brand__mark" aria-hidden="true">乌</span>
        <div>
          <p>VIRTUAL UTOPIA</p>
          <h1>管理台登录</h1>
        </div>
      </div>

      <p class="phase6-login-hint">
        管理台与主世界（{{ portHint }}）使用独立登录会话，请用管理员账号（KIN / admin）登录。
      </p>

      <form class="phase6-form" @submit.prevent="submit">
        <label class="phase6-field">
          <span>用户名</span>
          <input
            v-model="form.username"
            name="username"
            autocomplete="username"
            placeholder="请输入用户名"
            :disabled="loading"
          />
        </label>

        <label class="phase6-field">
          <span>密码</span>
          <input
            v-model="form.password"
            name="password"
            type="password"
            autocomplete="current-password"
            placeholder="请输入密码"
            :disabled="loading"
          />
        </label>

        <p v-if="errorMessage" class="phase6-form-error" role="alert">
          {{ errorMessage }}
        </p>

        <button
          type="submit"
          class="phase6-button phase6-button--primary phase6-button--wide"
          :disabled="loading"
        >
          <span v-if="loading" class="phase6-spinner" aria-hidden="true" />
          {{ loading ? '登录中' : '登录' }}
        </button>
      </form>
    </section>
  </main>
</template>
