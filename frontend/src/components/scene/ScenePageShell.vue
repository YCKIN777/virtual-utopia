<script setup>
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import BaseButton from '../ui/BaseButton.vue';
import BaseCard from '../ui/BaseCard.vue';
import BaseInput from '../ui/BaseInput.vue';
import { useToast } from '../../composables/useToast.js';
import { authStore } from '../../stores/authStore.js';
import { sceneApi } from '../../services/sceneApi.js';

defineProps({
  title: {
    type: String,
    required: true,
  },
  sceneKey: {
    type: String,
    required: true,
  },
});

const router = useRouter();
const toast = useToast();

const showLogin = ref(false);
const loggingIn = ref(false);
const loginForm = reactive({ username: '', password: '' });

// 待办⑤：登录/注册双 tab + 图形验证码（注册防滥用）。
const loginMode = ref('login'); // 'login' | 'register'
const registerForm = reactive({
  username: '',
  displayName: '',
  password: '',
  confirmPassword: '',
  captchaId: '',
  captchaAnswer: '',
});
const captchaImage = ref('');
const captchaLoading = ref(false);
const registering = ref(false);

const returnToMap = () => {
  router.push({ name: 'map' });
};

// P4 收尾：进入任意场景页时恢复登录态（token 存在则调 phase6 /auth/me 校验）。
onMounted(() => {
  authStore.ensureSession();
});

const openLogin = () => {
  loginForm.username = '';
  loginForm.password = '';
  authStore.state.error = '';
  loginMode.value = 'login';
  showLogin.value = true;
};

const closeLogin = () => {
  if (loggingIn.value || registering.value) return;
  showLogin.value = false;
};

const loadCaptcha = async () => {
  captchaLoading.value = true;

  try {
    const { captchaId, image } = await sceneApi.getCaptcha();
    registerForm.captchaId = captchaId;
    registerForm.captchaAnswer = '';
    captchaImage.value = image;
  } catch (error) {
    toast.error(error.message || '验证码加载失败', { title: '注册' });
  } finally {
    captchaLoading.value = false;
  }
};

const switchMode = (mode) => {
  loginMode.value = mode;
  authStore.state.error = '';

  if (mode === 'register') {
    registerForm.username = '';
    registerForm.displayName = '';
    registerForm.password = '';
    registerForm.confirmPassword = '';
    registerForm.captchaAnswer = '';
    loadCaptcha();
  }
};

const submitLogin = async () => {
  if (!loginForm.username.trim() || !loginForm.password || loggingIn.value) {
    return;
  }

  loggingIn.value = true;

  try {
    await authStore.login({
      username: loginForm.username.trim(),
      password: loginForm.password,
    });
    showLogin.value = false;
    toast.success('登录成功');
  } catch (error) {
    toast.error(error.message || '登录失败', { title: '登录' });
  } finally {
    loggingIn.value = false;
  }
};

const submitRegister = async () => {
  if (registering.value) return;

  const username = registerForm.username.trim();
  const displayName = registerForm.displayName.trim();

  if (!/^[a-zA-Z0-9_]{3,}$/.test(username)) {
    toast.error('用户名需至少 3 位，仅字母/数字/下划线', { title: '注册' });
    return;
  }

  if (displayName.length < 2 || displayName.length > 24) {
    toast.error('昵称需为 2-24 个字符', { title: '注册' });
    return;
  }

  if (registerForm.password.length < 6) {
    toast.error('密码至少 6 个字符', { title: '注册' });
    return;
  }

  if (registerForm.password !== registerForm.confirmPassword) {
    toast.error('两次输入的密码不一致', { title: '注册' });
    return;
  }

  if (!registerForm.captchaAnswer.trim()) {
    toast.error('请输入验证码', { title: '注册' });
    return;
  }

  registering.value = true;

  try {
    await sceneApi.register({
      username,
      password: registerForm.password,
      displayName,
      captchaId: registerForm.captchaId,
      captchaAnswer: registerForm.captchaAnswer.trim(),
    });
    toast.success('入驻申请已提交，待 KIN 审批激活后可登录', { title: '注册' });
    switchMode('login');
    loginForm.username = username;
  } catch (error) {
    toast.error(error.message || '注册失败', { title: '注册' });
    // 验证码错误/过期：自动刷新一张新验证码
    if (error.code === 'CAPTCHA_INVALID' || error.code === 'CAPTCHA_ERROR') {
      loadCaptcha();
    }
  } finally {
    registering.value = false;
  }
};

const handleLogout = async () => {
  await authStore.logout();
  toast.info('已退出登录');
};
</script>

<template>
  <main class="page-container py-6 sm:py-8">
    <div class="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="text-xs font-medium uppercase tracking-[0.16em] text-muted">
          {{ sceneKey }}
        </p>
        <h1
          class="mt-1 text-2xl font-semibold tracking-normal text-ink sm:text-3xl"
        >
          {{ title }}
        </h1>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <!-- P4 收尾：真实认证身份栏（未登录=游客，写入/审批被角色矩阵拒绝） -->
        <div
          class="flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs"
          :class="
            authStore.isAuthenticated.value
              ? 'border-line bg-surface-muted/60 text-ink'
              : 'border-dashed border-line bg-surface text-muted'
          "
        >
          <span
            class="inline-block h-1.5 w-1.5 rounded-full"
            :class="
              authStore.isAuthenticated.value ? 'bg-emerald-500' : 'bg-muted/50'
            "
            aria-hidden="true"
          />
          <template v-if="authStore.isAuthenticated.value">
            <span class="font-medium">{{
              authStore.state.user?.displayName
            }}</span>
            <span class="text-muted">· {{ authStore.roleLabel.value }}</span>
            <BaseButton size="sm" variant="ghost" @click="handleLogout">
              退出
            </BaseButton>
          </template>
          <template v-else>
            <span>游客模式（登录后可执行写入操作）</span>
            <BaseButton size="sm" variant="secondary" @click="openLogin">
              登录
            </BaseButton>
          </template>
        </div>

        <BaseButton variant="secondary" size="sm" @click="returnToMap">
          <svg
            viewBox="0 0 24 24"
            class="h-4 w-4"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            aria-hidden="true"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
          返回地图
        </BaseButton>
      </div>
    </div>

    <BaseCard :padded="false" elevated>
      <div
        class="grid min-h-[480px] gap-px bg-line/70 lg:grid-cols-[minmax(0,1fr)_360px]"
      >
        <section class="bg-surface p-5 sm:p-7">
          <slot name="primary">
            <div
              class="h-full min-h-[360px] rounded-hig border border-dashed border-line bg-surface-muted/45"
              aria-label="主内容插槽"
            />
          </slot>
        </section>

        <aside class="bg-surface p-5 sm:p-7">
          <slot name="aside">
            <div
              class="h-full min-h-[280px] rounded-hig border border-dashed border-line bg-surface-muted/45"
              aria-label="侧内容插槽"
            />
          </slot>
        </aside>
      </div>

      <template v-if="$slots.footer" #footer>
        <slot name="footer" />
      </template>
    </BaseCard>
  </main>

  <!-- P4 收尾：登录弹窗（复用 phase6 账号体系；密码前端 sha256，与主世界一致） -->
  <!-- 待办⑤：登录/注册双 tab；注册需图形验证码，提交后 pending 等 KIN 审批激活 -->
  <Teleport to="body">
    <div
      v-if="showLogin"
      class="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4"
      @click.self="closeLogin"
    >
      <form
        class="w-full max-w-sm rounded-hig border border-line bg-surface p-5 shadow-lg"
        @submit.prevent="loginMode === 'login' ? submitLogin() : submitRegister()"
      >
        <div class="flex items-center justify-between gap-2">
          <h2 class="text-base font-semibold text-ink">
            {{ loginMode === 'login' ? '登录（复用乌托邦账号）' : '注册入驻申请' }}
          </h2>
          <BaseButton
            size="sm"
            variant="ghost"
            aria-label="关闭登录弹窗"
            @click="closeLogin"
          >
            ✕
          </BaseButton>
        </div>

        <!-- tab 切换 -->
        <div class="mt-3 grid grid-cols-2 gap-1 rounded-hig bg-surface-muted/60 p-1">
          <button
            type="button"
            class="rounded-hig px-3 py-1.5 text-xs font-medium transition-colors"
            :class="
              loginMode === 'login'
                ? 'bg-surface text-ink shadow-sm'
                : 'text-muted hover:text-ink'
            "
            @click="switchMode('login')"
          >
            登录
          </button>
          <button
            type="button"
            class="rounded-hig px-3 py-1.5 text-xs font-medium transition-colors"
            :class="
              loginMode === 'register'
                ? 'bg-surface text-ink shadow-sm'
                : 'text-muted hover:text-ink'
            "
            @click="switchMode('register')"
          >
            注册
          </button>
        </div>

        <!-- 登录表单 -->
        <template v-if="loginMode === 'login'">
          <p class="mt-3 text-xs leading-5 text-muted">
            未登录以游客身份对话：AI 可查询公开信息，写入/审批操作将被拒绝。
          </p>
          <div class="mt-4 space-y-3">
            <BaseInput
              v-model="loginForm.username"
              placeholder="用户名"
              autocomplete="username"
            />
            <BaseInput
              v-model="loginForm.password"
              type="password"
              placeholder="密码"
              autocomplete="current-password"
            />
            <p
              v-if="authStore.state.error"
              class="rounded-hig bg-red-50 px-3 py-2 text-xs text-red-700"
              role="alert"
            >
              {{ authStore.state.error }}
            </p>
            <BaseButton
              type="submit"
              variant="primary"
              class="w-full"
              :disabled="
                loggingIn || !loginForm.username.trim() || !loginForm.password
              "
            >
              {{ loggingIn ? '登录中…' : '登录' }}
            </BaseButton>
          </div>
        </template>

        <!-- 注册表单 -->
        <template v-else>
          <p class="mt-3 text-xs leading-5 text-muted">
            提交居民入驻申请（editor 角色），由 KIN 审批激活后可登录并使用写入类操作。
          </p>
          <div class="mt-4 space-y-3">
            <BaseInput
              v-model="registerForm.username"
              placeholder="用户名（≥3 位，字母/数字/下划线）"
              autocomplete="username"
            />
            <BaseInput
              v-model="registerForm.displayName"
              placeholder="昵称（2-24 个字符）"
            />
            <BaseInput
              v-model="registerForm.password"
              type="password"
              placeholder="密码（至少 6 位）"
              autocomplete="new-password"
            />
            <BaseInput
              v-model="registerForm.confirmPassword"
              type="password"
              placeholder="确认密码"
              autocomplete="new-password"
            />
            <div class="flex items-stretch gap-2">
              <BaseInput
                v-model="registerForm.captchaAnswer"
                placeholder="验证码"
                class="min-w-0 flex-1"
                :disabled="captchaLoading"
              />
              <button
                type="button"
                class="shrink-0 overflow-hidden rounded-hig border border-line bg-surface-muted/60"
                :title="'点击刷新验证码'"
                :aria-label="'刷新验证码'"
                :disabled="captchaLoading"
                @click="loadCaptcha"
              >
                <img
                  v-if="captchaImage"
                  :src="captchaImage"
                  alt="验证码"
                  class="h-10 w-32 object-cover"
                />
                <span v-else class="block h-10 w-32 leading-10 text-center text-xs text-muted">
                  {{ captchaLoading ? '加载中…' : '点击获取' }}
                </span>
              </button>
            </div>
            <BaseButton
              type="submit"
              variant="primary"
              class="w-full"
              :disabled="registering"
            >
              {{ registering ? '提交中…' : '提交入驻申请' }}
            </BaseButton>
          </div>
        </template>
      </form>
    </div>
  </Teleport>
</template>
