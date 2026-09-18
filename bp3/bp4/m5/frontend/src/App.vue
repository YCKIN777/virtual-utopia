<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import * as THREE from 'three';
import { ThreeWorld } from '@bp2-world/ThreeWorld.js';
import {
  getHomeById,
  getTerrainHeight,
  homes,
} from '@bp2-world/worldLayout.js';
import { createM5Client, loginPhase5 } from './services/m5Client.js';
import { createM5RealtimeClient } from './services/realtimeClient.js';

const tokenKey = 'virtual-utopia.phase5.token';
const worldContainer = ref(null);
const token = ref(sessionStorage.getItem(tokenKey) || '');
const user = ref(null);
const api = ref(null);
const selectedPlotId = ref(homes[0]?.id || 'plot-1');
const buildMode = ref(false);
const placedItems = ref([]);
const plotting = ref(false);
const onlinePlayers = ref([]);
const remoteAvatarCount = ref(0);
const realtimeStatus = ref('offline');
const paletteSelection = ref('');
const toast = ref('');
const loading = reactive({
  visible: true,
  progress: 0,
  message: '准备山林庄园',
});
const loginForm = reactive({
  username: 'admin',
  password: 'utopia2026',
  busy: false,
  error: '',
});
const palette = [
  { id: 'chair', name: '木椅', color: '#a8784d' },
  { id: 'table', name: '木桌', color: '#8f623f' },
  { id: 'lantern', name: '灯笼', color: '#e09c53' },
  { id: 'plant', name: '盆栽', color: '#4d8d5c' },
  { id: 'fence', name: '木栅栏', color: '#7d5b3d' },
  { id: 'fire', name: '石火堆', color: '#b75b3d' },
];
let world = null;
let realtimeClient = null;
let previewGroup = null;
let toastTimer = null;
let localSyncTimer = null;
let lastSyncedAvatar = '';
const remoteAvatars = new Map();

const selectedHome = computed(() => getHomeById(selectedPlotId.value));
const canBuild = computed(() => user.value && user.value.role !== 'viewer');

const notify = (message) => {
  toast.value = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.value = '';
  }, 2500);
};

const initializeWorld = async () => {
  if (!worldContainer.value || world) {
    return;
  }

  world = new ThreeWorld(worldContainer.value, {
    onProgress: ({ progress, message }) => {
      loading.progress = progress;
      loading.message = message;
      loading.visible = progress < 1;
    },
  });
  await world.init();
  loading.visible = false;
};

const materialDefinition = (materialId) =>
  palette.find((item) => item.id === materialId) || palette[0];

const itemGeometry = (materialId) => {
  if (materialId === 'table') {
    return new THREE.BoxGeometry(1.3, 0.12, 0.8);
  }

  if (materialId === 'fence') {
    return new THREE.BoxGeometry(0.18, 0.9, 1.6);
  }

  if (materialId === 'fire') {
    return new THREE.CylinderGeometry(0.35, 0.45, 0.35, 8);
  }

  if (materialId === 'plant') {
    return new THREE.SphereGeometry(0.38, 10, 8);
  }

  return new THREE.BoxGeometry(0.55, 0.55, 0.55);
};

const renderBuildPreview = () => {
  if (!world) {
    return;
  }

  if (previewGroup) {
    world.scene.remove(previewGroup);
    previewGroup.traverse((object) => {
      object.geometry?.dispose();
      if (Array.isArray(object.material)) {
        object.material.forEach((material) => material.dispose());
      } else {
        object.material?.dispose();
      }
    });
  }

  const home = selectedHome.value;

  if (!home || !buildMode.value) {
    previewGroup = null;
    return;
  }

  previewGroup = new THREE.Group();
  previewGroup.name = 'bp4-m5-build-preview';
  previewGroup.position.set(
    home.x,
    getTerrainHeight(home.x, home.z) + 0.05,
    home.z,
  );

  const grid = new THREE.GridHelper(11, 5, '#9fd7b7', '#4d725e');

  grid.position.y = 0.08;
  previewGroup.add(grid);

  placedItems.value.forEach((item) => {
    const definition = materialDefinition(item.materialId);
    const mesh = new THREE.Mesh(
      itemGeometry(item.materialId),
      new THREE.MeshStandardMaterial({
        color: definition.color,
        roughness: 0.72,
      }),
    );

    mesh.position.set(
      (item.x - 2) * 2.1,
      item.materialId === 'plant' ? 0.5 : 0.35,
      (item.y - 2) * 2.1,
    );
    mesh.rotation.y = (item.rotation * Math.PI) / 180;
    previewGroup.add(mesh);
  });

  world.scene.add(previewGroup);
};

const refreshPlots = async () => {
  const payload = await api.value.plots();

  if (
    payload.plots?.length &&
    !payload.plots.some((plot) => plot.id === selectedPlotId.value)
  ) {
    selectedPlotId.value = payload.plots[0].id;
  }
};

const loadLayout = async () => {
  const payload = await api.value.layout(selectedPlotId.value);

  placedItems.value = payload.layout.items || [];
  renderBuildPreview();
};

const startRealtime = async () => {
  realtimeClient?.stop();
  realtimeStatus.value = 'connecting';
  const ticket = await api.value.ticket(['world-main']);

  realtimeClient = createM5RealtimeClient({
    ticket: ticket.ticket,
    onReady: () => {
      realtimeStatus.value = 'online';
    },
    onError: () => {
      realtimeStatus.value = 'offline';
    },
    onEvent: (event) => {
      if (
        event.type === 'home.layout.updated' &&
        event.data.plotId === selectedPlotId.value
      ) {
        placedItems.value = event.data.items || [];
        renderBuildPreview();
        notify('家园布局已同步');
      }

      if (event.type === 'player.presence.updated') {
        const users = event.data.users || [];

        if (users.length) {
          onlinePlayers.value = users;
        } else if (event.data.userId) {
          onlinePlayers.value = [
            ...onlinePlayers.value.filter(
              (player) => player.userId !== event.data.userId,
            ),
            event.data,
          ];
        }
      }

      if (
        event.type === 'avatar.state.updated' &&
        event.data.id !== `m5-${user.value?.id}`
      ) {
        remoteAvatars.set(event.data.id, event.data);
        remoteAvatarCount.value = remoteAvatars.size;
        world?.setRemoteAvatars([...remoteAvatars.values()]);
      }
    },
  });
  realtimeClient.start();
};

const syncLocalAvatar = () => {
  const avatarState = world?.getLocalAvatarState?.();

  if (!avatarState || !user.value || !realtimeClient) {
    return;
  }

  const avatar = {
    id: `m5-${user.value.id}`,
    displayName: user.value.displayName,
    color: '#4f8f7b',
    ...avatarState,
  };
  const signature = JSON.stringify(avatar);

  if (signature === lastSyncedAvatar) {
    return;
  }

  lastSyncedAvatar = signature;
  realtimeClient.sendAvatarState(avatar);
};

const loadIdentity = async () => {
  if (!token.value) {
    return;
  }

  const client = createM5Client({ token: token.value });

  try {
    const session = await client.session();

    user.value = session.user;
    api.value = client;
    world?.setLocalAvatar({
      id: `m5-${session.user.id}`,
      userId: session.user.id,
      displayName: session.user.displayName,
      color: '#4f8f7b',
      x: 0,
      y: 0,
      z: 0,
      rotation: 0,
    });
    await refreshPlots();
    await loadLayout();
    await startRealtime();
    localSyncTimer = setInterval(() => {
      syncLocalAvatar();
    }, 250);
  } catch (error) {
    token.value = '';
    sessionStorage.removeItem(tokenKey);
    loginForm.error = error.message;
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
    loginForm.error = error.message;
  } finally {
    loginForm.busy = false;
  }
};

const logout = () => {
  realtimeClient?.stop();
  realtimeClient = null;
  clearInterval(localSyncTimer);
  sessionStorage.removeItem(tokenKey);
  token.value = '';
  user.value = null;
  api.value = null;
  buildMode.value = false;
  placedItems.value = [];
  remoteAvatars.clear();
  remoteAvatarCount.value = 0;
  lastSyncedAvatar = '';
  world?.clearLocalAvatar();
  world?.setRemoteAvatars([]);
  renderBuildPreview();
};

const selectPlot = async (plotId) => {
  selectedPlotId.value = plotId;
  await loadLayout();
};

const onDragStart = (event, materialId) => {
  paletteSelection.value = materialId;
  event.dataTransfer.setData('text/material-id', materialId);
  event.dataTransfer.effectAllowed = 'copy';
};

const onDrop = (event, x, y) => {
  const materialId =
    event.dataTransfer.getData('text/material-id') || paletteSelection.value;

  if (!materialId) {
    return;
  }

  placedItems.value = [
    ...placedItems.value,
    {
      id: `item-${Date.now()}-${placedItems.value.length}`,
      materialId,
      x,
      y,
      rotation: 0,
    },
  ];
  paletteSelection.value = '';
  renderBuildPreview();
};

const removeItem = (itemId) => {
  placedItems.value = placedItems.value.filter((item) => item.id !== itemId);
  renderBuildPreview();
};

const rotateItem = (itemId) => {
  placedItems.value = placedItems.value.map((item) =>
    item.id === itemId
      ? {
          ...item,
          rotation: (item.rotation + 90) % 360,
        }
      : item,
  );
  renderBuildPreview();
};

const saveLayout = async () => {
  plotting.value = true;

  try {
    const result = await api.value.saveLayout(
      selectedPlotId.value,
      placedItems.value,
    );

    placedItems.value = result.layout.items;
    notify(`家园已保存 v${result.layout.version}`);
  } catch (error) {
    notify(error.message);
  } finally {
    plotting.value = false;
  }
};

const enterBuildMode = () => {
  buildMode.value = true;
  renderBuildPreview();
};

onMounted(async () => {
  await initializeWorld();
  await loadIdentity();
});

onBeforeUnmount(() => {
  realtimeClient?.stop();
  clearInterval(localSyncTimer);
  clearTimeout(toastTimer);
  if (previewGroup && world) {
    world.scene.remove(previewGroup);
  }
  world?.dispose();
  world = null;
});
</script>

<template>
  <main class="m5-world">
    <div ref="worldContainer" class="m5-world__canvas" />

    <header class="m5-header">
      <div>
        <span class="m5-kicker">BP4 MOUNTAIN MANOR</span>
        <h1>五十户山林庄园城镇</h1>
      </div>
      <div class="m5-status">
        <span :class="`is-${realtimeStatus}`">
          {{ realtimeStatus === 'online' ? '实时同步' : '连接中' }}
        </span>
        <span>{{ onlinePlayers.length }} 在线</span>
      </div>
    </header>

    <section v-if="loading.visible" class="m5-loading">
      <strong>{{ loading.message }}</strong>
      <span>{{ Math.round(loading.progress * 100) }}%</span>
    </section>

    <section v-if="!user" class="m5-login">
      <span class="m5-kicker">PHASE5 IDENTITY</span>
      <h2>进入山林家园</h2>
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
        <p v-if="loginForm.error" class="m5-error">
          {{ loginForm.error }}
        </p>
        <button type="submit" :disabled="loginForm.busy">
          {{ loginForm.busy ? '登录中' : '登录' }}
        </button>
      </form>
    </section>

    <template v-if="user && api">
      <aside class="m5-plot-panel">
        <header>
          <span class="m5-kicker">50 HOME PLOTS</span>
          <h2>玩家家园</h2>
        </header>
        <div class="m5-plot-grid">
          <button
            v-for="home in homes"
            :key="home.id"
            type="button"
            :class="{
              'is-active': home.id === selectedPlotId,
            }"
            @click="selectPlot(home.id)"
          >
            {{ home.number }}
          </button>
        </div>
      </aside>

      <aside class="m5-build-panel">
        <header>
          <div>
            <span class="m5-kicker">HOME BUILDER</span>
            <h2>{{ selectedHome?.name || selectedPlotId }}</h2>
          </div>
          <button
            v-if="canBuild && !buildMode"
            type="button"
            @click="enterBuildMode"
          >
            开始搭建
          </button>
          <button
            v-else-if="canBuild"
            type="button"
            :disabled="plotting"
            @click="saveLayout"
          >
            保存
          </button>
        </header>

        <template v-if="buildMode">
          <div class="m5-palette">
            <button
              v-for="item in palette"
              :key="item.id"
              type="button"
              draggable="true"
              :class="{
                'is-selected': paletteSelection === item.id,
              }"
              @dragstart="onDragStart($event, item.id)"
              @click="paletteSelection = item.id"
            >
              <span :style="{ background: item.color }" />
              {{ item.name }}
            </button>
          </div>

          <div class="m5-grid">
            <button
              v-for="cell in 25"
              :key="cell"
              type="button"
              :data-grid-x="(cell - 1) % 5"
              :data-grid-y="Math.floor((cell - 1) / 5)"
              @dragover.prevent
              @drop="onDrop($event, (cell - 1) % 5, Math.floor((cell - 1) / 5))"
              @click="
                paletteSelection &&
                onDrop(
                  {
                    dataTransfer: {
                      getData: () => '',
                    },
                  },
                  (cell - 1) % 5,
                  Math.floor((cell - 1) / 5),
                )
              "
            >
              <span
                v-for="item in placedItems.filter(
                  (candidate) =>
                    candidate.x === (cell - 1) % 5 &&
                    candidate.y === Math.floor((cell - 1) / 5),
                )"
                :key="item.id"
                class="m5-grid-item"
                :style="{
                  background: materialDefinition(item.materialId).color,
                }"
              />
            </button>
          </div>

          <div class="m5-placed-list">
            <article v-for="item in placedItems" :key="item.id">
              <strong>
                {{ materialDefinition(item.materialId).name }}
              </strong>
              <span>{{ item.x }},{{ item.y }}</span>
              <button type="button" @click="rotateItem(item.id)">旋转</button>
              <button type="button" @click="removeItem(item.id)">删除</button>
            </article>
          </div>
        </template>

        <p v-if="!canBuild" class="m5-hint">
          viewer账号仅可漫游，不能修改家园。
        </p>
        <p v-else-if="!buildMode" class="m5-hint">
          选择地块后进入搭建模式，拖拽素材到地块网格。
        </p>
      </aside>

      <section class="m5-online-panel">
        <span class="m5-kicker">M1 PRESENCE</span>
        <ul>
          <li v-for="player in onlinePlayers" :key="player.userId || player.id">
            {{ player.displayName || player.username }}
          </li>
          <li v-if="!onlinePlayers.length">等待位置同步</li>
        </ul>
      </section>

      <p v-if="toast" class="m5-toast">{{ toast }}</p>

      <span
        class="m5-observability"
        :data-selected-plot="selectedPlotId"
        :data-placed-items="placedItems.length"
        :data-realtime-status="realtimeStatus"
        :data-online-count="onlinePlayers.length"
        :data-remote-avatars="remoteAvatarCount"
      />
    </template>
  </main>
</template>
