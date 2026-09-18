const viteEnv = import.meta.env || {};
const defaultBaseUrl = viteEnv.VITE_PHASE6_GATEWAY_URL || '/phase6-api';

export class PersistenceClientError extends Error {
  constructor(message, { code = 'PERSISTENCE_ERROR', status = 0, cause } = {}) {
    super(message, { cause });
    this.name = 'PersistenceClientError';
    this.code = code;
    this.status = status;
  }
}

const requestJson = async ({
  baseUrl,
  path,
  method = 'GET',
  token = '',
  body,
  fetchImpl,
  timeoutMs,
}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      throw new PersistenceClientError(
        payload?.message || '持久化服务请求失败',
        {
          code: payload?.code || 'PERSISTENCE_HTTP_ERROR',
          status: response.status,
        },
      );
    }

    return payload;
  } catch (error) {
    if (error instanceof PersistenceClientError) {
      throw error;
    }

    throw new PersistenceClientError(
      controller.signal.aborted ? '持久化服务请求超时' : '持久化服务暂不可用',
      {
        code: controller.signal.aborted
          ? 'PERSISTENCE_TIMEOUT'
          : 'PERSISTENCE_UNAVAILABLE',
        cause: error,
      },
    );
  } finally {
    clearTimeout(timeout);
  }
};

export const createPersistenceClient = ({
  baseUrl = defaultBaseUrl,
  fetchImpl = globalThis.fetch,
  timeoutMs = 5000,
} = {}) => ({
  login: ({ username, password }) =>
    requestJson({
      baseUrl,
      path: '/api/phase6/auth/login',
      method: 'POST',
      body: {
        username,
        password,
      },
      fetchImpl,
      timeoutMs,
    }),
  me: (token) =>
    requestJson({
      baseUrl,
      path: '/api/phase6/auth/me',
      token,
      fetchImpl,
      timeoutMs,
    }),
  logout: (token) =>
    requestJson({
      baseUrl,
      path: '/api/phase6/auth/logout',
      method: 'POST',
      token,
      fetchImpl,
      timeoutMs,
    }),
  loadWorldState: (token) =>
    requestJson({
      baseUrl,
      path: '/api/phase6/world-state',
      token,
      fetchImpl,
      timeoutMs,
    }),
  saveWorldState: (token, snapshot) =>
    requestJson({
      baseUrl,
      path: '/api/phase6/world-state',
      method: 'PUT',
      token,
      body: {
        snapshot,
      },
      fetchImpl,
      timeoutMs,
    }),
  listPresence: (token) =>
    requestJson({
      baseUrl,
      path: '/api/phase6/presence',
      token,
      fetchImpl,
      timeoutMs,
    }),
  updatePresence: (token, position) =>
    requestJson({
      baseUrl,
      path: '/api/phase6/presence',
      method: 'POST',
      token,
      body: position,
      fetchImpl,
      timeoutMs,
    }),
  disconnectPresence: (token) =>
    requestJson({
      baseUrl,
      path: '/api/phase6/presence',
      method: 'DELETE',
      token,
      fetchImpl,
      timeoutMs,
    }),
  loadWorldChat: (token, limit = 60) =>
    requestJson({
      baseUrl,
      path: `/api/phase6/chat/world?limit=${encodeURIComponent(limit)}`,
      token,
      fetchImpl,
      timeoutMs,
    }),
  sendWorldChat: (token, content) =>
    requestJson({
      baseUrl,
      path: '/api/phase6/chat/world',
      method: 'POST',
      token,
      body: {
        content,
      },
      fetchImpl,
      timeoutMs,
    }),
});

export const persistenceClient = createPersistenceClient();

export const checkGateway = async ({
  baseUrl = defaultBaseUrl,
  fetchImpl = globalThis.fetch,
  timeoutMs = 1600,
} = {}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(`${baseUrl}/api/phase6/health`, {
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);

    return {
      online: response.ok && payload?.status === 'ok',
      service: payload?.service || null,
      status: payload?.status || 'unavailable',
    };
  } catch {
    return {
      online: false,
      service: null,
      status: 'unavailable',
    };
  } finally {
    clearTimeout(timeout);
  }
};
