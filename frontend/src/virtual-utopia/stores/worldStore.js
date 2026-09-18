import { reactive } from 'vue';
import { getSceneById, scenes } from '../data/scenes.js';
import {
  homeMaterialCategories,
  homeMaterialMap,
} from '../data/homeMaterials.js';
import { persistenceClient as defaultPersistenceClient } from '../services/gatewayClient.js';

const delay = (milliseconds) =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

const travelerId = 'traveler-001';
const authTokenKey = 'virtual-utopia.phase5.token';
const worldSnapshotVersion = 1;

const readStoredToken = (storage) => {
  try {
    return storage?.getItem(authTokenKey) || '';
  } catch {
    return '';
  }
};

const writeStoredToken = (storage, token) => {
  try {
    if (token) {
      storage?.setItem(authTokenKey, token);
    } else {
      storage?.removeItem(authTokenKey);
    }
  } catch {
    // Browser storage can be unavailable in private or test contexts.
  }
};

const isOfflinePersistenceError = (error) =>
  [
    'PERSISTENCE_UNAVAILABLE',
    'PERSISTENCE_TIMEOUT',
    'PHASE6_UPSTREAM_UNAVAILABLE',
    'REQUEST_TIMEOUT',
  ].includes(error?.code) ||
  [502, 503, 504].includes(error?.status) ||
  (error?.code === 'PHASE6_FORBIDDEN' &&
    /origin is not allowed/i.test(error.message));
const createSeedHomes = () =>
  Array.from({ length: 50 }, (_, index) => {
    const plotNumber = index + 1;
    const row = Math.floor(index / 10);
    const column = index % 10;
    const isTravelerHome = plotNumber === 28;
    const ownerNames = [
      '风铃',
      '木棉',
      '远星',
      '白鹭',
      '青禾',
      '云杉',
      '小满',
      '长夏',
      '知行',
    ];

    return {
      id: `plot-${plotNumber}`,
      number: plotNumber,
      x: 3.2 + column * 1.05,
      y: 7.1 + row * 1.8,
      ownerId: isTravelerHome
        ? travelerId
        : plotNumber <= 18
          ? `resident-${plotNumber}`
          : null,
      ownerName: isTravelerHome
        ? '漫游者'
        : plotNumber <= 18
          ? ownerNames[index % ownerNames.length]
          : '待入住',
      visibility: plotNumber % 7 === 0 ? 'private' : 'public',
      items: isTravelerHome
        ? [
            {
              id: 'seed-house',
              materialId: 'house-cabin',
              x: 0,
              y: -0.1,
              rotation: 0,
            },
            {
              id: 'seed-tree',
              materialId: 'tree-pine',
              x: -0.34,
              y: 0.2,
              rotation: 0,
            },
            {
              id: 'seed-lamp',
              materialId: 'lamp-path',
              x: 0.34,
              y: 0.2,
              rotation: 0,
            },
          ]
        : [],
      interiorItems: [],
      messages: isTravelerHome
        ? [
            {
              id: 'message-seed',
              author: '风铃',
              content: '广场边的松树很好看。',
              createdAt: '2026-09-15T10:00:00.000Z',
            },
          ]
        : [],
      hiddenClue: plotNumber === 1 ? '月光下的旧地图' : null,
      clueFoundBy: [],
    };
  });

export const createWorldStore = ({
  wait = delay,
  schedule = setTimeout,
  autoDismissMs = 4200,
  persistence = defaultPersistenceClient,
  storage = globalThis.sessionStorage,
  saveDelayMs = 450,
  credentials = {
    username: 'traveler',
    password: 'utopia2026',
  },
} = {}) => {
  let accessToken = '';
  let saveTimer = null;
  const state = reactive({
    user: null,
    unlockedSceneIds: scenes
      .filter((scene) => scene.unlockedByDefault)
      .map((scene) => scene.id),
    tasks: [
      {
        id: 'task-seed-1',
        sceneId: 'library',
        title: '遗落档案',
        status: 'completed',
        completedAt: '2026-09-14T09:30:00.000Z',
        reward: '故事片段 ×1',
      },
      {
        id: 'task-seed-2',
        sceneId: 'yard',
        title: '每日世界简报',
        status: 'completed',
        completedAt: '2026-09-15T11:10:00.000Z',
        reward: '声望 +10',
      },
    ],
    homes: createSeedHomes(),
    unlockedMaterialIds: homeMaterialCategories
      .flatMap((category) => category.items)
      .filter((material) => material.cost === 0)
      .map((material) => material.id),
    gatewayStatus: 'checking',
    persistence: {
      status: 'idle',
      lastSavedAt: null,
      error: null,
    },
    permissions: {
      role: 'viewer',
      canManageHome: false,
    },
    toasts: [],
  });

  const dismissToast = (toastId) => {
    state.toasts = state.toasts.filter((toast) => toast.id !== toastId);
  };

  const notify = (message, tone = 'info', title = '') => {
    const toast = {
      id: `${Date.now()}-${Math.random()}`,
      message,
      tone,
      title,
    };

    state.toasts = [...state.toasts, toast];

    if (autoDismissMs > 0) {
      schedule(() => dismissToast(toast.id), autoDismissMs);
    }

    return toast.id;
  };

  const createWorldSnapshot = () => ({
    version: worldSnapshotVersion,
    plotId: getOwnedHome()?.id || null,
    courtyardItems: JSON.parse(JSON.stringify(getOwnedHome()?.items || [])),
    interiorFurniture: JSON.parse(
      JSON.stringify(getOwnedHome()?.interiorItems || []),
    ),
    permissions: {
      role: state.user?.role || 'viewer',
      canManageHome: ['admin', 'editor'].includes(state.user?.role),
    },
  });

  const applyWorldSnapshot = (snapshot) => {
    if (!snapshot || typeof snapshot !== 'object' || !state.user) {
      return false;
    }

    if (
      Array.isArray(snapshot.courtyardItems) &&
      Array.isArray(snapshot.interiorFurniture)
    ) {
      state.homes.forEach((home) => {
        if (home.ownerId === state.user.id) {
          home.ownerId = null;
          home.ownerName = '待入住';
        }
      });

      const home =
        state.homes.find((candidate) => candidate.id === snapshot.plotId) ||
        state.homes.find((candidate) => candidate.id === 'plot-28') ||
        state.homes[0];

      if (home) {
        home.ownerId = state.user.id;
        home.ownerName = state.user.displayName;
        home.items = JSON.parse(JSON.stringify(snapshot.courtyardItems));
        home.interiorItems = JSON.parse(
          JSON.stringify(snapshot.interiorFurniture),
        );
      }
    }

    state.permissions = {
      role: state.user.role,
      canManageHome: ['admin', 'editor'].includes(state.user.role),
    };

    return true;
  };

  const ensureOwnedHome = (user) => {
    const existing = state.homes.find((home) => home.ownerId === user.id);
    const home =
      existing ||
      state.homes.find((candidate) => candidate.id === 'plot-28') ||
      state.homes[0];

    if (home) {
      home.ownerId = user.id;
      home.ownerName = user.displayName;
    }
  };

  const syncPermissions = () => {
    state.permissions = {
      role: state.user?.role || 'viewer',
      canManageHome: ['admin', 'editor'].includes(state.user?.role),
    };
  };

  const persistNow = async () => {
    if (!accessToken || !state.user) {
      return false;
    }

    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }

    state.persistence.status = 'saving';
    state.persistence.error = null;

    try {
      const result = await persistence.saveWorldState(
        accessToken,
        createWorldSnapshot(),
      );
      state.persistence.status = 'saved';
      state.persistence.lastSavedAt =
        result.savedAt || new Date().toISOString();
      return true;
    } catch (error) {
      state.persistence.status = isOfflinePersistenceError(error)
        ? 'offline'
        : 'error';
      state.persistence.error = error.message;
      return false;
    }
  };

  const queuePersist = () => {
    if (!accessToken || !state.user) {
      return;
    }

    if (saveTimer) {
      clearTimeout(saveTimer);
    }

    saveTimer = setTimeout(() => {
      saveTimer = null;
      void persistNow();
    }, saveDelayMs);
  };

  const login = async ({ username, password }) => {
    await wait(650);

    try {
      const session = await persistence.login({
        username,
        password,
      });
      accessToken = session.token;
      writeStoredToken(storage, accessToken);
      state.user = {
        id: `phase5-${session.user.id}`,
        phase5UserId: session.user.id,
        username: session.user.username,
        role: session.user.role,
        displayName: session.user.displayName || session.user.username,
        title: '乌托邦探索成员',
        joinedAt: new Date().toISOString(),
        level: 1,
        points: 0,
        worldShards: 0,
      };

      const persisted = await persistence.loadWorldState(accessToken);
      applyWorldSnapshot(persisted?.snapshot);
      ensureOwnedHome(state.user);
      syncPermissions();

      if (persisted?.snapshot) {
        state.persistence.status = 'saved';
        state.persistence.lastSavedAt = persisted.savedAt;
      } else if (state.permissions.canManageHome) {
        await persistNow();
      } else {
        state.persistence.status = 'saved';
        state.persistence.lastSavedAt = null;
      }

      notify('登录成功，世界快照已连接 Phase5', 'success');
    } catch (error) {
      const demoCredentialsMatch =
        username === credentials.username && password === credentials.password;

      if (
        !isOfflinePersistenceError(error) &&
        error.code !== 'PHASE5_UNAUTHORIZED'
      ) {
        throw error;
      }

      if (!demoCredentialsMatch) {
        const authError = new Error('用户名或密码错误');
        authError.code = 'INVALID_CREDENTIALS';
        throw authError;
      }

      accessToken = '';
      state.user = {
        id: travelerId,
        username,
        role: 'editor',
        displayName: '漫游者',
        title: '乌托邦探索成员',
        joinedAt: '2026-09-01T08:00:00.000Z',
        level: 4,
        points: 860,
        worldShards: 8,
      };
      ensureOwnedHome(state.user);
      syncPermissions();
      state.persistence.status = 'offline';
      state.persistence.error = error.message;
      notify(
        error.code === 'PHASE5_UNAUTHORIZED'
          ? '演示账号未在Phase5注册，当前使用内存临时模式'
          : 'Phase5暂不可用，当前使用内存临时模式',
        'info',
      );
    }
  };

  const restoreSession = async () => {
    const token = readStoredToken(storage);

    if (!token) {
      return false;
    }

    try {
      const user = await persistence.me(token);
      const persisted = await persistence.loadWorldState(token);
      accessToken = token;
      state.user = {
        id: `phase5-${user.id}`,
        phase5UserId: user.id,
        username: user.username,
        role: user.role,
        displayName: user.displayName || user.username,
        title: '乌托邦探索成员',
        joinedAt: new Date().toISOString(),
        level: 1,
        points: 0,
        worldShards: 0,
      };
      applyWorldSnapshot(persisted?.snapshot);
      ensureOwnedHome(state.user);
      syncPermissions();
      state.persistence.status = 'saved';
      state.persistence.lastSavedAt = persisted?.savedAt || null;
      return true;
    } catch {
      accessToken = '';
      writeStoredToken(storage, '');
      return false;
    }
  };

  const logout = async () => {
    const token = accessToken;
    accessToken = '';

    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }

    writeStoredToken(storage, '');
    state.user = null;
    state.persistence.status = 'idle';

    if (token) {
      await persistence.logout(token).catch(() => null);
    }

    notify('已退出账号，持久化登录态已清除', 'info');
  };

  const setGatewayStatus = (status) => {
    state.gatewayStatus = status;
  };

  const isSceneUnlocked = (sceneId) => state.unlockedSceneIds.includes(sceneId);

  const unlockScene = (sceneId) => {
    const scene = getSceneById(sceneId);

    if (!scene || isSceneUnlocked(sceneId)) {
      return false;
    }

    state.unlockedSceneIds = [...state.unlockedSceneIds, sceneId];

    return true;
  };

  const isTaskAccepted = (taskId) =>
    state.tasks.some((task) => task.id === taskId);

  const acceptTask = async ({ sceneId, task }) => {
    if (!state.user) {
      const error = new Error('请先登录后再接受任务');
      error.code = 'LOGIN_REQUIRED';
      throw error;
    }

    if (isTaskAccepted(task.id)) {
      notify('该任务已在个人中心中', 'info');
      return false;
    }

    await wait(450);
    const shardReward = task.type === '任务' ? 2 : 1;
    state.tasks = [
      ...state.tasks,
      {
        id: task.id,
        sceneId,
        title: task.title,
        status: 'active',
        completedAt: null,
        reward: task.reward,
      },
    ];
    state.user = {
      ...state.user,
      points: state.user.points + 10,
      worldShards: state.user.worldShards + shardReward,
    };
    unlockScene(sceneId);
    notify(
      `已接受任务：${task.title}，获得世界碎片 ×${shardReward}`,
      'success',
    );

    return true;
  };

  const getHomePlot = (plotId) =>
    state.homes.find((home) => home.id === plotId) || null;

  const getOwnedHome = () =>
    state.user
      ? state.homes.find((home) => home.ownerId === state.user.id) || null
      : null;

  const canEditHome = (plotId) =>
    Boolean(
      state.user &&
      state.permissions.canManageHome &&
      getHomePlot(plotId)?.ownerId === state.user.id,
    );

  const canViewHome = (plotId) => {
    const home = getHomePlot(plotId);

    if (!home) {
      return false;
    }

    return home.visibility === 'public' || home.ownerId === state.user?.id;
  };

  const setHomeVisibility = (plotId, visibility) => {
    const home = getHomePlot(plotId);

    if (
      !home ||
      !canEditHome(plotId) ||
      !['public', 'private'].includes(visibility)
    ) {
      return false;
    }

    home.visibility = visibility;
    notify(
      visibility === 'public' ? '家园已开放公开参观' : '家园已设为私密',
      'success',
    );
    return true;
  };

  const isMaterialUnlocked = (materialId) =>
    state.unlockedMaterialIds.includes(materialId);

  const unlockMaterial = (materialId) => {
    const material = homeMaterialMap[materialId];

    if (!state.user || !material) {
      return false;
    }

    if (isMaterialUnlocked(materialId)) {
      return true;
    }

    if (state.user.worldShards < material.cost) {
      notify('世界碎片不足', 'error');
      return false;
    }

    state.user = {
      ...state.user,
      worldShards: state.user.worldShards - material.cost,
    };
    state.unlockedMaterialIds = [...state.unlockedMaterialIds, materialId];
    notify(`已解锁素材：${material.name}`, 'success');
    return true;
  };

  const addHomeItem = ({ plotId, materialId, x, y }) => {
    const home = getHomePlot(plotId);
    const material = homeMaterialMap[materialId];

    if (
      !home ||
      !material ||
      !canEditHome(plotId) ||
      !isMaterialUnlocked(materialId)
    ) {
      return null;
    }

    const item = {
      id: `item-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      materialId,
      x,
      y,
      rotation: 0,
    };

    home.items = [...home.items, item];
    queuePersist();
    return item;
  };

  const updateHomeItem = ({ plotId, itemId, x, y, rotation }) => {
    const home = getHomePlot(plotId);

    if (!home || !canEditHome(plotId)) {
      return false;
    }

    const item = home.items.find((candidate) => candidate.id === itemId);

    if (!item) {
      return false;
    }

    if (Number.isFinite(x)) {
      item.x = x;
    }

    if (Number.isFinite(y)) {
      item.y = y;
    }

    if (Number.isFinite(rotation)) {
      item.rotation = rotation;
    }

    queuePersist();
    return true;
  };

  const removeHomeItem = ({ plotId, itemId }) => {
    const home = getHomePlot(plotId);

    if (!home || !canEditHome(plotId)) {
      return false;
    }

    home.items = home.items.filter((item) => item.id !== itemId);
    queuePersist();
    return true;
  };

  const addInteriorItem = ({ plotId, materialId, x, y }) => {
    const home = getHomePlot(plotId);
    const material = homeMaterialMap[materialId];

    if (
      !home ||
      !material ||
      !canEditHome(plotId) ||
      !isMaterialUnlocked(materialId)
    ) {
      return null;
    }

    const item = {
      id: `interior-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      materialId,
      x,
      y,
      rotation: 0,
    };

    home.interiorItems = [...(home.interiorItems || []), item];
    queuePersist();
    return item;
  };

  const updateInteriorItem = ({ plotId, itemId, x, y, rotation }) => {
    const home = getHomePlot(plotId);

    if (!home || !canEditHome(plotId)) {
      return false;
    }

    const item = (home.interiorItems || []).find(
      (candidate) => candidate.id === itemId,
    );

    if (!item) {
      return false;
    }

    if (Number.isFinite(x)) {
      item.x = x;
    }

    if (Number.isFinite(y)) {
      item.y = y;
    }

    if (Number.isFinite(rotation)) {
      item.rotation = rotation;
    }

    queuePersist();
    return true;
  };

  const removeInteriorItem = ({ plotId, itemId }) => {
    const home = getHomePlot(plotId);

    if (!home || !canEditHome(plotId)) {
      return false;
    }

    home.interiorItems = (home.interiorItems || []).filter(
      (item) => item.id !== itemId,
    );
    queuePersist();
    return true;
  };

  const addHomeMessage = ({ plotId, content }) => {
    const home = getHomePlot(plotId);
    const message = String(content || '').trim();

    if (!home || !state.user || !canViewHome(plotId) || !message) {
      return false;
    }

    home.messages = [
      ...home.messages,
      {
        id: `message-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        author: state.user.displayName,
        content: message.slice(0, 120),
        createdAt: new Date().toISOString(),
      },
    ];
    notify('留言仅保存在当前页面内存', 'success');
    return true;
  };

  const buryClue = ({ plotId, clue }) => {
    const home = getHomePlot(plotId);
    const normalizedClue = String(clue || '').trim();

    if (!home || !canEditHome(plotId) || !normalizedClue) {
      return false;
    }

    home.hiddenClue = normalizedClue.slice(0, 80);
    home.clueFoundBy = [];
    notify('隐藏线索仅保存在当前页面内存', 'success');
    return true;
  };

  const discoverClue = (plotId) => {
    const home = getHomePlot(plotId);

    if (
      !home?.hiddenClue ||
      !state.user ||
      !canViewHome(plotId) ||
      home.clueFoundBy.includes(state.user.id)
    ) {
      return null;
    }

    home.clueFoundBy = [...home.clueFoundBy, state.user.id];
    state.user = {
      ...state.user,
      worldShards: state.user.worldShards + 2,
    };
    notify(`发现隐藏线索：${home.hiddenClue}，获得世界碎片 ×2`, 'success');
    return home.hiddenClue;
  };

  return {
    state,
    login,
    logout,
    restoreSession,
    persistNow,
    getAuthToken: () => accessToken,
    notify,
    dismissToast,
    setGatewayStatus,
    isSceneUnlocked,
    unlockScene,
    isTaskAccepted,
    acceptTask,
    getHomePlot,
    getOwnedHome,
    canEditHome,
    canViewHome,
    setHomeVisibility,
    isMaterialUnlocked,
    unlockMaterial,
    addHomeItem,
    updateHomeItem,
    removeHomeItem,
    addInteriorItem,
    updateInteriorItem,
    removeInteriorItem,
    addHomeMessage,
    buryClue,
    discoverClue,
  };
};

export const worldStore = createWorldStore();
