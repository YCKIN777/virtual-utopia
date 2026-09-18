<script setup>
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import * as THREE from 'three';
import { ThreeWorld } from '@bp2-world/ThreeWorld.js';
import AvatarPanel from './components/AvatarPanel.vue';
import MessageBoard from './components/MessageBoard.vue';
import { createP2Client, loginPhase5 } from './services/p2Client.js';

const tokenKey = 'virtual-utopia.phase5.token';
const worldContainer = ref(null);
const token = ref(sessionStorage.getItem(tokenKey) || '');
const user = ref(null);
const api = ref(null);
const openPanel = ref('');
const plotId = ref('plot-1');
const catalog = reactive({
  actions: [],
  emotes: [],
});
const localState = ref(null);
const onlineStates = ref([]);
const messages = ref([]);
const actionBusy = ref(false);
const toast = ref('');
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
let pollTimer = null;
let toastTimer = null;
const stateSprites = new Map();

const showToast = (message) => {
  toast.value = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.value = '';
  }, 2400);
};

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

const createStateSprite = (label, color) => {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  canvas.width = 320;
  canvas.height = 80;
  context.fillStyle = 'rgba(12, 24, 22, 0.88)';
  context.roundRect(4, 8, 312, 64, 16);
  context.fill();
  context.fillStyle = color || '#c7f0d6';
  context.font = 'bold 30px sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(label, 160, 41);

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);

  sprite.name = 'bp3-p2-state-sprite';
  sprite.scale.set(5.2, 1.3, 1);
  sprite.position.set(0, 3.35, 0);
  return sprite;
};

const clearStateSprite = (userId) => {
  const existing = stateSprites.get(userId);

  if (!existing) {
    return;
  }

  existing.parent?.remove(existing);
  existing.material.map?.dispose();
  existing.material.dispose();
  stateSprites.delete(userId);
};

const applyAvatarVisual = (userId, state) => {
  const record = world?.avatarObjects?.get(`p2-${userId}`);

  if (!record) {
    return;
  }

  clearStateSprite(userId);
  const action = catalog.actions.find(
    (candidate) => candidate.id === state?.actionId,
  );
  const emote = catalog.emotes.find(
    (candidate) => candidate.id === state?.emoteId,
  );
  const label = [action?.name, emote?.name].filter(Boolean).join(' · ');

  if (!label || (state?.actionId === 'idle' && !emote)) {
    return;
  }

  const sprite = createStateSprite(label, emote?.icon);

  record.group.add(sprite);
  stateSprites.set(userId, sprite);
};

const loadIdentity = async () => {
  if (!token.value) {
    return;
  }

  const client = createP2Client({
    token: token.value,
  });

  try {
    const identity = await client.me();

    user.value = identity;
    api.value = client;
    const catalogPayload = await client.getAvatarCatalog();

    catalog.actions = catalogPayload.actions || [];
    catalog.emotes = catalogPayload.emotes || [];
    world?.setLocalAvatar({
      id: `p2-${identity.id}`,
      userId: identity.id,
      displayName: identity.displayName,
      color:
        identity.role === 'admin'
          ? '#d09a45'
          : identity.role === 'editor'
            ? '#4f8f7b'
            : '#6478b8',
      x: 0,
      y: 0,
      z: 0,
      rotation: 0,
    });
    localState.value = await client.getAvatarState();
    applyAvatarVisual(identity.id, localState.value.state);
    await loadMessages();
    startPolling();
  } catch {
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
    await loadIdentity();
  } catch (error) {
    loginForm.error = error.message || '登录失败';
  } finally {
    loginForm.busy = false;
  }
};

const logout = () => {
  sessionStorage.removeItem(tokenKey);
  token.value = '';
  user.value = null;
  api.value = null;
  messages.value = [];
  onlineStates.value = [];
  localState.value = null;
  clearInterval(pollTimer);
  stateSprites.forEach((_sprite, userId) => clearStateSprite(userId));
  world?.clearLocalAvatar();
};

const selectAvatarState = async ({ actionId, emoteId }) => {
  actionBusy.value = true;

  try {
    const payload = await api.value.updateAvatarState(actionId, emoteId);

    localState.value = payload;
    applyAvatarVisual(user.value.id, payload.state);
    showToast('动作状态已同步');
  } catch (error) {
    showToast(error.message);
  } finally {
    actionBusy.value = false;
  }
};

const syncAvatarStates = async () => {
  try {
    const payload = await api.value.getAvatarStates([]);

    onlineStates.value = payload.states || [];
    payload.states.forEach((state) => {
      applyAvatarVisual(state.userId, state);
    });
  } catch {
    // Polling will retry.
  }
};

const loadMessages = async () => {
  try {
    const payload = await api.value.listMessages(plotId.value.trim());

    messages.value = payload.messages || [];
  } catch (error) {
    showToast(error.message);
  }
};

const createMessage = async (content) => {
  actionBusy.value = true;

  try {
    await api.value.createMessage(plotId.value.trim(), content);
    await loadMessages();
    showToast('留言已发布');
  } catch (error) {
    showToast(error.message);
  } finally {
    actionBusy.value = false;
  }
};

const deleteMessage = async (message) => {
  actionBusy.value = true;

  try {
    await api.value.deleteMessage(plotId.value.trim(), message.id);
    await loadMessages();
    showToast('留言已删除');
  } catch (error) {
    showToast(error.message);
  } finally {
    actionBusy.value = false;
  }
};

const startPolling = () => {
  clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    void syncAvatarStates();
  }, 700);
  void syncAvatarStates();
};

onMounted(async () => {
  await initializeWorld();
  await loadIdentity();
});

onBeforeUnmount(() => {
  clearInterval(pollTimer);
  clearTimeout(toastTimer);
  stateSprites.forEach((_sprite, userId) => clearStateSprite(userId));
  world?.dispose();
  world = null;
});
</script>

<template>
  <main class="bp3-p2-world">
    <div ref="worldContainer" class="bp3-p2-world__canvas" />

    <header class="bp3-p2-header">
      <div>
        <span class="bp3-p2-kicker">VIRTUAL UTOPIA · BP3-M3</span>
        <h1>表情、互动与家园留言</h1>
      </div>
      <div class="bp3-p2-header__stats">
        <span>{{ stats.homes }}/50 庄园</span>
        <span>{{ stats.trees }} 树木实例</span>
        <span v-if="user">{{ user.displayName }}</span>
      </div>
    </header>

    <section v-if="loading.world" class="bp3-p2-loading">
      <strong>{{ loading.message }}</strong>
      <span>{{ Math.round(loading.progress * 100) }}%</span>
    </section>

    <section v-if="!user" class="bp3-p2-login">
      <span class="bp3-p2-kicker">PHASE5 IDENTITY</span>
      <h2>进入 BP3-M3 世界</h2>
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
        <p v-if="loginForm.error" class="bp3-p2-error">
          {{ loginForm.error }}
        </p>
        <button
          type="submit"
          class="bp3-p2-button is-primary"
          :disabled="loginForm.busy"
        >
          {{ loginForm.busy ? '登录中' : '登录' }}
        </button>
      </form>
    </section>

    <template v-if="user && api">
      <nav class="bp3-p2-dock" aria-label="互动功能">
        <button
          type="button"
          :class="{ 'is-active': openPanel === 'avatar' }"
          @click="openPanel = openPanel === 'avatar' ? '' : 'avatar'"
        >
          动作
        </button>
        <button
          type="button"
          :class="{ 'is-active': openPanel === 'messages' }"
          @click="openPanel = openPanel === 'messages' ? '' : 'messages'"
        >
          留言 {{ messages.length }}
        </button>
        <button type="button" @click="logout">退出</button>
      </nav>

      <aside v-if="openPanel === 'avatar'" class="bp3-p2-panel-slot">
        <AvatarPanel
          :actions="catalog.actions"
          :emotes="catalog.emotes"
          :state="localState?.state"
          :busy="actionBusy"
          @select="selectAvatarState"
          @close="openPanel = ''"
        />
      </aside>

      <aside v-if="openPanel === 'messages'" class="bp3-p2-panel-slot">
        <MessageBoard
          v-model:plot-id="plotId"
          :messages="messages"
          :current-user-id="user.id"
          :can-moderate="user.role === 'admin'"
          :busy="actionBusy"
          @create="createMessage"
          @delete="deleteMessage"
          @close="openPanel = ''"
        />
      </aside>

      <p v-if="toast" class="bp3-p2-toast" role="status">
        {{ toast }}
      </p>

      <span
        class="bp3-p2-observability"
        :data-avatar-state="localState?.state?.actionId || 'idle'"
        :data-online-states="onlineStates.length"
        :data-message-count="messages.length"
      />
    </template>
  </main>
</template>
