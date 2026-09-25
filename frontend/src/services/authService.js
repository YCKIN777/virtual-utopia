// frontend/src/services/authService.js
// P4 收尾：外层场景应用（AI 对话）真实认证 —— 复用 phase6/phase5 账号体系。
// 登录/登出/身份校验 + localStorage token 存取（key 独立于 virtual-utopia，避免跨应用串扰）。
// 密码链路与主世界一致：前端 sha256 十六进制 → phase6 → phase5（scrypt 校验，兼容明文）。
const viteEnv = import.meta.env || {};
const defaultBaseUrl = viteEnv.VITE_PHASE6_GATEWAY_URL || '/phase6-api';

export const SCENE_AUTH_TOKEN_KEY = 'scene-app.phase5.token';

export const sha256Hex = async (text) => {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

export class AuthServiceError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'AuthServiceError';
    this.code = options.code || 'AUTH_ERROR';
    this.status = options.status || 0;
  }
}

export const createAuthService = ({
  baseUrl = defaultBaseUrl,
  fetchImpl = globalThis.fetch,
  storage = typeof localStorage !== 'undefined' ? localStorage : null,
  tokenKey = SCENE_AUTH_TOKEN_KEY,
} = {}) => {
  const request = async ({ path, method = 'GET', token, body }) => {
    let response;

    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        method,
        headers: {
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (error) {
      throw new AuthServiceError('认证服务暂不可用', {
        code: 'AUTH_SERVICE_UNAVAILABLE',
        cause: error,
      });
    }

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      throw new AuthServiceError(payload?.message || '认证请求失败', {
        code: payload?.error || 'AUTH_ERROR',
        status: response.status,
      });
    }

    return payload;
  };

  const getToken = () => storage?.getItem(tokenKey) || '';
  const setToken = (token) => {
    if (token) {
      storage?.setItem(tokenKey, token);
    } else {
      storage?.removeItem(tokenKey);
    }
  };

  return {
    tokenKey,
    getToken,
    // 登录：payload = { token, expiresAt, user: { id, username, role, displayName } }
    login: async ({ username, password }) => {
      const payload = await request({
        path: '/api/phase6/auth/login',
        method: 'POST',
        body: {
          username,
          password: await sha256Hex(password),
        },
      });

      setToken(payload.token);

      return payload;
    },
    me: async (token = getToken()) => request({ path: '/api/phase6/auth/me', token }),
    logout: async (token = getToken()) => {
      try {
        await request({ path: '/api/phase6/auth/logout', method: 'POST', token });
      } finally {
        setToken('');
      }
    },
  };
};

export const authService = createAuthService();
