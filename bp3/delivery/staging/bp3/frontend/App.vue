<script setup>
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { ThreeWorld } from '@bp2-world/ThreeWorld.js';
import HomeAccessPanel from './components/HomeAccessPanel.vue';
import VisitorRequestDialog from './components/VisitorRequestDialog.vue';
import VoicePanel from './components/VoicePanel.vue';
import { createBp3Client, loginPhase5 } from './services/bp3Client.js';

const tokenKey = 'virtual-utopia.phase5.token';
const worldContainer = ref(null);
const token = ref(sessionStorage.getItem(tokenKey) || '');
const user = ref(null);
const api = ref(null);
const homePlotId = ref('');
const selectedPlotId = ref('');
const showRequestDialog = ref(false);
const loading = reactive({
  world: true,
  progress: 0,
  message: '准备山林庄园',
});
const stats = reactive({
  homes: 0,
  trees: 0,
});
const loginForm = reactive({
  username: 'traveler',
  password: 'utopia2026',
  busy: false,
  error: '',
});
let world = null;

const initializeWorld = async () => {
  if (!worldContainer.value || world) {
    return;
  }

  try {
    world = new ThreeWorld(worldContainer.value, {
      onProgress: ({ progress, message }) => {
        loading.progress = progress;
        loading.message = message;
        loading.world = progress < 1;
      },
      onStats: (nextStats) => {
        stats.homes = nextStats.homes;
        stats.trees = nextStats.trees;
      },
    });
    await world.init();
    loading.world = false;
  } catch (error) {
    loading.world = false;
    loginForm.error = error.message || 'Three.js 世界初始化失败';
  }
};

const restoreIdentity = async () => {
  if (!token.value) {
    return;
  }

  const client = createBp3Client({
    token: token.value,
  });

  try {
    user.value = await client.me();
    api.value = client;
    const home = await client.myHome();

    homePlotId.value = home.plotId;
    selectedPlotId.value = home.plotId;
  } catch (error) {
    sessionStorage.removeItem(tokenKey);
    token.value = '';
    user.value = null;
    api.value = null;
  }
};

const login = async () => {
  loginForm.busy = true;
  loginForm.error = '';

  try {
    const session = await loginPhase5({
      username: loginForm.username.trim(),
      password: loginForm.password,
    });

    token.value = session.token;
    sessionStorage.setItem(tokenKey, session.token);
    await restoreIdentity();
  } catch (error) {
    loginForm.error = error.message || '登录失败';
  } finally {
    loginForm.busy = false;
  }
};

const logout = async () => {
  sessionStorage.removeItem(tokenKey);
  token.value = '';
  user.value = null;
  api.value = null;
  homePlotId.value = '';
  selectedPlotId.value = '';
};

onMounted(async () => {
  await initializeWorld();
  await restoreIdentity();
});

onBeforeUnmount(() => {
  world?.dispose();
  world = null;
});
</script>

<template>
  <main class="bp3-world">
    <div ref="worldContainer" class="bp3-world__canvas" />

    <header class="bp3-world__header">
      <div>
        <span class="bp3-kicker">VIRTUAL UTOPIA · BP3 M1</span>
        <h1>五十户山林庄园城镇</h1>
      </div>
      <div class="bp3-world__stats">
        <span>{{ stats.homes }}/50 庄园</span>
        <span>{{ stats.trees }} 树木实例</span>
        <span v-if="user">{{ user.displayName }}</span>
      </div>
    </header>

    <section v-if="loading.world" class="bp3-loading">
      <strong>{{ loading.message }}</strong>
      <span>{{ Math.round(loading.progress * 100) }}%</span>
    </section>

    <section v-if="!user" class="bp3-login">
      <span class="bp3-kicker">PHASE5 IDENTITY</span>
      <h2>进入 BP3 世界</h2>
      <form @submit.prevent="login">
        <label>
          <span>用户名</span>
          <input v-model="loginForm.username" autocomplete="username" />
        </label>
        <label>
          <span>密码</span>
          <input
            v-model="loginForm.password"
            type="password"
            autocomplete="current-password"
          />
        </label>
        <p v-if="loginForm.error" class="bp3-error">
          {{ loginForm.error }}
        </p>
        <button
          type="submit"
          class="bp3-button is-primary"
          :disabled="loginForm.busy"
        >
          {{ loginForm.busy ? '登录中' : '登录' }}
        </button>
      </form>
    </section>

    <template v-if="user && api">
      <aside class="bp3-overlay bp3-overlay--left">
        <VoicePanel :api="api" :user="user" />
      </aside>

      <aside class="bp3-overlay bp3-overlay--right">
        <div class="bp3-home-toolbar">
          <label>
            <span>地块</span>
            <input v-model="selectedPlotId" placeholder="plot-1" />
          </label>
          <button
            type="button"
            class="bp3-button"
            @click="showRequestDialog = true"
          >
            访客申请
          </button>
          <button type="button" class="bp3-button" @click="logout">退出</button>
        </div>
        <HomeAccessPanel
          :api="api"
          :user="user"
          :plot-id="selectedPlotId || homePlotId"
        />
      </aside>
    </template>

    <VisitorRequestDialog
      v-if="api"
      :api="api"
      :open="showRequestDialog"
      @close="showRequestDialog = false"
    />
  </main>
</template>
