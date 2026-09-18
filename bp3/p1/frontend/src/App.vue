<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import * as THREE from 'three';
import { ThreeWorld } from '@bp2-world/ThreeWorld.js';
import EventDialog from './components/EventDialog.vue';
import InventoryPanel from './components/InventoryPanel.vue';
import TaskPanel from './components/TaskPanel.vue';
import { createP1Client, loginPhase5 } from './services/p1Client.js';

const tokenKey = 'virtual-utopia.phase5.token';
const worldContainer = ref(null);
const token = ref(sessionStorage.getItem(tokenKey) || '');
const user = ref(null);
const api = ref(null);
const eventDialog = ref(null);
const showEventDialog = ref(false);
const openPanel = ref('');
const nearbyResource = ref(null);
const actionBusy = ref(false);
const ready = ref(false);
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
const events = ref([]);
const tasks = ref([]);
const resources = ref([]);
const catalog = ref([]);
const inventory = ref(null);
const transactions = ref([]);
let world = null;
let resourceGroup = null;
let animationFrame = 0;
let markerStartedAt = 0;
let pollingTimer = null;
let nearestTimer = null;
let toastTimer = null;
let pointerStart = null;
const markers = new Map();
const pickupAnimations = new Map();
const knownActiveEvents = new Set();
const catalogById = computed(
  () => new Map(catalog.value.map((item) => [item.itemId, item])),
);

const showToast = (message) => {
  toast.value = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.value = '';
  }, 2600);
};

const resourceDistance = (node, avatar) =>
  Math.hypot(node.x - avatar.x, node.y - avatar.y, node.z - avatar.z);

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
    resourceGroup = new THREE.Group();
    resourceGroup.name = 'bp3-p1-resources';
    world.scene.add(resourceGroup);
    loading.world = false;
    markerStartedAt = performance.now();
    animateMarkers();
    bindResourceInteraction();
  } catch (error) {
    loading.world = false;
    loginForm.error = error.message || 'Three.js 世界初始化失败';
  }
};

const animateMarkers = () => {
  const elapsed = (performance.now() - markerStartedAt) / 1000;

  markers.forEach((record, nodeId) => {
    if (!record.group.visible) {
      return;
    }

    const pulse = 1 + Math.sin(elapsed * 2.4 + record.phase) * 0.08;
    const pickup = pickupAnimations.get(nodeId);

    record.core.rotation.y += 0.012;
    record.ring.rotation.z += 0.018;

    if (pickup) {
      const progress = Math.min(
        1,
        (performance.now() - pickup.startedAt) / 620,
      );

      record.group.scale.setScalar(pulse + progress * 0.8);
      record.core.material.opacity = 1 - progress;
      record.ring.material.opacity = 0.8 - progress * 0.8;

      if (progress >= 1) {
        record.group.visible = false;
        pickupAnimations.delete(nodeId);
      }
    } else {
      record.group.scale.setScalar(pulse);
      record.core.material.opacity = 1;
      record.ring.material.opacity = 0.72;
      record.group.position.y =
        record.node.y + Math.sin(elapsed * 1.8 + record.phase) * 0.16;
    }
  });

  animationFrame = requestAnimationFrame(animateMarkers);
};

const clearMarkers = () => {
  markers.forEach((record) => {
    record.core.material.dispose();
    record.ring.material.dispose();
    record.core.geometry.dispose();
    record.ring.geometry.dispose();
  });
  markers.clear();
  resourceGroup?.clear();
};

const renderResourceMarkers = () => {
  if (!resourceGroup) {
    return;
  }

  clearMarkers();
  resources.value.forEach((node, index) => {
    const item = catalogById.value.get(node.itemId);
    const color = item?.iconColor || '#8fb28b';
    const group = new THREE.Group();
    const coreMaterial = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.28,
      roughness: 0.45,
      transparent: true,
    });
    const ringMaterial = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    });
    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.58, 0),
      coreMaterial,
    );
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.82, 0.07, 6, 20),
      ringMaterial,
    );

    core.position.y = 0.78;
    core.userData.resourceNodeId = node.id;
    ring.position.y = 0.15;
    ring.rotation.x = Math.PI / 2;
    group.position.set(node.x, node.y, node.z);
    group.visible = node.available;
    group.add(core, ring);
    resourceGroup.add(group);
    markers.set(node.id, {
      core,
      group,
      node,
      phase: index * 0.7,
      ring,
    });
  });
};

const bindResourceInteraction = () => {
  const canvas = world?.renderer?.domElement;

  if (!canvas || canvas.dataset.bp3P1Bound === 'true') {
    return;
  }

  canvas.dataset.bp3P1Bound = 'true';
  canvas.addEventListener('pointerdown', (event) => {
    pointerStart = {
      x: event.clientX,
      y: event.clientY,
    };
  });
  canvas.addEventListener('pointerup', (event) => {
    if (!pointerStart) {
      return;
    }

    const moved = Math.hypot(
      event.clientX - pointerStart.x,
      event.clientY - pointerStart.y,
    );

    pointerStart = null;

    if (moved > 5) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    const raycaster = new THREE.Raycaster();

    raycaster.setFromCamera(pointer, world.camera);
    const hits = raycaster.intersectObjects(
      [...markers.values()].map((record) => record.core),
      false,
    );

    if (hits[0]?.object?.userData.resourceNodeId) {
      void collectResource(hits[0].object.userData.resourceNodeId);
    }
  });
};

const loadIdentity = async () => {
  if (!token.value) {
    return;
  }

  const client = createP1Client({
    token: token.value,
  });

  try {
    const identity = await client.me();

    user.value = identity;
    api.value = client;
    world?.setLocalAvatar({
      id: `p1-${identity.id}`,
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
    await refreshAll({ initial: true });
    ready.value = true;
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
  inventory.value = null;
  tasks.value = [];
  events.value = [];
  resources.value = [];
  ready.value = false;
  world?.clearLocalAvatar();
  clearMarkers();
};

const loadEvents = async ({ initial = false } = {}) => {
  const payload = await api.value.listEvents();

  events.value = payload.events || [];

  const active = events.value.filter((event) => event.status === 'active');

  if (!initial) {
    const newEvent = active.find((event) => !knownActiveEvents.has(event.id));

    if (newEvent) {
      eventDialog.value = newEvent;
      showEventDialog.value = true;
    }
  }

  active.forEach((event) => {
    knownActiveEvents.add(event.id);
  });
};

const loadResources = async () => {
  const payload = await api.value.listResources();

  resources.value = payload.resources || [];
  renderResourceMarkers();
};

const loadTasks = async () => {
  const payload = await api.value.listTasks();

  tasks.value = payload.tasks || [];
};

const loadInventory = async () => {
  const [inventoryPayload, transactionPayload] = await Promise.all([
    api.value.getInventory(),
    api.value.listTransactions(40),
  ]);

  inventory.value = inventoryPayload.inventory;
  transactions.value = transactionPayload.transactions || [];
};

const loadCatalog = async () => {
  const payload = await api.value.listCatalog();

  catalog.value = payload.items || [];
};

const refreshAll = async ({ initial = false } = {}) => {
  if (!api.value) {
    return;
  }

  await Promise.all([
    loadCatalog(),
    loadEvents({ initial }),
    loadResources(),
    loadTasks(),
    loadInventory(),
  ]);
};

const acceptTask = async (task) => {
  actionBusy.value = true;

  try {
    await api.value.acceptTask(task.id);
    await loadTasks();
    showToast('任务已加入');
  } catch (error) {
    showToast(error.message);
  } finally {
    actionBusy.value = false;
  }
};

const claimTask = async (task) => {
  actionBusy.value = true;

  try {
    await api.value.claimTask(task.id);
    await Promise.all([loadTasks(), loadInventory()]);
    showToast('奖励已放入背包');
  } catch (error) {
    showToast(error.message);
  } finally {
    actionBusy.value = false;
  }
};

const consumeItem = async (item) => {
  actionBusy.value = true;

  try {
    await api.value.consumeItem(item.itemId, 1);
    await loadInventory();
    showToast(`已使用 ${item.name} ×1`);
  } catch (error) {
    showToast(error.message);
  } finally {
    actionBusy.value = false;
  }
};

const collectResource = async (nodeId) => {
  const node = resources.value.find((candidate) => candidate.id === nodeId);
  const avatar = world?.getLocalAvatarState();

  if (!node || !avatar) {
    return;
  }

  if (resourceDistance(node, avatar) > node.interactionRadius) {
    showToast('请靠近资源节点');
    return;
  }

  actionBusy.value = true;

  try {
    const result = await api.value.collectResource(node.id, {
      x: avatar.x,
      y: avatar.y,
      z: avatar.z,
    });

    pickupAnimations.set(node.id, {
      startedAt: performance.now(),
    });
    showToast(
      `获得 ${catalogById.value.get(node.itemId)?.name || node.itemId} ×${result.collection.quantity}`,
    );
    await new Promise((resolve) => setTimeout(resolve, 650));
    await Promise.all([loadResources(), loadInventory(), loadTasks()]);
  } catch (error) {
    showToast(error.message);
  } finally {
    actionBusy.value = false;
  }
};

const updateNearbyResource = () => {
  const avatar = world?.getLocalAvatarState();

  if (!avatar) {
    nearbyResource.value = null;
    return;
  }

  const candidates = resources.value
    .filter((node) => node.available)
    .map((node) => ({
      distance: resourceDistance(node, avatar),
      node,
    }))
    .filter(({ distance, node }) => distance <= node.interactionRadius)
    .sort((left, right) => left.distance - right.distance);

  nearbyResource.value = candidates[0]?.node || null;
};

const startPolling = () => {
  clearInterval(pollingTimer);
  clearInterval(nearestTimer);
  pollingTimer = setInterval(() => {
    void refreshAll({ initial: false }).catch(() => null);
  }, 2200);
  nearestTimer = setInterval(updateNearbyResource, 350);
  updateNearbyResource();
};

onMounted(async () => {
  await initializeWorld();
  await loadIdentity();
});

onBeforeUnmount(() => {
  cancelAnimationFrame(animationFrame);
  clearInterval(pollingTimer);
  clearInterval(nearestTimer);
  clearTimeout(toastTimer);
  clearMarkers();
  if (world?.scene && resourceGroup) {
    world.scene.remove(resourceGroup);
  }
  world?.dispose();
  world = null;
});
</script>

<template>
  <main class="bp3-p1-world">
    <div ref="worldContainer" class="bp3-p1-world__canvas" />

    <header class="bp3-p1-header">
      <div>
        <span class="bp3-p1-kicker">VIRTUAL UTOPIA · BP3-M2</span>
        <h1>山林探索与聚落任务</h1>
      </div>
      <div class="bp3-p1-header__stats">
        <span>{{ stats.homes }}/50 庄园</span>
        <span>{{ stats.trees }} 树木实例</span>
        <span v-if="user">{{ user.displayName }}</span>
      </div>
    </header>

    <section v-if="loading.world" class="bp3-p1-loading">
      <strong>{{ loading.message }}</strong>
      <span>{{ Math.round(loading.progress * 100) }}%</span>
    </section>

    <section v-if="!user" class="bp3-p1-login">
      <span class="bp3-p1-kicker">PHASE5 IDENTITY</span>
      <h2>进入 BP3-M2 世界</h2>
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
        <p v-if="loginForm.error" class="bp3-p1-error">
          {{ loginForm.error }}
        </p>
        <button
          type="submit"
          class="bp3-p1-button is-primary"
          :disabled="loginForm.busy"
        >
          {{ loginForm.busy ? '登录中' : '登录' }}
        </button>
      </form>
    </section>

    <template v-if="user && api">
      <nav class="bp3-p1-dock" aria-label="探索功能">
        <button
          type="button"
          :class="{ 'is-active': openPanel === 'tasks' }"
          @click="openPanel = openPanel === 'tasks' ? '' : 'tasks'"
        >
          任务
        </button>
        <button
          type="button"
          :class="{ 'is-active': openPanel === 'inventory' }"
          @click="openPanel = openPanel === 'inventory' ? '' : 'inventory'"
        >
          背包
        </button>
        <button
          type="button"
          :disabled="!events.length"
          @click="
            eventDialog =
              events.find((event) => event.status === 'active') || events[0];
            showEventDialog = true;
          "
        >
          事件 {{ events.length }}
        </button>
        <button type="button" @click="logout">退出</button>
      </nav>

      <aside v-if="openPanel === 'tasks'" class="bp3-p1-panel-slot">
        <TaskPanel
          :tasks="tasks"
          :catalog="catalog"
          :busy="actionBusy"
          @accept="acceptTask"
          @claim="claimTask"
          @close="openPanel = ''"
        />
      </aside>

      <aside v-if="openPanel === 'inventory'" class="bp3-p1-panel-slot">
        <InventoryPanel
          :inventory="inventory"
          :transactions="transactions"
          :busy="actionBusy"
          @consume="consumeItem"
          @close="openPanel = ''"
        />
      </aside>

      <button
        v-if="nearbyResource"
        type="button"
        class="bp3-p1-collect-prompt"
        :data-nearby-resource="nearbyResource.id"
        :disabled="actionBusy"
        @click="collectResource(nearbyResource.id)"
      >
        拾取
        {{
          catalogById.get(nearbyResource.itemId)?.name || nearbyResource.name
        }}
      </button>

      <p v-if="toast" class="bp3-p1-toast" role="status">
        {{ toast }}
      </p>

      <span
        class="bp3-p1-observability"
        :data-resource-count="resources.length"
        :data-task-count="tasks.length"
        :data-event-count="events.length"
        :data-inventory-items="inventory?.usedSlots || 0"
        :data-p1-ready="ready ? 'true' : 'false'"
      />
    </template>

    <EventDialog
      :event="eventDialog"
      :open="showEventDialog"
      @close="showEventDialog = false"
    />
  </main>
</template>
