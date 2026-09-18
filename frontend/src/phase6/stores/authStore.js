import { reactive } from 'vue';
import { createPhase6Api } from '../services/phase6Api.js';

const STORAGE_KEY = 'virtual-utopia-phase6-auth';

const createMemoryStorage = () => {
  const values = new Map();

  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    },
  };
};

const getDefaultStorage = () =>
  typeof globalThis.sessionStorage === 'undefined'
    ? createMemoryStorage()
    : globalThis.sessionStorage;

const readStoredState = (storage) => {
  try {
    return JSON.parse(storage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
};

export const createAuthStore = ({
  storage = getDefaultStorage(),
  api,
} = {}) => {
  const stored = readStoredState(storage);
  const state = reactive({
    token: stored.token || null,
    expiresAt: stored.expiresAt || null,
    user: stored.user || null,
    initialized: false,
  });

  const persist = () => {
    if (!state.token) {
      storage.removeItem(STORAGE_KEY);
      return;
    }

    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        token: state.token,
        expiresAt: state.expiresAt,
        user: state.user,
      }),
    );
  };

  const clear = () => {
    state.token = null;
    state.expiresAt = null;
    state.user = null;
    state.initialized = true;
    persist();
  };

  const client =
    api ||
    createPhase6Api({
      getToken: () => state.token,
      onUnauthorized: () => clear(),
    });

  const login = async ({ username, password }) => {
    const result = await client.login({
      username,
      password,
    });

    state.token = result.token;
    state.expiresAt = result.expiresAt;
    state.user = result.user;
    state.initialized = true;
    persist();

    return result;
  };

  const ensureSession = async () => {
    if (!state.token) {
      state.initialized = true;
      return false;
    }

    if (state.user) {
      state.initialized = true;
      return true;
    }

    try {
      state.user = await client.me();
      state.initialized = true;
      persist();
      return true;
    } catch {
      clear();
      return false;
    }
  };

  const logout = async () => {
    try {
      if (state.token) {
        await client.logout();
      }
    } finally {
      clear();
    }
  };

  const hasRole = (...roles) =>
    Boolean(state.user && roles.includes(state.user.role));

  return {
    state,
    api: client,
    login,
    logout,
    clear,
    ensureSession,
    hasRole,
  };
};

export const authStore = createAuthStore();
