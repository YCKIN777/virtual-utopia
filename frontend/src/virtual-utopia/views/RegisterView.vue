<script setup>
import { reactive, ref } from 'vue';
import { RouterLink } from 'vue-router';
import WorldPreview from '../components/WorldPreview.vue';
import { worldStore } from '../stores/worldStore.js';

const form = reactive({
  username: '',
  displayName: '',
  password: '',
  confirm: '',
  hobbies: '',
  occupation: '',
  selfIntro: '',
  contact: '',
  address: '',
});
const errors = reactive({
  username: '',
  displayName: '',
  password: '',
  confirm: '',
  submit: '',
});
const loading = ref(false);
const submitted = ref(false);

const validate = () => {
  errors.username = '';
  errors.displayName = '';
  errors.password = '';
  errors.confirm = '';
  errors.submit = '';

  if (!form.username.trim()) {
    errors.username = '请输入用户名（账号）';
  } else if (form.username.trim().length < 3) {
    errors.username = '用户名至少需要 3 个字符';
  } else if (!/^[a-zA-Z0-9_]+$/.test(form.username.trim())) {
    errors.username = '用户名只能包含字母、数字和下划线';
  }

  if (!form.displayName.trim()) {
    errors.displayName = '请输入昵称';
  } else if (form.displayName.trim().length < 2 || form.displayName.trim().length > 24) {
    errors.displayName = '昵称需为 2~24 个字符';
  }

  if (!form.password) {
    errors.password = '请设置密码';
  } else if (form.password.length < 6) {
    errors.password = '密码至少需要 6 个字符';
  }

  if (!form.confirm) {
    errors.confirm = '请再次输入密码';
  } else if (form.confirm !== form.password) {
    errors.confirm = '两次输入的密码不一致';
  }

  return !errors.username && !errors.displayName && !errors.password && !errors.confirm;
};

const submit = async () => {
  if (!validate()) {
    return;
  }

  loading.value = true;
  errors.submit = '';

  const result = await worldStore.registerResidentApplication({
    username: form.username.trim(),
    displayName: form.displayName.trim(),
    password: form.password,
    hobbies: form.hobbies.trim(),
    occupation: form.occupation.trim(),
    selfIntro: form.selfIntro.trim(),
    contact: form.contact.trim(),
    address: form.address.trim(),
  });

  loading.value = false;

  if (!result.ok) {
    const message = result.error || '提交申请失败';

    // 定位到对应字段（服务端唯一校验错误）
    if (message.includes('用户名')) {
      errors.username = message;
    } else if (message.includes('昵称')) {
      errors.displayName = message;
    } else {
      errors.submit = message;
    }

    return;
  }

  submitted.value = true;
};
</script>

<template>
  <main class="vu-login-page">
    <section class="vu-login-visual">
      <WorldPreview />
      <div class="vu-login-visual__copy">
        <span class="vu-kicker">RESIDENCY</span>
        <h1>加入乌托邦</h1>
        <p class="vu-login-visual__subtitle">
          提交原住民入驻申请，经 KIN 审核通过后入驻山林庄园。
        </p>
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
            <span class="vu-kicker">APPLY</span>
            <h2>提交入驻申请</h2>
          </div>
        </div>

        <div v-if="submitted" class="vu-register-done">
          <strong>申请已提交，等待 KIN 审核</strong>
          <p>
            审核通过后即可使用该账号登录进入乌托邦世界。审核期间无法登录，用户名与昵称一经提交不可修改。
          </p>
          <RouterLink
            :to="{ name: 'login' }"
            class="vu-button vu-button--accent vu-button--wide"
          >
            返回登录
          </RouterLink>
        </div>

        <form v-else class="vu-form" novalidate @submit.prevent="submit">
          <label class="vu-field">
            <span>账号（用户名）<b class="vu-req">*</b></span>
            <input
              v-model="form.username"
              autocomplete="username"
              placeholder="设置登录账号，字母/数字/下划线"
              :aria-invalid="Boolean(errors.username)"
              :disabled="loading"
            />
            <small v-if="errors.username" class="vu-field__error">
              {{ errors.username }}
            </small>
          </label>

          <label class="vu-field">
            <span>昵称<b class="vu-req">*</b></span>
            <input
              v-model="form.displayName"
              autocomplete="nickname"
              placeholder="对外展示的昵称，提交后固定"
              :aria-invalid="Boolean(errors.displayName)"
              :disabled="loading"
            />
            <small v-if="errors.displayName" class="vu-field__error">
              {{ errors.displayName }}
            </small>
          </label>

          <label class="vu-field">
            <span>密码<b class="vu-req">*</b></span>
            <input
              v-model="form.password"
              type="password"
              autocomplete="new-password"
              placeholder="至少 6 个字符"
              :aria-invalid="Boolean(errors.password)"
              :disabled="loading"
            />
            <small v-if="errors.password" class="vu-field__error">
              {{ errors.password }}
            </small>
          </label>

          <label class="vu-field">
            <span>确认密码<b class="vu-req">*</b></span>
            <input
              v-model="form.confirm"
              type="password"
              autocomplete="new-password"
              placeholder="再次输入密码"
              :aria-invalid="Boolean(errors.confirm)"
              :disabled="loading"
            />
            <small v-if="errors.confirm" class="vu-field__error">
              {{ errors.confirm }}
            </small>
          </label>

          <label class="vu-field">
            <span>爱好（选填）</span>
            <input
              v-model="form.hobbies"
              placeholder="例如：园艺、徒步、读书"
              :disabled="loading"
            />
          </label>

          <label class="vu-field">
            <span>职业（选填）</span>
            <input
              v-model="form.occupation"
              placeholder="例如：木匠、园丁"
              :disabled="loading"
            />
          </label>

          <label class="vu-field">
            <span>自我介绍（选填）</span>
            <textarea
              v-model="form.selfIntro"
              rows="3"
              maxlength="500"
              placeholder="向邻里介绍一下自己"
              :disabled="loading"
            />
          </label>

          <label class="vu-field">
            <span>联系标识（选填 · 仅 KIN 后台可见）</span>
            <input
              v-model="form.contact"
              placeholder="例如：通讯号 / 邮箱"
              :disabled="loading"
            />
          </label>

          <label class="vu-field">
            <span>家庭住址（选填 · 仅 KIN 后台可见）</span>
            <input
              v-model="form.address"
              placeholder="联系地址"
              :disabled="loading"
            />
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
            {{ loading ? '正在提交' : '提交入驻申请' }}
          </button>
        </form>

        <div class="vu-demo-account">
          <span>已是居民？</span>
          <RouterLink :to="{ name: 'login' }" class="vu-inline-link">
            前往登录
          </RouterLink>
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

.vu-register-done {
  display: grid;
  gap: 12px;
  padding: 22px 0;
  text-align: center;
}

.vu-register-done strong {
  font-size: 18px;
}

.vu-register-done p {
  margin: 0;
  color: rgba(244, 246, 245, 0.7);
  font-size: 14px;
  line-height: 1.6;
}

.vu-field__hint {
  color: rgba(244, 246, 245, 0.45);
}

.vu-inline-link {
  color: var(--vu-accent, #bfe8d2);
  text-decoration: none;
  font-weight: 600;
}

.vu-req {
  color: #f2a6a0;
  font-weight: 700;
  margin-left: 2px;
}

.vu-form textarea {
  padding: 10px 12px;
  border: 1px solid rgba(244, 246, 245, 0.16);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  color: #f4f6f5;
  font-size: 14px;
  resize: vertical;
}
</style>
