<script setup>
import {
  computed,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue';
import { useRouter } from 'vue-router';
import HomePanel from '../components/HomePanel.vue';
import ResidentChatPanel from '../components/ResidentChatPanel.vue';
import SpaceChatPanel from '../components/SpaceChatPanel.vue';
import SpaceSearchPanel from '../components/SpaceSearchPanel.vue';
import WorldChatPanel from '../components/WorldChatPanel.vue';
import AiChatPanel from '../components/AiChatPanel.vue';
import { createPresenceClient } from '../services/presenceClient.js';
import { worldStore } from '../stores/worldStore.js';
import { ThreeWorld } from '../webgl/ThreeWorld.js';
import {
  getChannelForPosition,
  getHomeById,
  validateHomeLayout,
} from '../webgl/worldLayout.js';
import {
  RESIDENT_CHAT_DISTANCE,
  seedResidents,
} from '../data/residents.js';

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
  timePeriod: 'day',
  weather: 0,
  fog: true,
  wind: true,
  interior: false,
  overview: false,
});
const BODY_COLORS = [
  '#345c53',
  '#7a4b3a',
  '#3a5a8a',
  '#7a6b3a',
  '#5a3a6a',
  '#b04a3a',
];
const HAIR_COLORS = ['#2b2620', '#4a3b2a', '#6b4a2a', '#8a6a3a', '#c9a24a'];
const APPEARANCE_KEY = 'vu-avatar-appearance';

const loadAppearance = () => {
  try {
    const raw = localStorage.getItem(APPEARANCE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return { bodyColor: BODY_COLORS[0], hairColor: HAIR_COLORS[0] };
};

const avatarAppearance = reactive(loadAppearance());
const avatarPanelOpen = ref(false);

const setAvatarAppearance = (patch) => {
  Object.assign(avatarAppearance, patch);
  try {
    localStorage.setItem(APPEARANCE_KEY, JSON.stringify(avatarAppearance));
  } catch {
    // ignore
  }
  world?.setAppearance(patch);
};
const onlineUsers = ref([]);
const presenceStatus = ref('offline');
let world;
let presenceClient;

const nearResidents = ref([]);
const residentChatOpen = ref(false);
const residentChatTarget = ref(null);
let residentSyncTimer = null;
let residentProximityTimer = null;

// —— 阶段十：空间社交（就近触发 / 七大场景 / 主页异步 / 检索）——
const socialContext = ref(null);
const spacePanel = reactive({
  open: false,
  mode: 'public',
  peerId: '',
  peerName: '',
  label: '',
  channel: 'direct',
});
const searchOpen = ref(false);
let socialTimer = null;
let residentBubbleClock = '';
let positionSyncTimer = null;
let worldChatChannelTimer = null;
let visitNotifyTimer = null;
let pendingReturnPoller = null;
let pendingReturnApplied = false;

// P1-1 主页回我家：周期保存玩家位置 + 场景标签到 worldStore，
// 让 ProfileView 能告诉用户「我现在在哪」+ 跨页落地。
const persistPlayerPosition = () => {
  if (!world) return;
  const position = world.getPlayerPosition ? world.getPlayerPosition() : null;
  if (!position) return;
  const ctx = world.getSocialContext ? world.getSocialContext() : null;
  const plotId =
    ctx?.nearestHome && typeof ctx.nearestHome.distance === 'number' && ctx.nearestHome.distance <= 12.5
      ? ctx.nearestHome.id
      : null;
  worldStore.setLastWorldPosition({
    x: position.x,
    y: position.y,
    z: position.z,
    sceneLabel: ctx?.label || '',
    plotId,
  });
};

// P1-1 主页回我家：把本地化身（targetPosition + group.position）和
// camera/controls.target 一起同步到给定坐标，避免被 animate 里 updateLocalAvatarTransform 复位
const snapAvatarTo = (x, y, z) => {
  if (!world) return;
  if (world.localAvatarId && world.avatarObjects?.has(world.localAvatarId)) {
    const record = world.avatarObjects.get(world.localAvatarId);
    if (record?.targetPosition) record.targetPosition.set(x, y, z);
    if (record?.group?.position) {
      record.group.position.set(x, y, z);
      record.group.updateMatrixWorld?.();
    }
  }
  if (world.camera && world.controls) {
    world.camera.position.set(x + 18, y + 22, z + 22);
    world.controls.target.set(x, y + 1, z);
    world.controls.update?.();
  }
};
// P1-1 主页回我家：消费 ProfileView 设置的 pendingReturn
//  - type='home' → flyToHome(plotId) + 强制结束 flyAnimation + snap avatar 到 home
//  - type='here' → snapAvatarTo(lastPosition)
const applyPendingReturn = () => {
  if (!world) return;
  const target = worldStore.consumePendingReturn();
  if (!target) return;
  if (target.type === 'home') {
    const homeId = target.plotId || worldStore.getOwnedHome()?.id;
    if (homeId) {
      world.flyToHome(homeId);
      // 立刻结束飞行动画：flyAnimation.target 是 (home.x, home.y+2.4, home.z)，
      // controls.target 用 lerp(0.1) 走过去要走几百帧，我们不等。
      if (world.flyAnimation) {
        const dest = world.flyAnimation.target;
        if (world.controls && dest) {
          world.controls.target.copy(dest);
        }
        if (world.camera && dest) {
          world.camera.lookAt(dest);
          world.camera.position.set(dest.x + 18, dest.y + 22, dest.z + 22);
        }
        world.flyAnimation = null;
      }
      // 手动同步 avatar 到 home 位置，避免 animate 下帧把它拉回。
      const home = worldStore.getHomePlot(homeId);
      if (home) {
        snapAvatarTo(home.x, home.y, home.z);
      }
    }
    return;
  }
  if (target.type === 'here' && target.position) {
    const { x, y, z } = target.position;
    snapAvatarTo(x, y, z);
  }
};

const isResidentUser = computed(() =>
  ['admin', 'editor'].includes(worldStore.state.permissions?.role),
);

const socialHint = computed(() => {
  const context = socialContext.value;
  if (!context) return '';
  if (context.zone === 'home_interior') return '院内私密交流 · 仅院内人员可见';
  if (context.zone === 'home_gate') return '门口邻里交流 · 就近触发';
  if (context.zone === 'plaza') return '公共频道 · 发言全域 50 户可见';
  if (context.zone === 'river') return '河岸偶遇 · 边走边聊';
  if (context.zone === 'plaza_edge') return '广场周边 · 就近轻互动';
  return '山脚自由交流 · 无固定点位';
});

// 就近入口按钮是否可点击：广场公屏永远可用；其它场景需就近有居民。
const spaceEntryEnabled = computed(() => {
  const context = socialContext.value;
  if (!context) return false;
  if (context.channel === 'public') return true;
  return Boolean(context.nearestResident);
});

const openSpaceChat = () => {
  if (!isResidentUser.value) {
    worldStore.notify('访客暂无社交权限，完成入驻后即可交流', 'info');
    return;
  }
  const context = socialContext.value;
  if (!context) {
    worldStore.notify('正在定位你的场景…稍后再试', 'info');
    return;
  }
  const peer = context.nearestResident;
  if (context.channel === 'public') {
    spacePanel.mode = 'public';
    spacePanel.peerId = '';
    spacePanel.peerName = '';
  } else if (peer) {
    spacePanel.mode = 'direct';
    spacePanel.peerId = peer.avatarId;
    spacePanel.peerName = peer.residentName;
  } else {
    // 修复：原先在 home_gate/river/mountain 等场景下，硬打开 peerId='' 的面板
    // 会导致发送时后端 404（"对方不是有效原住民"），用户看到的是"无响应"。
    // 现在直接提示用户走近居民，避免空对话死路。
    worldStore.notify('附近暂无在线居民，请走近一位邻居或返回广场中心', 'info');
    return;
  }
  spacePanel.label = context.label;
  spacePanel.channel = context.channel;
  spacePanel.open = true;
};

const handleSearchOpen = (item) => {
  searchOpen.value = false;
  if (item?.type === 'direct_chat' && item.ref?.peerId) {
    spacePanel.mode = 'direct';
    spacePanel.peerId = item.ref.peerId;
    spacePanel.peerName = item.ownerName || '邻居';
    spacePanel.label = '检索结果 · 私聊记录';
    spacePanel.channel = 'direct';
    spacePanel.open = true;
    return;
  }
  if (item?.type === 'public_chat') {
    spacePanel.mode = 'public';
    spacePanel.peerId = '';
    spacePanel.peerName = '';
    spacePanel.label = '检索结果 · 广场公屏';
    spacePanel.channel = 'public';
    spacePanel.open = true;
    return;
  }
  worldStore.notify('该结果来自主页条目，可在个人主页查看', 'info');
};

const openResidentChat = (resident) => {
  residentChatTarget.value = resident;
  residentChatOpen.value = true;
};

const friendPanelOpen = ref(false);

const visitorInviteOpen = ref(false);
const visitorRegisterOpen = ref(false);
const registerCode = ref('');

const visitorQuota = computed(() => worldStore.state.visitorQuota);

const issueInvitationAction = () => {
  worldStore.issueVisitorInvitation();
};

const revokeInvitationAction = (invitation) => {
  worldStore.revokeVisitorInvitation({ invitationId: invitation.id });
};

const registerVisitorAction = () => {
  const code = registerCode.value.trim();

  if (!code) {
    worldStore.notify('请输入邀请码', 'error');
    return;
  }

  worldStore.registerVisitor({ code });
  registerCode.value = '';
};

const quotaStatusLabel = (status) => {
  const labels = {
    issued: '待兑换',
    used: '已兑换',
    revoked: '已回收',
  };

  return labels[status] || status;
};

const onlineUserIds = computed(
  () => new Set(onlineUsers.value.map((user) => user.userId)),
);

const isFriendOnline = (friend) => onlineUserIds.value.has(friend.userId);

const teleportToFriend = (friend) => {
  const plotId = `plot-${((friend.userId % 50) + 1)}`;
  world?.flyToHome(plotId);
};

const removeFriendAction = (friend) => {
  worldStore.removeFriend({ friendId: friend.userId });
};

const respondFriendAction = (request, accept) => {
  worldStore.respondFriendRequest({ requestId: request.id, accept });
};

const sendFriendAction = (user) => {
  worldStore.sendFriendRequest({
    toUserId: user.userId,
    toUsername: user.username,
    toDisplayName: user.displayName,
  });
};

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
    appearance: { ...avatarAppearance },
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
  void worldStore.loadFriends();
  void worldStore.loadVisitorQuota();
};

const layoutValidation = validateHomeLayout();

const router = useRouter();

const selectWorldObject = (info) => {
  selectedInfo.value = info;

  if (info?.type === 'home') {
    worldStore.recordHomeVisit({ plotId: info.id });
  }

  // 点击某户居民宅的暖灯/木牌：直接打开与该户主居民的一对一聊天（免凑距离）。
  if (info?.type === 'residentHome') {
    const resident = seedResidents.find(
      (item) => item.homePlotId === info.homeId,
    );

    if (resident) {
      openResidentChat({
        avatarId: resident.avatarId,
        residentName: resident.residentName,
        homePlotId: resident.homePlotId,
      });
    }
  }

  // P2 迷你主页：点击广场 Avatar 弹出小卡
  if (info?.type === 'avatar') {
    openMiniProfile(info);
  }
};

// —— P2 迷你主页 ——
const miniProfile = ref(null);
const miniProfileBio = ref('');

const openMiniProfile = async (info) => {
  const online = onlineUsers.value.find((item) => item.userId === info.userId);

  miniProfile.value = {
    avatarId: info.avatarId,
    userId: info.userId,
    displayName: info.displayName || '漫游者',
    color: online?.color || '#4f8f7b',
    online: Boolean(online),
  };
  miniProfileBio.value = '';

  const directory = await worldStore.listResidentDirectory();

  if (directory.ok) {
    const entry = directory.residents.find(
      (item) => item.userId === info.userId,
    );
    miniProfileBio.value =
      entry?.selfIntro || entry?.occupation || entry?.hobbies || '';
  }
};

const greetMiniProfile = async () => {
  const target = miniProfile.value;

  if (!target) {
    return;
  }

  const result = await worldStore.sendDirectMessage({
    toUserId: target.userId,
    content: '你好，很高兴认识你！',
  });

  if (result.ok) {
    worldStore.notify(`已向 ${target.displayName} 打招呼`, 'success');
  }
};

const viewFullProfile = () => {
  const target = miniProfile.value;

  if (!target) {
    return;
  }

  miniProfile.value = null;
  router.push({ name: 'profile', query: { userId: target.userId } });
};

const TIME_PERIODS = ['day', 'dusk', 'night', 'dawn'];
const TIME_PERIOD_LABELS = {
  day: '白天',
  dusk: '黄昏',
  night: '夜晚',
  dawn: '日出',
};

const cycleTimePeriod = () => {
  const index = TIME_PERIODS.indexOf(controlsState.timePeriod);
  controlsState.timePeriod = TIME_PERIODS[(index + 1) % TIME_PERIODS.length];
  world?.setTimePeriod(controlsState.timePeriod);
};

const WEATHER_LABELS = ['晴天', '小雨', '阴雨薄雾'];
const cycleWeather = () => {
  controlsState.weather = (controlsState.weather + 1) % WEATHER_LABELS.length;
  world?.setWeather(controlsState.weather);
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
  world?.flyToHome(worldStore.getOwnedHome()?.id || 'plot-1');
};

  const goCenter = () => {
    controlsState.overview = false;
    world?.flyToCenter();
  };

  const flyToResident = (homeId) => {
    controlsState.overview = false;
    world?.flyToHome(homeId);
  };

const toggleOverview = () => {
  if (controlsState.overview) {
    goHome();
    return;
  }

  controlsState.overview = true;
  world?.flyToOverview();
};

watch(selectedInfo, () => {
  const home = worldStore.getOwnedHome();
  worldStore.setAvatarInOwnYard(
    Boolean(
      home &&
        selectedInfo.value?.type === 'home' &&
        selectedInfo.value.id === home.id,
    ),
  );
});

let kinYardTimer = null;
const KIN_YARD_DISTANCE = 14;

const updateKinYardPresence = () => {
  const kinPos = world?.getRoamingAgentPosition?.('kin-lord');
  const layout = getHomeById('plot-39');

  if (!kinPos || !layout) {
    worldStore.setKinInOwnYard(false);
    return;
  }

  const distance = Math.hypot(kinPos.x - layout.x, kinPos.z - layout.z);
  worldStore.setKinInOwnYard(distance < KIN_YARD_DISTANCE);
};

onMounted(async () => {
  void worldStore.loadVisitorQuota();

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
    world.addRoamingAgent({
      id: 'kin-lord',
      name: 'KIN',
      appearance: { bodyColor: '#1f5a4a', hairColor: '#2b2620' },
      isLord: true,
      homeId: 'plot-39',
    });
    seedResidents.forEach((resident) => world.addResidentAvatar(resident));
    world.restoreResidentAvatarStates(worldStore.state.residentStates || []);
    residentSyncTimer = setInterval(() => {
      worldStore.setResidentStates(world.getResidentAvatarStates());
    }, 3000);
    residentProximityTimer = setInterval(() => {
      nearResidents.value = world.getResidentsNearLocal(RESIDENT_CHAT_DISTANCE);
    }, 600);
    // 阶段十：空间社交场景判定（就近触发、远离隐藏、无固定点位）
    socialTimer = setInterval(() => {
      socialContext.value = world.getSocialContext();
      const nearby = socialContext.value?.nearestResident;
      if (nearby && residentBubbleClock !== nearby.residentName) {
        residentBubbleClock = nearby.residentName;
        world.showChatBubble({
          avatarId: nearby.avatarId,
          text: '你好呀，最近在忙什么？',
          durationMs: 4600,
        });
      }
      if (!nearby) residentBubbleClock = '';
    }, 900);
    kinYardTimer = setInterval(updateKinYardPresence, 500);
    updateKinYardPresence();
    // P1-1 主页回我家：周期持久化玩家位置（3s 一次，复用现有轮询节流）
    persistPlayerPosition();
    positionSyncTimer = setInterval(persistPlayerPosition, 3000);
    // P1-2 属地聊天：按玩家位置实时切换聊天频道（广场 / 宅院门口）
    worldChatChannelTimer = setInterval(() => {
      const position = world.getLocalAvatarState();

      if (position) {
        worldStore.setWorldChatChannel(
          getChannelForPosition(position.x, position.z),
        );
      }
    }, 800);
    // P1-3 串门通知：轮询自家宅院来访记录，检测到新访客时站内提示
    worldStore.checkHomeVisitNotifications();
    visitNotifyTimer = setInterval(
      () => worldStore.checkHomeVisitNotifications(),
      3000,
    );
    // P1-1 主页回我家：等 homeObjects===50 且首帧渲染后才消费 pendingReturn，
    // 否则 flyToHome 会被下一帧 updateLocalAvatarTransform 复位。
    pendingReturnApplied = false;
    pendingReturnPoller = setInterval(() => {
      if (pendingReturnApplied) {
        if (pendingReturnPoller) {
          clearInterval(pendingReturnPoller);
          pendingReturnPoller = null;
        }
        return;
      }
      if (!world || !world.homeObjects || world.homeObjects.size < 50) {
        return;
      }
      // requestAnimationFrame 保证在 ThreeWorld.animate 真正渲染过一次之后再消费。
      requestAnimationFrame(() => {
        if (pendingReturnApplied) return;
        applyPendingReturn();
        pendingReturnApplied = true;
        if (pendingReturnPoller) {
          clearInterval(pendingReturnPoller);
          pendingReturnPoller = null;
        }
      });
    }, 250);
    if (import.meta.env.DEV) {
      window.__utopiaWorld = world;
      // 开发期调试钩子：便于自测脚本查看 worldStore 状态（生产不注入）。
      window.__utopiaStore = worldStore;
    }
  } catch (error) {
    loading.visible = false;
    errorMessage.value = error.message || 'WebGL 世界初始化失败';
  }
});

onBeforeUnmount(() => {
  stopPresence();
  if (kinYardTimer) {
    clearInterval(kinYardTimer);
    kinYardTimer = null;
  }
  if (residentSyncTimer) {
    clearInterval(residentSyncTimer);
    residentSyncTimer = null;
  }
  if (residentProximityTimer) {
    clearInterval(residentProximityTimer);
    residentProximityTimer = null;
  }
  if (socialTimer) {
    clearInterval(socialTimer);
    socialTimer = null;
  }
  if (positionSyncTimer) {
    clearInterval(positionSyncTimer);
    positionSyncTimer = null;
  }
  if (worldChatChannelTimer) {
    clearInterval(worldChatChannelTimer);
    worldChatChannelTimer = null;
  }
  if (visitNotifyTimer) {
    clearInterval(visitNotifyTimer);
    visitNotifyTimer = null;
  }
  if (pendingReturnPoller) {
    clearInterval(pendingReturnPoller);
    pendingReturnPoller = null;
  }
  if (import.meta.env.DEV) {
    delete window.__utopiaWorld;
  }
  world?.dispose();
});

watch(currentUser, () => {
  startPresence();
  void worldStore.loadVisitorQuota();
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
      <button type="button" @click="cycleTimePeriod">
        时段：{{ TIME_PERIOD_LABELS[controlsState.timePeriod] }}
      </button>
      <button type="button" @click="cycleWeather">
        天气：{{ WEATHER_LABELS[controlsState.weather] }}
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
      <button type="button" @click="avatarPanelOpen = !avatarPanelOpen">
        Avatar装扮
      </button>

      <div v-if="avatarPanelOpen" class="vu-avatar-panel">
        <div class="vu-avatar-panel__row">
          <span>服装</span>
          <button
            v-for="color in BODY_COLORS"
            :key="color"
            type="button"
            class="vu-swatch"
            :class="{ 'vu-swatch--active': avatarAppearance.bodyColor === color }"
            :style="{ background: color }"
            :aria-label="'服装颜色 ' + color"
            @click="setAvatarAppearance({ bodyColor: color })"
          />
        </div>
        <div class="vu-avatar-panel__row">
          <span>头发</span>
          <button
            v-for="color in HAIR_COLORS"
            :key="color"
            type="button"
            class="vu-swatch"
            :class="{ 'vu-swatch--active': avatarAppearance.hairColor === color }"
            :style="{ background: color }"
            :aria-label="'头发颜色 ' + color"
            @click="setAvatarAppearance({ hairColor: color })"
          />
        </div>
      </div>

      <button
        v-if="currentUser"
        type="button"
        @click="friendPanelOpen = !friendPanelOpen"
      >
        好友
      </button>

      <div v-if="friendPanelOpen" class="vu-friend-panel">
        <div class="vu-friend-panel__heading">好友列表</div>
        <div class="vu-friend-panel__list">
          <div
            v-for="friend in worldStore.state.friends"
            :key="friend.id"
            class="vu-friend-item"
          >
            <span>
              {{ friend.displayName || friend.username }}
              <i :class="isFriendOnline(friend) ? 'is-online' : 'is-offline'">
                {{ isFriendOnline(friend) ? '在线' : '离线' }}
              </i>
            </span>
            <button type="button" @click="teleportToFriend(friend)">传送</button>
            <button type="button" @click="removeFriendAction(friend)">删除</button>
          </div>
          <p v-if="!worldStore.state.friends.length" class="vu-friend-panel__empty">
            还没有好友
          </p>
        </div>

        <div class="vu-friend-panel__heading">待处理申请</div>
        <div class="vu-friend-panel__list">
          <div
            v-for="request in worldStore.state.friendRequests"
            :key="request.id"
            class="vu-friend-item"
          >
            <span>{{ request.from.displayName }} 申请加你为好友</span>
            <button type="button" @click="respondFriendAction(request, true)">同意</button>
            <button type="button" @click="respondFriendAction(request, false)">拒绝</button>
          </div>
          <p v-if="!worldStore.state.friendRequests.length" class="vu-friend-panel__empty">
            暂无申请
          </p>
        </div>

        <div class="vu-friend-panel__heading">在线用户</div>
        <div class="vu-friend-panel__list">
          <div
            v-for="user in onlineUsers"
            :key="user.id"
            class="vu-friend-item"
          >
            <span>{{ user.displayName || user.username }}</span>
            <button type="button" @click="sendFriendAction(user)">加好友</button>
          </div>
          <p v-if="!onlineUsers.length" class="vu-friend-panel__empty">
            暂无在线用户
          </p>
        </div>
      </div>

      <button
        v-if="currentUser && (visitorQuota.isResident || visitorQuota.isAdmin)"
        type="button"
        @click="visitorInviteOpen = !visitorInviteOpen"
      >
        访客邀请
      </button>

      <div v-if="visitorInviteOpen" class="vu-friend-panel">
        <div class="vu-friend-panel__heading">
          {{ visitorQuota.isAdmin ? '城主 · ' : '' }}访客邀请名额
        </div>
        <div class="vu-quota-row">
          <span>我的名额</span>
          <strong v-if="visitorQuota.resident">
            {{ visitorQuota.resident.quotaAvailable }} /
            {{ visitorQuota.resident.quotaTotal }}
          </strong>
          <strong v-else>城主公共名额</strong>
        </div>
        <div class="vu-quota-row">
          <span>访客总数</span>
          <strong>
            {{ visitorQuota.stats?.totalVisitors || 0 }} /
            {{ visitorQuota.stats?.globalVisitorCap || 200 }}
          </strong>
        </div>
        <p class="vu-quota-hint">
          {{
            visitorQuota.stats?.residentEntryOpen
              ? '原住民邀请入口开放中'
              : '原住民邀请入口已关闭（仅城主可发公共名额）'
          }}
        </p>

        <button
          type="button"
          class="vu-quota-issue"
          :disabled="
            visitorQuota.isResident &&
            !visitorQuota.stats?.residentEntryOpen
          "
          @click="issueInvitationAction"
        >
          发放邀请码
        </button>

        <div v-if="visitorQuota.invitations.length" class="vu-friend-panel__list">
          <div
            v-for="invitation in visitorQuota.invitations"
            :key="invitation.id"
            class="vu-friend-item"
          >
            <span class="vu-quota-code">{{ invitation.code }}</span>
            <i :class="invitation.status">{{ quotaStatusLabel(invitation.status) }}</i>
            <button
              v-if="invitation.status === 'issued'"
              type="button"
              @click="revokeInvitationAction(invitation)"
            >
              回收
            </button>
          </div>
        </div>
        <p v-else class="vu-friend-panel__empty">还没有发放邀请码</p>
      </div>

      <button
        v-if="currentUser && !visitorQuota.isResident && !visitorQuota.isAdmin"
        type="button"
        @click="visitorRegisterOpen = !visitorRegisterOpen"
      >
        访客注册
      </button>

      <div v-if="visitorRegisterOpen" class="vu-friend-panel">
        <div class="vu-friend-panel__heading">访客注册</div>
        <p class="vu-quota-hint">输入原住民或城主发放的邀请码，注册为访客。</p>
        <form class="vu-inline-form" @submit.prevent="registerVisitorAction">
          <input v-model="registerCode" maxlength="40" placeholder="邀请码" />
          <button type="submit" class="vu-quota-issue">注册</button>
        </form>
      </div>
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
        {{
          selectedInfo.type === 'center'
            ? 'LIFE PLAZA'
            : selectedInfo.type === 'residentHome'
              ? 'RESIDENT HOME'
              : 'ECO MANOR'
        }}
      </span>
      <h2>{{ selectedInfo.title }}</h2>
      <p>{{ selectedInfo.description }}</p>
      <div v-if="selectedInfo.type === 'home'" class="vu-world-info__tags">
        <span>{{ selectedInfo.view }} 景观</span>
        <span>独立庭院</span>
        <span>屋顶花园</span>
      </div>
      <div
        v-else-if="selectedInfo.type === 'residentHome'"
        class="vu-world-info__tags"
      >
        <span>原住民宅院</span>
        <span>{{ selectedInfo.homeId }}</span>
      </div>
      <button
        v-if="selectedInfo.type === 'residentHome'"
        type="button"
        class="vu-world-info__action"
        @click="flyToResident(selectedInfo.homeId)"
      >
        飞向此地
      </button>
    </article>

    <HomePanel
      v-if="selectedInfo?.type === 'home'"
      :plot-id="selectedInfo.id"
      @close="selectedInfo = null"
    />

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

    <div v-if="nearResidents.length" class="vu-resident-chat-entry">
      <button type="button" @click="openResidentChat(nearResidents[0])">
        与 {{ nearResidents[0].residentName }} 交谈
      </button>
    </div>

    <!-- 阶段十：空间社交 —— 就近触发入口（无常驻面板、远离自动隐藏、无人数限制） -->
    <div v-if="isResidentUser && socialContext" class="vu-space-entry">
      <span class="vu-space-entry__zone">{{ socialContext.label }}</span>
      <span class="vu-space-entry__hint">{{ socialHint }}</span>
      <div class="vu-space-entry__actions">
        <button
          type="button"
          class="vu-space-entry__btn"
          :class="{ 'vu-space-entry__btn--disabled': !spaceEntryEnabled }"
          :disabled="!spaceEntryEnabled"
          @click="openSpaceChat"
        >
          {{
            socialContext.channel === 'public'
              ? '进入广场公屏'
              : socialContext.nearestResident
                ? `与 ${socialContext.nearestResident.residentName} 交流`
                : '走近居民后可私聊'
          }}
        </button>
        <button
          type="button"
          class="vu-space-entry__btn vu-space-entry__btn--ghost"
          @click="searchOpen = true"
        >
          检索
        </button>
      </div>
    </div>

    <SpaceChatPanel
      v-if="spacePanel.open"
      :mode="spacePanel.mode"
      :peer-id="spacePanel.peerId"
      :peer-name="spacePanel.peerName"
      :scene-label="spacePanel.label"
      :scene="socialContext ? socialContext.scene : null"
      :channel="spacePanel.channel"
      @close="spacePanel.open = false"
    />

    <SpaceSearchPanel v-if="searchOpen" @close="searchOpen = false" @open="handleSearchOpen" />

    <ResidentChatPanel
      v-if="residentChatOpen && residentChatTarget"
      :resident="residentChatTarget"
      @close="residentChatOpen = false"
    />

    <WorldChatPanel v-if="currentUser" @select-resident="openResidentChat" />

    <!-- P5 前端改造：3D 世界 AI 对话（scene 3000 LangGraph stream + KIN 审批） -->
    <AiChatPanel />

    <aside v-if="miniProfile" class="vu-mini-profile">
      <button
        type="button"
        class="vu-mini-profile__close"
        aria-label="关闭迷你主页"
        @click="miniProfile = null"
      >
        ×
      </button>
      <div class="vu-mini-profile__head">
        <span
          class="vu-mini-profile__avatar"
          :style="{ background: miniProfile.color }"
          aria-hidden="true"
        >
          {{ miniProfile.displayName.slice(0, 1) }}
        </span>
        <div>
          <strong>{{ miniProfile.displayName }}</strong>
          <span
            class="vu-mini-profile__status"
            :class="miniProfile.online ? 'is-online' : 'is-offline'"
          >
            {{ miniProfile.online ? '在线' : '离线' }}
          </span>
        </div>
      </div>
      <p class="vu-mini-profile__bio">
        {{ miniProfileBio || '这位邻居还没有填写简介' }}
      </p>
      <div class="vu-mini-profile__actions">
        <button
          type="button"
          class="vu-button vu-button--accent vu-button--small"
          @click="greetMiniProfile"
        >
          打招呼
        </button>
        <button
          type="button"
          class="vu-button vu-button--light vu-button--small"
          @click="viewFullProfile"
        >
          查看主页
        </button>
      </div>
    </aside>
  </main>
</template>

<style scoped>
.vu-mini-profile {
  position: fixed;
  left: 22px;
  bottom: 22px;
  z-index: 36;
  width: min(260px, calc(100vw - 28px));
  padding: 14px;
  border: 1px solid rgba(28, 62, 54, 0.22);
  border-radius: 10px;
  background: #f7f5ef;
  color: #243d37;
  box-shadow: 0 12px 34px rgba(13, 29, 27, 0.24);
}

.vu-mini-profile__close {
  position: absolute;
  top: 8px;
  right: 10px;
  border: 0;
  background: none;
  color: #7a8a83;
  font-size: 18px;
  cursor: pointer;
}

.vu-mini-profile__head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.vu-mini-profile__avatar {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 50%;
  color: #fff;
  font-weight: 700;
  flex-shrink: 0;
}

.vu-mini-profile__head strong {
  display: block;
  font-size: 15px;
}

.vu-mini-profile__status {
  font-size: 11px;
}

.vu-mini-profile__status.is-online {
  color: #2d7a5c;
}

.vu-mini-profile__status.is-offline {
  color: #98a29d;
}

.vu-mini-profile__bio {
  margin: 10px 0;
  color: #557067;
  font-size: 13px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.vu-mini-profile__actions {
  display: flex;
  gap: 8px;
}
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

.vu-avatar-panel {
  display: grid;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 8px;
  background: rgba(24, 40, 36, 0.92);
  margin-top: 4px;
}

.vu-avatar-panel__row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.vu-avatar-panel__row span {
  width: 34px;
  color: #d9e2dc;
  font-size: 11px;
}

.vu-swatch {
  width: 22px;
  height: 22px;
  border: 1px solid rgba(255, 255, 255, 0.45);
  border-radius: 50%;
  cursor: pointer;
  padding: 0;
}

.vu-swatch--active {
  box-shadow: 0 0 0 2px #fff, 0 0 0 4px #2d6c5c;
}

.vu-friend-panel {
  display: grid;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 8px;
  background: rgba(24, 40, 36, 0.92);
  margin-top: 4px;
}

.vu-friend-panel__heading {
  color: #ffe6b8;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.4px;
}

.vu-friend-panel__list {
  display: grid;
  gap: 6px;
}

.vu-friend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #d9e2dc;
  font-size: 12px;
}

.vu-friend-item span {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vu-friend-item i {
  font-style: normal;
  font-size: 10px;
  margin-left: 4px;
}

.vu-friend-item i.is-online {
  color: #7fe0a8;
}

.vu-friend-item i.is-offline {
  color: #8b9791;
}

.vu-friend-item button {
  border: 0;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.16);
  color: #fff;
  font-size: 10px;
  padding: 3px 7px;
  cursor: pointer;
}

.vu-friend-panel__empty {
  color: #8b9791;
  font-size: 11px;
}

.vu-quota-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #d9e2dc;
  font-size: 12px;
}

.vu-quota-row strong {
  color: #ffe6b8;
  font-weight: 700;
}

.vu-quota-hint {
  margin: 2px 0 6px;
  color: #8b9791;
  font-size: 11px;
}

.vu-quota-issue {
  border: 0;
  border-radius: 4px;
  background: rgba(255, 230, 184, 0.2);
  color: #ffe6b8;
  font-size: 12px;
  padding: 6px 10px;
  cursor: pointer;
  margin-bottom: 6px;
}

.vu-quota-issue:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.vu-quota-code {
  font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace;
  font-size: 10px;
  letter-spacing: 0.3px;
}

.vu-friend-item i.issued {
  color: #d8b25a;
}

.vu-friend-item i.used {
  color: #7fe0a8;
}

.vu-friend-item i.revoked {
  color: #8b9791;
}

.vu-inline-form {
  display: flex;
  gap: 6px;
}

.vu-inline-form input {
  flex: 1;
  min-width: 0;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.08);
  color: #f3f7f4;
  font-size: 12px;
  padding: 6px 8px;
}

.vu-resident-chat-entry {
  position: absolute;
  left: 50%;
  bottom: 148px;
  transform: translateX(-50%);
  z-index: 30;
}

.vu-resident-chat-entry button {
  border: 1px solid rgba(255, 218, 125, 0.65);
  border-radius: 999px;
  background: rgba(28, 61, 54, 0.92);
  color: #ffd77c;
  font-size: 13px;
  font-weight: 600;
  padding: 8px 16px;
  cursor: pointer;
  box-shadow: 0 8px 22px rgba(14, 31, 27, 0.35);
  backdrop-filter: blur(4px);
}

.vu-resident-chat-entry button:hover {
  background: rgba(36, 80, 70, 0.96);
  color: #ffe4a3;
}

/* 阶段十：空间社交就近入口（极简轻量，远离自动隐藏） */
.vu-space-entry {
  position: absolute;
  left: 50%;
  bottom: 92px;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 9px 16px 10px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.84);
  border: 1px solid rgba(47, 168, 79, 0.28);
  box-shadow: 0 10px 26px rgba(18, 32, 26, 0.16);
  backdrop-filter: blur(6px);
  animation: vu-space-fade-in 0.24s ease-out;
  pointer-events: auto;
}

.vu-space-entry__zone {
  font-size: 12.5px;
  font-weight: 600;
  color: #1d1d1f;
}

.vu-space-entry__hint {
  font-size: 11px;
  color: #6e6e73;
}

.vu-space-entry__actions {
  display: flex;
  gap: 8px;
  margin-top: 2px;
}

.vu-space-entry__btn {
  height: 28px;
  padding: 0 14px;
  border: none;
  border-radius: 999px;
  background: #2fa84f;
  color: #ffffff;
  font-size: 12px;
  cursor: pointer;
}

.vu-space-entry__btn:hover {
  background: #258a41;
}

.vu-space-entry__btn--ghost {
  background: rgba(47, 168, 79, 0.1);
  color: #258a41;
}

.vu-space-entry__btn--ghost:hover {
  background: rgba(47, 168, 79, 0.18);
}

.vu-space-entry__btn--disabled,
.vu-space-entry__btn[disabled] {
  background: rgba(150, 165, 158, 0.45);
  color: rgba(255, 255, 255, 0.85);
  cursor: not-allowed;
}

.vu-space-entry__btn--ghost[disabled],
.vu-space-entry__btn--ghost.vu-space-entry__btn--disabled {
  background: rgba(47, 168, 79, 0.08);
  color: rgba(37, 138, 65, 0.55);
}

@keyframes vu-space-fade-in {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}
</style>
