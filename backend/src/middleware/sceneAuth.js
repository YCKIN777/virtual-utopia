// backend/src/middleware/sceneAuth.js
// P4 收尾：场景服务真实认证中间件 —— 替换前端 body.user 直传信任。
// 请求带 Authorization: Bearer <token> 时，调 phase6 /api/phase6/auth/me 解析真实身份，
// 归一化为 AI 层 userContext { userId, role, username } 写入 request.userContext；
// 无 token → 游客（role=null，写类工具按权限矩阵拒绝）；
// token 无效 → 401；认证服务不可达 → 503（不静默降级为游客）。
export class SceneAuthError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = 'SceneAuthError';

    if (options.code) {
      this.code = options.code;
    }
  }
}

const normalizeUser = (user) => {
  // phase5 /auth/me → { id, username, role, displayName, ... }；
  // AI 工具层约定 { userId, role, username }，此处归一化。
  return {
    userId: user.id,
    username: user.username,
    role: user.role,
  };
};

export const createSceneAuthMiddleware = ({
  phase6BaseUrl,
  fetchImpl = globalThis.fetch,
} = {}) => {
  const meUrl = `${phase6BaseUrl}/api/phase6/auth/me`;

  return async (request, response, next) => {
    const authorization = request.headers?.authorization;

    if (!authorization || !authorization.startsWith('Bearer ')) {
      // 游客：允许继续，工具层按 role=null 拒绝敏感操作。
      request.userContext = null;
      return next();
    }

    try {
      const meResponse = await fetchImpl(meUrl, {
        method: 'GET',
        headers: {
          Authorization: authorization,
        },
      });

      if (meResponse.status === 401 || meResponse.status === 403) {
        return response.status(401).json({
          error: 'AUTH_FAILED',
          message: '登录已失效，请重新登录',
        });
      }

      if (!meResponse.ok) {
        return response.status(503).json({
          error: 'AUTH_SERVICE_UNAVAILABLE',
          message: '认证服务暂不可用，请稍后再试',
        });
      }

      const user = await meResponse.json();

      if (!user || !['admin', 'editor', 'viewer'].includes(user.role)) {
        return response.status(401).json({
          error: 'AUTH_FAILED',
          message: '登录身份无效',
        });
      }

      request.userContext = normalizeUser(user);
      return next();
    } catch (error) {
      // 网络错误（phase6 未启动等）：显式 503，不把「带了 token 却验不了」静默当游客。
      return response.status(503).json({
        error: 'AUTH_SERVICE_UNAVAILABLE',
        message: '认证服务暂不可用，请稍后再试',
      });
    }
  };
};
