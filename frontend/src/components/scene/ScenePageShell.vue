<script setup>
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import BaseButton from '../ui/BaseButton.vue';
import BaseCard from '../ui/BaseCard.vue';
import BaseInput from '../ui/BaseInput.vue';
import { useToast } from '../../composables/useToast.js';
import { authStore } from '../../stores/authStore.js';

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
  showLogin.value = true;
};

const closeLogin = () => {
  if (loggingIn.value) return;
  showLogin.value = false;
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
  <Teleport to="body">
    <div
      v-if="showLogin"
      class="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4"
      @click.self="closeLogin"
    >
      <form
        class="w-full max-w-sm rounded-hig border border-line bg-surface p-5 shadow-lg"
        @submit.prevent="submitLogin"
      >
        <div class="flex items-center justify-between gap-2">
          <h2 class="text-base font-semibold text-ink">登录（复用乌托邦账号）</h2>
          <BaseButton
            size="sm"
            variant="ghost"
            aria-label="关闭登录弹窗"
            @click="closeLogin"
          >
            ✕
          </BaseButton>
        </div>
        <p class="mt-1 text-xs leading-5 text-muted">
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
      </form>
    </div>
  </Teleport>
</template>
