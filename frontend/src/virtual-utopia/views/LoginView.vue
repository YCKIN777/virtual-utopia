<script setup>
import { reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { worldStore } from '../stores/worldStore.js';

const route = useRoute();
const router = useRouter();
const form = reactive({
  username: '',
  password: '',
});
const errors = reactive({
  username: '',
  password: '',
  submit: '',
});
const loading = ref(false);

const validate = () => {
  errors.username = '';
  errors.password = '';
  errors.submit = '';

  if (!form.username.trim()) {
    errors.username = '请输入用户名';
  } else if (form.username.trim().length < 3) {
    errors.username = '用户名至少需要 3 个字符';
  }

  if (!form.password) {
    errors.password = '请输入密码';
  } else if (form.password.length < 6) {
    errors.password = '密码至少需要 6 个字符';
  }

  return !errors.username && !errors.password;
};

const submit = async () => {
  if (!validate()) {
    return;
  }

  loading.value = true;

  try {
    await worldStore.login({
      username: form.username.trim(),
      password: form.password,
    });
    const redirect =
      typeof route.query.redirect === 'string'
        ? route.query.redirect
        : '/profile';
    await router.replace(redirect);
  } catch (error) {
    errors.submit = error.message || '登录失败';
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <main class="vu-login-page">
    <section class="vu-login-visual">
      <div class="vu-login-visual__copy">
        <span class="vu-kicker">RESIDENT ACCESS</span>
        <h1>进入你的乌托邦档案</h1>
        <p>登录后通过 Phase6 网关连接 Phase5；服务不可用时自动回退内存模式。</p>
      </div>
    </section>

    <section class="vu-login-panel">
      <div class="vu-login-panel__inner">
        <RouterLink :to="{ name: 'home' }" class="vu-login-back">
          返回门户
        </RouterLink>

        <div class="vu-login-heading">
          <span class="vu-brand__mark" aria-hidden="true">乌</span>
          <div>
            <span class="vu-kicker">SIGN IN</span>
            <h2>居民登录</h2>
          </div>
        </div>

        <form class="vu-form" novalidate @submit.prevent="submit">
          <label class="vu-field">
            <span>用户名</span>
            <input
              v-model="form.username"
              autocomplete="username"
              placeholder="traveler"
              :aria-invalid="Boolean(errors.username)"
              :disabled="loading"
            />
            <small v-if="errors.username" class="vu-field__error">
              {{ errors.username }}
            </small>
          </label>

          <label class="vu-field">
            <span>密码</span>
            <input
              v-model="form.password"
              type="password"
              autocomplete="current-password"
              placeholder="utopia2026"
              :aria-invalid="Boolean(errors.password)"
              :disabled="loading"
            />
            <small v-if="errors.password" class="vu-field__error">
              {{ errors.password }}
            </small>
          </label>

          <p v-if="errors.submit" class="vu-form__error" role="alert">
            {{ errors.submit }}
          </p>

          <button
            type="submit"
            class="vu-button vu-button--accent vu-button--wide"
            :disabled="loading"
          >
            <span v-if="loading" class="vu-spinner" aria-hidden="true" />
            {{ loading ? '正在登录' : '登录' }}
          </button>
        </form>

        <div class="vu-demo-account">
          <span>演示账号</span>
          <strong>traveler / utopia2026</strong>
        </div>
      </div>
    </section>
  </main>
</template>
