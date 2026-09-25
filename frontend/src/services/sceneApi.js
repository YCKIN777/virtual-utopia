import { runtimeConfig } from '../config/runtime.js';
import { isKnownScene, isSceneAgentEnabled } from '../config/scenes.js';

export class SceneApiError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'SceneApiError';
    this.code = options.code || 'SCENE_API_ERROR';
    this.statusCode = options.statusCode || 0;
    this.cause = options.cause;
  }
}

const FRIENDLY_ERROR_MESSAGES = Object.freeze({
  INVALID_SCENE: '场景无效',
  SCENE_NOT_AVAILABLE: '该场景尚未开放',
  SESSION_NOT_FOUND: '会话已过期，请重新发送',
  NETWORK_ERROR: '无法连接后端服务',
  INVALID_RESPONSE: '后端返回了无效响应',
});

const getErrorMessage = (code) => {
  if (code.endsWith('CONFIGURATION_ERROR')) {
    return '模型服务尚未配置，请稍后再试';
  }

  if (code.endsWith('TIMEOUT')) {
    return '模型响应超时，请稍后重试';
  }

  if (code.endsWith('CIRCUIT_OPEN')) {
    return '模型服务暂时不可用，请稍后重试';
  }

  if (code.endsWith('OVERLOADED')) {
    return '当前请求较多，请稍后重试';
  }

  return FRIENDLY_ERROR_MESSAGES[code] || '请求处理失败';
};

export const createSceneApi = ({
  baseUrl = runtimeConfig.apiBaseUrl,
  fetchImpl = globalThis.fetch,
} = {}) => ({
  async sendMessage({ sceneId, sessionId, input, history = [] }) {
    if (!isKnownScene(sceneId)) {
      throw new SceneApiError('未知场景', {
        code: 'INVALID_SCENE',
        statusCode: 400,
      });
    }

    if (!isSceneAgentEnabled(sceneId)) {
      throw new SceneApiError('该场景尚未开放', {
        code: 'SCENE_NOT_AVAILABLE',
        statusCode: 503,
      });
    }

    let response;

    try {
      response = await fetchImpl(`${baseUrl}/scene/route`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sceneId,
          sessionId,
          input,
          history,
        }),
      });
    } catch (error) {
      throw new SceneApiError('无法连接后端服务', {
        code: 'NETWORK_ERROR',
        cause: error,
      });
    }

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const errorCode = payload?.code || payload?.error || 'SCENE_API_ERROR';

      throw new SceneApiError(getErrorMessage(errorCode, payload?.message), {
        code: errorCode,
        statusCode: response.status,
      });
    }

    if (!payload?.result?.reply) {
      throw new SceneApiError('后端返回了无效响应', {
        code: 'INVALID_RESPONSE',
        statusCode: 502,
      });
    }

    return payload;
  },

  // P4: 流式对话（SSE）—— POST /api/scene/route/stream。
  // 事件：status（thinking/tool_calling/tool_result）、reply_chunk（token 流）、
  // done（完整响应，meta 在此补全）、error。
  async sendMessageStream({
    sceneId,
    sessionId,
    input,
    history = [],
    user,
    onStatus,
    onToken,
    onDone,
  }) {
    if (!isKnownScene(sceneId)) {
      throw new SceneApiError('未知场景', {
        code: 'INVALID_SCENE',
        statusCode: 400,
      });
    }

    if (!isSceneAgentEnabled(sceneId)) {
      throw new SceneApiError('该场景尚未开放', {
        code: 'SCENE_NOT_AVAILABLE',
        statusCode: 503,
      });
    }

    let response;

    try {
      response = await fetchImpl(`${baseUrl}/scene/route/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sceneId,
          sessionId,
          input,
          history,
          ...(user ? { user } : {}),
        }),
      });
    } catch (error) {
      throw new SceneApiError('无法连接后端服务', {
        code: 'NETWORK_ERROR',
        cause: error,
      });
    }

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      const errorCode = payload?.code || payload?.error || 'SCENE_API_ERROR';

      throw new SceneApiError(getErrorMessage(errorCode, payload?.message), {
        code: errorCode,
        statusCode: response.status,
      });
    }

    if (!response.body) {
      throw new SceneApiError('后端返回了无效响应', {
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
        if (line.startsWith('event: ')) {
          event = line.slice('event: '.length);
        } else if (line.startsWith('data: ')) {
          data = line.slice('data: '.length);
        }
      }

      if (!event || !data) return;

      const payload = JSON.parse(data);

      if (event === 'status') {
        onStatus?.(payload);
      } else if (event === 'reply_chunk') {
        onToken?.(payload.token);
      } else if (event === 'done') {
        // done 事件结构为 { payload: <完整响应> }，解包后传给 onDone（与 sendMessage 返回值同构）
        donePayload = payload.payload;
        onDone?.(donePayload);
      } else if (event === 'error') {
        throw new SceneApiError(payload.message || '请求处理失败', {
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
      throw new SceneApiError('后端返回了无效响应', {
        code: 'INVALID_RESPONSE',
        statusCode: 502,
      });
    }

    return donePayload;
  },

  // P4 HITL: 审批恢复 —— POST /api/scene/route/resume
  async resumeApproval({ conversationId, decision }) {
    let response;

    try {
      response = await fetchImpl(`${baseUrl}/scene/route/resume`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversationId,
          decision,
        }),
      });
    } catch (error) {
      throw new SceneApiError('无法连接后端服务', {
        code: 'NETWORK_ERROR',
        cause: error,
      });
    }

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const errorCode = payload?.error || payload?.code || 'SCENE_API_ERROR';

      throw new SceneApiError(payload?.message || '审批恢复失败', {
        code: errorCode,
        statusCode: response.status,
      });
    }

    if (!payload?.result?.reply) {
      throw new SceneApiError('后端返回了无效响应', {
        code: 'INVALID_RESPONSE',
        statusCode: 502,
      });
    }

    return payload;
  },
});

export const sceneApi = createSceneApi();
