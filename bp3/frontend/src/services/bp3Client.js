const bp3BaseUrl = import.meta.env.VITE_BP3_API_URL || '/bp3-api';
const phase5BaseUrl = import.meta.env.VITE_PHASE5_API_URL || '/phase5-api';

export class Bp3ClientError extends Error {
  constructor(
    message,
    { code = 'BP3_CLIENT_ERROR', status = 0, details = null, cause } = {},
  ) {
    super(message, { cause });
    this.name = 'Bp3ClientError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const requestJson = async ({
  baseUrl = bp3BaseUrl,
  path,
  method = 'GET',
  token = '',
  body,
  signal,
  fetchImpl = globalThis.fetch,
  timeoutMs = 6000,
}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();

  signal?.addEventListener('abort', onAbort, {
    once: true,
  });

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
      throw new Bp3ClientError(payload?.message || 'BP3 request failed', {
        code: payload?.code || 'BP3_HTTP_ERROR',
        status: response.status,
        details: payload?.details || null,
      });
    }

    return payload;
  } catch (error) {
    if (error instanceof Bp3ClientError) {
      throw error;
    }

    throw new Bp3ClientError(
      controller.signal.aborted
        ? 'BP3 request timed out'
        : 'BP3 service is unavailable',
      {
        code: controller.signal.aborted ? 'BP3_TIMEOUT' : 'BP3_UNAVAILABLE',
        cause: error,
      },
    );
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onAbort);
  }
};

export const loginPhase5 = ({ username, password, fetchImpl } = {}) =>
  requestJson({
    baseUrl: phase5BaseUrl,
    path: '/api/phase5/auth/login',
    method: 'POST',
    body: {
      username,
      password,
    },
    fetchImpl,
  });

export const createBp3Client = ({
  token = '',
  fetchImpl = globalThis.fetch,
} = {}) => {
  const request = (path, options = {}) =>
    requestJson({
      path,
      token,
      fetchImpl,
      ...options,
    });

  return Object.freeze({
    me: () => request('/api/bp3/auth/me'),
    myHome: () => request('/api/bp3/me/home'),
    health: () => request('/api/bp3/health'),
    listVoiceChannels: () => request('/api/bp3/voice/channels'),
    joinVoice: (channelId = 'world-main') =>
      request(`/api/bp3/voice/channels/${encodeURIComponent(channelId)}/join`, {
        method: 'POST',
      }),
    leaveVoice: (channelId = 'world-main') =>
      request(
        `/api/bp3/voice/channels/${encodeURIComponent(channelId)}/leave`,
        { method: 'POST' },
      ),
    muteVoice: (channelId, muted) =>
      request(`/api/bp3/voice/channels/${encodeURIComponent(channelId)}/mute`, {
        method: 'POST',
        body: { muted },
      }),
    moderateVoice: (channelId, targetUserId, action, reason = null) =>
      request(
        `/api/bp3/voice/channels/${encodeURIComponent(channelId)}/moderate`,
        {
          method: 'POST',
          body: {
            targetUserId,
            action,
            reason,
          },
        },
      ),
    getHomeAccess: (plotId) =>
      request(`/api/bp3/homes/${encodeURIComponent(plotId)}/access`),
    updateHomeAccess: (plotId, { accessMode, lockEnabled } = {}) =>
      request(`/api/bp3/homes/${encodeURIComponent(plotId)}/access`, {
        method: 'PUT',
        body: {
          accessMode,
          lockEnabled,
        },
      }),
    listVisitors: (plotId) =>
      request(`/api/bp3/homes/${encodeURIComponent(plotId)}/visitors`),
    setVisitor: (plotId, { userId, listType, expiresAt = null }) =>
      request(`/api/bp3/homes/${encodeURIComponent(plotId)}/visitors`, {
        method: 'POST',
        body: {
          userId,
          listType,
          expiresAt,
        },
      }),
    removeVisitor: (plotId, userId) =>
      request(
        `/api/bp3/homes/${encodeURIComponent(
          plotId,
        )}/visitors/${encodeURIComponent(userId)}`,
        { method: 'DELETE' },
      ),
    listAccessRequests: (plotId) =>
      request(`/api/bp3/homes/${encodeURIComponent(plotId)}/access-requests`),
    createAccessRequest: (plotId, message = '') =>
      request(`/api/bp3/homes/${encodeURIComponent(plotId)}/access-requests`, {
        method: 'POST',
        body: { message },
      }),
    approveAccessRequest: (plotId, requestId) =>
      request(
        `/api/bp3/homes/${encodeURIComponent(
          plotId,
        )}/access-requests/${encodeURIComponent(requestId)}/approve`,
        { method: 'POST' },
      ),
    rejectAccessRequest: (plotId, requestId) =>
      request(
        `/api/bp3/homes/${encodeURIComponent(
          plotId,
        )}/access-requests/${encodeURIComponent(requestId)}/reject`,
        { method: 'POST' },
      ),
    setDoorLock: (plotId, locked) =>
      request(`/api/bp3/homes/${encodeURIComponent(plotId)}/unlock`, {
        method: 'POST',
        body: { locked },
      }),
    checkHomeAccess: (plotId) =>
      request(`/api/bp3/homes/${encodeURIComponent(plotId)}/access-check`, {
        method: 'POST',
        body: { consumeGrant: true },
      }),
    listInvites: (plotId) =>
      request(`/api/bp3/homes/${encodeURIComponent(plotId)}/invites`),
    createInvite: (plotId, { expiresInSeconds, maxUses = 1 } = {}) =>
      request(`/api/bp3/homes/${encodeURIComponent(plotId)}/invites`, {
        method: 'POST',
        body: {
          expiresInSeconds,
          maxUses,
        },
      }),
    revokeGrant: (plotId, grantId) =>
      request(
        `/api/bp3/homes/${encodeURIComponent(
          plotId,
        )}/grants/${encodeURIComponent(grantId)}`,
        { method: 'DELETE' },
      ),
    redeemInvite: (token) =>
      request(`/api/bp3/invites/${encodeURIComponent(token)}/redeem`, {
        method: 'POST',
      }),
    listHomeLogs: (plotId, limit = 100) =>
      request(
        `/api/bp3/homes/${encodeURIComponent(
          plotId,
        )}/logs?limit=${encodeURIComponent(limit)}`,
      ),
  });
};
