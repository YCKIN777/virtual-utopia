import { reactive } from 'vue';
import { getSceneById, scenes } from '../data/scenes.js';
import { persistenceClient as defaultPersistenceClient } from '../services/gatewayClient.js';
import { sha256Hex } from '../utils/hashPassword.js';

const delay = (milliseconds) =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

const travelerId = 'traveler-001';
const authTokenKey = 'virtual-utopia.phase5.token';
const worldSnapshotVersion = 1;
const KIN_HOME_ID = 'plot-39';
const KIN_OWNER_ID = 'kin-lord';

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
    const isKinHome = plotNumber === 39;

    return {
      id: `plot-${plotNumber}`,
      number: plotNumber,
      x: 3.2 + column * 1.05,
      y: 7.1 + row * 1.8,
      ownerId: isKinHome ? KIN_OWNER_ID : null,
      ownerName: isKinHome ? 'KIN' : '',
      visitEnabled: false,
      visibility: 'private',
      messages: [],
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
    friends: [],
    friendRequests: [],
    visitorQuota: {
      loaded: false,
      isResident: false,
      isAdmin: false,
      resident: null,
      invitations: [],
      stats: null,
    },
    avatarInOwnYard: false,
    kinInOwnYard: false,
    residentStates: [],
    residentChats: {},
    worldChat: {
      loaded: false,
      messages: [],
    },
    residentCards: {
      loaded: false,
      mine: [],
      community: [],
    },
    board: {
      loaded: false,
      items: [],
    },
    guestbook: {
      loaded: false,
      messages: [],
    },
    // 阶段七：空间社交内容层（广场公屏 / 就近私聊 / 主页异步 / 宅院权限 / 检索）
    space: {
      scenes: [],
      scenesLoaded: false,
      publicMessages: [],
      peers: {},
      profile: { loaded: false, entries: [], comments: {} },
      homeAccess: {},
      search: { query: '', results: [], searched: false },
      lastExport: null,
      stats: null,
    },
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
    visitEnabled: Object.fromEntries(
      state.homes.map((home) => [home.id, home.visibility === 'public']),
    ),
    permissions: {
      role: state.user?.role || 'viewer',
      canManageHome: ['admin', 'editor'].includes(state.user?.role),
    },
    residents: JSON.parse(JSON.stringify(state.residentStates || [])),
    residentChats: JSON.parse(JSON.stringify(state.residentChats || {})),
  });

  const applyWorldSnapshot = (snapshot) => {
    if (!snapshot || typeof snapshot !== 'object' || !state.user) {
      return false;
    }

    if (state.user) {
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
      }
    }

    state.permissions = {
      role: state.user.role,
      canManageHome: ['admin', 'editor'].includes(state.user.role),
    };

    state.residentStates = Array.isArray(snapshot.residents)
      ? snapshot.residents
      : [];

    state.residentChats =
      snapshot.residentChats && typeof snapshot.residentChats === 'object'
        ? snapshot.residentChats
        : {};

    // 恢复每户宅院参观开关状态（visitEnabled）
    if (snapshot.visitEnabled && typeof snapshot.visitEnabled === 'object') {
      state.homes.forEach((home) => {
        if (typeof snapshot.visitEnabled[home.id] === 'boolean') {
          home.visibility = snapshot.visitEnabled[home.id] ? 'public' : 'private';
          home.visitEnabled = snapshot.visitEnabled[home.id];
        }
      });
    }

    return true;
  };

  const ensureOwnedHome = (user) => {
    // 访客（viewer）无家园地块：不分配任何 plot（需求：访客仅漫游/公聊/访问公开家园）
    if (user?.role === 'viewer') {
      return;
    }

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
        password: await sha256Hex(password),
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

  const assignHome = (plotId, newOwnerName) => {
    const home = getHomePlot(plotId);
    const name = String(newOwnerName || '').trim();

    if (!home || !name) {
      return false;
    }

    home.ownerName = name;
    home.ownerId = `resident-${name}`;
    home.visitEnabled = false;
    home.visibility = 'private';
    return true;
  };

  const isKinHome = (plotId) => plotId === KIN_HOME_ID;

  const canEditHome = (plotId) =>
    Boolean(
      state.user &&
      state.permissions.canManageHome &&
      (getHomePlot(plotId)?.ownerId === state.user.id ||
        (isKinHome(plotId) && state.user.role === 'admin')),
    );

  const canViewHome = (plotId) => {
    const home = getHomePlot(plotId);

    if (!home) {
      return false;
    }

    return (
      home.visibility === 'public' ||
      home.ownerId === state.user?.id ||
      (isKinHome(plotId) && state.user?.role === 'admin')
    );
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
    home.visitEnabled = visibility === 'public';
    queuePersist();
    notify(
      visibility === 'public' ? '家园已开放公开参观' : '家园已设为私密',
      'success',
    );
    return true;
  };

  const setVisitPermission = (plotId, open) =>
    setHomeVisibility(plotId, open ? 'public' : 'private');

  const setAvatarInOwnYard = (value) => {
    state.avatarInOwnYard = Boolean(value);
  };

  const setResidentStates = (states) => {
    state.residentStates = Array.isArray(states) ? states : [];
    queuePersist();
  };

  const getKinHome = () => getHomePlot(KIN_HOME_ID);

  const canEditKinHome = () =>
    Boolean(state.user && state.user.role === 'admin');

  const setKinInOwnYard = (value) => {
    state.kinInOwnYard = Boolean(value);
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

  const removeHomeMessage = ({ plotId, messageId }) => {
    const home = getHomePlot(plotId);

    if (!home || !state.user || !canEditHome(plotId)) {
      return false;
    }

    const before = home.messages.length;
    home.messages = home.messages.filter((item) => item.id !== messageId);
    return home.messages.length < before;
  };

  const recordHomeVisit = ({ plotId }) => {
    const home = getHomePlot(plotId);

    if (!home || !state.user || home.ownerId === state.user.id) {
      return false;
    }

    const visit = {
      id: `visit-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      username: state.user.displayName || state.user.username || '访客',
      visitedAt: new Date().toISOString(),
    };
    home.visits = [...(home.visits || []), visit];
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

  const applyFriendsPayload = (payload) => {
    state.friends = Array.isArray(payload?.friends) ? payload.friends : [];
    state.friendRequests = Array.isArray(payload?.requests)
      ? payload.requests
      : [];
  };

  const loadFriends = async () => {
    if (!accessToken) return;
    try {
      const payload = await persistence.listFriends(accessToken);
      applyFriendsPayload(payload);
    } catch {
      // 好友数据加载失败不阻塞
    }
  };

  const sendFriendRequest = async ({ toUserId, toUsername, toDisplayName }) => {
    if (!accessToken) return null;
    try {
      const payload = await persistence.sendFriendRequest(accessToken, {
        toUserId,
        toUsername,
        toDisplayName,
      });
      applyFriendsPayload(payload);
      notify('好友申请已发送', 'success');
      return payload;
    } catch (error) {
      notify(error.message || '发送好友申请失败', 'error');
      return null;
    }
  };

  const respondFriendRequest = async ({ requestId, accept }) => {
    if (!accessToken) return null;
    try {
      const payload = await persistence.respondFriendRequest(accessToken, {
        requestId,
        accept,
      });
      applyFriendsPayload(payload);
      notify(accept ? '已同意好友申请' : '已拒绝好友申请', 'success');
      return payload;
    } catch (error) {
      notify(error.message || '处理好友申请失败', 'error');
      return null;
    }
  };

  const removeFriend = async ({ friendId }) => {
    if (!accessToken) return null;
    try {
      const payload = await persistence.removeFriend(accessToken, friendId);
      applyFriendsPayload(payload);
      notify('已删除好友', 'success');
      return payload;
    } catch (error) {
      notify(error.message || '删除好友失败', 'error');
      return null;
    }
  };

  const applyVisitorQuotaOverview = (payload) => {
    state.visitorQuota = {
      loaded: true,
      isResident: Boolean(payload?.isResident),
      isAdmin: Boolean(payload?.isAdmin),
      resident: payload?.resident || null,
      invitations: Array.isArray(payload?.invitations)
        ? payload.invitations
        : [],
      stats: payload?.stats || null,
    };
  };

  const loadVisitorQuota = async () => {
    if (!accessToken) return;
    try {
      const payload = await persistence.loadVisitorQuotaOverview(accessToken);
      applyVisitorQuotaOverview(payload);
    } catch {
      // 访客名额数据加载失败不阻塞世界
    }
  };

  const issueVisitorInvitation = async () => {
    if (!accessToken) return null;
    try {
      const payload = await persistence.issueVisitorInvitation(accessToken);
      applyVisitorQuotaOverview(payload.overview);
      notify('访客邀请码已发放', 'success');
      return payload;
    } catch (error) {
      notify(error.message || '发放访客名额失败', 'error');
      return null;
    }
  };

  const revokeVisitorInvitation = async ({ invitationId }) => {
    if (!accessToken) return null;
    try {
      const payload = await persistence.revokeVisitorInvitation(
        accessToken,
        invitationId,
      );
      applyVisitorQuotaOverview(payload.overview);
      notify('访客名额已回收', 'success');
      return payload;
    } catch (error) {
      notify(error.message || '回收访客名额失败', 'error');
      return null;
    }
  };

  const registerVisitor = async ({ code }) => {
    if (!accessToken) return null;
    try {
      const payload = await persistence.registerVisitor(accessToken, code);
      await loadVisitorQuota();
      notify('访客注册成功，欢迎来到乌托邦', 'success');
      return payload;
    } catch (error) {
      notify(error.message || '访客注册失败', 'error');
      return null;
    }
  };

  const registerResidentApplication = async ({
    username,
    password,
    displayName,
    hobbies,
    occupation,
    selfIntro,
    contact,
    address,
  }) => {
    try {
      const payload = await persistence.registerResidentApplication({
        username,
        password: await sha256Hex(password),
        displayName,
        hobbies,
        occupation,
        selfIntro,
        contact,
        address,
      });
      return { ok: true, payload };
    } catch (error) {
      return { ok: false, error: error.message || '提交申请失败' };
    }
  };

  const queryResidentApplication = async (username) => {
    try {
      const payload = await persistence.queryResidentApplication(username);
      return { ok: true, payload };
    } catch (error) {
      return { ok: false, error: error.message || '查询申请状态失败' };
    }
  };

  const changePassword = async ({ currentPassword, newPassword }) => {
    if (!accessToken) {
      return { ok: false, error: '请先登录' };
    }

    try {
      await persistence.changePassword(accessToken, {
        currentPassword,
        newPassword,
      });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message || '修改密码失败' };
    }
  };

  const loadResidentCards = async () => {
    if (!accessToken) return { ok: false, error: '请先登录' };
    try {
      const payload = await persistence.listResidentCards(accessToken);
      state.residentCards = {
        loaded: true,
        mine: Array.isArray(payload?.mine) ? payload.mine : [],
        community: Array.isArray(payload?.community) ? payload.community : [],
      };
      return { ok: true };
    } catch (error) {
      state.residentCards = { loaded: false, mine: [], community: [] };
      return { ok: false, error: error.message || '加载卡片失败' };
    }
  };

  const createResidentCard = async ({ cardType, content, permission }) => {
    if (!accessToken) return { ok: false, error: '请先登录' };
    try {
      const payload = await persistence.createResidentCard(accessToken, {
        cardType,
        content,
        permission,
      });
      if (payload?.card) {
        state.residentCards.mine = [
          payload.card,
          ...state.residentCards.mine,
        ];
      }
      return { ok: true, card: payload?.card };
    } catch (error) {
      return { ok: false, error: error.message || '创建卡片失败' };
    }
  };

  const updateResidentCard = async (cardId, { content, permission }) => {
    if (!accessToken) return { ok: false, error: '请先登录' };
    try {
      const payload = await persistence.updateResidentCard(
        accessToken,
        cardId,
        { content, permission },
      );
      if (payload?.card) {
        state.residentCards.mine = state.residentCards.mine.map((card) =>
          card.id === cardId ? payload.card : card,
        );
      }
      return { ok: true, card: payload?.card };
    } catch (error) {
      return { ok: false, error: error.message || '更新卡片失败' };
    }
  };

  const deleteResidentCard = async (cardId) => {
    if (!accessToken) return { ok: false, error: '请先登录' };
    try {
      await persistence.deleteResidentCard(accessToken, cardId);
      state.residentCards.mine = state.residentCards.mine.filter(
        (card) => card.id !== cardId,
      );
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message || '删除卡片失败' };
    }
  };

  const loadResidentBoard = async (userId) => {
    if (!accessToken) return { ok: false, error: '请先登录' };
    try {
      const payload = await persistence.listResidentBoard(accessToken, userId);
      state.board = {
        loaded: true,
        items: Array.isArray(payload?.board) ? payload.board : [],
      };
      return { ok: true };
    } catch (error) {
      state.board = { loaded: false, items: [] };
      return { ok: false, error: error.message || '加载展示板失败' };
    }
  };

  const loadGuestbook = async () => {
    if (!accessToken) return { ok: false, error: '请先登录' };
    try {
      const payload = await persistence.listGuestbook(accessToken, 100);
      state.guestbook = {
        loaded: true,
        messages: Array.isArray(payload?.messages) ? payload.messages : [],
      };
      return { ok: true };
    } catch (error) {
      state.guestbook = { loaded: false, messages: [] };
      return { ok: false, error: error.message || '加载留言簿失败' };
    }
  };

  const createGuestbookMessage = async (content) => {
    if (!accessToken) return { ok: false, error: '请先登录' };
    try {
      const payload = await persistence.createGuestbookMessage(
        accessToken,
        content,
      );
      if (payload?.message) {
        state.guestbook.messages = [
          payload.message,
          ...state.guestbook.messages,
        ];
      }
      return { ok: true, message: payload?.message };
    } catch (error) {
      return { ok: false, error: error.message || '留言失败' };
    }
  };

  const deleteGuestbookMessage = async (messageId) => {
    if (!accessToken) return { ok: false, error: '请先登录' };
    try {
      await persistence.deleteGuestbookMessage(accessToken, messageId);
      state.guestbook.messages = state.guestbook.messages.filter(
        (message) => message.id !== messageId,
      );
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message || '删除留言失败' };
    }
  };

  const listResidentDirectory = async () => {
    if (!accessToken) return { ok: false, error: '请先登录', residents: [] };
    try {
      const payload = await persistence.listResidentDirectory(accessToken);
      return { ok: true, residents: payload?.residents || [] };
    } catch (error) {
      return { ok: false, error: error.message || '加载名录失败', residents: [] };
    }
  };

  const listDirectMessages = async (peerId) => {
    if (!accessToken) return { ok: false, error: '请先登录', messages: [] };
    try {
      const payload = await persistence.listDirectMessages(accessToken, peerId);
      return { ok: true, messages: payload?.messages || [] };
    } catch (error) {
      return { ok: false, error: error.message || '加载私聊失败', messages: [] };
    }
  };

  const sendDirectMessage = async ({ toUserId, content }) => {
    if (!accessToken) return { ok: false, error: '请先登录' };
    try {
      const payload = await persistence.sendDirectMessage(accessToken, {
        toUserId,
        content,
      });
      return { ok: true, message: payload?.message };
    } catch (error) {
      return { ok: false, error: error.message || '发送失败' };
    }
  };

  const listGroups = async () => {
    if (!accessToken) return { ok: false, error: '请先登录', groups: [] };
    try {
      const payload = await persistence.listGroups(accessToken);
      return { ok: true, groups: payload?.groups || [] };
    } catch (error) {
      return { ok: false, error: error.message || '加载群列表失败', groups: [] };
    }
  };

  const createGroup = async ({ name, memberIds }) => {
    if (!accessToken) return { ok: false, error: '请先登录' };
    try {
      const payload = await persistence.createGroup(accessToken, {
        name,
        memberIds,
      });
      return { ok: true, group: payload?.group };
    } catch (error) {
      return { ok: false, error: error.message || '建群失败' };
    }
  };

  const listGroupMessages = async (groupId) => {
    if (!accessToken) return { ok: false, error: '请先登录', messages: [], members: [] };
    try {
      const payload = await persistence.listGroupMessages(accessToken, groupId);
      return {
        ok: true,
        messages: payload?.messages || [],
        members: payload?.members || [],
        group: payload?.group || null,
      };
    } catch (error) {
      return { ok: false, error: error.message || '加载群聊失败', messages: [], members: [] };
    }
  };

  const sendGroupMessage = async (groupId, { content }) => {
    if (!accessToken) return { ok: false, error: '请先登录' };
    try {
      const payload = await persistence.sendGroupMessage(accessToken, groupId, {
        content,
      });
      return { ok: true, message: payload?.message };
    } catch (error) {
      return { ok: false, error: error.message || '群发言失败' };
    }
  };

  // ==========================================================================
  // 阶段七：空间社交内容层
  //   广场公屏（全员可见、无人数限制）/ 就近私聊（七大场景共用）/ 主页异步交流 /
  //   宅院三档权限（全开·仅好友·闭门）/ 关键词检索（权限隔离）/ 导出与快照
  // 全部为新增能力，不改动既有世界场景与既有 phase6 功能。
  // ==========================================================================
  const requireSession = () =>
    accessToken && ['admin', 'editor'].includes(state.permissions?.role);

  const loadSpaceScenes = async () => {
    try {
      const payload = await persistence.listSocialScenes();
      state.space = {
        ...state.space,
        scenes: Array.isArray(payload?.scenes) ? payload.scenes : [],
        scenesLoaded: true,
      };
      return { ok: true, scenes: state.space.scenes };
    } catch (error) {
      return { ok: false, error: error.message || '场景清单加载失败' };
    }
  };

  const loadSpacePublicMessages = async (limit = 60) => {
    if (!requireSession()) return { ok: false, error: '需原住民身份' };
    try {
      const payload = await persistence.listPublicSpaceMessages(accessToken, limit);
      state.space = {
        ...state.space,
        publicMessages: Array.isArray(payload?.messages) ? payload.messages : [],
      };
      return { ok: true, messages: state.space.publicMessages };
    } catch (error) {
      return { ok: false, error: error.message || '广场公屏加载失败' };
    }
  };

  const sendSpacePublicMessage = async ({ text, scene }) => {
    if (!requireSession()) return { ok: false, error: '需原住民身份' };
    const message = String(text || '').trim();
    if (!message) return { ok: false, error: '请输入内容' };
    try {
      const payload = await persistence.sendPublicSpaceMessage(accessToken, {
        text: message,
        scene,
      });
      if (payload?.message) {
        state.space.publicMessages = [...state.space.publicMessages, payload.message].slice(-200);
      }
      return { ok: true, message: payload?.message };
    } catch (error) {
      return { ok: false, error: error.message || '发言失败' };
    }
  };

  const loadSpaceConversation = async (peerId, limit = 60) => {
    if (!requireSession()) return { ok: false, error: '需原住民身份' };
    try {
      const payload = await persistence.listSpaceConversation(accessToken, peerId, limit);
      const messages = Array.isArray(payload?.messages) ? payload.messages : [];
      state.space.peers = { ...state.space.peers, [peerId]: messages };
      return { ok: true, messages, peerName: payload?.peerName };
    } catch (error) {
      return { ok: false, error: error.message || '私聊加载失败', messages: [] };
    }
  };

  const sendSpaceConversationMessage = async (peerId, { text, scene, channel = 'direct' }) => {
    if (!requireSession()) return { ok: false, error: '需原住民身份' };
    const message = String(text || '').trim();
    if (!message) return { ok: false, error: '请输入内容' };
    try {
      const payload = await persistence.sendSpaceConversationMessage(accessToken, peerId, {
        text: message,
        scene,
        channel,
      });
      if (payload?.message) {
        const existing = state.space.peers[peerId] || [];
        state.space.peers = {
          ...state.space.peers,
          [peerId]: [...existing, payload.message].slice(-200),
        };
      }
      return { ok: true, message: payload?.message };
    } catch (error) {
      return { ok: false, error: error.message || '发送失败' };
    }
  };

  const loadSpaceProfile = async (userId = 'me') => {
    if (!requireSession()) return { ok: false, error: '需原住民身份' };
    try {
      const payload = await persistence.loadSpaceProfile(accessToken, userId);
      if (userId === 'me') {
        state.space.profile = {
          loaded: true,
          entries: Array.isArray(payload?.entries) ? payload.entries : [],
          comments: payload?.comments || {},
        };
      }
      return { ok: true, ...payload };
    } catch (error) {
      return { ok: false, error: error.message || '主页加载失败', entries: [] };
    }
  };

  const saveSpaceProfileEntry = async ({ id, board, title, body, images, visibility }) => {
    if (!requireSession()) return { ok: false, error: '需原住民身份' };
    try {
      const payload = await persistence.saveSpaceProfileEntry(accessToken, {
        id,
        board,
        title,
        body,
        images,
        visibility,
      });
      await loadSpaceProfile('me');
      return { ok: true, entry: payload?.entry };
    } catch (error) {
      return { ok: false, error: error.message || '保存失败' };
    }
  };

  const deleteSpaceProfileEntry = async (entryId) => {
    if (!requireSession()) return { ok: false, error: '需原住民身份' };
    try {
      await persistence.deleteSpaceProfileEntry(accessToken, entryId);
      await loadSpaceProfile('me');
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message || '删除失败' };
    }
  };

  const loadSpaceComments = async (ownerId, entryId) => {
    if (!requireSession()) return { ok: false, error: '需原住民身份', comments: [] };
    try {
      const payload = await persistence.listSpaceComments(accessToken, ownerId, entryId);
      return { ok: true, comments: payload?.comments || [] };
    } catch (error) {
      return { ok: false, error: error.message || '留言加载失败', comments: [] };
    }
  };

  const createSpaceComment = async (ownerId, entryId, text) => {
    if (!requireSession()) return { ok: false, error: '需原住民身份' };
    const content = String(text || '').trim();
    if (!content) return { ok: false, error: '请输入留言' };
    try {
      const payload = await persistence.createSpaceComment(accessToken, ownerId, entryId, {
        text: content,
      });
      if (ownerId === 'me' || String(ownerId) === String(state.user?.id)) {
        await loadSpaceProfile('me');
      }
      return { ok: true, comment: payload?.comment };
    } catch (error) {
      return { ok: false, error: error.message || '留言失败' };
    }
  };

  const loadHomeAccess = async (plotId) => {
    if (!requireSession()) return { ok: false, error: '需原住民身份' };
    try {
      const payload = await persistence.loadHomeAccess(accessToken, plotId);
      state.space.homeAccess = {
        ...state.space.homeAccess,
        [plotId]: payload?.access,
      };
      return { ok: true, access: payload?.access };
    } catch (error) {
      return { ok: false, error: error.message || '宅院权限读取失败' };
    }
  };

  const saveHomeAccess = async (plotId, mode) => {
    if (!requireSession()) return { ok: false, error: '需原住民身份' };
    try {
      const payload = await persistence.saveHomeAccess(accessToken, plotId, mode);
      state.space.homeAccess = {
        ...state.space.homeAccess,
        [plotId]: payload?.access,
      };
      return { ok: true, access: payload?.access };
    } catch (error) {
      return { ok: false, error: error.message || '宅院权限保存失败' };
    }
  };

  const checkHomeAccess = async (plotId) => {
    if (!requireSession()) return { ok: false, allowed: false, error: '需原住民身份' };
    try {
      const payload = await persistence.checkHomeAccess(accessToken, plotId);
      return { ok: true, ...payload };
    } catch (error) {
      return { ok: false, allowed: false, error: error.message || '宅院权限校验失败' };
    }
  };

  const searchSpace = async (query) => {
    if (!requireSession()) return { ok: false, error: '需原住民身份', results: [] };
    const keyword = String(query || '').trim();
    if (!keyword) {
      state.space.search = { query: '', results: [], searched: false };
      return { ok: true, results: [] };
    }
    try {
      const payload = await persistence.searchSpace(accessToken, keyword, 30);
      const results = Array.isArray(payload?.results) ? payload.results : [];
      state.space.search = { query: keyword, results, searched: true };
      return { ok: true, results };
    } catch (error) {
      return { ok: false, error: error.message || '检索失败', results: [] };
    }
  };

  const exportMySpaceData = async () => {
    if (!requireSession()) return { ok: false, error: '需原住民身份' };
    try {
      const payload = await persistence.exportMySpaceData(accessToken);
      state.space.lastExport = payload;
      notify(`已导出个人数据：${payload?.counts?.entries ?? 0} 条主页 · ${payload?.counts?.conversations ?? 0} 个会话`, 'success');
      return { ok: true, ...payload };
    } catch (error) {
      return { ok: false, error: error.message || '导出失败' };
    }
  };

  const loadSpaceStats = async () => {
    if (!requireSession()) return { ok: false, error: '需原住民身份' };
    try {
      const payload = await persistence.loadSpaceStats(accessToken);
      state.space.stats = payload?.stats || null;
      return { ok: true, ...payload };
    } catch (error) {
      return { ok: false, error: error.message || '统计加载失败' };
    }
  };

  const snapshotSpaceData = async () => {
    if (!requireSession()) return { ok: false, error: '需原住民身份' };
    try {
      const payload = await persistence.snapshotSpaceData(accessToken);
      return { ok: true, snapshot: payload?.snapshot };
    } catch (error) {
      return { ok: false, error: error.message || '快照失败' };
    }
  };

  const loadWorldChat = async () => {
    if (!accessToken) return;
    try {
      const payload = await persistence.loadWorldChat(accessToken, 50);
      const list = Array.isArray(payload?.messages) ? payload.messages : [];

      // 空结果不覆盖已有消息（避免轮询偶发空响应清空面板）
      if (list.length > 0 || !state.worldChat.loaded) {
        state.worldChat = {
          loaded: true,
          messages: list,
        };
      }
    } catch (error) {
      console.error('[world-chat] 加载失败:', error?.message || error);
    }
  };

  const sendWorldChat = async ({ content }) => {
    const normalized = String(content || '').trim().slice(0, 200);

    if (!accessToken || !normalized) {
      return null;
    }

    try {
      const payload = await persistence.sendWorldChat(accessToken, normalized);

      if (payload?.message) {
        state.worldChat.messages = [
          ...state.worldChat.messages,
          payload.message,
        ].slice(-50);
      }
      return payload;
    } catch (error) {
      notify(error.message || '发送消息失败', 'error');
      return null;
    }
  };

  const sendResidentChat = async ({ residentName, message }) => {
    const normalizedName = String(residentName || '').trim();
    const normalized = String(message || '').trim().slice(0, 200);

    if (!accessToken) {
      // 未登录不再静默失败：给出友好提示，引导用户先登录再与居民交谈。
      notify('请先登录再与居民交谈', 'info');
      return null;
    }

    if (!normalizedName || !normalized) {
      return null;
    }

    const existing = Array.isArray(state.residentChats[normalizedName])
      ? state.residentChats[normalizedName]
      : [];
    const history = existing.slice(-10).map((item) => ({
      role: item.role,
      content: item.content,
    }));

    state.residentChats = {
      ...state.residentChats,
      [normalizedName]: [
        ...existing,
        {
          id: `rc-user-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          role: 'user',
          content: normalized,
          at: new Date().toISOString(),
        },
      ],
    };

    try {
      const payload = await persistence.sendResidentChat(accessToken, {
        residentName: normalizedName,
        message: normalized,
        history,
      });
      const reply = payload?.reply;

      if (reply) {
        const current = state.residentChats[normalizedName] || [];
        state.residentChats = {
          ...state.residentChats,
          [normalizedName]: [
            ...current,
            {
              id: `rc-assistant-${Date.now()}-${Math.random()
                .toString(16)
                .slice(2)}`,
              role: 'assistant',
              content: reply,
              at: new Date().toISOString(),
            },
          ],
        };
      }

      queuePersist();
      return payload;
    } catch (error) {
      notify(error.message || '居民对话失败', 'error');
      return null;
    }
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
    assignHome,
    canEditHome,
    canViewHome,
    setHomeVisibility,
    setVisitPermission,
    setAvatarInOwnYard,
    setResidentStates,
    getKinHome,
    canEditKinHome,
    setKinInOwnYard,
    addHomeMessage,
    removeHomeMessage,
    recordHomeVisit,
    buryClue,
    discoverClue,
    loadFriends,
    sendFriendRequest,
    respondFriendRequest,
    removeFriend,
    loadVisitorQuota,
    issueVisitorInvitation,
    revokeVisitorInvitation,
    registerVisitor,
    registerResidentApplication,
    queryResidentApplication,
    changePassword,
    loadResidentCards,
    createResidentCard,
    updateResidentCard,
    deleteResidentCard,
    loadResidentBoard,
    loadGuestbook,
    createGuestbookMessage,
    deleteGuestbookMessage,
    listResidentDirectory,
    listDirectMessages,
    sendDirectMessage,
    listGroups,
    createGroup,
    listGroupMessages,
    sendGroupMessage,
    loadWorldChat,
    sendWorldChat,
    // 阶段七：空间社交内容层
    loadSpaceScenes,
    loadSpacePublicMessages,
    sendSpacePublicMessage,
    loadSpaceConversation,
    sendSpaceConversationMessage,
    loadSpaceProfile,
    saveSpaceProfileEntry,
    deleteSpaceProfileEntry,
    loadSpaceComments,
    createSpaceComment,
    loadHomeAccess,
    saveHomeAccess,
    checkHomeAccess,
    searchSpace,
    exportMySpaceData,
    loadSpaceStats,
    snapshotSpaceData,
    sendResidentChat,
  };
};

export const worldStore = createWorldStore();
