const m3BaseUrl = import.meta.env.VITE_BP4_M3_API_URL || '/bp4-m3-api';
const phase5BaseUrl = import.meta.env.VITE_PHASE5_API_URL || '/phase5-api';

const requestJson = async ({
  baseUrl = m3BaseUrl,
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
    const error = new Error(payload?.message || '运营后台请求失败');

    error.code = payload?.code || 'BP4_M3_REQUEST_ERROR';
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

export const createM3Client = ({ token = '' } = {}) => {
  const request = (path, options = {}) =>
    requestJson({ path, token, ...options });

  return Object.freeze({
    session: () => request('/api/bp4/m3/session'),
    roles: () => request('/api/bp4/m3/roles'),
    accounts: () => request('/api/bp4/m3/accounts'),
    setRole: (userId, opsRole) =>
      request(`/api/bp4/m3/accounts/${encodeURIComponent(userId)}/role`, {
        method: 'PUT',
        body: { opsRole },
      }),
    worlds: () => request('/api/bp4/m3/worlds'),
    createWorld: (world) =>
      request('/api/bp4/m3/worlds', {
        method: 'POST',
        body: world,
      }),
    updateWorld: (worldId, fields) =>
      request(`/api/bp4/m3/worlds/${encodeURIComponent(worldId)}`, {
        method: 'PUT',
        body: fields,
      }),
    homes: (worldId = '') =>
      request(
        `/api/bp4/m3/homes${
          worldId ? `?worldId=${encodeURIComponent(worldId)}` : ''
        }`,
      ),
    createHome: (home) =>
      request('/api/bp4/m3/homes', {
        method: 'POST',
        body: home,
      }),
    updateHome: (plotId, fields) =>
      request(`/api/bp4/m3/homes/${encodeURIComponent(plotId)}`, {
        method: 'PUT',
        body: fields,
      }),
    players: () => request('/api/bp4/m3/players'),
    overview: () => request('/api/bp4/m3/overview'),
    integrations: () => request('/api/bp4/m3/integrations'),
    audit: () => request('/api/bp4/m3/audit'),
  });
};
