// frontend/src/stores/authStore.js
// P4 收尾：外层场景应用登录态（单例）—— 未登录=游客（AI 可聊，写类工具被角色矩阵拒绝）。
import { computed, reactive } from 'vue';
import { authService } from '../services/authService.js';

const ROLE_LABELS = Object.freeze({
  admin: 'KIN 管理员',
  editor: '原住民',
  viewer: '访客',
});

const normalizeUser = (user) => ({
  userId: user.id,
  username: user.username,
  role: user.role,
  displayName: user.displayName || user.username,
});

export const createAuthStore = ({ service = authService } = {}) => {
  const state = reactive({
    user: null,
    token: '',
    status: 'unknown', // unknown | guest | authenticated
    error: '',
  });

  const ensureSession = async () => {
    const token = service.getToken();

    if (!token) {
      state.status = 'guest';
      return state;
    }

    try {
      const user = await service.me(token);

      state.token = token;
      state.user = normalizeUser(user);
      state.status = 'authenticated';
    } catch {
      // token 失效：清空并降级为游客（不弹错，交由下次操作反馈）。
      state.token = '';
      state.user = null;
      state.status = 'guest';
    }

    return state;
  };

  const login = async ({ username, password }) => {
    state.error = '';

    try {
      const payload = await service.login({ username, password });

      state.token = payload.token;
      state.user = normalizeUser(payload.user);
      state.status = 'authenticated';

      return state.user;
    } catch (error) {
      state.status = 'guest';
      state.error = error.message || '登录失败';

      throw error;
    }
  };

  const logout = async () => {
    await service.logout();
    state.token = '';
    state.user = null;
    state.status = 'guest';
  };

  const isAuthenticated = computed(() => state.status === 'authenticated');
  const isAdmin = computed(() => state.user?.role === 'admin');
  const roleLabel = computed(() =>
    ROLE_LABELS[state.user?.role] || '游客',
  );

  return {
    state,
    ensureSession,
    login,
    logout,
    isAuthenticated,
    isAdmin,
    roleLabel,
  };
};

export const authStore = createAuthStore();
