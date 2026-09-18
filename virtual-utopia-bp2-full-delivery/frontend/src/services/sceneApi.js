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
});

export const sceneApi = createSceneApi();
