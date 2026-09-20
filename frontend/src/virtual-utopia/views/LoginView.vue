<script setup>
import { reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import WorldPreview from '../components/WorldPreview.vue';
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

const queryOpen = ref(false);
const queryUsername = ref('');
const queryResult = ref(null);
const queryError = ref('');
const queryBusy = ref(false);

const STATUS_LABELS = {
  pending: '待审批',
  active: '已通过',
  disabled: '已驳回',
  moved_out: '已迁出',
};

const doQuery = async () => {
  const username = queryUsername.value.trim();

  if (!username) {
    queryError.value = '请输入申请账号';
    return;
  }

  queryBusy.value = true;
  queryError.value = '';
  queryResult.value = null;

  const result = await worldStore.queryResidentApplication(username);

  queryBusy.value = false;

  if (!result.ok) {
    queryError.value = result.error || '查询失败';
    return;
  }

  if (!result.payload?.found) {
    queryError.value = '未找到该申请账号，请确认输入是否正确';
    return;
  }

  queryResult.value = result.payload;
};
</script>

<template>
  <main class="vu-login-page">
    <section class="vu-login-visual">
      <WorldPreview />
      <div class="vu-login-visual__copy">
        <span class="vu-kicker">WORLDVIEW</span>
        <h1>虚拟乌托邦</h1>
        <p class="vu-login-visual__subtitle">一处平等、松弛的虚拟栖居空间</p>
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

        <div class="vu-login-register-entry">
          <span>还没有居民账号？</span>
          <RouterLink :to="{ name: 'register' }" class="vu-login-register-link">
            提交入驻申请
          </RouterLink>
        </div>

        <div class="vu-login-query-entry">
          <button
            type="button"
            class="vu-login-query-link"
            @click="queryOpen = !queryOpen"
          >
            {{ queryOpen ? '收起' : '查询我的申请' }}
          </button>
        </div>

        <div v-if="queryOpen" class="vu-login-query-panel">
          <div class="vu-query-form">
            <input
              v-model="queryUsername"
              placeholder="输入申请账号（用户名）"
              @keyup.enter="doQuery"
            />
            <button
              type="button"
              class="vu-button vu-button--dark vu-button--small"
              :disabled="queryBusy"
              @click="doQuery"
            >
              {{ queryBusy ? '查询中' : '查询' }}
            </button>
          </div>
          <p v-if="queryError" class="vu-form__error" role="alert">
            {{ queryError }}
          </p>
          <div
            v-if="queryResult"
            class="vu-query-result"
            :class="`vu-query-result--${queryResult.status}`"
          >
            <strong>
              申请状态：{{ STATUS_LABELS[queryResult.status] || queryResult.status }}
            </strong>
            <p v-if="queryResult.status === 'disabled' && queryResult.rejectReason">
              驳回理由：{{ queryResult.rejectReason }}
            </p>
            <p v-else-if="queryResult.status === 'active'">
              恭喜！申请已通过，可使用该账号登录进入乌托邦。
            </p>
            <p v-else-if="queryResult.status === 'pending'">
              申请正在审核中，请耐心等待 KIN 审批。
            </p>
          </div>
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
.vu-login-visual__copy {
  position: relative;
  z-index: 2;
  max-width: 620px;
  padding: 22px 26px;
  border-radius: 12px;
  background: rgba(17, 38, 31, 0.28);
}

.vu-login-visual h1 {
  margin-bottom: 12px;
  font-size: clamp(32px, 4.5vw, 50px);
}

.vu-login-visual__subtitle {
  margin: 0;
  color: rgba(255, 255, 255, 0.88);
  font-size: 17px;
  letter-spacing: 0.06em;
}

.vu-login-register-entry {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding-top: 14px;
  border-top: 1px solid rgba(244, 246, 245, 0.08);
  font-size: 13px;
  color: rgba(244, 246, 245, 0.6);
}

.vu-login-register-link {
  color: var(--vu-accent, #bfe8d2);
  text-decoration: none;
  font-weight: 600;
}

.vu-login-register-link:hover {
  text-decoration: underline;
}

.vu-login-query-entry {
  display: flex;
  justify-content: center;
  padding-top: 10px;
}

.vu-login-query-link {
  background: none;
  border: 0;
  color: rgba(244, 246, 245, 0.6);
  font-size: 13px;
  text-decoration: underline;
  cursor: pointer;
}

.vu-login-query-panel {
  display: grid;
  gap: 10px;
  margin-top: 12px;
  padding: 14px;
  border: 1px solid rgba(244, 246, 245, 0.12);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
}

.vu-query-form {
  display: flex;
  gap: 8px;
}

.vu-query-form input {
  flex: 1;
  padding: 9px 12px;
  border: 1px solid rgba(244, 246, 245, 0.16);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  color: #f4f6f5;
  font-size: 14px;
}

.vu-query-result {
  display: grid;
  gap: 4px;
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 13px;
}

.vu-query-result strong {
  font-size: 14px;
}

.vu-query-result p {
  margin: 0;
  color: rgba(244, 246, 245, 0.75);
}

.vu-query-result--pending {
  background: rgba(255, 190, 103, 0.12);
  color: #ffbe67;
}

.vu-query-result--active {
  background: rgba(191, 232, 210, 0.14);
  color: #bfe8d2;
}

.vu-query-result--disabled {
  background: rgba(242, 166, 160, 0.12);
  color: #f2a6a0;
}
</style>
