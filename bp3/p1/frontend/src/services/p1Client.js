const p1BaseUrl = import.meta.env.VITE_BP3_P1_API_URL || '/bp3-p1-api';
const phase5BaseUrl = import.meta.env.VITE_PHASE5_API_URL || '/phase5-api';

export class P1ClientError extends Error {
  constructor(
    message,
    { code = 'BP3_P1_CLIENT_ERROR', status = 0, details = null, cause } = {},
  ) {
    super(message, { cause });
    this.name = 'P1ClientError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const requestJson = async ({
  baseUrl = p1BaseUrl,
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
      throw new P1ClientError(payload?.message || 'BP3 P1 request failed', {
        code: payload?.code || 'BP3_P1_HTTP_ERROR',
        status: response.status,
        details: payload?.details || null,
      });
    }

    return payload;
  } catch (error) {
    if (error instanceof P1ClientError) {
      throw error;
    }

    throw new P1ClientError(
      controller.signal.aborted
        ? 'BP3 P1 request timed out'
        : 'BP3 P1 service is unavailable',
      {
        code: controller.signal.aborted
          ? 'BP3_P1_TIMEOUT'
          : 'BP3_P1_UNAVAILABLE',
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

export const createP1Client = ({ token = '' } = {}) => {
  const request = (path, options = {}) =>
    requestJson({
      path,
      token,
      ...options,
    });

  return Object.freeze({
    me: () => request('/api/bp3/p1/auth/me'),
    health: () => request('/api/bp3/p1/health'),
    listCatalog: () => request('/api/bp3/p1/catalog/items'),
    listEvents: () => request('/api/bp3/p1/events'),
    createEvent: (payload) =>
      request('/api/bp3/p1/events', {
        method: 'POST',
        body: payload,
      }),
    activateEvent: (eventId) =>
      request(`/api/bp3/p1/events/${encodeURIComponent(eventId)}/activate`, {
        method: 'POST',
      }),
    endEvent: (eventId) =>
      request(`/api/bp3/p1/events/${encodeURIComponent(eventId)}/end`, {
        method: 'POST',
      }),
    listTasks: () => request('/api/bp3/p1/tasks'),
    createTask: (payload) =>
      request('/api/bp3/p1/tasks', {
        method: 'POST',
        body: payload,
      }),
    acceptTask: (taskId) =>
      request(`/api/bp3/p1/tasks/${encodeURIComponent(taskId)}/accept`, {
        method: 'POST',
      }),
    claimTask: (taskId) =>
      request(`/api/bp3/p1/tasks/${encodeURIComponent(taskId)}/claim`, {
        method: 'POST',
      }),
    listResources: () => request('/api/bp3/p1/resources'),
    createResource: (payload) =>
      request('/api/bp3/p1/resources', {
        method: 'POST',
        body: payload,
      }),
    collectResource: (nodeId, position) =>
      request(`/api/bp3/p1/resources/${encodeURIComponent(nodeId)}/collect`, {
        method: 'POST',
        body: { position },
      }),
    getInventory: () => request('/api/bp3/p1/inventory'),
    listTransactions: (limit = 40) =>
      request(
        `/api/bp3/p1/inventory/transactions?limit=${encodeURIComponent(limit)}`,
      ),
    consumeItem: (itemId, quantity) =>
      request('/api/bp3/p1/inventory/consume', {
        method: 'POST',
        body: {
          itemId,
          quantity,
        },
      }),
  });
};
