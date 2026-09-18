const p2BaseUrl = import.meta.env.VITE_BP3_P2_API_URL || '/bp3-p2-api';
const phase5BaseUrl = import.meta.env.VITE_PHASE5_API_URL || '/phase5-api';

export class P2ClientError extends Error {
  constructor(
    message,
    { code = 'BP3_P2_CLIENT_ERROR', status = 0, cause } = {},
  ) {
    super(message, { cause });
    this.name = 'P2ClientError';
    this.code = code;
    this.status = status;
  }
}

const requestJson = async ({
  baseUrl = p2BaseUrl,
  path,
  method = 'GET',
  token = '',
  body,
  timeoutMs = 6000,
}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
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
      throw new P2ClientError(payload?.message || 'BP3 P2 request failed', {
        code: payload?.code || 'BP3_P2_HTTP_ERROR',
        status: response.status,
      });
    }

    return payload;
  } catch (error) {
    if (error instanceof P2ClientError) {
      throw error;
    }

    throw new P2ClientError(
      controller.signal.aborted
        ? 'BP3 P2 request timed out'
        : 'BP3 P2 service is unavailable',
      {
        code: controller.signal.aborted
          ? 'BP3_P2_TIMEOUT'
          : 'BP3_P2_UNAVAILABLE',
        cause: error,
      },
    );
  } finally {
    clearTimeout(timeout);
  }
};

export const loginPhase5 = ({ username, password } = {}) =>
  requestJson({
    baseUrl: phase5BaseUrl,
    path: '/api/phase5/auth/login',
    method: 'POST',
    body: {
      username,
      password,
    },
  });

export const createP2Client = ({ token = '' } = {}) => {
  const request = (path, options = {}) =>
    requestJson({
      path,
      token,
      ...options,
    });

  return Object.freeze({
    me: () => request('/api/bp3/p2/auth/me'),
    health: () => request('/api/bp3/p2/health'),
    getAvatarCatalog: () => request('/api/bp3/p2/avatar/catalog'),
    getAvatarState: (userId) =>
      request(
        `/api/bp3/p2/avatar/state${
          userId ? `?userId=${encodeURIComponent(userId)}` : ''
        }`,
      ),
    getAvatarStates: (userIds) =>
      request(
        `/api/bp3/p2/avatar/states?userIds=${encodeURIComponent(
          userIds.join(','),
        )}`,
      ),
    updateAvatarState: (actionId, emoteId) =>
      request('/api/bp3/p2/avatar/state', {
        method: 'PUT',
        body: {
          actionId,
          emoteId,
        },
      }),
    listMessages: (plotId, limit = 100) =>
      request(
        `/api/bp3/p2/homes/${encodeURIComponent(
          plotId,
        )}/messages?limit=${encodeURIComponent(limit)}`,
      ),
    createMessage: (plotId, content) =>
      request(`/api/bp3/p2/homes/${encodeURIComponent(plotId)}/messages`, {
        method: 'POST',
        body: { content },
      }),
    deleteMessage: (plotId, messageId) =>
      request(
        `/api/bp3/p2/homes/${encodeURIComponent(
          plotId,
        )}/messages/${encodeURIComponent(messageId)}`,
        { method: 'DELETE' },
      ),
  });
};
