const moduleABaseUrl =
  import.meta.env.VITE_BP4_MODULE_A_API_URL || '/module-a-api';
const phase5BaseUrl = import.meta.env.VITE_PHASE5_API_URL || '/phase5-api';

const requestJson = async ({
  baseUrl = moduleABaseUrl,
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
    const error = new Error(payload?.message || '家园权限请求失败');

    error.code = payload?.code || 'BP4_MODULE_A_REQUEST_ERROR';
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

export const createModuleAClient = ({ token = '' } = {}) => {
  const request = (path, options = {}) =>
    requestJson({ path, token, ...options });

  return Object.freeze({
    session: () => request('/api/bp4/module-a/session'),
    homes: () => request('/api/bp4/module-a/homes'),
    users: () => request('/api/bp4/module-a/users'),
    access: (plotId) =>
      request(`/api/bp4/module-a/homes/${encodeURIComponent(plotId)}/access`),
    updateOwner: (plotId, fields) =>
      request(`/api/bp4/module-a/homes/${encodeURIComponent(plotId)}/owner`, {
        method: 'PUT',
        body: fields,
      }),
    updateAccess: (plotId, fields) =>
      request(`/api/bp4/module-a/homes/${encodeURIComponent(plotId)}/access`, {
        method: 'PUT',
        body: fields,
      }),
    evaluate: (plotId, fields) =>
      request(
        `/api/bp4/module-a/homes/${encodeURIComponent(plotId)}/evaluate`,
        {
          method: 'POST',
          body: fields,
        },
      ),
    events: (plotId = '') =>
      request(
        `/api/bp4/module-a/events${
          plotId ? `?plotId=${encodeURIComponent(plotId)}` : ''
        }`,
      ),
    audit: () => request('/api/bp4/module-a/audit'),
    realtimeTicket: () =>
      request('/api/bp4/module-a/realtime/ticket', {
        method: 'POST',
        body: {
          channelIds: ['world-main'],
        },
      }),
  });
};
