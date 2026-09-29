// services/sceneClient.js —— 3D 世界版 AI 对话客户端（scene 3000 LangGraph）
// 与 shell 的 services/sceneApi.js 同构（SSE stream / route / resume / captcha），
// 但 baseUrl 走 vite proxy（/scene-api → 3000，同源无 CORS），token 取 3D 世界登录态
// （virtual-utopia.phase5.token，与 phase6 网关同一 token，后端经 /auth/me 解析身份）。

const sceneBaseUrl =
  (import.meta.env?.VITE_SCENE_API_BASE_URL || '/scene-api').replace(/\/+$/, '');

const AUTH_TOKEN_KEY = 'virtual-utopia.phase5.token';

export class SceneClientError extends Error {
  constructor(message, { code = 'SCENE_API_ERROR', statusCode = 0, cause } = {}) {
    super(message, { cause });
    this.name = 'SceneClientError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

const getToken = () => {
  try {
    return (
      sessionStorage.getItem(AUTH_TOKEN_KEY) ||
      localStorage.getItem(AUTH_TOKEN_KEY) ||
      ''
    );
  } catch {
    return '';
  }
};

const authHeaders = () => {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const getFriendlyMessage = (code, fallback) => {
  const map = {
    INVALID_SCENE: '场景无效',
    SCENE_NOT_AVAILABLE: '该场景尚未开放',
    SESSION_NOT_FOUND: '会话已过期，请重新发送',
    NETWORK_ERROR: '无法连接后端服务',
    INVALID_RESPONSE: '后端返回了无效响应',
  };
  if (code?.endsWith?.('CONFIGURATION_ERROR')) return '模型服务尚未配置，请稍后再试';
  if (code?.endsWith?.('TIMEOUT')) return '模型响应超时，请稍后重试';
  if (code?.endsWith?.('CIRCUIT_OPEN')) return '模型服务暂时不可用，请稍后重试';
  if (code?.endsWith?.('OVERLOADED')) return '当前请求较多，请稍后重试';
  return map[code] || fallback || '请求处理失败';
};

// P4 HITL：审批恢复 —— POST /api/scene/route/resume
export async function resumeApproval({ conversationId, decision }) {
  let response;
  try {
    response = await fetch(`${sceneBaseUrl}/api/scene/route/resume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ conversationId, decision }),
    });
  } catch (error) {
    throw new SceneClientError('无法连接后端服务', {
      code: 'NETWORK_ERROR',
      cause: error,
    });
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new SceneClientError(
      payload?.message || getFriendlyMessage(payload?.code, '审批恢复失败'),
      { code: payload?.error || payload?.code || 'SCENE_API_ERROR', statusCode: response.status },
    );
  }
  if (!payload?.result?.reply) {
    throw new SceneClientError('后端返回了无效响应', {
      code: 'INVALID_RESPONSE',
      statusCode: 502,
    });
  }
  return payload;
}

// P4：流式对话（SSE）—— POST /api/scene/route/stream
// 事件：status（thinking/tool_calling/tool_result）、reply_chunk（token 流）、
// done（完整响应，meta 在此补全）、error。
export async function sendMessageStream({
  sceneId,
  sessionId,
  input,
  history = [],
  companions = [],
  onStatus,
  onToken,
  onDone,
}) {
  let response;
  try {
    response = await fetch(`${sceneBaseUrl}/api/scene/route/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({
        sceneId,
        sessionId,
        input,
        history,
        companions,
      }),
    });
  } catch (error) {
    throw new SceneClientError('无法连接后端服务', {
      code: 'NETWORK_ERROR',
      cause: error,
    });
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new SceneClientError(
      payload?.message || getFriendlyMessage(payload?.code || payload?.error),
      { code: payload?.code || payload?.error || 'SCENE_API_ERROR', statusCode: response.status },
    );
  }

  if (!response.body) {
    throw new SceneClientError('后端返回了无效响应', {
      code: 'INVALID_RESPONSE',
      statusCode: 502,
    });
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let donePayload = null;

  const parseBlock = (block) => {
    let event = null;
    let data = '';
    for (const line of block.split('\n')) {
      if (line.startsWith('event: ')) event = line.slice(7);
      else if (line.startsWith('data: ')) data = line.slice(6);
    }
    if (!event || !data) return;
    const payload = JSON.parse(data);
    if (event === 'status') onStatus?.(payload);
    else if (event === 'reply_chunk') onToken?.(payload.token);
    else if (event === 'done') {
      donePayload = payload.payload;
      onDone?.(donePayload);
    } else if (event === 'error') {
      throw new SceneClientError(payload.message || '请求处理失败', {
        code: payload.code || 'SCENE_API_ERROR',
        statusCode: 502,
      });
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary;
    while ((boundary = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      parseBlock(block);
    }
  }

  if (!donePayload?.result?.reply) {
    throw new SceneClientError('后端返回了无效响应', {
      code: 'INVALID_RESPONSE',
      statusCode: 502,
    });
  }
  return donePayload;
}

// 非流式兜底 —— POST /api/scene/route
export async function sendMessage({ sceneId, sessionId, input, history = [] }) {
  let response;
  try {
    response = await fetch(`${sceneBaseUrl}/api/scene/route`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ sceneId, sessionId, input, history }),
    });
  } catch (error) {
    throw new SceneClientError('无法连接后端服务', {
      code: 'NETWORK_ERROR',
      cause: error,
    });
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new SceneClientError(
      payload?.message || getFriendlyMessage(payload?.code || payload?.error),
      { code: payload?.code || payload?.error || 'SCENE_API_ERROR', statusCode: response.status },
    );
  }
  if (!payload?.result?.reply) {
    throw new SceneClientError('后端返回了无效响应', {
      code: 'INVALID_RESPONSE',
      statusCode: 502,
    });
  }
  return payload;
}

// 已登录判断（AI 对话需要真实身份：写类工具按角色矩阵；未登录=游客）
export const isAiChatAvailable = () => Boolean(getToken());

// 供 UI 复用登录态（避免循环依赖：不 import worldStore，仅读 storage key）
export const getAiAuthToken = getToken;
