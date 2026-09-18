<script setup>
import {
  computed,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue';
import HomeDecorator from '../components/HomeDecorator.vue';
import WorldChatPanel from '../components/WorldChatPanel.vue';
import { createPresenceClient } from '../services/presenceClient.js';
import { worldStore } from '../stores/worldStore.js';
import { ThreeWorld } from '../webgl/ThreeWorld.js';
import { validateHomeLayout } from '../webgl/worldLayout.js';

const containerRef = ref(null);
const loading = reactive({
  visible: true,
  progress: 0,
  message: '准备山林庄园',
});
const errorMessage = ref('');
const selectedInfo = ref(null);
const stats = reactive({
  homes: 0,
  bridges: 0,
  trees: 0,
});
const controlsState = reactive({
  dayMode: true,
  fog: true,
  wind: true,
  interior: false,
  overview: false,
});
const onlineUsers = ref([]);
const presenceStatus = ref('offline');
let world;
let presenceClient;

const currentUser = computed(() => worldStore.state.user);

const getAvatarColor = (userId) => {
  const colors = [
    '#d76d5e',
    '#4f8f7b',
    '#d09a45',
    '#6478b8',
    '#9b6cbb',
    '#5aa0b5',
  ];
  const numericId = Number(userId) || 0;

  return colors[Math.abs(numericId) % colors.length];
};

const stopPresence = () => {
  presenceClient?.stop();
  presenceClient = null;
  onlineUsers.value = [];
  presenceStatus.value = 'offline';
  world?.clearLocalAvatar();
};

const startPresence = () => {
  const user = worldStore.state.user;
  const token = worldStore.getAuthToken();

  if (!world || !user || !token) {
    stopPresence();
    return;
  }

  stopPresence();
  world.setLocalAvatar({
    id: user.id,
    userId: user.phase5UserId,
    displayName: user.displayName,
    color: getAvatarColor(user.phase5UserId),
    x: 0,
    y: 0,
    z: 0,
    rotation: 0,
  });
  presenceStatus.value = 'connecting';
  presenceClient = createPresenceClient({
    token,
    onUpdate: (users) => {
      onlineUsers.value = users;
      presenceStatus.value = 'online';
      const localUser = users.find((candidate) => candidate.id === user.id);

      if (localUser) {
        world?.setLocalAvatar(localUser);
      }

      world?.setRemoteAvatars(users);
    },
    onError: () => {
      presenceStatus.value = 'offline';
    },
  });
  presenceClient.start(() => world?.getLocalAvatarState());
};

const layoutValidation = validateHomeLayout();

const selectWorldObject = (info) => {
  selectedInfo.value = info;
};

const toggleDayMode = () => {
  controlsState.dayMode = !controlsState.dayMode;
  world?.setDayMode(controlsState.dayMode);
};

const toggleFog = () => {
  controlsState.fog = !controlsState.fog;
  world?.setFogEnabled(controlsState.fog);
};

const toggleWind = () => {
  controlsState.wind = !controlsState.wind;
  world?.setWindEnabled(controlsState.wind);
};

const toggleInterior = () => {
  controlsState.interior = !controlsState.interior;
  world?.setInteriorMode(controlsState.interior);
};

const resetView = () => {
  selectedInfo.value = null;
  controlsState.overview = false;
  world?.resetView();
};

const goHome = () => {
  controlsState.overview = false;
  world?.flyToHome('plot-1');
};

const goCenter = () => {
  controlsState.overview = false;
  world?.flyToCenter();
};

const toggleOverview = () => {
  if (controlsState.overview) {
    goHome();
    return;
  }

  controlsState.overview = true;
  world?.flyToOverview();
};

onMounted(async () => {
  if (!containerRef.value) {
    return;
  }

  try {
    world = new ThreeWorld(containerRef.value, {
      onProgress: ({ progress, message }) => {
        loading.progress = progress;
        loading.message = message;
        loading.visible = progress < 1;
      },
      onSelect: selectWorldObject,
      onStats: (nextStats) => {
        stats.homes = nextStats.homes;
        stats.bridges = nextStats.bridges;
        stats.trees = nextStats.trees;
      },
    });
    await world.init();
    startPresence();
    if (import.meta.env.DEV) {
      window.__utopiaWorld = world;
    }
  } catch (error) {
    loading.visible = false;
    errorMessage.value = error.message || 'WebGL 世界初始化失败';
  }
});

onBeforeUnmount(() => {
  stopPresence();
  if (import.meta.env.DEV) {
    delete window.__utopiaWorld;
  }
  world?.dispose();
});

watch(currentUser, () => {
  startPresence();
});
</script>

<template>
  <main class="vu-world-page">
    <div ref="containerRef" class="vu-world-canvas" />

    <header class="vu-world-header">
      <div>
        <span class="vu-kicker">FIFTY MANORS · MOUNTAIN TOWN</span>
        <h1>五十户山林庄园城镇</h1>
        <p>第三人称漫游 · 木构连廊 · 生态庄园</p>
      </div>
      <div class="vu-world-stats">
        <span>{{ stats.homes }}/50 庄园</span>
        <span>4 组团 · 50 户</span>
        <span>{{ stats.trees }} 树木实例</span>
      </div>
    </header>

    <aside class="vu-world-controls">
      <button type="button" class="vu-world-primary" @click="goHome">
        回我的家
      </button>
      <button type="button" @click="toggleOverview">
        {{ controlsState.overview ? '退出俯瞰' : '俯瞰全景' }}
      </button>
      <button type="button" @click="goCenter">前往生活广场</button>
      <button type="button" @click="resetView">重置视角</button>
      <button type="button" @click="toggleDayMode">
        {{ controlsState.dayMode ? '切换夜晚' : '切换日间' }}
      </button>
      <button type="button" @click="toggleFog">
        {{ controlsState.fog ? '关闭雾气' : '开启雾气' }}
      </button>
      <button type="button" @click="toggleWind">
        {{ controlsState.wind ? '停止风动' : '开启风动' }}
      </button>
      <button type="button" @click="toggleInterior">
        {{ controlsState.interior ? '恢复外壳' : '室内模式' }}
      </button>
    </aside>

    <div class="vu-world-help">
      <span>WASD / 方向键移动</span>
      <span>鼠标拖拽环绕</span>
      <span>滚轮缩放</span>
    </div>

    <aside
      v-if="onlineUsers.length"
      class="vu-world-online"
      aria-label="在线用户列表"
    >
      <header>
        <strong>在线漫游者</strong>
        <span>{{ onlineUsers.length }}</span>
      </header>
      <ul>
        <li v-for="user in onlineUsers" :key="user.id">
          <i aria-hidden="true" :style="{ background: user.color }" />
          <span>{{ user.displayName }}</span>
          <small>{{ user.role }}</small>
        </li>
      </ul>
      <p v-if="presenceStatus === 'connecting'">正在同步位置…</p>
    </aside>

    <article v-if="selectedInfo" class="vu-world-info">
      <button type="button" aria-label="关闭信息" @click="selectedInfo = null">
        ×
      </button>
      <span class="vu-kicker">
        {{ selectedInfo.type === 'center' ? 'LIFE PLAZA' : 'ECO MANOR' }}
      </span>
      <h2>{{ selectedInfo.title }}</h2>
      <p>{{ selectedInfo.description }}</p>
      <div v-if="selectedInfo.type === 'home'" class="vu-world-info__tags">
        <span>{{ selectedInfo.view }} 景观</span>
        <span>独立庭院</span>
        <span>屋顶花园</span>
      </div>
    </article>

    <div v-if="loading.visible" class="vu-world-loading">
      <span class="vu-spinner" aria-hidden="true" />
      <strong>{{ loading.message }}</strong>
      <div class="vu-world-progress">
        <i :style="{ width: `${loading.progress * 100}%` }" />
      </div>
    </div>

    <div v-if="errorMessage" class="vu-world-error">
      {{ errorMessage }}
    </div>

    <div v-if="layoutValidation.valid" class="vu-world-validation">
      50 户布局校验通过 · 最小间距
      {{ layoutValidation.minimumDistance.toFixed(1) }}
    </div>

    <HomeDecorator />
    <WorldChatPanel v-if="currentUser" />
  </main>
</template>

<style scoped>
.vu-world-online {
  position: absolute;
  top: 118px;
  right: 156px;
  width: 190px;
  padding: 10px;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 8px;
  background: rgba(28, 61, 54, 0.88);
  color: #f3f7f4;
  box-shadow: 0 12px 30px rgba(14, 31, 27, 0.2);
  backdrop-filter: blur(5px);
}

.vu-world-online header,
.vu-world-online li {
  display: flex;
  align-items: center;
}

.vu-world-online header {
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 12px;
}

.vu-world-online header span {
  min-width: 22px;
  padding: 2px 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.14);
  text-align: center;
}

.vu-world-online ul {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.vu-world-online li {
  gap: 7px;
  min-width: 0;
  font-size: 12px;
}

.vu-world-online li i {
  width: 9px;
  height: 9px;
  flex: 0 0 auto;
  border-radius: 50%;
}

.vu-world-online li span {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vu-world-online li small,
.vu-world-online p {
  color: rgba(243, 247, 244, 0.68);
}

.vu-world-online p {
  margin: 7px 0 0;
  font-size: 11px;
}

@media (max-width: 760px) {
  .vu-world-online {
    top: auto;
    right: 12px;
    bottom: 64px;
    width: 150px;
  }
}
</style>
