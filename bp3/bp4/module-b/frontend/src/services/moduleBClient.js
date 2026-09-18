const moduleBBaseUrl =
  import.meta.env.VITE_BP4_MODULE_B_API_URL || '/module-b-api';
const phase5BaseUrl = import.meta.env.VITE_PHASE5_API_URL || '/phase5-api';

const requestJson = async ({
  baseUrl = moduleBBaseUrl,
  path,
  method = 'GET',
  token = '',
  body,
}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(payload?.message || '聊天请求失败');

    error.code = payload?.code || 'BP4_MODULE_B_REQUEST_ERROR';
    error.status = response.status;
    throw error;
  }

  return payload;
};

export const loginPhase5 = ({ username, password }) =>
  requestJson({
    baseUrl: phase5BaseUrl,
    path: '/api/phase5/auth/login',
    method: 'POST',
    body: { username, password },
  });

export const createModuleBClient = ({ token = '' } = {}) => {
  const request = (path, options = {}) =>
    requestJson({ path, token, ...options });

  return Object.freeze({
    session: () => request('/api/bp4/module-b/session'),
    users: () => request('/api/bp4/module-b/users'),
    history: (channel, limit = 50) =>
      request(
        `/api/bp4/module-b/messages?${new URLSearchParams({
          channelType: channel.type,
          ...(channel.plotId ? { plotId: channel.plotId } : {}),
          ...(channel.targetUserId
            ? {
                targetUserId: String(channel.targetUserId),
              }
            : {}),
          limit: String(limit),
        }).toString()}`,
      ),
    send: (channel, content) =>
      request('/api/bp4/module-b/messages', {
        method: 'POST',
        body: {
          channel,
          content,
          clientMessageId: `web-${Date.now()}`,
        },
      }),
    recall: (messageId) =>
      request(
        `/api/bp4/module-b/messages/${encodeURIComponent(messageId)}/recall`,
        {
          method: 'POST',
        },
      ),
    realtimeTicket: () =>
      request('/api/bp4/module-b/realtime/ticket', {
        method: 'POST',
      }),
  });
};
